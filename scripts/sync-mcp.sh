#!/usr/bin/env bash
# Writes the plugin of this repository into a checkout of taskade/mcp.
# taskade/mcp holds a generated copy of the plugin. The Claude directory reads
# plugins/taskade/, and the other hosts read the root files of taskade/mcp.
#   ./scripts/sync-mcp.sh <path to a taskade/mcp checkout> [skill ...]
# With no skill name, the script writes these files in taskade/mcp:
#   - skills/ and plugins/taskade/skills/: equal to plugins/taskade/skills/ here. The script
#     copies each skill and removes each other file from the two folders.
#   - plugins/taskade/README.md: the README of the plugin here, with a note of the version.
#   - .mcp.json and assets/logo.png, at the root and in plugins/taskade/.
#   - The plugin version in each manifest, and the description of the Claude Code, Cursor
#     and Codex manifests and of the Claude Code marketplace. Each manifest keeps its other
#     fields, because the install commands and the listings of taskade/mcp read them.
# With skill names, the script copies only those skills into the two folders.
# The script refuses a version that is older than the version in taskade/mcp. It also
# refuses a checkout of taskade/mcp with changes that are not committed in a path that it
# writes, because the sync replaces those paths. It writes every file in a temporary folder
# first, and copies the files into taskade/mcp only after each check passed, so that a
# failed check changes nothing there.
#   ./scripts/sync-mcp.sh --self-test   runs the script against made-up taskade/mcp copies
# The workflow .github/workflows/sync-mcp.yml runs this script for each version tag.
set -euo pipefail

usage() {
  echo "Usage: $0 <path to a taskade/mcp checkout> [skill ...]" >&2
  echo "       $0 --self-test" >&2
  exit 1
}

# Each path that the sync writes in taskade/mcp.
outputs=(
  skills plugins/taskade/skills plugins/taskade/README.md
  .mcp.json plugins/taskade/.mcp.json assets/logo.png plugins/taskade/assets/logo.png
  plugin.json .claude-plugin/plugin.json plugins/taskade/.claude-plugin/plugin.json
  .cursor-plugin/plugin.json .claude-plugin/marketplace.json gemini-extension.json
)

