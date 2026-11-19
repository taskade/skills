#!/usr/bin/env node
// Checks the name and the description of each skill, and the trigger test set in
// tests/triggers.json. An agent client picks a skill from its name and description alone.
// No dependencies.
//
//   node scripts/check-triggers.mjs              all rules, and the list of collisions
//   node scripts/check-triggers.mjs --overlap    also the overlap of each pair of skills
//   node scripts/check-triggers.mjs --self-test  break a copy in one way for each case
//
// `node scripts/check.mjs` runs the same rules. This script cannot judge which skill a client
// picks. tests/TRIGGERS.md records that judgment for each prompt.

import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DESCRIPTION_LIMIT,
  NAME_LIMIT,
  PLUGIN,
  REPO_ROOT,
  frontmatterOf,
  hasYamlBreak,
  skillNames,
} from './check.mjs';

const TEST_SET = 'tests/triggers.json';
const NO_SKILL = 'none';
const MIN_MUST = 8;
const MIN_NEAR_MISS = 4;

// Two descriptions collide when the Jaccard index of their content words is at this value or
// above. At 0.14 the pairs that people mix up today show (fix-app and fix-first-screen,
// check-app and secure-app, repo-to-project and spreadsheet-to-app), and the pairs with no
// shared job (build-agent and secure-app) stay far below. Run --overlap to see each value.
const OVERLAP_LIMIT = 0.14;

// Words that carry no job. Each description has them, so they say nothing about a collision.
const STOP_WORDS = new Set(
  `a an the and or of to in on for with from by at as is are be it its this that these those
  than then there their them they his her my me i you your we our us not no do does did done
  can will must if when after before each one two three only also all any so up out into over
  who what which how why where use used user says say said skill next job jobs instead see
  taskade genesis eve until about more most first new way thing same other own theirs mine
  get put want ask asks give make app apps check`.split(/\s+/),
);

// Says when to use the skill, for example "Use when the user says ...".
const WHEN_PATTERN = /\b(?:use|trigger)(?: this skill)? (?:when|whenever|if)\b|\bwhen the user\b/i;

function stem(word) {
  if (word.length <= 3 || /(?:ss|us|is)$/.test(word)) {
    return word;
  }
  return word.replace(/ies$/, 'y').replace(/s$/, '').replace(/(?:ing|ed)$/, '');
}

function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// A skill name as a word, not a part of a longer name or of a host such as taskade.com.
function namePattern(name) {
  return new RegExp(`(?<![a-z0-9-])${escape(name)}(?![a-z0-9-]|\\.[a-z])`, 'g');
}

