#!/usr/bin/env node
// Checks the plugin folder, the skills and the manifests. No dependencies.
//
//   node scripts/check.mjs                    all rules
//   node scripts/check.mjs --base origin/main also the version rule against that ref
//   node scripts/check.mjs --mcp ../mcp       report the difference from a taskade/mcp checkout
//   node scripts/check.mjs --self-test        break a copy in one way for each case
//
// Without --mcp and --self-test, the check also runs scripts/check-triggers.mjs.

import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const PLUGIN = 'plugins/taskade';

// Each file that carries the plugin version.
const VERSION_FILES = [
  `${PLUGIN}/plugin.json`,
  `${PLUGIN}/.claude-plugin/plugin.json`,
  `${PLUGIN}/.cursor-plugin/plugin.json`,
  '.claude-plugin/marketplace.json',
];

// Each marketplace file, and the plugin source that it must name.
const MARKETPLACE_FILES = [
  '.claude-plugin/marketplace.json',
  '.cursor-plugin/marketplace.json',
  '.agents/plugins/marketplace.json',
];

// A plugin directory accepts only these file types in a plugin folder, and a file named LICENSE.
const ALLOWED_EXTENSIONS = new Set([
  '.md',
  '.txt',
  '.json',
  '.yaml',
  '.yml',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
]);
const TEXT_EXTENSIONS = new Set(['.md', '.txt', '.json', '.yaml', '.yml']);
const REFUSED_FILE_NAMES = new Set([
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  '.yarnrc.yml',
]);

const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const NAME_LIMIT = 64;
export const DESCRIPTION_LIMIT = 1024;

// Text that must not be in a public file.
const TEXT_RULES = [{ pattern: /—/, message: 'em dash (use a period or a comma)' }];

// macOS writes .DS_Store files. The .gitignore keeps them out of git, so the walk leaves them out.
function walk(dir, prefix = '') {
  return readdirSync(dir)
    .filter((name) => name !== '.DS_Store')
    .sort()
    .flatMap((name) => {
      const path = prefix === '' ? name : `${prefix}/${name}`;
      const stat = lstatSync(join(dir, name));
      const entry = { path, isSymlink: stat.isSymbolicLink(), isDirectory: stat.isDirectory() };
      return entry.isDirectory ? [entry, ...walk(join(dir, name), path)] : [entry];
    });
}

function readJson(root, file) {
  return JSON.parse(readFileSync(join(root, file), 'utf8'));
}

function versionOf(file, json) {
  return file.endsWith('marketplace.json') ? json.plugins?.[0]?.version : json.version;
}

