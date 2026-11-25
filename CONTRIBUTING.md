# Contributing

## Layout

```
plugins/taskade/              the plugin, and the only copy of each skill
  skills/<name>/SKILL.md      frontmatter and the guidance
  skills/<name>/references/   detail that the main file does not carry
  .claude-plugin/plugin.json  manifest for Claude Code
  .cursor-plugin/plugin.json  manifest for Cursor
  plugin.json                 manifest for Codex
  .mcp.json, mcp.json         the hosted Taskade MCP server
.claude-plugin/               marketplace file for Claude Code
.cursor-plugin/               marketplace file for Cursor
.agents/plugins/              marketplace file for Codex
```

Edit a skill in `plugins/taskade/skills/` only. Do not add a second copy in another folder.

The plugin folder can hold only Markdown, JSON, YAML, text and image files. Do not add a script, a symbolic link or a package manager file to it.

## Rules for a skill

1. **State only what Taskade does today.** Before you write that a tool or a feature does something, check it in the product. If a job has no tool, say who does the job (Taskade EVE or the owner in the Taskade app).
2. **Make the `name` equal to the folder name.** Use lower case letters, digits and hyphens.
3. **Write the `description` for the agent that picks a skill.** Say when to use the skill and when not to use it.
4. **Put the failure next to the step that prevents it.** A failure that a person met is worth more than a rule that a person imagined.
5. **Add a check for each step that writes.** The agent reads the result back before it reports.
6. **Do not copy the full tool list into a skill.** The agent reads the tool list from the server, and a full hand list goes stale. A skill can name the tools that a job needs.
7. **Write a request link only with `https://www.taskade.com/create?prompt=`.** That page fills in the request and starts nothing.
8. **Keep each skill whole.** A person can install one skill alone. Link only to files in the folder of the skill. To send the agent to another skill, write its name.

## Writing

- Use short sentences and the active voice. Give one instruction in each sentence.
- Write "Taskade EVE" and "Taskade Genesis" in full.
- Do not use an em dash. Use a period or a comma.
- Do not publish a count that changes with each release, such as a count of tools or views. A plan limit stays exact.

## Checks

Run `node scripts/check.mjs --base origin/main` before you open a pull request. CI runs the same script with the base branch of the pull request. Without `--base`, the script does not check the version. It checks these things:

- Each skill has frontmatter, and its `name` is equal to the folder name.
- Each `description` is one line with no `: ` and no ` #`. A YAML parser reads them as a new key or a comment, and some installers then skip the skill.
- Each relative link, link definition and `references/` path in a skill points at a file in the folder of that skill. No skill names a file in the folder of another skill.
- Each job skill holds the "Before you start" block of `scripts/check.mjs` once, byte for byte, outside a code fence, with one "## Before you start" heading. The front door `taskade` and `taskade-markdown` do not need it.
- Copies of one reference file in two or more skills are equal byte for byte.
- No public text file has an em dash.
- The plugin folder holds only the file types that a plugin directory accepts.
- The plugin version is the same in each manifest, and each marketplace file points at `./plugins/taskade`.
- A request link uses only `https://www.taskade.com/create?prompt=`.
- The README lists each skill.
- On a pull request: a change in `plugins/taskade/` comes with a new plugin version.
- The rules of `scripts/check-triggers.mjs` (see "Trigger tests" below).

`node scripts/check.mjs --self-test` breaks a copy of the repository in one way for each case. Then it makes sure that the check fails. It does not have a case for each rule yet. Add a case there when you add or change a rule.

## Trigger tests

An agent client picks a skill from its `name` and `description` alone. `tests/triggers.json` holds the trigger test set. For each skill, it has at least 8 prompts that must select the skill, and at least 4 near-miss prompts that must select another skill or no Taskade skill. `tests/TRIGGERS.md` records the skill that a client picks for each prompt.

`node scripts/check-triggers.mjs` checks these things. `node scripts/check.mjs` runs it too.

- Each `name` has at most 64 characters, and each `description` at most 1024.
- Each `description` passes the YAML rule of `check.mjs`, and says when to use the skill ("Use when ...").
- The test set has an entry for each skill, with enough prompts, and names only skills that exist. A prompt does not expect two different skills.
- Two descriptions whose content words overlap at 0.14 or above are a collision. A collision passes only when one description names the other skill, and the test set has a near-miss prompt in each direction. `--overlap` prints the value of each pair.

