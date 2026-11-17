// The engine here is a byte-for-byte copy from boqo-ai/boqo-clips. A hand edit
// changes the hash and fails this test; edit it in boqo-clips and re-sync.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { engineHash } from '../engine/hash.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const engine = JSON.parse(readFileSync(join(root, 'engine', 'ENGINE.json'), 'utf8'));

test('the vendored engine matches the hash it was synced with', () => {
  assert.equal(engineHash(root), engine.hash);
});

test('every file ENGINE.json lists exists', () => {
  assert.ok(Array.isArray(engine.files) && engine.files.length > 0);
  for (const rel of engine.files) assert.ok(existsSync(join(root, rel)), `missing ${rel}`);
});

test("package.json carries the engine's two dependencies, the lockfile agrees, and CI installs from it", () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.ok(engine.deps && Object.keys(engine.deps).length === 2, 'ENGINE.json lists the two engine dependencies');
  assert.deepEqual(pkg.dependencies, engine.deps);
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  assert.deepEqual(lock.packages[''].dependencies, engine.deps);
  assert.ok(Number(pkg.engines.node.match(/\d+/)[0]) >= 20, 'the Node floor is 20 or higher');
  const ci = readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
  const install = ci.indexOf('npm ci --ignore-scripts');
  assert.ok(install !== -1 && install < ci.indexOf('- run: npm test'), 'CI runs npm ci --ignore-scripts before npm test');
  assert.match(readFileSync(join(root, '.gitignore'), 'utf8'), /^node_modules\/$/m);
});