// Reads the `name` and `description` of a SKILL.md. Each value must be on one line.
// `hasContinuation` is true when an indented line continues a value.
export function frontmatterOf(text) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text.replace(/\r\n/g, '\n'));
  if (match == null) {
    return null;
  }
  const fields = {};
  const lines = match[1].split('\n');
  for (const line of lines) {
    const field = /^([A-Za-z-]+):\s*(.*)$/.exec(line);
    if (field != null) {
      fields[field[1]] = field[2].trim().replace(/^(["'])(.*)\1$/, '$2');
    }
  }
  return { ...fields, hasContinuation: lines.some((line) => /^\s+\S/.test(line)) };
}

// Removes fenced code blocks (also indented ones) and inline code, so that a Markdown example is
// not read as a link.
function withoutCode(text) {
  return text
    .replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n[ \t]*\1[^\n]*$/gm, '')
    .replace(/(`+)[^\n]*?\1/g, '');
}

// Returns each URL that carries a prompt parameter and is not /create.
// The URL is the text from the first `https://`, or else from the first `/`, up to the parameter.
// Text with no URL before the parameter (for example `?prompt=` alone) names the parameter and passes.
function promptUrlProblems(text) {
  return [...text.matchAll(/(\S*?)((?:\?|&(?:amp;)*)prompt=)/gi)]
    .map((match) => {
      const found = /https?:\/\/\S*$/i.exec(match[1]) ?? /\/\S*$/.exec(match[1]);
      return { url: found == null ? '' : found[0], param: match[2] };
    })
    .filter(
      ({ url }) =>
        !['', 'https://www.taskade.com/create', '/create'].includes(
          url.replace(/\?.*$/, '').toLowerCase(),
        ),
    )
    .map(({ url, param }) => `${url}${param}`);
}

// A YAML parser reads ": " or " #" in a value with no quotes as a new key or a comment, and
// then skips the skill. Some installers use such a parser. `text` is the whole SKILL.md.
export function hasYamlBreak(text) {
  const rawDescription = /^description:[ \t]*(.*)$/m.exec(text.replace(/\r\n/g, '\n'))?.[1] ?? '';
  return !/^["']/.test(rawDescription) && /: | #|:$/.test(rawDescription);
}

function checkPluginFiles(root) {
  return walk(join(root, PLUGIN)).flatMap((entry) => {
    const name = basename(entry.path);
    const label = `${PLUGIN}/${entry.path}`;
    if (entry.isSymlink) {
      return [`${label}: symbolic link (commit a regular file)`];
    }
    if (entry.isDirectory) {
      const nested = entry.path !== '.claude-plugin' && name === '.claude-plugin';
      return nested || name === '.claude' ? [`${label}: folder is not allowed`] : [];
    }
    if (entry.path.startsWith('.claude-plugin/') && entry.path !== '.claude-plugin/plugin.json') {
      return [`${label}: .claude-plugin/ can hold only plugin.json`];
    }
    if (REFUSED_FILE_NAMES.has(name)) {
      return [`${label}: package manager file is not allowed`];
    }
    const extension = extname(name).toLowerCase();
    if (extension === '' ? name !== 'LICENSE' : !ALLOWED_EXTENSIONS.has(extension)) {
      return [`${label}: file type is not allowed in the plugin folder`];
    }
    return [];
  });
}

export function skillNames(root) {
  const skillsDir = join(root, PLUGIN, 'skills');
  return readdirSync(skillsDir)
    .sort()
    .filter((name) => lstatSync(join(skillsDir, name)).isDirectory());
}

function checkSkills(root) {
  const skillsDir = join(root, PLUGIN, 'skills');
  const names = skillNames(root);
  const referenceFiles = new Set(
    names.flatMap((name) =>
      existsSync(join(skillsDir, name, 'references'))
        ? readdirSync(join(skillsDir, name, 'references')).map((file) => `references/${file}`)
        : [],
    ),
  );
  const problems = names.length === 0 ? [`${PLUGIN}/skills: no skill found`] : [];

  for (const name of names) {
    const label = `${PLUGIN}/skills/${name}/SKILL.md`;
    const file = join(skillsDir, name, 'SKILL.md');
    if (!existsSync(file)) {
      problems.push(`${label}: file is missing`);
      continue;
    }
    const text = readFileSync(file, 'utf8');
    const fields = frontmatterOf(text);
    if (fields == null) {
      problems.push(`${label}: no frontmatter block at the top`);
      continue;
    }
    if (fields.name !== name) {
      problems.push(`${label}: name "${fields.name}" is not equal to the folder name "${name}"`);
    }
    if (!NAME_PATTERN.test(name) || name.length > NAME_LIMIT) {
      problems.push(`${label}: use lower case letters, digits and hyphens, ${NAME_LIMIT} at most`);
    }
    const description = fields.description ?? '';
    if (/^[>|][-+]?$/.test(description) || fields.hasContinuation) {
      problems.push(`${label}: write each frontmatter value on one line, not as a block`);
    }
    if (description === '') {
      problems.push(`${label}: description is empty`);
    }
    if (hasYamlBreak(text)) {
      problems.push(
        `${label}: the description has ": " or " #", which a YAML parser cannot read (reword it)`,
      );
    }
    if (description.length > DESCRIPTION_LIMIT) {
      problems.push(
        `${label}: description has ${description.length} characters, the limit is ${DESCRIPTION_LIMIT}`,
      );
    }
    for (const match of text.matchAll(/`(references\/[^`\s]+)`/g)) {
      if (!referenceFiles.has(match[1])) {
        problems.push(`${label}: ${match[1]} does not exist in any skill`);
      }
    }
    for (const match of withoutCode(text).matchAll(/\]\((?!https?:|#|mailto:)([^)\s]+)\)/g)) {
      const target = resolve(skillsDir, name, match[1].replace(/#.*$/, ''));
      if (!target.startsWith(resolve(root, PLUGIN) + sep)) {
        problems.push(`${label}: link target ${match[1]} is outside the plugin folder`);
      } else if (!existsSync(target)) {
        problems.push(`${label}: link target ${match[1]} does not exist`);
      }
    }
  }
  return problems;
}

function checkManifests(root) {
  const problems = [];
  const versions = VERSION_FILES.map((file) => {
    if (!existsSync(join(root, file))) {
      problems.push(`${file}: file is missing`);
      return undefined;
    }
    return versionOf(file, readJson(root, file));
  });
  if (new Set(versions).size !== 1 || !/^\d+\.\d+\.\d+$/.test(versions[0] ?? '')) {
    problems.push(
      `The plugin version is not the same in each manifest: ${VERSION_FILES.map(
        (file, index) => `${file} = ${versions[index]}`,
      ).join(', ')}. Run ./scripts/bump.sh.`,
    );
  }
  for (const file of MARKETPLACE_FILES) {
    if (!existsSync(join(root, file))) {
      problems.push(`${file}: file is missing`);
      continue;
    }
    const source = readJson(root, file).plugins?.[0]?.source;
    const path = typeof source === 'string' ? source : source?.path;
    if (path !== `./${PLUGIN}`) {
      problems.push(`${file}: the plugin source must be ./${PLUGIN}`);
    }
  }
  return problems;
}

function publicTextFiles(root) {
  const pluginFiles = walk(join(root, PLUGIN))
    .filter((entry) => !entry.isDirectory && !entry.isSymlink)
    .map((entry) => `${PLUGIN}/${entry.path}`)
    .filter((file) => TEXT_EXTENSIONS.has(extname(file).toLowerCase()));
  return [
    ...pluginFiles,
    ...MARKETPLACE_FILES,
    'README.md',
    'CONTRIBUTING.md',
    'AGENTS.md',
    'SECURITY.md',
    'CODE_OF_CONDUCT.md',
    '.github/pull_request_template.md',
    '.github/ISSUE_TEMPLATE/skill-problem.yml',
    '.github/ISSUE_TEMPLATE/new-skill.yml',
    '.github/ISSUE_TEMPLATE/config.yml',
  ].filter((file) =>
    existsSync(join(root, file)),
  );
}

function checkText(root) {
  return publicTextFiles(root).flatMap((file) => {
    const text = readFileSync(join(root, file), 'utf8');
    return [
      ...TEXT_RULES.filter((rule) => rule.pattern.test(text)).map(
        (rule) => `${file}: ${rule.message}`,
      ),
      ...promptUrlProblems(text).map(
        (url) => `${file}: ${url} (only https://www.taskade.com/create can carry a prompt)`,
      ),
    ];
  });
}

function checkReadme(root) {
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  return skillNames(root)
    .filter((name) => !readme.includes(`(${PLUGIN}/skills/${name})`))
    .map((name) => `README.md: the skill table has no row for ${name}`);
}

function checkAll(root) {
  return [
    ...checkPluginFiles(root),
    ...checkSkills(root),
    ...checkManifests(root),
    ...checkText(root),
    ...checkReadme(root),
  ];
}

// A change to the plugin folder needs a version above the version of the base.
function checkVersionAgainst(root, base) {
  const git = (...args) =>
    execFileSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  const works = (...args) => {
    try {
      git(...args);
      return true;
    } catch {
      return false;
    }
  };
  if (!works('rev-parse', '--verify', '--quiet', `${base}^{commit}`)) {
    return [`--base: git cannot read the ref "${base}". Fetch it, or correct the name.`];
  }
  if (!works('cat-file', '-e', `${base}:${PLUGIN}/plugin.json`)) {
    return []; // The base has no plugin folder yet.
  }
  const baseVersion = JSON.parse(git('show', `${base}:${PLUGIN}/plugin.json`)).version;
  const changed = git('diff', '--name-only', `${base}...HEAD`, '--', PLUGIN).trim();
  const version = readJson(root, `${PLUGIN}/plugin.json`).version;
  return changed !== '' && !isAbove(version, baseVersion)
    ? [
        `These plugin files changed and the version ${version} is not above ${baseVersion}, the version of ${base}. Run ./scripts/bump.sh.\n${changed}`,
      ]
    : [];
}

function isAbove(version, baseVersion) {
  const [a, b] = [version, baseVersion].map((value) => String(value).split('.').map(Number));
  const index = [0, 1, 2].find((position) => a[position] !== b[position]);
  return index != null && a[index] > b[index];
}

// Compares the skills with a taskade/mcp checkout. This is a report, not a rule.
function reportMcp(root, mcpDir) {
  const here = join(root, PLUGIN, 'skills');
  const filesIn = (dir) =>
    existsSync(dir)
      ? walk(dir)
          .filter((entry) => !entry.isDirectory)
          .map((entry) => entry.path)
      : [];
  const lines = [];
  for (const target of ['skills', 'plugins/taskade/skills']) {
    const there = join(mcpDir, target);
    const all = [...new Set([...filesIn(here), ...filesIn(there)])].sort();
    const rows = all.flatMap((file) => {
      const a = existsSync(join(here, file)) ? readFileSync(join(here, file)) : null;
      const b = existsSync(join(there, file)) ? readFileSync(join(there, file)) : null;
      if (a != null && b != null && a.equals(b)) {
        return [];
      }
      const state = a == null ? 'only in taskade/mcp' : b == null ? 'only here' : 'different';
      return [`| \`${file}\` | ${state} |`];
    });
    lines.push(
      `### ${target} in taskade/mcp`,
      '',
      rows.length === 0
        ? 'Same as this repository.'
        : ['| File | State |', '|---|---|', ...rows].join('\n'),
      '',
    );
  }
  const mcpVersion = existsSync(join(mcpDir, 'plugin.json'))
    ? readJson(mcpDir, 'plugin.json').version
    : 'unknown';
  lines.push(
    `Plugin version here: ${readJson(root, `${PLUGIN}/plugin.json`).version}. In taskade/mcp: ${mcpVersion}.`,
  );
  return lines.join('\n');
}

// Each case changes a copy of the repository and names the text that the check must print.
const SELF_TEST = [
  {
    name: 'a clean copy passes',
    change: () => {},
    expect: null,
  },
  {
    name: 'a script in the plugin folder',
    change: (root) => writeFileSync(join(root, PLUGIN, 'run.sh'), 'echo\n'),
    expect: 'file type is not allowed',
  },
  {
    name: 'a package.json in the plugin folder',
    change: (root) => writeFileSync(join(root, PLUGIN, 'package.json'), '{}\n'),
    expect: 'package manager file',
  },
  {
    name: 'a symbolic link in the plugin folder',
    change: (root) => symlinkSync('README.md', join(root, PLUGIN, 'LINK.md')),
    expect: 'symbolic link',
  },
  {
    name: 'a skill name that is not the folder name',
    change: (root) =>
      edit(root, `${PLUGIN}/skills/taskade/SKILL.md`, /^name: taskade$/m, 'name: other'),
    expect: 'is not equal to the folder name',
  },
  {
    name: 'a skill with no frontmatter',
    change: (root) => writeFileSync(join(root, PLUGIN, 'skills/taskade/SKILL.md'), '# Taskade\n'),
    expect: 'no frontmatter block',
  },
  {
    name: 'a description over the limit',
    change: (root) =>
      edit(
        root,
        `${PLUGIN}/skills/taskade/SKILL.md`,
        /^description: .*$/m,
        `description: ${'a'.repeat(DESCRIPTION_LIMIT + 1)}`,
      ),
    expect: 'the limit is',
  },
  {
    name: 'a reference file that does not exist',
    change: (root) =>
      edit(root, `${PLUGIN}/skills/taskade/SKILL.md`, /$/, '\nRead `references/none.md`.\n'),
    expect: 'does not exist in any skill',
  },
  {
    name: 'a link target that does not exist',
    change: (root) =>
      edit(root, `${PLUGIN}/skills/taskade/SKILL.md`, /$/, '\nRead [the guide](guide.md).\n'),
    expect: 'link target guide.md does not exist',
  },
  {
    name: 'a link example inside code passes',
    change: (root) =>
      edit(
        root,
        `${PLUGIN}/skills/taskade/SKILL.md`,
        /$/,
        '\nWrite `[text](url)` or `![alt](url)`.\n\n```markdown\n[text](other.md)\n```\n',
      ),
    expect: null,
  },
  {
    name: 'a link target outside the plugin folder',
    change: (root) =>
      edit(root, `${PLUGIN}/skills/taskade/SKILL.md`, /$/, '\nRead [it](../../../../README.md).\n'),
    expect: 'is outside the plugin folder',
  },
  {
    name: 'a description with a colon and a space',
    change: (root) =>
      edit(
        root,
        `${PLUGIN}/skills/taskade/SKILL.md`,
        /^description: .*$/m,
        'description: Use Taskade. Next jobs: taskade-report.',
      ),
    expect: 'which a YAML parser cannot read',
  },
  {
    name: 'a description written as a block',
    change: (root) =>
      edit(
        root,
        `${PLUGIN}/skills/taskade/SKILL.md`,
        /^description: .*$/m,
        'description: >-\n  Use Taskade.',
      ),
    expect: 'on one line',
  },
  {
    name: 'a description that continues on a second line',
    change: (root) =>
      edit(
        root,
        `${PLUGIN}/skills/taskade/SKILL.md`,
        /^description: .*$/m,
        `description: Use Taskade.\n  ${'a'.repeat(DESCRIPTION_LIMIT + 1)}`,
      ),
    expect: 'on one line',
  },
  {
    name: 'a block description with a space after the marker',
    change: (root) =>
      edit(
        root,
        `${PLUGIN}/skills/taskade/SKILL.md`,
        /^description: .*$/m,
        'description: >- \n  Use Taskade.',
      ),
    expect: 'on one line',
  },
  {
    name: 'a skill with Windows line ends passes',
    change: (root) => edit(root, `${PLUGIN}/skills/taskade-report/SKILL.md`, /\n/g, '\r\n'),
    expect: null,
  },
  {
    name: 'a link example inside an indented code fence passes',
    change: (root) =>
      edit(
        root,
        `${PLUGIN}/skills/taskade/SKILL.md`,
        /$/,
        '\n- An item\n\n  ```md\n  See [x](nowhere.md)\n  ```\n',
      ),
    expect: null,
  },
  {
    name: 'a pnpm lock file in the plugin folder',
    change: (root) => writeFileSync(join(root, PLUGIN, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n'),
    expect: 'package manager file',
  },
  {
    name: 'a prompt link with a placeholder in its path',
    change: (root) =>
      edit(
        root,
        `${PLUGIN}/skills/taskade/SKILL.md`,
        /$/,
        '\nOpen `https://www.taskade.com/spaces/<spaceId>?prompt=<text>`\n',
      ),
    expect: 'can carry a prompt',
  },
  {
    name: 'a /create link with another parameter first passes',
    change: (root) =>
      edit(
        root,
        `${PLUGIN}/skills/taskade/SKILL.md`,
        /$/,
        '\nOpen `https://www.taskade.com/create?ref=nav&prompt=<text>`. The parameter is `?prompt=`.\n',
      ),
    expect: null,
  },
  {
    name: 'an em dash in a text file with an upper case extension',
    change: (root) =>
      writeFileSync(join(root, PLUGIN, 'skills/taskade/NOTES.TXT'), 'One — two.\n'),
    expect: 'em dash',
  },
  {
    name: 'a version that differs in one manifest',
    change: (root) =>
      edit(
        root,
        `${PLUGIN}/.cursor-plugin/plugin.json`,
        /"version": "[^"]+"/,
        '"version": "9.9.9"',
      ),
    expect: 'not the same in each manifest',
  },
  {
    name: 'a marketplace that points at the repository root',
    change: (root) => edit(root, '.claude-plugin/marketplace.json', `"./${PLUGIN}"`, '"./"'),
    expect: 'the plugin source must be',
  },
  {
    name: 'a prompt link that is not /create',
    change: (root) =>
      edit(
        root,
        `${PLUGIN}/skills/taskade/SKILL.md`,
        /$/,
        '\nOpen https://www.taskade.com/spaces/x?prompt=hello\n',
      ),
    expect: 'can carry a prompt',
  },
  {
    name: 'an em dash',
    change: (root) => edit(root, 'README.md', /$/, '\nOne — two.\n'),
    expect: 'em dash',
  },
  {
    name: 'a skill that the README does not list',
    change: (root) => {
      cpSync(join(root, PLUGIN, 'skills/taskade-report'), join(root, PLUGIN, 'skills/new-skill'), {
        recursive: true,
      });
      edit(root, `${PLUGIN}/skills/new-skill/SKILL.md`, /^name: taskade-report$/m, 'name: new-skill');
    },
    expect: 'no row for new-skill',
  },
];

function edit(root, file, pattern, replacement) {
  const before = readFileSync(join(root, file), 'utf8');
  const after = before.replace(pattern, replacement);
  if (after === before) {
    throw new Error(`self-test: the pattern did not match in ${file}`);
  }
  writeFileSync(join(root, file), after);
}

function selfTest() {
  const failures = [];
  for (const testCase of SELF_TEST) {
    const root = mkdtempSync(join(tmpdir(), 'skills-check-'));
    try {
      for (const item of [
        'plugins',
        '.claude-plugin',
        '.cursor-plugin',
        '.agents',
        'README.md',
        'CONTRIBUTING.md',
      ]) {
        cpSync(join(REPO_ROOT, item), join(root, item), { recursive: true });
      }
      testCase.change(root);
      const problems = checkAll(root);
      const passed =
        testCase.expect == null
          ? problems.length === 0
          : problems.some((problem) => problem.includes(testCase.expect));
      if (!passed) {
        failures.push(`${testCase.name}: got ${JSON.stringify(problems)}`);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
  return failures;
}

// The version rule reads git history, so its cases run in a temporary repository.
function selfTestVersionRule() {
  const root = mkdtempSync(join(tmpdir(), 'skills-check-git-'));
  const git = (...args) =>
    execFileSync(
      'git',
      [
        '-C',
        root,
        '-c',
        'user.name=check',
        '-c',
        'user.email=check@example.com',
        // The settings of the person who runs the test must not sign or hook these commits.
        '-c',
        'commit.gpgsign=false',
        '-c',
        'tag.gpgsign=false',
        '-c',
        'core.hooksPath=/dev/null',
        ...args,
      ],
      { stdio: 'ignore' },
    );
  const setVersion = (version) => {
    for (const file of VERSION_FILES) {
      edit(root, file, /"version": "[^"]+"/, `"version": "${version}"`);
    }
  };
  const failures = [];
  const expectProblem = (name, base, text) => {
    const problems = checkVersionAgainst(root, base);
    const passed =
      text == null ? problems.length === 0 : problems.some((problem) => problem.includes(text));
    if (!passed) {
      failures.push(`${name}: got ${JSON.stringify(problems)}`);
    }
  };
  try {
    for (const item of ['plugins', '.claude-plugin', '.cursor-plugin', '.agents']) {
      cpSync(join(REPO_ROOT, item), join(root, item), { recursive: true });
    }
    setVersion('1.0.0');
    git('init', '--quiet');
    git('add', '--all');
    git('commit', '--quiet', '--message', 'base');
    git('tag', 'base');
    expectProblem('no change passes', 'base', null);
    expectProblem('a ref that git cannot read', 'no-such-ref', 'git cannot read the ref');

    edit(root, `${PLUGIN}/skills/taskade/SKILL.md`, /$/, '\nOne more line.\n');
    git('commit', '--quiet', '--all', '--message', 'change a skill');
    expectProblem('a change with the same version', 'base', 'is not above 1.0.0');

    setVersion('0.9.9');
    git('commit', '--quiet', '--all', '--message', 'lower the version');
    expectProblem('a change with a lower version', 'base', 'is not above 1.0.0');

    setVersion('1.0.1');
    git('commit', '--quiet', '--all', '--message', 'raise the version');
    expectProblem('a change with a higher version passes', 'base', null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  return failures;
}

const VALUE_FLAGS = { '--base': 'origin/main', '--mcp': '../mcp' };

// Reads the arguments. Accepts `--flag value` and `--flag=value`.
// Returns `{ error }` for an argument that the script does not know and for a flag with no value,
// so that a wrong flag cannot skip a rule.
function parseArgs(argv) {
  const args = argv.flatMap((arg) => {
    const pair = /^(--[a-z-]+)=(.*)$/.exec(arg);
    return pair == null ? [arg] : [pair[1], pair[2]];
  });
  const result = { selfTest: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--self-test') {
      result.selfTest = true;
    } else if (arg in VALUE_FLAGS) {
      const value = args[index + 1];
      if (value == null || value === '' || value.startsWith('--')) {
        return { error: `${arg} needs a value, for example ${arg} ${VALUE_FLAGS[arg]}` };
      }
      result[arg === '--base' ? 'base' : 'mcpDir'] = value;
      index += 1;
    } else {
      return { error: `Unknown argument ${arg}. Use --base <ref>, --mcp <dir> or --self-test.` };
    }
  }
  return result;
}

const ARG_CASES = [
  { argv: [], expect: { selfTest: false } },
  { argv: ['--base', 'origin/main'], expect: { selfTest: false, base: 'origin/main' } },
  { argv: ['--base=HEAD~1'], expect: { selfTest: false, base: 'HEAD~1' } },
  { argv: ['--mcp=../mcp'], expect: { selfTest: false, mcpDir: '../mcp' } },
  { argv: ['--self-test'], expect: { selfTest: true } },
  { argv: ['--base'], expect: 'needs a value' },
  { argv: ['--base='], expect: 'needs a value' },
  { argv: ['--mcp', '--base', 'main'], expect: 'needs a value' },
  { argv: ['--bse', 'HEAD~1'], expect: 'Unknown argument --bse' },
  { argv: ['HEAD~1'], expect: 'Unknown argument HEAD~1' },
];

function selfTestArgs() {
  return ARG_CASES.flatMap(({ argv, expect }) => {
    const result = parseArgs(argv);
    const passed =
      typeof expect === 'string'
        ? (result.error ?? '').includes(expect)
        : JSON.stringify(result) === JSON.stringify(expect);
    return passed ? [] : [`arguments ${JSON.stringify(argv)}: got ${JSON.stringify(result)}`];
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.error != null) {
    console.error(options.error);
    process.exit(1);
  }

  if (options.selfTest) {
    const failures = [...selfTest(), ...selfTestVersionRule(), ...selfTestArgs()];
    if (failures.length > 0) {
      console.error(`Self-test failed:\n${failures.join('\n')}`);
      process.exit(1);
    }
    console.log(
      `Self-test passed: ${SELF_TEST.length} cases, 5 cases of the version rule and ${ARG_CASES.length} cases of the arguments.`,
    );
    return;
  }

  if (options.mcpDir != null) {
    console.log(reportMcp(REPO_ROOT, options.mcpDir));
    return;
  }

  const base = options.base;
  // Imported here, after this module has run, because check-triggers.mjs imports this module.
  const { checkTriggers } = await import('./check-triggers.mjs');
  const problems = [
    ...checkAll(REPO_ROOT),
    ...(base != null ? checkVersionAgainst(REPO_ROOT, base) : []),
    ...checkTriggers(REPO_ROOT).problems,
  ];
  if (problems.length > 0) {
    console.error(
      `${problems.length} problem(s):\n${problems.map((problem) => `- ${problem}`).join('\n')}`,
    );
    process.exit(1);
  }
  console.log(
    `Check passed: ${skillNames(REPO_ROOT).length} skills, version ${readJson(REPO_ROOT, `${PLUGIN}/plugin.json`).version}.`,
  );
}

// Runs only when this file is the command, not when another script imports it.
if (process.argv[1] != null && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // No top-level await: main() imports check-triggers.mjs, which imports this module.
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
