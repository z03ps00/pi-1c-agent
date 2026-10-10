import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  beginRun,
  classifyThinking,
  createFoldRun,
  formatFoldLine,
  messageShape,
  noteCall,
  shouldHideCall,
} from '../lib/transcript-fold/fold-state.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('quiet read and grep collapse into one line', () => {
  const run = createFoldRun();
  for (let i = 0; i < 6; i += 1) noteCall(run, { name: 'read', toolCallId: `r${i}` });
  noteCall(run, { name: 'grep', toolCallId: 'g1' });
  noteCall(run, { name: 'find', toolCallId: 'f1' });
  noteCall(run, { name: 'ls', toolCallId: 'l1' });
  assert.equal(noteCall(run, { name: 'read', toolCallId: 'r0' }), false);
  assert.equal(formatFoldLine(run), 'Thinking… · read ×6 · grep ×1 · find ×1 · ls ×1');
  assert.equal(shouldHideCall(run, { name: 'read', toolCallId: 'r0' }), true);
  assert.equal(shouldHideCall(run, { name: 'grep', toolCallId: 'g1' }), true);
  assert.equal(shouldHideCall(run, { name: 'edit', toolCallId: 'e1' }), false);
  assert.equal(shouldHideCall(run, { name: 'write', toolCallId: 'w1' }), false);
  assert.equal(shouldHideCall(run, { name: 'bash', toolCallId: 'b1' }), false);
  assert.equal(noteCall(run, { name: 'edit', toolCallId: 'e1' }), false);
});

test('a failed quiet call stays visible and leaves the tally', () => {
  const run = createFoldRun();
  noteCall(run, { name: 'read', toolCallId: 'ok' });
  noteCall(run, { name: 'read', toolCallId: 'bad' });
  assert.equal(noteCall(run, { name: 'read', toolCallId: 'bad', isError: true }), true);
  assert.equal(formatFoldLine(run), 'Thinking… · read ×1');
  assert.equal(shouldHideCall(run, { name: 'read', toolCallId: 'bad', isError: true }), false);
  assert.equal(shouldHideCall(run, { name: 'read', toolCallId: 'ok' }), true);
  const unseen = createFoldRun();
  assert.equal(noteCall(unseen, { name: 'grep', toolCallId: 'g', isError: true }), false);
  assert.equal(formatFoldLine(unseen), 'Thinking…');
  assert.equal(shouldHideCall(unseen, { name: 'grep', toolCallId: 'g', isError: true }), false);
});

test('Ctrl+O returns quiet call lines', () => {
  const run = createFoldRun();
  noteCall(run, { name: 'find', toolCallId: 'f1' });
  noteCall(run, { name: 'ls', toolCallId: 'l1' });
  assert.equal(shouldHideCall(run, { name: 'find', toolCallId: 'f1', expanded: true }), false);
  assert.equal(shouldHideCall(run, { name: 'ls', toolCallId: 'l1', expanded: true }), false);
  assert.equal(shouldHideCall(run, { name: 'find', toolCallId: 'f1', expanded: false }), true);
  assert.equal(formatFoldLine(run), 'Thinking… · find ×1 · ls ×1');
});

test('a new turn resets the counter and keeps one thinking summary', () => {
  let run = createFoldRun();
  noteCall(run, { name: 'read', toolCallId: 'r1' });
  noteCall(run, { name: 'grep', toolCallId: 'g1' });
  assert.equal(classifyThinking(run, 'a', { hasThinking: true, hasText: false, hasTools: true }, true), 'summary');
  assert.equal(classifyThinking(run, 'a', { hasThinking: true, hasText: false, hasTools: true }, true), 'summary');
  assert.equal(classifyThinking(run, 'b', { hasThinking: true, hasText: false, hasTools: true }, true), 'suppress');
  assert.equal(classifyThinking(run, 'answer', { hasThinking: true, hasText: true, hasTools: false }, true), 'passthrough');
  assert.equal(formatFoldLine(run), 'Thinking… · read ×1 · grep ×1');

  run = beginRun();
  assert.equal(formatFoldLine(run), 'Thinking…');
  assert.equal(classifyThinking(run, 'c', { hasThinking: true, hasText: false, hasTools: false }, true), 'summary');
  assert.equal(classifyThinking(run, 'd', { hasThinking: true, hasText: false, hasTools: false }, true), 'suppress');
  assert.equal(classifyThinking(run, 'c', { hasThinking: true, hasText: false, hasTools: false }, false), 'passthrough');
  assert.equal(messageShape({
    content: [
      { type: 'thinking', thinking: '  look  ' },
      { type: 'text', text: '   ' },
      { type: 'toolCall', id: '1', name: 'read' },
    ],
  }).hasText, false);
});

test('transcript fold extension hides quiet tools behind one summary', () => {
  const src = fs.readFileSync(path.join(root, 'extensions/1c-transcript-fold/index.ts'), 'utf8');
  assert.match(src, /registerToolRenderer/);
  assert.match(src, /renderShell:\s*"self"/);
  assert.match(src, /AssistantMessageComponent/);
  assert.match(src, /UserMessageComponent/);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const foldAt = pkg.pi.extensions.indexOf('extensions/1c-transcript-fold/index.ts');
  const uiAt = pkg.pi.extensions.indexOf('extensions/1c-ui/index.ts');
  assert.ok(foldAt >= 0 && foldAt < uiAt);
});
