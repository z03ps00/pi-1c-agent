#!/usr/bin/env node
const behavior = String(process.env.PI_1C_MOCK_PI_BEHAVIOR || 'handoff-no-nl');
const payload = {
  type: 'message_end',
  message: {
    role: 'assistant',
    content: 'done\n\n## Upstream Handoff\n\n```json\n{"schema":2,"runId":"mock-1","agent":"1c-explorer","status":"ok","task":"mock","artifacts":[],"findings":[],"public_surface":[],"locked_decisions":[],"constraints":[],"unresolved":[],"verification":[]}\n```\n',
  },
};
if (behavior === 'sleep') {
  setTimeout(() => {}, Number(process.env.PI_1C_MOCK_PI_SLEEP_MS || 60_000));
} else {
  if (behavior === 'stderr-flood') process.stderr.write('e'.repeat(1024 * 400));
  process.stdout.write(JSON.stringify(payload));
  if (behavior === 'with-nl') process.stdout.write('\n');
  process.exit(0);
}
