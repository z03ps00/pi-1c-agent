import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { inspectMcpJson } from '../lib/mcp-inspect.mjs';
import { profileRoot, walkFiles } from '../lib/profile-root.mjs';

const MEMORY_INCLUDE = ['remember', 'recall', 'search_tools'];
const MEMORY_EXCLUDE = ['forget', 'call_tool'];
const KNOWLEDGE_INCLUDE = [
  'find',
  'search',
  'read',
  'list',
  'tree',
  'remember',
  'list_watches',
  'grep',
  'glob',
  'health',
];
const KNOWLEDGE_EXCLUDE = ['write', 'edit', 'add_resource', 'forget', 'cancel_watch'];

function stackDir() {
  return path.join(profileRoot(), 'mcp.optional', 'memory-stack');
}

function read(rel) {
  return fs.readFileSync(path.join(stackDir(), rel), 'utf8');
}

test('shipped memory-stack compose has no lab network, lab IPs, or volume mounts', () => {
  const dir = stackDir();
  assert.ok(fs.existsSync(path.join(dir, 'compose.yml')), 'compose.yml missing');
  const files = walkFiles(dir, (p) =>
    /\.(yml|yaml|env|sh|md|template)$/i.test(p) || path.basename(p).endsWith('.template'),
  );
  const hits = [];
  for (const filePath of files) {
    if (filePath.endsWith('.env.example')) continue;
    const text = fs.readFileSync(filePath, 'utf8');
    if (/\/mnt\/vol_/.test(text)) hits.push(`${filePath}:volume-mount`);
    if (/tunnel_tunnel-net/.test(text)) hits.push(`${filePath}:tunnel_tunnel-net`);
    if (/172\.19\.0\./.test(text)) hits.push(`${filePath}:lab-ip`);
  }
  assert.deepEqual(hits, [], `lab coupling in shipped stack:\n${hits.join('\n')}`);
  const compose = read('compose.yml');
  assert.match(compose, /sha256:49e20c09ec7ea2f16c116d9ddb2ea90b4c24bf3f5a83078609e52399487dbec1/);
  assert.match(compose, /sha256:ae7c1ade4c2b304264eb5d031022a0e18ec0671c4fc37f66f6594b7a91edfc0c/);
  assert.match(compose, /memory-net/);
  assert.match(compose, /127\.0\.0\.1/);
  assert.doesNotMatch(compose, /external:\s*true/);
});

test('only example secrets are shipped; real env files are gitignored', () => {
  const secrets = path.join(stackDir(), 'secrets');
  const names = fs.readdirSync(secrets);
  assert.deepEqual(
    names.filter((n) => n.endsWith('.env.example')).sort(),
    ['openviking-client.env.example', 'openviking-root.env.example', 'routerai.env.example'],
  );
  assert.equal(names.filter((n) => n.endsWith('.env') && !n.endsWith('.env.example')).length, 0);
  for (const example of names.filter((n) => n.endsWith('.env.example'))) {
    const text = fs.readFileSync(path.join(secrets, example), 'utf8');
    assert.match(text, /=$/m);
    assert.doesNotMatch(text, /sk-|Bearer |sk-or-/);
  }
  const gitignore = fs.readFileSync(path.join(profileRoot(), '.gitignore'), 'utf8');
  assert.match(gitignore, /mcp\.optional\/memory-stack\/secrets\/\*\.env/);
  assert.match(gitignore, /mcp\.optional\/memory-stack\/data\//);
});

test('client fragments match the shipped servers and default mcp.json stays empty', () => {
  const root = profileRoot();
  const memory = JSON.parse(fs.readFileSync(path.join(root, 'mcp.optional', 'memory.json'), 'utf8'));
  const knowledge = JSON.parse(fs.readFileSync(path.join(root, 'mcp.optional', 'knowledge.json'), 'utf8'));
  assert.deepEqual(memory.memory.includeTools, MEMORY_INCLUDE);
  assert.deepEqual(memory.memory.excludeTools, MEMORY_EXCLUDE);
  assert.deepEqual(knowledge.knowledge.includeTools, KNOWLEDGE_INCLUDE);
  assert.deepEqual(knowledge.knowledge.excludeTools, KNOWLEDGE_EXCLUDE);
  assert.equal(memory.memory.url, '${MEMORY_MCP_URL}');
  assert.equal(knowledge.knowledge.url, '${KNOWLEDGE_MCP_URL}');
  const defaultMcp = JSON.parse(fs.readFileSync(path.join(root, 'mcp.json'), 'utf8'));
  const inspected = inspectMcpJson(defaultMcp);
  assert.deepEqual(inspected.unsolicited, []);
  assert.ok(!defaultMcp.mcpServers?.memory);
  assert.ok(!defaultMcp.mcpServers?.knowledge);
});

test('install prompts route to our pair; Ollama overlay exists; disable keeps data', () => {
  const prompts = path.join(profileRoot(), 'prompts');
  const install = fs.readFileSync(path.join(prompts, 'install-memory-mcp.md'), 'utf8');
  assert.match(install, /memory-stack\.sh/);
  assert.match(install, /routerai/);
  assert.match(install, /ollama/);
  assert.match(install, /8001/);
  assert.match(install, /1933/);
  assert.match(install, /main_dataset/);
  assert.match(install, /disable/);
  assert.doesNotMatch(install, /127\.0\.0\.1:8010:8000/);

  const cognee = fs.readFileSync(path.join(prompts, 'install-cognee.md'), 'utf8');
  assert.match(cognee, /install-memory-mcp/);
  assert.match(cognee, /8001/);
  assert.match(cognee, /comol\/ai_rules_1c/);
  assert.doesNotMatch(cognee, /docker run[\s\S]*8010:8000/);

  const tools = fs.readFileSync(path.join(prompts, 'installtools.md'), 'utf8');
  assert.match(tools, /install-memory-mcp/);
  assert.match(tools, /Never install the upstream Cognee/);
  assert.match(tools, /8001/);

  const checkmcp = fs.readFileSync(path.join(prompts, 'checkmcp.md'), 'utf8');
  assert.match(checkmcp, /1933\/health/);
  assert.match(checkmcp, /8001\/health/);

  const ollama = read('compose.ollama.yml');
  assert.match(ollama, /LLM_PROVIDER:\s*ollama/);
  assert.match(ollama, /qwen3\.5:9b/);
  assert.match(ollama, /bge-m3/);
  assert.match(ollama, /container_name: pi-1c-memory-ollama/);

  const script = read('scripts/memory-stack.sh');
  assert.match(script, /\bdown\b|\bstop\b/);
  assert.doesNotMatch(script, /compose[\s\S]*down\s+-v/);
  assert.doesNotMatch(script, /rm\s+-rf\s+.*data/);
  assert.match(script, /data preserved|keeps \.\/data|preserved/);
});