The script cannot judge which skill a client picks. When you change a description, read only the names and the descriptions, pick a skill for each prompt, and update `tests/TRIGGERS.md`. A miss is a defect only when the description is at fault. A prompt that passed before must still pass. `node scripts/check-triggers.mjs --self-test` breaks a copy in one way for each rule.

`./scripts/sync-mcp.sh --self-test` syncs into made-up copies of taskade/mcp. It makes sure that the script refuses an older version and a checkout with changes that are not committed, and that a failed check changes no file.

## Versions and releases

A change to a file in `plugins/taskade/` needs a new plugin version. The version is the same in each manifest.

1. Run `./scripts/bump.sh patch` for a correction, or `./scripts/bump.sh minor` for a new skill.
2. Merge the pull request.
3. Tag the merge commit: `git tag -a taskade--v<version> -m "taskade <version>"`, then push the tag.
4. The workflow "Sync to taskade/mcp" (`.github/workflows/sync-mcp.yml`) runs `scripts/sync-mcp.sh` for the tag and opens a pull request in [taskade/mcp](https://github.com/taskade/mcp). Read the diff of that pull request and merge it. The workflow closes each open sync pull request of an older version, and it opens none while a sync pull request of a newer version is open. A pull request from a fork never counts as a sync.

## The copy in taskade/mcp

taskade/mcp holds a generated copy of the plugin. Do not edit the skills there. `scripts/sync-mcp.sh <path to a taskade/mcp checkout>` writes these files in taskade/mcp:

- `skills/` and `plugins/taskade/skills/`, equal to `plugins/taskade/skills/` here
- `plugins/taskade/README.md`, with a note of the version
- `.mcp.json` and `assets/logo.png`, at the root and in `plugins/taskade/`
- The plugin version in each manifest, and the description of the Claude Code, Cursor and Codex manifests and of the Claude Code marketplace

Each manifest in taskade/mcp keeps its other fields, because the install commands and the listings of taskade/mcp read them.

The workflow reads the secret `TASKADE_MCP_SYNC_TOKEN` of the GitHub environment `mcp-sync`. An administrator of this repository sets it up in this order:

1. Protect `main` of taskade/mcp. The listings install from that branch, so each change must come through a reviewed pull request.
2. In Settings, Environments of this repository, create the environment `mcp-sync`. Add a rule for deployment tags `taskade--v*`. Add a required reviewer if each sync needs an approval.
3. Create a fine-grained personal access token with access to taskade/mcp only, with these permissions:
   - Contents: read and write
   - Pull requests: read and write
4. Add the token to the environment `mcp-sync` as the secret `TASKADE_MCP_SYNC_TOKEN`.

A GitHub App installation token expires after 1 hour, so it cannot be a stored secret.

With no secret, for example in a fork, the workflow prints a notice, opens no pull request and does not fail. The workflow refuses a tag whose commit is not on `main`. A tag that a workflow pushes with `GITHUB_TOKEN` does not start the workflow. To sync a tag again, run the workflow by hand. Pick the tag in "Use workflow from", because the environment accepts only a `taskade--v*` tag, and type the same tag name.

To sync by hand:

1. Check out the tag.
2. Run `./scripts/sync-mcp.sh <path to a taskade/mcp checkout>`. The script prints a note when the commit has no tag for its version. It refuses a version that is older than a version in any manifest of taskade/mcp. It refuses a checkout with changes that are not committed in a path that the sync writes. When a check fails, it changes no file there.
3. Update the fields that the sync does not write, in `plugin.json` of taskade/mcp: the release notes in `publication.release_notes`, and the `interface` text when the skills change what the plugin does. The script names the fields.
4. Run `yarn test` in taskade/mcp.
5. Open a pull request in taskade/mcp.

If a sync by hand stops halfway, run `git checkout -- . && git clean -fd` in the taskade/mcp checkout. Then run the script again.

`node scripts/check.mjs --mcp <path to a taskade/mcp checkout>` reports the difference between the two repositories.

## How a change reaches users

| Channel | What it reads |
|---|---|
| `claude plugin marketplace add taskade/skills`, Codex, `npx skills add taskade/skills` | This repository |
| Claude directory, Gemini CLI, GitHub Copilot CLI, `taskade/mcp` installs | The plugin files in [taskade/mcp](https://github.com/taskade/mcp), a copy of a tagged version of this repository that the sync pull request writes |
| `https://www.taskade.com/SKILL.md` | The front-door skill `taskade` as one file, which Taskade publishes |

## Propose a change

Open an issue first for a new skill or a new name. A correction, clearer text or a better example can go directly to a pull request. If the change comes from a failure that you met, say what occurred.

## License

MIT. We accept contributions under the same license.
