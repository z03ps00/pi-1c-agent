export const APPROVE_INTRO = 'Когда спрашивать подтверждение в BUILD. Новая сессия начинается с «не спрашивать».';

export const APPROVE_CHOICES = [
  { value: 'off', label: 'off', description: 'не спрашивать.' },
  { value: 'safe', label: 'safe', description: 'спрашивать перед опасным действием: запись файлов, разрушительная команда, изменение базы.' },
  { value: 'strict', label: 'strict', description: 'спрашивать перед каждым вызовом инструмента.' },
];

export const ANON_INTRO = 'Насколько эта сессия отрезана от памяти. Новая сессия начинается с обычной политики.';

export const ANON_CHOICES = [
  { value: 'off', label: 'off', description: 'память читается и пишется как обычно.' },
  { value: '1', label: '1', description: 'не писать в общую память и не оставлять очередь на запись.' },
  { value: '2', label: '2', description: 'не читать и не писать общую память.' },
  { value: '3', label: '3', description: 'не читать, не писать и не оставлять локальные handoff-следы.' },
];

export const CAPTURE_MODEL_INTRO = 'Чем сжимать диалог перед записью в память.';

export const CAPTURE_MODEL_CHOICES = [
  { value: 'off', label: 'off', description: 'без модели, только простые правила.' },
  { value: 'stack', label: 'stack', description: 'модель стека Cognee и OpenViking.' },
  { value: 'chat', label: 'chat', description: 'текущая модель этого чата.' },
  { value: 'ollama', label: 'ollama', description: 'локальная модель. Дальше спросит имя.' },
  { value: 'routerai', label: 'routerai', description: 'модель Router AI. Дальше спросит имя.' },
];

export const SESSION_ROTATE_INTRO = 'Новая сессия вместо сжатия контекста. Порог процента задаётся отдельно: /session-rotate 80.';

export const SESSION_ROTATE_CHOICES = [
  { value: 'on', label: 'on', description: 'при заполнении контекста начать новую сессию.' },
  { value: 'off', label: 'off', description: 'не ротировать, контекст сжимается как обычно.' },
];