if [[ "${1:-}" == "--self-test" ]]; then
  script="$(cd -- "$(dirname -- "$0")" && pwd -P)/$(basename -- "$0")"
  source_repo="$(cd -- "$(dirname -- "$0")/.." && pwd -P)"
  work="$(mktemp -d)"
  trap 'rm -rf "${work:?}"' EXIT
  # A clone holds only committed files, so the check for files that are not committed
  # passes. The script under test is the one of the working tree.
  git clone --quiet "$source_repo" "$work/skills"
  cp "$script" "$work/skills/scripts/sync-mcp.sh"
  version="$(node -p 'require(process.argv[1]).version' "$work/skills/plugins/taskade/plugin.json")"

  # Writes a made-up taskade/mcp checkout with each manifest at the given version.
  make_mcp() {
    rm -rf "${1:?}"
    mkdir -p "$1/skills/old-skill" "$1/plugins/taskade/skills" "$1/plugins/taskade/.claude-plugin" "$1/.claude-plugin" "$1/.cursor-plugin"
    echo old > "$1/skills/old-skill/SKILL.md"
    node - "$1" "$2" <<'NODE'
const { writeFileSync } = require('node:fs');
const [dir, version] = process.argv.slice(2);
const manifest = { name: 'taskade', version, description: 'old' };
const write = (file, json) => writeFileSync(`${dir}/${file}`, `${JSON.stringify(json, null, 2)}\n`);
for (const file of ['plugin.json', '.claude-plugin/plugin.json', 'plugins/taskade/.claude-plugin/plugin.json', '.cursor-plugin/plugin.json']) {
  write(file, manifest);
}
write('.claude-plugin/marketplace.json', { name: 'taskade', plugins: [{ name: 'taskade', description: 'old', version }] });
write('gemini-extension.json', { name: 'taskade', version });
NODE
    git -C "$1" init --quiet
    commit_mcp "$1"
  }
  # Commits each file of a made-up taskade/mcp checkout, as a maintainer does after a sync.
  commit_mcp() {
    git -C "$1" add --all
    git -C "$1" -c user.name=self-test -c user.email=self-test@example.com commit --quiet --message sync
  }
  # Prints one hash of every file in a folder, except the files of Git.
  tree_hash() {
    (cd -- "$1" && find . -path ./.git -prune -o -type f -print0 | LC_ALL=C sort -z | xargs -0 shasum | shasum)
  }
  fail() {
    echo "Self-test failed: $1" >&2
    exit 1
  }
  mcp="$work/mcp"
  run() {
    "$work/skills/scripts/sync-mcp.sh" "$mcp" > "$work/out.txt" 2>&1
  }

  make_mcp "$mcp" 0.0.1
  run || fail "a sync into an older copy stopped: $(cat "$work/out.txt")"
  [[ -f "$mcp/skills/taskade/SKILL.md" && ! -e "$mcp/skills/old-skill" ]] || fail "the skill folder is not equal to the plugin"
  [[ "$(node -p 'require(process.argv[1]).version' "$mcp/gemini-extension.json")" == "$version" ]] || fail "the version was not set"

  commit_mcp "$mcp"
  before="$(tree_hash "$mcp")"
  run || fail "a second sync of the same version stopped: $(cat "$work/out.txt")"
  [[ "$(tree_hash "$mcp")" == "$before" ]] || fail "a second sync of the same version changed a file"

  make_mcp "$mcp" 0.0.1
  echo note > "$mcp/skills/old-skill/NOTES.md"
  echo changed > "$mcp/skills/old-skill/SKILL.md"
  before="$(tree_hash "$mcp")"
  run && fail "a sync into a copy with changes that are not committed did not stop"
  grep -q "skills/old-skill/NOTES.md" "$work/out.txt" || fail "the refusal of a changed copy did not name the untracked file"
  grep -q "skills/old-skill/SKILL.md" "$work/out.txt" || fail "the refusal of a changed copy did not name the changed file"
  [[ "$(tree_hash "$mcp")" == "$before" ]] || fail "a refused changed copy changed a file"

  make_mcp "$mcp" 999.0.0
  before="$(tree_hash "$mcp")"
  run && fail "a sync into a newer copy did not stop"
  grep -q "is newer than" "$work/out.txt" || fail "the refusal of an older version gave no reason"
  [[ "$(tree_hash "$mcp")" == "$before" ]] || fail "a refused older version changed a file"

  make_mcp "$mcp" 0.0.1
  node -e 'const f=process.argv[1];const fs=require("node:fs");fs.writeFileSync(f,fs.readFileSync(f,"utf8").replace("0.0.1","999.0.0"))' "$mcp/.cursor-plugin/plugin.json"
  before="$(tree_hash "$mcp")"
  run && fail "a sync into a copy with one newer manifest did not stop"
  [[ "$(tree_hash "$mcp")" == "$before" ]] || fail "a refused older version changed a file"

  make_mcp "$mcp" 0.0.1
  node -e 'const f=process.argv[1];const fs=require("node:fs");fs.writeFileSync(f,fs.readFileSync(f,"utf8").replace(/\n}/,",\n  \"engines\": { \"version\": \"1.0.0\" }\n}"))' "$mcp/.cursor-plugin/plugin.json"
  before="$(tree_hash "$mcp")"
  run && fail "a manifest with two version fields did not stop the sync"
  [[ "$(tree_hash "$mcp")" == "$before" ]] || fail "a failed manifest check changed a file"

  echo "Self-test passed: 6 cases (a sync, the same version again, a target with changes that are not committed, an older version, one newer manifest, a manifest with two version fields)."
  exit 0
fi

