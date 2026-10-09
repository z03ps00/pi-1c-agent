import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReglogCode, collectReglog, parseReglogLine, parseReglogArgs } from '../lib/reglog.mjs';

test('registration log line splits into columns', () => {
  const row = parseReglogLine('2026-10-09 12:00:00|Ошибка|_$Job|ivan|Документ.Заказ|сбой | хвост');
  assert.equal(row.user, 'ivan');
  assert.equal(row.object, 'Документ.Заказ');
  assert.equal(row.comment, 'сбой | хвост');
});

test('limits stay bounded and the query is fixed', () => {
  assert.equal(parseReglogArgs('999 2h warning').limit, 64);
  assert.equal(parseReglogArgs('999 2h warning').level, 'warning');
  const code = buildReglogCode(parseReglogArgs('8 1d both'));
  assert.match(code, /ВыгрузитьЖурналРегистрации/);
  assert.doesNotMatch(code, /Записать\(/);
});

test('missing MCP does not call the base', async () => {
  let called = false;
  const result = await collectReglog({
    values: { INFOBASE_KIND: 'file', INFOBASE_PATH: '/tmp/bases/shop.1cd', IB_PASSWORD: 'secret' },
    tools: [],
    fetchImpl: async () => { called = true; return { text: async () => '' }; },
  });
  assert.equal(called, false);
  assert.match(result.text, /shop/);
  assert.match(result.text, /не запрашивалась/);
  assert.doesNotMatch(result.text, /secret/);
});