// The content words of a description, with the names of the skills taken out.
export function contentWords(description, names) {
  let text = description;
  for (const name of [...names].sort((a, b) => b.length - a.length)) {
    text = text.replace(namePattern(name), ' ');
  }
  return new Set(
    (text.toLowerCase().match(/[a-z][a-z'-]*/g) ?? [])
      .map((word) => word.replace(/'s$/, ''))
      .filter((word) => !STOP_WORDS.has(word))
      .map(stem)
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word)),
  );
}

export function overlapOf(a, b) {
  const shared = [...a].filter((word) => b.has(word));
  const union = new Set([...a, ...b]);
  return { value: union.size === 0 ? 0 : shared.length / union.size, shared };
}

function readSkills(root) {
  return skillNames(root).flatMap((folder) => {
    const file = join(root, PLUGIN, 'skills', folder, 'SKILL.md');
    if (!existsSync(file)) {
      return [];
    }
    const text = readFileSync(file, 'utf8');
    const fields = frontmatterOf(text) ?? {};
    return [{ folder, name: fields.name ?? folder, description: fields.description ?? '', text }];
  });
}

function checkDescriptions(skills) {
  return skills.flatMap((skill) => {
    const label = `${PLUGIN}/skills/${skill.folder}/SKILL.md`;
    const problems = [];
    if (skill.name.length > NAME_LIMIT) {
      problems.push(`${label}: name has ${skill.name.length} characters, the limit is ${NAME_LIMIT}`);
    }
    if (skill.description.length > DESCRIPTION_LIMIT) {
      problems.push(
        `${label}: description has ${skill.description.length} characters, the limit is ${DESCRIPTION_LIMIT}`,
      );
    }
    if (hasYamlBreak(skill.text)) {
      problems.push(`${label}: the description has ": " or " #", which a YAML parser cannot read`);
    }
    if (!WHEN_PATTERN.test(skill.description)) {
      problems.push(`${label}: the description does not say when to use the skill ("Use when ...")`);
    }
    return problems;
  });
}

// Reads the test set. Returns the problems and a list of { owner, prompt, expect }.
function readTestSet(root, names) {
  const file = join(root, TEST_SET);
  if (!existsSync(file)) {
    return { problems: [`${TEST_SET}: file is missing`], cases: [] };
  }
  let json;
  try {
    json = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    return { problems: [`${TEST_SET}: not valid JSON (${error.message})`], cases: [] };
  }
  const skills = json?.skills;
  if (skills == null || typeof skills !== 'object') {
    return { problems: [`${TEST_SET}: no "skills" object`], cases: [] };
  }
  const known = new Set(names);
  const problems = [];
  const cases = [];
  const seen = new Map();
  for (const name of names) {
    if (!(name in skills)) {
      problems.push(`${TEST_SET}: the skill ${name} has no entry`);
    }
  }
  for (const [owner, entry] of Object.entries(skills)) {
    if (!known.has(owner)) {
      problems.push(`${TEST_SET}: "${owner}" is not a skill in ${PLUGIN}/skills`);
      continue;
    }
    const must = Array.isArray(entry?.must) ? entry.must : [];
    const nearMiss = Array.isArray(entry?.nearMiss) ? entry.nearMiss : [];
    if (must.length < MIN_MUST) {
      problems.push(`${TEST_SET}: ${owner} has ${must.length} "must" prompts, it needs ${MIN_MUST}`);
    }
    if (nearMiss.length < MIN_NEAR_MISS) {
      problems.push(
        `${TEST_SET}: ${owner} has ${nearMiss.length} "nearMiss" prompts, it needs ${MIN_NEAR_MISS}`,
      );
    }
    const items = [
      ...must.map((prompt) => ({ prompt, expect: owner })),
      ...nearMiss.map((item) => ({ prompt: item?.prompt, expect: item?.expect })),
    ];
    for (const { prompt, expect } of items) {
      if (typeof prompt !== 'string' || prompt.trim() === '') {
        problems.push(`${TEST_SET}: ${owner} has a prompt that is empty or not text`);
        continue;
      }
      if (expect !== NO_SKILL && !known.has(expect)) {
        problems.push(`${TEST_SET}: "${prompt}" expects "${expect}", which is not a skill`);
      }
      if (expect === owner && !must.includes(prompt)) {
        problems.push(`${TEST_SET}: the near miss "${prompt}" expects its own skill ${owner}`);
      }
      // A prompt can be in the set more than one time, with the same expected skill each time.
      const key = prompt.trim().toLowerCase();
      if (seen.has(key) && seen.get(key) !== expect) {
        problems.push(
          `${TEST_SET}: "${prompt}" expects ${seen.get(key)} in one place and ${expect} in another`,
        );
      }
      seen.set(key, expect);
      cases.push({ owner, prompt, expect });
    }
  }
  return { problems, cases };
}

// A pair of descriptions at or above OVERLAP_LIMIT is a collision. A collision passes only when
// one description names the other skill, and the test set has a near miss in each direction.
function checkCollisions(skills, cases) {
  const names = skills.map((skill) => skill.name);
  const words = new Map(skills.map((skill) => [skill.name, contentWords(skill.description, names)]));
  const pairs = [];
  for (let i = 0; i < skills.length; i += 1) {
    for (let j = i + 1; j < skills.length; j += 1) {
      const [a, b] = [skills[i], skills[j]];
      pairs.push({ a, b, ...overlapOf(words.get(a.name), words.get(b.name)) });
    }
  }
  pairs.sort((x, y) => y.value - x.value);
  const nearMiss = (owner, expect) =>
    cases.some((item) => item.owner === owner && item.expect === expect);
  const names2 = (skill, other) => namePattern(other.name).test(skill.description);
  const problems = [];
  const collisions = pairs.filter((pair) => pair.value >= OVERLAP_LIMIT);
  for (const { a, b, value, shared } of collisions) {
    const label = `${a.name} and ${b.name} (overlap ${value.toFixed(2)}: ${shared.join(', ')})`;
    if (!names2(a, b) && !names2(b, a)) {
      problems.push(`${label}: the descriptions share content words, and neither names the other`);
    }
    const missing = [
      [a, b],
      [b, a],
    ]
      .filter(([x, y]) => !nearMiss(x.name, y.name))
      .map(([x, y]) => `${x.name} to ${y.name}`);
    if (missing.length > 0) {
      problems.push(`${label}: ${TEST_SET} has no near-miss prompt from ${missing.join(' or ')}`);
    }
  }
  return { problems, pairs, collisions };
}

export function checkTriggers(root) {
  const skills = readSkills(root);
  const testSet = readTestSet(
    root,
    skills.map((skill) => skill.name),
  );
  const collisions = checkCollisions(skills, testSet.cases);
  return {
    problems: [...checkDescriptions(skills), ...testSet.problems, ...collisions.problems],
    pairs: collisions.pairs,
    collisions: collisions.collisions,
    cases: testSet.cases,
  };
}

// Each case changes a copy of the repository and names the text that the check must print.
const SELF_TEST = [
  { name: 'a clean copy passes', change: () => {}, expect: null },
  {
    name: 'a description over the limit',
    change: (root) =>
      editSkill(root, 'taskade-report', /^description: .*$/m, (line) =>
        `${line} ${'word '.repeat(DESCRIPTION_LIMIT / 5)}`.trimEnd(),
      ),
    expect: `the limit is ${DESCRIPTION_LIMIT}`,
  },
  {
    name: 'a name over the limit',
    change: (root) =>
      editSkill(root, 'taskade-report', /^name: .*$/m, () => `name: ${'a'.repeat(NAME_LIMIT + 1)}`),
    expect: `the limit is ${NAME_LIMIT}`,
  },
  {
    name: 'a description with a colon and a space',
    change: (root) =>
      editSkill(root, 'taskade-report', /^description: .*$/m, () =>
        'description: Write a report. Use when the user asks for a report. Next jobs: none.',
      ),
    expect: 'which a YAML parser cannot read',
  },
  {
    name: 'a description that does not say when to use the skill',
    change: (root) =>
      editSkill(root, 'taskade-report', /^description: .*$/m, (line) =>
        line.replace(/Use when the user asks for/, 'It writes'),
      ),
    expect: 'does not say when to use the skill',
  },
  {
    name: 'two descriptions that collide and do not name each other',
    change: (root) => {
      cpSync(
        join(root, PLUGIN, 'skills/taskade-fix-app'),
        join(root, PLUGIN, 'skills/taskade-repair-app'),
        { recursive: true },
      );
      editSkill(root, 'taskade-repair-app', /^name: .*$/m, () => 'name: taskade-repair-app');
    },
    expect: 'neither names the other',
  },
  {
    name: 'a collision with no near miss in one direction',
    change: (root) =>
      editTestSet(root, (json) => {
        const entry = json.skills['taskade-secure-app'];
        entry.nearMiss = entry.nearMiss.filter((item) => item.expect !== 'taskade-check-app');
      }),
    expect: 'no near-miss prompt from taskade-secure-app to taskade-check-app',
  },
  {
    name: 'a skill with too few "must" prompts',
    change: (root) =>
      editTestSet(root, (json) => {
        json.skills['taskade-report'].must = json.skills['taskade-report'].must.slice(0, MIN_MUST - 1);
      }),
    expect: `"must" prompts, it needs ${MIN_MUST}`,
  },
  {
    name: 'a skill with too few near misses',
    change: (root) =>
      editTestSet(root, (json) => {
        json.skills['taskade-report'].nearMiss = json.skills['taskade-report'].nearMiss.slice(
          0,
          MIN_NEAR_MISS - 1,
        );
      }),
    expect: `"nearMiss" prompts, it needs ${MIN_NEAR_MISS}`,
  },
  {
    name: 'a prompt that expects a skill that does not exist',
    change: (root) =>
      editTestSet(root, (json) => {
        json.skills['taskade-report'].nearMiss.push({ prompt: 'brew coffee', expect: 'taskade-coffee' });
      }),
    expect: 'expects "taskade-coffee", which is not a skill',
  },
  {
    name: 'an entry for a skill that does not exist',
    change: (root) =>
      editTestSet(root, (json) => {
        json.skills['taskade-coffee'] = { must: [], nearMiss: [] };
      }),
    expect: '"taskade-coffee" is not a skill',
  },
  {
    name: 'a skill with no entry',
    change: (root) =>
      editTestSet(root, (json) => {
        delete json.skills['taskade-report'];
      }),
    expect: 'the skill taskade-report has no entry',
  },
  {
    name: 'a near miss that expects its own skill',
    change: (root) =>
      editTestSet(root, (json) => {
        json.skills['taskade-report'].nearMiss.push({ prompt: 'how is my week', expect: 'taskade-report' });
      }),
    expect: 'expects its own skill',
  },
  {
    name: 'one prompt with two expected skills',
    change: (root) =>
      editTestSet(root, (json) => {
        json.skills['taskade-markdown'].must.push(json.skills['taskade-report'].must[0]);
      }),
    expect: 'expects taskade-report in one place and taskade-markdown in another',
  },
  {
    name: 'a test set that is not valid JSON',
    change: (root) => writeFileSync(join(root, TEST_SET), '{'),
    expect: 'not valid JSON',
  },
];

function editSkill(root, folder, pattern, replace) {
  const file = join(root, PLUGIN, 'skills', folder, 'SKILL.md');
  const before = readFileSync(file, 'utf8');
  const after = before.replace(pattern, replace);
  if (after === before) {
    throw new Error(`self-test: the pattern did not match in ${folder}/SKILL.md`);
  }
  writeFileSync(file, after);
}

function editTestSet(root, change) {
  const json = JSON.parse(readFileSync(join(root, TEST_SET), 'utf8'));
  change(json);
  writeFileSync(join(root, TEST_SET), `${JSON.stringify(json, null, 2)}\n`);
}

function selfTest() {
  const failures = [];
  for (const testCase of SELF_TEST) {
    const root = mkdtempSync(join(tmpdir(), 'skills-triggers-'));
    try {
      cpSync(join(REPO_ROOT, 'plugins'), join(root, 'plugins'), { recursive: true });
      cpSync(join(REPO_ROOT, 'tests'), join(root, 'tests'), { recursive: true });
      testCase.change(root);
      const { problems } = checkTriggers(root);
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

function main() {
  const args = process.argv.slice(2);
  const unknown = args.filter((arg) => !['--self-test', '--overlap'].includes(arg));
  if (unknown.length > 0) {
    console.error(`Unknown argument ${unknown[0]}. Use --overlap or --self-test.`);
    process.exit(1);
  }
  if (args.includes('--self-test')) {
    const failures = selfTest();
    if (failures.length > 0) {
      console.error(`Self-test failed:\n${failures.join('\n')}`);
      process.exit(1);
    }
    console.log(`Self-test passed: ${SELF_TEST.length} cases.`);
    return;
  }
  const { problems, pairs, collisions, cases } = checkTriggers(REPO_ROOT);
  const line = ({ a, b, value, shared }) =>
    `- ${a.name} and ${b.name}: ${value.toFixed(2)} (${shared.join(', ')})`;
  if (args.includes('--overlap')) {
    console.log(`Overlap of each pair, the limit is ${OVERLAP_LIMIT}:\n${pairs.map(line).join('\n')}\n`);
  }
  console.log(
    collisions.length === 0
      ? 'Collisions: none.'
      : `Collisions (overlap ${OVERLAP_LIMIT} or above):\n${collisions.map(line).join('\n')}`,
  );
  if (problems.length > 0) {
    console.error(`${problems.length} problem(s):\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
    process.exit(1);
  }
  console.log(`Trigger check passed: ${pairs.length} pairs, ${cases.length} prompts.`);
}

// Runs only when this file is the command, not when check.mjs imports it.
if (process.argv[1] != null && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
