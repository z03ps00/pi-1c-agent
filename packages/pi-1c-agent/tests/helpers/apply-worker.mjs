import { applyDraft } from '../../lib/knowledge.mjs';

const cwd = process.argv[2];
const draftId = process.argv[3];
const expected = Number(process.argv[4]);
try {
  applyDraft(cwd, draftId, { expectedRevision: expected });
  process.stdout.write('ok');
} catch (error) {
  process.stdout.write(error?.message || String(error));
  process.exit(1);
}
