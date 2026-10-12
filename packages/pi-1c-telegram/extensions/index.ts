import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, loadToken } from '../lib/config.mjs';
import { gatewayRunning, startGateway, stopGateway } from '../lib/service.mjs';
import {
  addRoot,
  createPairing,
  formatPins,
  persistConfig,
  pinChoiceLabel,
  pinPath,
  removePin,
  setAllowedUser,
  statusText,
  useHere,
  writeToken,
} from '../lib/setup.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

const MENU = [
  { value: 'status', label: 'Статус', description: 'токен, допуск, каталоги и процесс.' },
  { value: 'token', label: 'Токен бота', description: 'вставить токен из BotFather. В команду его писать не нужно.' },
  { value: 'pair', label: 'Подключить телефон', description: 'показать код. Отправьте его своему боту.' },
  { value: 'user', label: 'Telegram id', description: 'вписать числовой id вручную.' },
  { value: 'here', label: 'Этот проект', description: 'текущий каталог станет корнем и кнопкой в боте.' },
  { value: 'pins', label: 'Закреплённые пути', description: 'список проектов бота: посмотреть, добавить или убрать.' },
  { value: 'root', label: 'Разрешённый каталог', description: 'проекты можно выбирать только внутри него.' },
  { value: 'start', label: 'Запустить', description: 'поднять бота на этой машине.' },
  { value: 'stop', label: 'Остановить', description: 'остановить процесс бота.' },
];

function profileDir(): string {
  const fromEnv = process.env.PI_CODING_AGENT_DIR?.trim();
  if (fromEnv) return fromEnv;
  return path.resolve(here, '..', '..', '..');
}

function parseArgs(args?: string): string {
  const raw = String(args ?? '').trim().toLowerCase();
  if (!raw) return 'menu';
  if (MENU.some((item) => item.value === raw) || raw === 'status') return raw;
  return 'invalid';
}

async function pick(ctx: any, title: string): Promise<string | undefined> {
  if (typeof ctx?.ui?.select !== 'function') return undefined;
  const selected = await ctx.ui.select(title, MENU.map((item) => `${item.label} — ${item.description}`));
  if (!selected) return undefined;
  const hit = MENU.find((item) => selected === `${item.label} — ${item.description}` || selected === item.label);
  return hit?.value;
}

async function ask(ctx: any, title: string): Promise<string> {
  if (typeof ctx?.ui?.input !== 'function') return '';
  return String(await ctx.ui.input(title) ?? '').trim();
}

function notify(ctx: any, text: string, level: 'info' | 'error' = 'info'): void {
  if (typeof ctx?.ui?.notify === 'function') ctx.ui.notify(text, level);
}

export default function telegramSetup(pi: any): void {
  async function handle(args: string | undefined, ctx: any): Promise<void> {
    const action = parseArgs(args);
    if (action === 'invalid') {
      notify(ctx, 'telegram: status, token, pair, user, here, pins, root, start или stop. Токен в команду не пишите.', 'error');
      return;
    }
    const chosen = action === 'menu' ? await pick(ctx, 'Telegram') : action;
    if (!chosen) return;
    const dir = profileDir();
    const config = loadConfig(dir);
    if (chosen === 'status') {
      notify(ctx, statusText({ config, token: loadToken(dir), running: gatewayRunning(dir) }));
      return;
    }
    if (chosen === 'token') {
      const token = await ask(ctx, 'Токен бота из BotFather');
      if (!token) return;
      const saved = writeToken(dir, token);
      notify(ctx, saved.message, saved.ok ? 'info' : 'error');
      return;
    }
    if (chosen === 'pair') {
      if (!loadToken(dir)) {
        notify(ctx, 'Сначала введите токен.', 'error');
        return;
      }
      const pairing = createPairing(dir);
      const started = startGateway(dir);
      notify(ctx, `${pairing.message}\n${started.message}`);
      return;
    }
    if (chosen === 'user') {
      const id = await ask(ctx, 'Числовой Telegram id');
      if (!id) return;
      const next = setAllowedUser(config, id);
      if (!next.ok || !next.config) {
        notify(ctx, next.message, 'error');
        return;
      }
      persistConfig(dir, next.config);
      notify(ctx, next.message);
      return;
    }
    if (chosen === 'here') {
      const next = useHere(config, ctx.cwd || process.cwd());
      if (next.ok && next.config) persistConfig(dir, next.config);
      notify(ctx, next.message, next.ok ? 'info' : 'error');
      return;
    }
    if (chosen === 'pins') {
      await managePins(ctx, dir, config);
      return;
    }
    if (chosen === 'root') {
      const raw = await ask(ctx, 'Каталог-корень');
      if (!raw) return;
      const next = addRoot(config, raw);
      if (next.ok && next.config) persistConfig(dir, next.config);
      notify(ctx, next.message, next.ok ? 'info' : 'error');
      return;
    }
    if (chosen === 'start') {
      const started = startGateway(dir);
      notify(ctx, started.message, started.ok ? 'info' : 'error');
      return;
    }
    if (chosen === 'stop') notify(ctx, stopGateway(dir).message);
  }

  async function managePins(ctx: any, dir: string, config: any): Promise<void> {
    if (typeof ctx?.ui?.select !== 'function') {
      notify(ctx, formatPins(config));
      return;
    }
    const selected = await ctx.ui.select('Закреплённые пути', [
      'Список',
      'Добавить путь',
      'Убрать путь',
    ]);
    if (selected === 'Список') {
      notify(ctx, formatPins(config));
      return;
    }
    if (selected === 'Добавить путь') {
      const raw = await ask(ctx, 'Путь к проекту');
      if (!raw) return;
      const next = pinPath(loadConfig(dir), raw);
      if (next.ok && next.config) persistConfig(dir, next.config);
      notify(ctx, next.message, next.ok ? 'info' : 'error');
      return;
    }
    if (selected === 'Убрать путь') {
      const current = loadConfig(dir);
      const pins = current.pins || [];
      if (!pins.length) {
        notify(ctx, 'Закреплённых путей нет.');
        return;
      }
      const label = await ctx.ui.select('Убрать путь', pins.map((item: string) => pinChoiceLabel(item)));
      if (!label) return;
      const next = removePin(current, label);
      if (next.ok && next.config) persistConfig(dir, next.config);
      notify(ctx, next.message, next.ok ? 'info' : 'error');
    }
  }

  pi.registerCommand('telegram', {
    description: 'Подключение Telegram: токен, телефон, каталоги, запуск. Пустой вызов открывает раздел.',
    handler: handle,
  });
}
