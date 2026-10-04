#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  THINKING_LEVELS,
  applySettingsObject,
  authStatus,
  expandProjectPath,
  jsonValidate,
  listBackupFiles,
  listSessionFiles,
  packageVersion,
  parseModelCatalog,
  resolveBackupDir,
  resolveProfileDir,
  resolveSessionDir,
  settingsGet,
} from './lib/pi-1c-ctl-lib.mjs';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const GRAY = '\x1b[90m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const BOX_W = 72;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const profileDir = resolveProfileDir({ scriptDir });
const sessionDir = resolveSessionDir({ profileDir });
const backupDir = resolveBackupDir();
const packageDir = process.env.PACKAGE_DIR || path.join(profileDir, 'packages', 'pi-1c-agent');
const settingsJson = path.join(profileDir, 'settings.json');
const authJson = path.join(profileDir, 'auth.json');
const piCmd = process.env.PI_CMD || (process.platform === 'win32' ? 'pi.cmd' : 'pi');

function visLen(str) {
  return [...String(str).replace(/\x1b\[[0-9;]*m/g, '')].length;
}

function rep(ch, n) {
  return String(ch).repeat(Math.max(0, n));
}

function truncateVis(str, max) {
  let out = '';
  let vis = 0;
  let rest = String(str);
  while (rest) {
    const m = rest.match(/^\x1b\[[0-9;]*m/);
    if (m) {
      out += m[0];
      rest = rest.slice(m[0].length);
      continue;
    }
    const chunk = [...rest][0];
    out += chunk;
    vis += 1;
    rest = rest.slice(chunk.length);
    if (vis >= max) {
      out += '…';
      break;
    }
  }
  return out;
}

function boxTop() {
  return `${CYAN}╔${rep('═', BOX_W - 2)}╗${RESET}`;
}
function boxBottom() {
  return `${CYAN}╚${rep('═', BOX_W - 2)}╝${RESET}`;
}
function boxSep() {
  return `${CYAN}╠${rep('═', BOX_W - 2)}╣${RESET}`;
}
function boxDash() {
  return `${CYAN}║${RESET}${rep('─', BOX_W - 2)}${CYAN}║${RESET}`;
}
function boxLine(str) {
  const max = BOX_W - 5;
  let text = String(str);
  let len = visLen(text);
  if (len > max) {
    text = truncateVis(text, max - 1);
    len = visLen(text);
  }
  const pad = Math.max(0, BOX_W - 4 - len);
  return `${CYAN}║${RESET} ${text}${rep(' ', pad)} ${CYAN}║${RESET}`;
}
function boxCenter(str) {
  const len = visLen(str);
  const pad = Math.max(0, Math.floor((BOX_W - 4 - len) / 2));
  const rem = Math.max(0, (BOX_W - 4 - len) % 2);
  return `${CYAN}║${RESET}${rep(' ', pad + 1)}${str}${rep(' ', pad + 1 + rem)} ${CYAN}║${RESET}`;
}

function printBox(lines) {
  output.write(`${lines.join('\n')}\n`);
}

function piAvailable() {
  if (process.env.PI_CMD && fs.existsSync(process.env.PI_CMD)) return true;
  const probe = spawnSync(piCmd, ['--version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    shell: process.platform === 'win32',
  });
  return probe.status === 0;
}

function runPi(args = [], { cwd } = {}) {
  if (!piAvailable()) {
    output.write(`${RED}Команда pi не найдена: ${piCmd}${RESET}\n`);
    return 1;
  }
  const result = spawnSync(piCmd, args, {
    stdio: 'inherit',
    cwd: cwd || process.cwd(),
    env: {
      ...process.env,
      PI_CODING_AGENT_DIR: profileDir,
      PI_CODING_AGENT_SESSION_DIR: sessionDir,
    },
    shell: process.platform === 'win32',
  });
  return result.status ?? 1;
}

function piVersion() {
  const r = spawnSync(piCmd, ['--version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    shell: process.platform === 'win32',
  });
  const text = String(r.stdout || '').trim();
  return text || '?';
}

function ensureBackupDir() {
  fs.mkdirSync(backupDir, { recursive: true });
  try { fs.chmodSync(backupDir, 0o700); } catch { /* win */ }
}

function backupSettings(reason = 'manual') {
  ensureBackupDir();
  if (!jsonValidate(settingsJson)) {
    output.write(`${RED}settings.json невалиден — backup отменён.${RESET}\n`);
    return false;
  }
  const ts = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const dst = path.join(backupDir, `settings-${ts}-${reason}.json`);
  fs.copyFileSync(settingsJson, dst);
  try { fs.chmodSync(dst, 0o600); } catch { /* win */ }
  output.write(`${GREEN}Backup создан:${RESET} ${dst}\n`);
  return true;
}

function applySettings(provider, model, level) {
  if (!THINKING_LEVELS.has(level)) {
    output.write(`${RED}Недопустимый thinking level: ${level} (ожидается off|minimal|low|medium|high|xhigh|max)${RESET}\n`);
    return false;
  }
  if (!fs.existsSync(settingsJson)) {
    output.write(`${RED}Нет файла: ${settingsJson}${RESET}\n`);
    return false;
  }
  if (!jsonValidate(settingsJson)) {
    output.write(`${RED}Текущий settings.json невалиден. Изменение запрещено.${RESET}\n`);
    return false;
  }
  if (!backupSettings('before-model-change')) return false;
  let data;
  try {
    data = JSON.parse(fs.readFileSync(settingsJson, 'utf8'));
  } catch {
    output.write(`${RED}Не удалось прочитать settings.json.${RESET}\n`);
    return false;
  }
  let next;
  try {
    next = applySettingsObject(data, provider, model, level);
  } catch (error) {
    output.write(`${RED}${error.message}${RESET}\n`);
    return false;
  }
  const tmp = path.join(profileDir, `.settings.json.tmp.${process.pid}.${Date.now()}`);
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
  if (!jsonValidate(tmp)) {
    fs.unlinkSync(tmp);
    output.write(`${RED}Временный settings.json не прошёл JSON validation.${RESET}\n`);
    return false;
  }
  try {
    fs.chmodSync(tmp, fs.statSync(settingsJson).mode & 0o777);
  } catch {
    try { fs.chmodSync(tmp, 0o600); } catch { /* win */ }
  }
  fs.renameSync(tmp, settingsJson);
  if (!jsonValidate(settingsJson)) {
    output.write(`${RED}КРИТИЧНО: settings.json после mv невалиден. Восстановите backup.${RESET}\n`);
    return false;
  }
  output.write(`${GREEN}Настройки применены атомарно:${RESET} provider=${provider}, model=${model}, thinking=${level}\n`);
  return true;
}

async function pause(rl) {
  await rl.question(`${GRAY}Нажмите Enter…${RESET}`);
}

async function confirmPhrase(rl, phrase, prompt) {
  output.write(`${YELLOW}${prompt}${RESET}\n`);
  const answer = await rl.question(`Введите ${BOLD}${phrase}${RESET} для подтверждения: `);
  return answer === phrase;
}

async function statusScreen(rl) {
  console.clear();
  const provider = settingsGet(settingsJson, 'defaultProvider');
  const model = settingsGet(settingsJson, 'defaultModel');
  let thinking = settingsGet(settingsJson, 'defaultThinkingLevel');
  if (!thinking) thinking = '(не задан)';
  const sessions = listSessionFiles(sessionDir);
  printBox([
    boxTop(),
    boxCenter('Pi 1C Agent — статус'),
    boxSep(),
    boxLine(` Pi config: ${profileDir}`),
    boxLine(` Sessions:  ${sessionDir}`),
    boxLine(` Package:   ${packageDir}`),
    boxDash(),
    boxLine(` Pi:        ${piVersion()}`),
    boxLine(` Package:   ${packageVersion(path.join(packageDir, 'package.json'))}`),
    boxLine(` Settings:  provider=${provider || '?'}, model=${model || '?'}`),
    boxLine(` Thinking:  ${thinking}`),
    boxLine(` auth.json: ${authStatus(authJson)} (секреты не выводятся)`),
    boxLine(` Sessions:  ${sessions.length} файлов; latest=${sessions[0]?.name || 'нет'}`),
    boxBottom(),
  ]);
  await pause(rl);
}

async function sessionsScreen(rl) {
  console.clear();
  const sessions = listSessionFiles(sessionDir);
  const lines = [
    boxTop(),
    boxCenter('Сессии Pi'),
    boxSep(),
    ...sessions.map((s) => boxLine(` ${s.stamp}  ${s.name}`)),
    boxDash(),
    boxLine(' [1] Продолжить последнюю: pi -c'),
    boxLine(' [2] Выбрать сессию: pi -r'),
    boxLine(' [0] Назад'),
    boxBottom(),
  ];
  printBox(lines);
  const choice = await rl.question(`\n${BOLD}Выбор:${RESET} `);
  if (choice === '1') {
    runPi(['-c']);
    await pause(rl);
  } else if (choice === '2') {
    runPi(['-r']);
    await pause(rl);
  }
}

async function newChat(rl) {
  console.clear();
  output.write(`${CYAN}Запуск нового чата Pi 1C Agent. Выход — /quit или Ctrl+C.${RESET}\n\n`);
  runPi([]);
  await pause(rl);
}

async function openProjectByPath(rl) {
  console.clear();
  const raw = await rl.question(`${CYAN}Путь к каталогу проекта 1С:${RESET} `);
  const project = expandProjectPath(raw);
  if (!project) {
    output.write(`${YELLOW}Путь пустой.${RESET}\n`);
    await pause(rl);
    return;
  }
  if (!fs.existsSync(project) || !fs.statSync(project).isDirectory()) {
    output.write(`${RED}Каталог не найден:${RESET} ${project}\n`);
    await pause(rl);
    return;
  }
  output.write(`${CYAN}Запуск Pi 1C Agent в${RESET} ${project}\n\n`);
  runPi([], { cwd: project });
  await pause(rl);
}

async function diagnosticsScreen(rl) {
  console.clear();
  const ok = (label) => boxLine(` ${GREEN}OK${RESET} ${label}`);
  const fail = (label) => boxLine(` ${RED}FAIL${RESET} ${label}`);
  const warn = (label) => boxLine(` ${YELLOW}WARN${RESET} ${label}`);
  printBox([
    boxTop(),
    boxCenter('Диагностика'),
    boxSep(),
    jsonValidate(settingsJson) ? ok('settings.json валиден') : fail('settings.json невалиден'),
    fs.existsSync(authJson) ? ok('auth.json найден (содержимое не выводится)') : warn('auth.json не найден'),
    piAvailable() ? ok('pi command доступен') : fail('pi command недоступен'),
    fs.existsSync(packageDir) ? ok('пакет pi-1c-agent найден') : fail('пакет не найден'),
    fs.existsSync(sessionDir) ? ok('каталог сессий найден') : fail('каталог сессий не найден'),
    boxDash(),
    boxLine(' Подсказка: обновить каталог моделей можно через меню обновления.'),
    boxBottom(),
  ]);
  await pause(rl);
}

async function restoreSettings(rl) {
  ensureBackupDir();
  const backups = listBackupFiles(backupDir);
  if (!backups.length) {
    output.write(`${YELLOW}Backups не найдены.${RESET}\n`);
    return;
  }
  console.clear();
  printBox([
    boxTop(),
    boxCenter('Восстановление settings.json'),
    boxSep(),
    ...backups.map((b, i) => boxLine(` [${i + 1}] ${b.name}`)),
    boxLine(' [0] Отмена'),
    boxBottom(),
  ]);
  const n = Number(await rl.question(`\n${BOLD}Номер backup:${RESET} `));
  if (!Number.isInteger(n) || n < 1 || n > backups.length) return;
  const src = backups[n - 1].full;
  if (!jsonValidate(src)) {
    output.write(`${RED}Выбранный backup невалиден.${RESET}\n`);
    return;
  }
  const ok = await confirmPhrase(
    rl,
    'RESTORE',
    `Будет восстановлен ${backups[n - 1].name}. Текущий settings.json будет предварительно сохранён.`,
  );
  if (!ok) {
    output.write('Отмена.\n');
    return;
  }
  if (!backupSettings('before-restore')) return;
  const tmp = path.join(profileDir, `.settings.json.restore.${process.pid}.${Date.now()}`);
  fs.copyFileSync(src, tmp);
  if (!jsonValidate(tmp)) {
    fs.unlinkSync(tmp);
    output.write(`${RED}Временный файл restore невалиден.${RESET}\n`);
    return;
  }
  try {
    fs.chmodSync(tmp, fs.statSync(settingsJson).mode & 0o777);
  } catch {
    try { fs.chmodSync(tmp, 0o600); } catch { /* win */ }
  }
  fs.renameSync(tmp, settingsJson);
  if (jsonValidate(settingsJson)) output.write(`${GREEN}Восстановлено атомарно.${RESET}\n`);
  else output.write(`${RED}КРИТИЧНО: settings.json невалиден после restore.${RESET}\n`);
}

async function backupRestoreMenu(rl) {
  while (true) {
    console.clear();
    printBox([
      boxTop(),
      boxCenter('Backup / Restore settings.json'),
      boxSep(),
      boxLine(` Backup dir: ${backupDir}`),
      boxDash(),
      boxLine(' [1] Создать backup settings.json'),
      boxLine(' [2] Восстановить из backup'),
      boxLine(' [3] Показать последние backups'),
      boxLine(' [0] Назад'),
      boxBottom(),
    ]);
    const choice = await rl.question(`\n${BOLD}Выбор:${RESET} `);
    if (choice === '1') {
      backupSettings('manual');
      await pause(rl);
    } else if (choice === '2') {
      await restoreSettings(rl);
      await pause(rl);
    } else if (choice === '3') {
      console.clear();
      const backups = listBackupFiles(backupDir);
      output.write(backups.map((b) => b.full).join('\n') || '');
      output.write('\n');
      await pause(rl);
    } else if (choice === '0' || choice === '') {
      return;
    } else {
      output.write(`${RED}Неверный выбор${RESET}\n`);
      await pause(rl);
    }
  }
}

async function catalogModelMenu(rl) {
  const listed = spawnSync(piCmd, ['--list-models'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PI_CODING_AGENT_DIR: profileDir },
    shell: process.platform === 'win32',
  });
  const entries = parseModelCatalog(listed.stdout);
  if (!entries.length) {
    output.write(`${RED}Не удалось получить каталог моделей.${RESET}\n`);
    await pause(rl);
    return;
  }
  const currentProvider = settingsGet(settingsJson, 'defaultProvider');
  const currentModel = settingsGet(settingsJson, 'defaultModel');
  console.clear();
  printBox([
    boxTop(),
    boxCenter('Модель по умолчанию — каталог Pi'),
    boxSep(),
    ...entries.map((entry, i) => {
      const mark = entry.provider === currentProvider && entry.model === currentModel
        ? ` ${GREEN}← текущая${RESET}`
        : '';
      return boxLine(` [${i + 1}] ${entry.provider} / ${entry.model}${mark}`);
    }),
    boxLine(' [0] Отмена'),
    boxBottom(),
  ]);
  const i = Number(await rl.question(`\n${BOLD}Номер модели:${RESET} `));
  if (!Number.isInteger(i) || i < 1 || i > entries.length) return;
  const entry = entries[i - 1];
  let level = await rl.question(`${BOLD}Thinking level (off/minimal/low/medium/high/xhigh/max, пусто=не менять):${RESET} `);
  if (!level) level = '__KEEP__';
  if (THINKING_LEVELS.has(level) && level !== '__REMOVE__') {
    applySettings(entry.provider, entry.model, level);
    await pause(rl);
  } else {
    output.write(`${RED}Недопустимый уровень.${RESET}\n`);
    await pause(rl);
  }
}

async function manualModel(rl) {
  const provider = await rl.question('Provider: ');
  const model = await rl.question('Model: ');
  let level = (await rl.question('Thinking level (пусто=удалить, keep=не менять, например low/medium/high): ')).toLowerCase();
  if (!provider || !model) {
    output.write(`${RED}provider/model обязательны.${RESET}\n`);
    return;
  }
  if (level === 'keep') level = '__KEEP__';
  if (!level) level = '__REMOVE__';
  applySettings(provider, model, level);
}

async function modelsMenu(rl) {
  while (true) {
    const provider = settingsGet(settingsJson, 'defaultProvider');
    const model = settingsGet(settingsJson, 'defaultModel');
    let thinking = settingsGet(settingsJson, 'defaultThinkingLevel');
    if (!thinking) thinking = '(не задан)';
    console.clear();
    printBox([
      boxTop(),
      boxCenter('Быстрый выбор модели'),
      boxSep(),
      boxLine(` Сейчас: provider=${provider || '?'}, model=${model || '?'}, thinking=${thinking}`),
      boxDash(),
      boxLine(' [1] GPT-5.5                 openai-codex / gpt-5.5 / high'),
      boxLine(' [2] GPT-5.6 Luna            openai-codex / gpt-5.6-luna / high'),
      boxLine(' [3] GPT-5.6 Sol             openai-codex / gpt-5.6-sol / high'),
      boxLine(' [4] GPT-5.6 Terra           openai-codex / gpt-5.6-terra / high'),
      boxLine(' [5] GPT-5.4                 openai-codex / gpt-5.4 / medium'),
      boxLine(' [6] DeepSeek V4 Flash       deepseek / deepseek-v4-flash / low'),
      boxLine(' [7] DeepSeek V4 Pro         deepseek / deepseek-v4-pro / high'),
      boxLine(' [R] RouterAI Flash          routerai / deepseek/deepseek-v4-flash-0731 / low'),
      boxLine(' [8] Cursor Auto             cursor / auto / __REMOVE__'),
      boxLine(' [9] Ввести provider/model/thinking вручную'),
      boxLine(' [C] Выбрать из полного каталога Pi'),
      boxLine(' [0] Назад'),
      boxBottom(),
    ]);
    const choice = await rl.question(`\n${BOLD}Выбор:${RESET} `);
    if (choice === '1') { applySettings('openai-codex', 'gpt-5.5', 'high'); await pause(rl); }
    else if (choice === '2') { applySettings('openai-codex', 'gpt-5.6-luna', 'high'); await pause(rl); }
    else if (choice === '3') { applySettings('openai-codex', 'gpt-5.6-sol', 'high'); await pause(rl); }
    else if (choice === '4') { applySettings('openai-codex', 'gpt-5.6-terra', 'high'); await pause(rl); }
    else if (choice === '5') { applySettings('openai-codex', 'gpt-5.4', 'medium'); await pause(rl); }
    else if (choice === '6') { applySettings('deepseek', 'deepseek-v4-flash', 'low'); await pause(rl); }
    else if (choice === '7') { applySettings('deepseek', 'deepseek-v4-pro', 'high'); await pause(rl); }
    else if (choice === 'r' || choice === 'R') { applySettings('routerai', 'deepseek/deepseek-v4-flash-0731', 'low'); await pause(rl); }
    else if (choice === '8') { applySettings('cursor', 'auto', '__REMOVE__'); await pause(rl); }
    else if (choice === '9') { await manualModel(rl); await pause(rl); }
    else if (choice === 'c' || choice === 'C') { await catalogModelMenu(rl); }
    else if (choice === '0' || choice === '') return;
    else {
      output.write(`${RED}Неверный выбор${RESET}\n`);
      await pause(rl);
    }
  }
}

async function updateMenu(rl) {
  while (true) {
    console.clear();
    printBox([
      boxTop(),
      boxCenter('Обновление Pi / пакетов'),
      boxSep(),
      boxLine(' Все действия требуют явного текстового подтверждения.'),
      boxDash(),
      boxLine(' [1] pi update --models'),
      boxLine(' [2] pi update --self'),
      boxLine(' [3] pi update --extensions'),
      boxLine(' [4] pi update --all'),
      boxLine(' [0] Назад'),
      boxBottom(),
    ]);
    const choice = await rl.question(`\n${BOLD}Выбор:${RESET} `);
    if (choice === '1') {
      if (await confirmPhrase(rl, 'UPDATE-MODELS', 'Обновить каталоги моделей?')) runPi(['update', '--models']);
      await pause(rl);
    } else if (choice === '2') {
      if (await confirmPhrase(rl, 'UPDATE-SELF', 'Обновить Pi CLI/runtime?')) runPi(['update', '--self']);
      await pause(rl);
    } else if (choice === '3') {
      if (await confirmPhrase(rl, 'UPDATE-EXTENSIONS', 'Обновить установленные пакеты/расширения?')) runPi(['update', '--extensions']);
      await pause(rl);
    } else if (choice === '4') {
      if (await confirmPhrase(rl, 'UPDATE-ALL', 'Обновить Pi и пакеты?')) runPi(['update', '--all']);
      await pause(rl);
    } else if (choice === '0' || choice === '') return;
    else {
      output.write(`${RED}Неверный выбор${RESET}\n`);
      await pause(rl);
    }
  }
}

async function mainMenu() {
  const rl = readline.createInterface({ input, output });
  try {
    while (true) {
      const provider = settingsGet(settingsJson, 'defaultProvider');
      const model = settingsGet(settingsJson, 'defaultModel');
      let thinking = settingsGet(settingsJson, 'defaultThinkingLevel');
      if (!thinking) thinking = '-';
      console.clear();
      printBox([
        boxTop(),
        boxCenter('Pi 1C Agent'),
        boxSep(),
        boxLine(` ${BOLD}Текущая модель:${RESET} ${provider || '?'} / ${model || '?'} / thinking=${thinking}`),
        boxDash(),
        boxLine(` ${BOLD}[1]${RESET} Статус Pi/пакета`),
        boxLine(` ${BOLD}[2]${RESET} Новый чат`),
        boxLine(` ${BOLD}[8]${RESET} Открыть проект по пути`),
        boxLine(` ${BOLD}[3]${RESET} Сессии (continue / resume)`),
        boxLine(` ${BOLD}[4]${RESET} Быстрый выбор моделей и thinking level`),
        boxLine(` ${BOLD}[5]${RESET} Диагностика`),
        boxLine(` ${BOLD}[6]${RESET} Backup / Restore settings.json`),
        boxLine(` ${BOLD}[7]${RESET} Обновление Pi/пакетов/моделей`),
        boxLine(` ${BOLD}[0]${RESET} Выход`),
        boxBottom(),
      ]);
      const choice = await rl.question(`\n${BOLD}Выбор:${RESET} `);
      if (choice === '1') await statusScreen(rl);
      else if (choice === '2') await newChat(rl);
      else if (choice === '8') await openProjectByPath(rl);
      else if (choice === '3') await sessionsScreen(rl);
      else if (choice === '4') await modelsMenu(rl);
      else if (choice === '5') await diagnosticsScreen(rl);
      else if (choice === '6') await backupRestoreMenu(rl);
      else if (choice === '7') await updateMenu(rl);
      else if (choice === '0' || choice === 'q' || choice === 'Q') {
        console.clear();
        return;
      } else {
        output.write(`${RED}Неверный выбор${RESET}\n`);
        await pause(rl);
      }
    }
  } finally {
    rl.close();
  }
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return pathToFileURL(fs.realpathSync(entry)).href === import.meta.url;
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  mainMenu().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
