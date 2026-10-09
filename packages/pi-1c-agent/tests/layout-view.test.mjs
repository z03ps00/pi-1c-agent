import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { renderLayoutHtml, writeLayoutPreview } from '../lib/layout-view.mjs';

const FORM = `<?xml version="1.0" encoding="UTF-8"?>
<Form xmlns="http://v8.1c.ru/8.3/xcf/logform">
  <ChildItems>
    <UsualGroup name="Группа">
      <Title><v8:item><v8:content>Шапка</v8:content></v8:item></Title>
      <ChildItems>
        <InputField name="Номер"/>
        <Button name="Записать"/>
      </ChildItems>
    </UsualGroup>
  </ChildItems>
</Form>
`;

test('form sketch has no script and keeps the field name', () => {
  const html = renderLayoutHtml(FORM);
  assert.doesNotMatch(html, /<script/i);
  assert.match(html, /Номер/);
  assert.match(html, /Шапка/);
});

test('preview file stays inside the project', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pi1c-layout-'));
  const form = path.join(cwd, 'Form.xml');
  fs.writeFileSync(form, FORM);
  const dest = writeLayoutPreview(cwd, 'Form.xml');
  assert.equal(dest.startsWith(path.join(cwd, '.pi', 'previews')), true);
  assert.doesNotMatch(fs.readFileSync(dest, 'utf8'), /<script/i);
  assert.throws(() => writeLayoutPreview(cwd, '../outside.xml'), /leaves the project|file not found/);
});
