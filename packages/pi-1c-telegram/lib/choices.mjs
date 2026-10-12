import { MODE_CHOICES, MODE_INTRO } from '../../pi-1c-agent/lib/ui/mode-choices.mjs';
import {
  ANON_CHOICES,
  ANON_INTRO,
  APPROVE_CHOICES,
  APPROVE_INTRO,
  CAPTURE_MODEL_CHOICES,
  CAPTURE_MODEL_INTRO,
  LEARNING_CHOICES,
  LEARNING_INTRO,
  MCPCONFIG_CHOICES,
  MCPCONFIG_INTRO,
  SESSION_ROTATE_CHOICES,
  SESSION_ROTATE_INTRO,
} from '../../pi-1c-agent/lib/ui/option-choices.mjs';
import { INIT_MODE_CHOICES, INIT_MODE_INTRO, INIT_SOURCE_CHOICES, INIT_SOURCE_INTRO } from '../../pi-1c-agent/lib/ui/init-copy.mjs';
import { SHIPPED_THEMES, THEME_INTRO } from '../../pi-1c-agent/lib/ui/theme-select.mjs';
import { TASKMODE_INTRO, taskmodeChoices } from '../../pi-1c-agent/lib/taskmode-state.mjs';
import {
  CAVEMAN_CHOICES,
  CAVEMAN_INTRO,
  ECONOMY_CHOICES,
  ECONOMY_INTRO,
  LITEMODE_CHOICES,
  LITEMODE_INTRO,
  PREVIEW_CHOICES,
  PREVIEW_INTRO,
  RULESMODEL_CHOICES,
  RULESMODEL_INTRO,
  SDLC_CHOICES,
  SDLC_INTRO,
  UITESTS_CHOICES,
  UITESTS_INTRO,
} from '../../pi-1c-agent/lib/project-settings.mjs';

const THEME_CHOICES = SHIPPED_THEMES.map((theme) => ({
  value: theme.name,
  label: theme.label,
  description: theme.description,
}));

export const OVERLAYS = Object.freeze({
  mode: { intro: MODE_INTRO, choices: MODE_CHOICES },
  taskmode: { intro: TASKMODE_INTRO, choices: taskmodeChoices() },
  anon: { intro: ANON_INTRO, choices: ANON_CHOICES },
  approve: { intro: APPROVE_INTRO, choices: APPROVE_CHOICES },
  learning: { intro: LEARNING_INTRO, choices: LEARNING_CHOICES },
  sdlc: { intro: SDLC_INTRO, choices: SDLC_CHOICES },
  litemode: { intro: LITEMODE_INTRO, choices: LITEMODE_CHOICES },
  uitests: { intro: UITESTS_INTRO, choices: UITESTS_CHOICES },
  previewmode: { intro: PREVIEW_INTRO, choices: PREVIEW_CHOICES },
  caveman: { intro: CAVEMAN_INTRO, choices: CAVEMAN_CHOICES },
  economymode: { intro: ECONOMY_INTRO, choices: ECONOMY_CHOICES },
  rulesmodel: { intro: RULESMODEL_INTRO, choices: RULESMODEL_CHOICES },
  'capture-model': { intro: CAPTURE_MODEL_INTRO, choices: CAPTURE_MODEL_CHOICES },
  'session-rotate': { intro: SESSION_ROTATE_INTRO, choices: SESSION_ROTATE_CHOICES },
  theme: { intro: THEME_INTRO, choices: THEME_CHOICES },
  mcpconfig: { intro: MCPCONFIG_INTRO, choices: MCPCONFIG_CHOICES },
  init: { intro: INIT_SOURCE_INTRO, choices: INIT_SOURCE_CHOICES },
});

export const INIT_MODE = Object.freeze({
  intro: INIT_MODE_INTRO,
  choices: INIT_MODE_CHOICES,
});

export const LOCAL_COMMANDS = new Set(['start', 'help', 'menu', 'project', 'cancel', 'status']);

export function parseIncoming(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return { kind: 'empty' };
  if (isBarePath(raw)) return { kind: 'text', text: raw, path: true };
  if (!raw.startsWith('/')) return { kind: 'text', text: raw, path: false };
  const body = raw.slice(1);
  const space = body.search(/\s/);
  const head = space === -1 ? body : body.slice(0, space);
  const name = head.split('@')[0].toLowerCase();
  const arg = space === -1 ? '' : body.slice(space + 1).trim();
  if (!name) return { kind: 'text', text: raw, path: false };
  if (LOCAL_COMMANDS.has(name)) return { kind: 'local', name, arg, raw };
  if (Object.prototype.hasOwnProperty.call(OVERLAYS, name) && !arg) return { kind: 'overlay', name, raw };
  return { kind: 'agent', raw };
}

function isBarePath(raw) {
  if (raw.startsWith('/') && raw.slice(1).includes('/')) return true;
  return false;
}
