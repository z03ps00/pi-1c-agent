import fs from 'node:fs';
import path from 'node:path';

export const KERNEL_SLICES = Object.freeze([
  'core',
  '1c-domain',
  'context-routing',
  'tool-policy',
  'quality',
  'safety',
]);

export function systemDir(packageRoot) {
  return path.join(packageRoot, 'system');
}

export function readKernelSlices(packageRoot) {
  return KERNEL_SLICES.map((name) => {
    const file = path.join(systemDir(packageRoot), `${name}.md`);
    return fs.readFileSync(file, 'utf8').trim();
  });
}

export function buildSystemKernel({
  packageRoot,
  projectConstraints = '',
  capabilitySummary = '',
} = {}) {
  const parts = ['# 1C harness kernel', ...readKernelSlices(packageRoot)];
  const project = String(projectConstraints ?? '').trim();
  const capabilities = String(capabilitySummary ?? '').trim();
  if (project) parts.push(`# Active project\n\n${project}`);
  if (capabilities) parts.push(capabilities);
  return parts.join('\n\n');
}
