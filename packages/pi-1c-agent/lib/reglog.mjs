import { infobaseLabel } from './ib-label.mjs';

const MAX_LIMIT = 64;
const DEFAULT_LIMIT = 32;
const DEFAULT_PERIOD = 7 * 24 * 60 * 60;

export function parseReglogArgs(text = '') {
  let limit = DEFAULT_LIMIT;
  let periodSeconds = DEFAULT_PERIOD;
  let level = 'error';
  for (const token of String(text || '').trim().split(/\s+/).filter(Boolean)) {
    const lower = token.toLowerCase();
    if (lower === 'error' || lower === 'warning' || lower === 'both') {
      level = lower;
      continue;
    }
    const period = lower.match(/^(\d+)([hd])$/);
    if (period) {
      const amount = Number(period[1]);
      periodSeconds = period[2] === 'd' ? amount * 86400 : amount * 3600;
      continue;
    }
    if (/^\d+$/.test(token)) limit = Number(token);
  }
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;
  if (!Number.isFinite(periodSeconds) || periodSeconds < 60) periodSeconds = 60;
  if (periodSeconds > 30 * 86400) periodSeconds = 30 * 86400;
  return { limit, periodSeconds, level };
}

export function buildReglogCode({ limit, periodSeconds, level }) {
  const safeLimit = Math.max(1, Math.min(MAX_LIMIT, Number(limit) || DEFAULT_LIMIT));
  const safePeriod = Math.max(60, Math.trunc(Number(periodSeconds) || DEFAULT_PERIOD));
  const levelLine = level === 'warning'
    ? 'Фильтр.Вставить("Уровень", УровеньЖурналаРегистрации.Предупреждение);'
    : level === 'both'
      ? ''
      : 'Фильтр.Вставить("Уровень", УровеньЖурналаРегистрации.Ошибка);';
  return `Таблица = Новый ТаблицаЗначений;
Фильтр = Новый Структура;
Фильтр.Вставить("ДатаНачала", ТекущаяДатаСеанса() - ${safePeriod});
${levelLine}
ВыгрузитьЖурналРегистрации(Таблица, Фильтр);
Текст = "";
Край = Мин(${safeLimit}, Таблица.Количество()) - 1;
Для Индекс = 0 По Край Цикл
  СтрокаЖурнала = Таблица[Индекс];
  Текст = Текст + Формат(СтрокаЖурнала.Дата, "ДФ=yyyy-MM-dd HH:mm:ss")
    + "|" + Строка(СтрокаЖурнала.Уровень)
    + "|" + Строка(СтрокаЖурнала.Событие)
    + "|" + Строка(СтрокаЖурнала.Пользователь)
    + "|" + Строка(СтрокаЖурнала.ПредставлениеМетаданных)
    + "|" + СтрЗаменить(Строка(СтрокаЖурнала.Комментарий), Символы.ПС, " ")
    + Символы.ПС;
КонецЦикла;
Результат = Текст;`;
}

export function parseReglogLine(line) {
  const parts = String(line || '').split('|');
  if (parts.length < 6) return null;
  const [when, level, event, user, object, ...rest] = parts;
  if (!when.trim()) return null;
  return {
    when: when.trim(),
    level: level.trim(),
    event: event.trim(),
    user: user.trim(),
    object: object.trim(),
    comment: rest.join('|').trim().slice(0, 180),
  };
}

export function parseReglogText(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map(parseReglogLine)
    .filter(Boolean);
}

export function formatReglogTable(rows) {
  if (!rows.length) return 'Записей нет.';
  const header = 'when | level | event | user | object | comment';
  const body = rows.map((row) => [row.when, row.level, row.event, row.user, row.object, row.comment].join(' | '));
  return [header, ...body].join('\n');
}

function toolNames(tools) {
  return (tools || []).map((tool) => String(tool || ''));
}

export function reglogUnavailable(values, tools) {
  const label = infobaseLabel(values);
  const names = toolNames(tools);
  const found = names.find((name) => /vcexecutecode|execute_code|vcloggetlasterror/i.test(name));
  const port = String(values.MCP_TOOLKIT_PORT || '').replace(/\D/g, '');
  if (!found && !port) {
    return `Журнал недоступен: нет подключённого MCP. База ${label.kind} ${label.name} не запрашивалась.`;
  }
  return '';
}

export async function collectReglog({ values = {}, args = '', tools = [], fetchImpl } = {}) {
  const label = infobaseLabel(values);
  const parsed = parseReglogArgs(args);
  const missing = reglogUnavailable(values, tools);
  const preface = `База ${label.kind} ${label.name}.`;
  if (missing) return { ok: false, text: missing };
  const port = String(values.MCP_TOOLKIT_PORT || '').replace(/\D/g, '');
  if (!port || typeof fetchImpl !== 'function') {
    return {
      ok: false,
      text: `${preface} Журнал недоступен: команда не отправляет код модели. База не запрашивалась.`,
    };
  }
  const code = buildReglogCode(parsed);
  let response;
  try {
    response = await fetchImpl(`http://127.0.0.1:${port}/api/execute_code`, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ code }),
    });
  } catch (error) {
    return { ok: false, text: `${preface} Журнал недоступен: ${error.message}. База не изменялась.` };
  }
  const payload = typeof response?.text === 'function' ? await response.text() : String(response?.body || '');
  let raw = payload;
  try {
    const json = JSON.parse(payload);
    raw = json.result ?? json.Результат ?? json.text ?? payload;
  } catch { /* plain text */ }
  const rows = parseReglogText(raw);
  return { ok: true, text: `${preface}\n${formatReglogTable(rows)}` };
}
