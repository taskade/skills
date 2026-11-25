#!/usr/bin/env node
// Writes hosted-tools.json, the snapshot of the tool list of the hosted Taskade MCP server.
// scripts/check.mjs reads the snapshot and fails when a skill names a tool that it does not hold.
// No dependencies.
//
//   node scripts/hosted-tools.mjs sync         fetch the public tool list file, write the snapshot
//   node scripts/hosted-tools.mjs --self-test  give the reader bad lists, one for each case
//
// The sync changes nothing when the file does not answer 200 with the expected shape.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HOSTED_TOOLS = 'hosted-tools.json';
export const SERVER = 'https://www.taskade.com/mcp';
export const TOOL_LIST_URL = 'https://www.taskade.com/.well-known/mcp/tools.json';

const FLAGS = ['readOnly', 'destructive', 'openWorld'];
const TOOL_NAME = /^[a-z][a-z0-9_]*$/;

// Reads a tool list and returns the snapshot, sorted by name, with only the known fields.
// Throws with the reason when the list does not have the expected shape.
export function toSnapshot(data) {
  if (data == null || typeof data !== 'object' || !Array.isArray(data.tools)) {
    throw new Error('The tool list has no "tools" array.');
  }
  if (data.server !== undefined && data.server !== SERVER) {
    throw new Error(`The tool list names the server ${data.server}, not ${SERVER}.`);
  }
  const tools = data.tools.map((tool, index) => {
    if (tool == null || typeof tool !== 'object' || typeof tool.name !== 'string') {
      throw new Error(`Tool ${index} has no "name".`);
    }
    if (!TOOL_NAME.test(tool.name)) {
      throw new Error(`The tool name "${tool.name}" is not lower case letters, digits and "_".`);
    }
    const entry = { name: tool.name };
    if (tool.title !== undefined) {
      if (typeof tool.title !== 'string') {
        throw new Error(`The "title" of ${tool.name} is not a string.`);
      }
      entry.title = tool.title;
    }
    for (const flag of FLAGS) {
      if (tool[flag] !== undefined) {
        if (typeof tool[flag] !== 'boolean') {
          throw new Error(`The "${flag}" of ${tool.name} is not true or false.`);
        }
        entry[flag] = tool[flag];
      }
    }
    return entry;
  });
  if (tools.length === 0) {
    throw new Error('The tool list has no tools.');
  }
  tools.sort((a, b) => (a.name < b.name ? -1 : 1));
  const repeated = tools.find((tool, index) => index > 0 && tools[index - 1].name === tool.name);
  if (repeated != null) {
    throw new Error(`The tool list holds a name two times: ${repeated.name}.`);
  }
  if (data.count !== undefined && data.count !== tools.length) {
    throw new Error(`The tool list says "count": ${data.count}, but it holds ${tools.length} tools.`);
  }
  return { server: SERVER, count: tools.length, tools };
}

export function formatSnapshot(snapshot) {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

// Returns the snapshot of the file, or throws when the file is not as `sync` writes it.
export function readSnapshot(root) {
  const text = readFileSync(join(root, HOSTED_TOOLS), 'utf8');
  const snapshot = toSnapshot(JSON.parse(text));
  if (formatSnapshot(snapshot) !== text) {
    throw new Error(
      'the file must hold "server", "count" and the tools sorted by name, as `node scripts/hosted-tools.mjs sync` writes it.',
    );
  }
  return snapshot;
}

async function sync() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  let snapshot;
  try {
    const response = await fetch(TOOL_LIST_URL, { signal: AbortSignal.timeout(30_000) });
    if (response.status !== 200) {
      throw new Error(`the file answered HTTP ${response.status}, not 200.`);
    }
    snapshot = toSnapshot(await response.json());
  } catch (error) {
    console.error(
      `Could not read ${TOOL_LIST_URL}: ${error.message}\n${HOSTED_TOOLS} did not change.`,
    );
    process.exit(1);
  }
  writeFileSync(join(root, HOSTED_TOOLS), formatSnapshot(snapshot));
  console.log(`Wrote ${HOSTED_TOOLS} (${snapshot.count} tools). Run node scripts/check.mjs next.`);
}

// Each case gives the reader a bad list and names the text of the error.
const SELF_TEST = [
  { name: 'no tools array', data: { name: 'x' }, expect: 'no "tools" array' },
  { name: 'an empty list', data: { tools: [] }, expect: 'has no tools' },
  { name: 'a tool with no name', data: { tools: [{ title: 'x' }] }, expect: 'has no "name"' },
  { name: 'a name in camel case', data: { tools: [{ name: 'listTasks' }] }, expect: 'lower case' },
  {
    name: 'a flag that is text',
    data: { tools: [{ name: 'a', readOnly: 'yes' }] },
    expect: 'not true or false',
  },
  {
    name: 'a name two times',
    data: { tools: [{ name: 'a' }, { name: 'a' }] },
    expect: 'two times',
  },
  { name: 'a wrong count', data: { count: 3, tools: [{ name: 'a' }] }, expect: 'holds 1 tools' },
  {
    name: 'another server',
    data: { server: 'https://example.com/mcp', tools: [{ name: 'a' }] },
    expect: 'names the server',
  },
];

function selfTest() {
  const failures = SELF_TEST.flatMap((testCase) => {
    try {
      toSnapshot(testCase.data);
      return [`${testCase.name}: no error`];
    } catch (error) {
      return error.message.includes(testCase.expect) ? [] : [`${testCase.name}: ${error.message}`];
    }
  });
  // A good list comes back sorted by name, with only the known fields.
  const good = toSnapshot({
    tools: [
      { name: 'list_tasks', title: 'List tasks', readOnly: true, inputSchema: {} },
      { name: 'delete_task' },
    ],
  });
  const expected = {
    server: SERVER,
    count: 2,
    tools: [{ name: 'delete_task' }, { name: 'list_tasks', title: 'List tasks', readOnly: true }],
  };
  if (JSON.stringify(good) !== JSON.stringify(expected)) {
    failures.push(`a good list: got ${JSON.stringify(good)}`);
  }
  if (failures.length > 0) {
    console.error(`Self-test failed:\n${failures.join('\n')}`);
    process.exit(1);
  }
  console.log(`Self-test passed: ${SELF_TEST.length + 1} cases.`);
}

// Runs only when this file is the command, not when another script imports it.
if (process.argv[1] != null && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv.slice(2).join(' ');
  if (mode === 'sync') {
    sync();
  } else if (mode === '--self-test') {
    selfTest();
  } else {
    console.error('Usage: node scripts/hosted-tools.mjs sync | --self-test');
    process.exit(1);
  }
}