if [[ $# -lt 1 ]]; then
  usage
fi
# The script has no option other than --self-test. A path that starts with a dash is
# refused here, so that no command reads it as an option.
if [[ "$1" == -* ]]; then
  echo "$1 is not an option of this script. For a folder with a name that starts with a dash, write ./$1." >&2
  usage
fi
if [[ ! -d "$1" ]]; then
  echo "No folder at $1." >&2
  usage
fi
# Resolve the path before the change of folder, so that a relative path works.
mcp_dir="$(cd -- "$1" && pwd -P)"
shift

cd -- "$(dirname -- "$0")/.."
repo_root="$(pwd -P)"
source_dir="plugins/taskade/skills"

# Only taskade/mcp holds these two files and these two skill folders. A checkout of this
# repository does not pass.
if [[ "$mcp_dir" == "$repo_root" || ! -f "$mcp_dir/gemini-extension.json" || ! -f "$mcp_dir/plugins/taskade/.claude-plugin/plugin.json" || ! -d "$mcp_dir/skills" || ! -d "$mcp_dir/plugins/taskade/skills" ]]; then
  echo "$mcp_dir is not a taskade/mcp checkout." >&2
  usage
fi

# The sync replaces each output path, and it removes each file in the two skill folders that
# the plugin does not hold. A change that is not committed in those paths goes away with no
# copy. So the folder must be the top of a Git checkout, and each output path must be clean.
# The --ignored flag also shows a file that a gitignore hides.
mcp_top="$(git -C "$mcp_dir" rev-parse --show-toplevel 2> /dev/null || true)"
if [[ -z "$mcp_top" || "$(cd -- "$mcp_top" && pwd -P)" != "$mcp_dir" ]]; then
  echo "$mcp_dir is not the top folder of a Git checkout. The script cannot find changes that are not committed." >&2
  usage
fi
dirty="$(git -C "$mcp_dir" status --porcelain --untracked-files=all --ignored -- "${outputs[@]}" | grep -v '\.DS_Store$' || true)"
if [[ -n "$dirty" ]]; then
  echo "$mcp_dir has changes that are not committed in paths that the sync writes:" >&2
  echo "$dirty" >&2
  echo "The sync replaces these paths. Commit or remove each file in this list, then run the script again." >&2
  echo "To discard each change of an interrupted sync, run 'git checkout -- . && git clean -fd' in $mcp_dir." >&2
  exit 1
fi

# Each file and folder that the sync reads. The script refuses a change in them that is not
# committed, and then reads them only from a copy of the commit. The --ignored flag also
# shows a file that a gitignore hides.
inputs=(plugins/taskade .claude-plugin/marketplace.json)
pending="$(git status --porcelain --ignored -- "${inputs[@]}" | grep -v '\.DS_Store$' || true)"
if [[ -n "$pending" ]]; then
  echo "Commit or remove these files first:" >&2
  echo "$pending" >&2
  exit 1
fi
tags="$(git tag --points-at HEAD)"
commit_dir="$(mktemp -d)"
out_dir="$(mktemp -d)"
trap 'rm -rf "${commit_dir:?}" "${out_dir:?}"' EXIT
git archive HEAD "${inputs[@]}" | tar -x -C "$commit_dir"
cd -- "$commit_dir"

# Check each name before the first write. A name is a folder name, not a path, so that an
# argument cannot point outside the two skill folders.
for skill in "$@"; do
  if [[ ! "$skill" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
    echo "$skill is not a skill name. Use lower case letters, digits and hyphens." >&2
    exit 1
  fi
  if [[ ! -f "$source_dir/$skill/SKILL.md" ]]; then
    echo "No skill named $skill in $source_dir." >&2
    exit 1
  fi
done

version="$(sed -nE 's/^[[:space:]]*"version": "([0-9]+\.[0-9]+\.[0-9]+)".*/\1/p' plugins/taskade/plugin.json | head -n 1)"
if [[ -z "$version" ]]; then
  echo "No version found in plugins/taskade/plugin.json." >&2
  exit 1
fi

# An older version over a newer one puts old skills back. Sync a newer tag instead. Each
# version field of each manifest of taskade/mcp counts.
newest="$(node - "$mcp_dir" "$version" <<'NODE'
const { existsSync, readFileSync } = require('node:fs');
const files = ['plugin.json', '.claude-plugin/plugin.json', 'plugins/taskade/.claude-plugin/plugin.json',
  '.cursor-plugin/plugin.json', '.claude-plugin/marketplace.json', 'gemini-extension.json'];
const [dir, source] = process.argv.slice(2);
const parse = (v) => v.split('.').map(Number);
const newer = (a, b) => { const [x, y] = [parse(a), parse(b)]; return (x[0] - y[0] || x[1] - y[1] || x[2] - y[2]) > 0; };
let newest = '';
for (const file of files) {
  const path = `${dir}/${file}`;
  if (!existsSync(path)) continue;
  for (const [, v] of readFileSync(path, 'utf8').matchAll(/"version": "([0-9]+\.[0-9]+\.[0-9]+)"/g)) {
    if (newer(v, source) && (newest === '' || newer(v, newest))) newest = v;
  }
}
console.log(newest);
NODE
)"
if [[ -n "$newest" ]]; then
  echo "taskade/mcp holds version $newest, which is newer than $version. Sync the tag of $newest or a newer one." >&2
  exit 1
fi

# Start the temporary folder from the files of taskade/mcp, so that each write below
# changes only what a sync owns.
for path in "${outputs[@]}"; do
  if [[ -e "$mcp_dir/$path" ]]; then
    mkdir -p "$out_dir/$(dirname "$path")"
    cp -R "$mcp_dir/$path" "$out_dir/$path"
  fi
done

for target in "$out_dir/skills" "$out_dir/plugins/taskade/skills"; do
  if [[ $# -eq 0 ]]; then
    rsync -a --delete --exclude='.DS_Store' "$source_dir/" "$target/"
  else
    for skill in "$@"; do
      rsync -a --delete --exclude='.DS_Store' "$source_dir/$skill/" "$target/$skill/"
    done
  fi
done

if [[ $# -eq 0 ]]; then
  for target in "$out_dir" "$out_dir/plugins/taskade"; do
    cp plugins/taskade/.mcp.json "$target/.mcp.json"
    mkdir -p "$target/assets"
    cp plugins/taskade/assets/logo.png "$target/assets/logo.png"
  done

  # The note is an HTML comment, so that the listing does not show it.
  {
    echo "<!-- Generated from taskade/skills version $version by scripts/sync-mcp.sh. Edit the plugin in taskade/skills, not here. -->"
    echo
    cat plugins/taskade/README.md
  } > "$out_dir/plugins/taskade/README.md"

  # Replace only the value of each field, so that the format of each file stays the same.
  node - "$out_dir" "$version" <<'NODE'
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const [mcpDir, version] = process.argv.slice(2);
// Each manifest of taskade/mcp, and the manifest here that gives its description.
const manifests = {
  'plugin.json': 'plugins/taskade/plugin.json',
  '.claude-plugin/plugin.json': 'plugins/taskade/.claude-plugin/plugin.json',
  'plugins/taskade/.claude-plugin/plugin.json': 'plugins/taskade/.claude-plugin/plugin.json',
  '.cursor-plugin/plugin.json': 'plugins/taskade/.cursor-plugin/plugin.json',
  '.claude-plugin/marketplace.json': '.claude-plugin/marketplace.json',
  'gemini-extension.json': null,
};
const versionPattern = /"version": "[0-9]+\.[0-9]+\.[0-9]+"/g;
// A manifest holds its description at the top level. A marketplace file holds it in the
// plugin entry.
const descriptionOf = (json) => json.description ?? json.plugins[0].description;
const descriptionPattern = (file) =>
  file.endsWith('marketplace.json')
    ? /^      "description": "(?:[^"\\]|\\.)*"/m
    : /^  "description": "(?:[^"\\]|\\.)*"/m;

for (const [file, source] of Object.entries(manifests)) {
  const path = join(mcpDir, file);
  let text = readFileSync(path, 'utf8');
  if ((text.match(versionPattern) ?? []).length !== 1) {
    throw new Error(`${file} in taskade/mcp must hold exactly one "version" field.`);
  }
  text = text.replace(versionPattern, () => `"version": "${version}"`);
  if (source != null) {
    const pattern = descriptionPattern(file);
    const match = pattern.exec(text);
    if (match == null) {
      throw new Error(`${file} in taskade/mcp has no "description" field at the expected place.`);
    }
    const indent = match[0].slice(0, match[0].indexOf('"'));
    const description = descriptionOf(JSON.parse(readFileSync(source, 'utf8')));
    text = text.replace(pattern, () => `${indent}"description": ${JSON.stringify(description)}`);
  }
  JSON.parse(text);
  writeFileSync(path, text);
}
NODE
fi

# Each check passed. Copy the result into taskade/mcp.
for path in "${outputs[@]}"; do
  if [[ -d "$out_dir/$path" ]]; then
    mkdir -p "$mcp_dir/$path"
    rsync -a --delete --exclude='.DS_Store' "$out_dir/$path/" "$mcp_dir/$path/"
  elif [[ -f "$out_dir/$path" ]]; then
    mkdir -p "$mcp_dir/$(dirname "$path")"
    cp "$out_dir/$path" "$mcp_dir/$path"
  fi
done

if [[ "$tags" != *"taskade--v$version"* ]]; then
  echo "Note: this commit has no tag taskade--v$version. Sync a tagged release to taskade/mcp." >&2
fi
if [[ $# -eq 0 ]]; then
  echo "Synced the plugin of version $version into $mcp_dir."
else
  echo "Synced the skills $* of version $version into $mcp_dir."
fi
echo "Next, in taskade/mcp: run yarn test, read the diff, and open a pull request."
# The sync writes only the version and the description of each manifest. A person writes
# these fields of plugin.json in taskade/mcp in the pull request.
echo "The sync does not write these fields of plugin.json in taskade/mcp. Update them in the pull request:"
echo "  - extensions[\"com.openai\"].publication.release_notes: the release notes of $version."
echo "  - extensions[\"com.openai\"].interface.longDescription, shortDescription and defaultPrompt: when the skills change what the plugin does."
