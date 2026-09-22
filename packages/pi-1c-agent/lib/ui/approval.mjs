export const APPROVE_ONCE = 'Approve once';
export const APPROVE_ALL = 'Approve this risk class for this target (session)';
export const APPROVE_DENY = 'Deny';

export function composeApprovalView({ toolName = '', action = '', reason = '' } = {}) {
  return {
    title: 'Нужно подтверждение',
    fields: [
      { label: 'Инструмент', value: String(toolName || 'неизвестно') },
      { label: 'Действие', value: String(action || '').trim() || '(нет деталей)' },
      { label: 'Риск', value: String(reason || '').trim() || '(не указано)' },
    ],
    choices: [
      { id: 'once', label: 'Разрешить один раз', value: APPROVE_ONCE },
      { id: 'session', label: 'Разрешить похожие до конца сеанса', value: APPROVE_ALL },
      { id: 'deny', label: 'Отклонить', value: APPROVE_DENY },
    ],
  };
}

export function summarizeToolAction(toolName, input = {}) {
  const tool = String(toolName || '');
  if (tool === 'bash' || tool === 'shell') {
    return String(input.command || input.cmd || '').trim() || tool;
  }
  if (tool === 'write' || tool === 'edit' || tool === 'read') {
    return String(input.path || input.file_path || input.file || '').trim() || tool;
  }
  try {
    const json = JSON.stringify(input);
    return json.length > 160 ? `${json.slice(0, 157)}...` : json;
  } catch {
    return tool;
  }
}
