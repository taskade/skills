# AGENTS.md

This repository holds agent skills for [Taskade](https://www.taskade.com). The skills follow the [Agent Skills specification](https://agentskills.io/specification).

## Use Taskade from an agent

- Start with the front-door skill: `plugins/taskade/skills/taskade/SKILL.md`. Taskade publishes the front-door skill at `https://www.taskade.com/SKILL.md`.
- The tools come from the hosted Taskade MCP server: `https://www.taskade.com/mcp`. The user signs in with a Taskade account through OAuth.
- MCP access is part of every paid Taskade plan (Starter and up).
- The skill `taskade-markdown`, the view advice of `taskade`, and the plan and build request of `taskade-build-app` work with no connection. The user needs a Taskade account to import a file, to change a view or to start a build.
- Taskade EVE builds an app, creates an automation, and adds or removes its steps inside Taskade. Write the request for Taskade EVE. The owner publishes the app and chooses who can use it in Taskade. When the server lists the tools, the skills turn an automation On or Off, change a step setting, and set the sign-up of an app, each with a preview and the owner's yes.
- Name each new skill `taskade-<verb>-<object>` for a job or `taskade-<noun>` for a reference. The front door stays `taskade`.

Install commands:

```sh
claude plugin marketplace add taskade/skills && claude plugin install taskade@taskade-skills   # Claude Code
codex plugin marketplace add taskade/skills                                                    # Codex
npx skills add taskade/skills                                                                  # any other agent, skills only
```

## Change this repository

- Edit a skill only in `plugins/taskade/skills/<name>/`. It is the only copy.
- Read [CONTRIBUTING.md](CONTRIBUTING.md) before you write. It has the rules for a skill and the writing rules.
- State only what Taskade does today. Do not add a tool name that the Taskade MCP server does not list.
- The plugin folder holds only Markdown, JSON, YAML, text and image files.
- Run `node scripts/check.mjs --base origin/main` before you open a pull request. It also runs `scripts/check-triggers.mjs`.
- When you change a `description`, judge each prompt in `tests/triggers.json` again, and update `tests/TRIGGERS.md`. A prompt that passed before must still pass.
- A change in `plugins/taskade/` needs a new plugin version: `./scripts/bump.sh patch`, or `./scripts/bump.sh minor` for a new skill.
