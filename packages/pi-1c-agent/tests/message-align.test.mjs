import assert from 'node:assert/strict';
import test from 'node:test';
import { alignChatTree, bubbleHit, bubbleMetrics, installMessageBubble, placeBubble } from '../lib/ui/message-align.mjs';

const paints = {
  border: (text) => text,
  title: (text) => text,
  bg: (text) => text,
};

function widthOf(text) {
  return String(text ?? '')
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;]*m/g, '')
    .length;
}

test('agent panel has one white-style frame, a pi label, and a tab gap', () => {
  const lines = placeBubble(['Привет'], 40, 'left', paints);
  assert.match(lines[0], /^╭ pi /);
  assert.match(lines.join('\n'), /Привет/);
  assert.equal(lines.at(-1), '\t');
  assert.equal(lines.filter((line) => line.includes('╭')).length, 1);
  for (const line of lines.slice(0, -1)) assert.ok(widthOf(line) <= 39);
});

test('user panel keeps a single frame, shifts right, and does not gain a second border', () => {
  const boxed = ['╭ user ────────╮', '│ привет       │', '╰──────────────╯'];
  const lines = placeBubble(boxed, 80, 'right', paints);
  assert.ok(lines[0].startsWith(' '));
  assert.match(lines[0], /╭ user /);
  assert.equal(lines.filter((line) => line.includes('╭')).length, 1);
  assert.match(lines[1], /привет/);
  assert.equal(lines.at(-1), '\t');
});

test('a click in the right panel maps back into the original message', () => {
  const component = {
    render() { return ['hi']; },
    handleMouse(event) { return { x: event.x, y: event.y, width: event.width }; },
  };
  assert.equal(installMessageBubble(component, 'right'), true);
  assert.equal(installMessageBubble(component, 'right'), false);
  const lines = component.render(40);
  const metrics = bubbleMetrics(40, 'right');
  const hit = component.handleMouse({ x: metrics.pad, y: 0, width: 40, height: lines.length });
  assert.deepEqual(hit, { x: 0, y: 0, width: metrics.contentWidth });
  assert.equal(component.handleMouse({ x: 0, y: 0, width: 40, height: lines.length }), undefined);
  assert.equal(bubbleHit(metrics, { x: metrics.pad, y: lines.length - 1, width: 40, height: lines.length }), null);
});

test('the chat tree wraps each message once, agent left and user right', () => {
  class AssistantMessageComponent {}
  class UserMessageComponent {}
  const agent = new AssistantMessageComponent();
  agent.render = () => ['слева'];
  const user = new UserMessageComponent();
  user.render = () => ['╭ user ──╮', '│ справа │', '╰────────╯'];
  const root = { children: [{ children: [agent] }, user] };
  assert.equal(alignChatTree(root, paints), 2);
  assert.equal(alignChatTree(root, paints), 0);
  assert.match(agent.render(50)[0], /^╭ pi /);
  assert.ok(user.render(50)[0].startsWith(' '));
  assert.match(user.render(50)[0], /user/);
});
