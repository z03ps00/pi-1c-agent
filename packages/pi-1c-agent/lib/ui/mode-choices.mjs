export const MODE_INTRO = 'Режим сессии: можно ли писать файлы и запускать команды.';

export const MODE_CHOICES = [
  { value: 'build', label: 'BUILD', description: 'можно менять файлы и выполнять команды.' },
  { value: 'plan', label: 'PLAN', description: 'только чтение и план. Код проекта не пишется, bash выключен.' },
  { value: 'ask', label: 'ASK', description: 'только ответы. Запись файлов и bash выключены.' },
];
