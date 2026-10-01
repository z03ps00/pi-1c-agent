export const APPROVE_CHOICES = [
  { value: 'off', label: 'OFF', description: 'Do not ask' },
  { value: 'safe', label: 'SAFE', description: 'Ask on dangerous BUILD actions' },
  { value: 'strict', label: 'STRICT', description: 'Approve every tool call' },
];

export const ANON_CHOICES = [
  { value: 'off', label: 'OFF', description: 'Shared memory policy restored' },
  { value: '1', label: '1', description: 'No memory writes' },
  { value: '2', label: '2', description: 'No memory reads or writes' },
  { value: '3', label: '3', description: 'No reads, writes, or local traces' },
];

export const CAPTURE_MODEL_CHOICES = [
  { value: 'off', label: 'OFF', description: 'Heuristic only' },
  { value: 'stack', label: 'STACK', description: 'Paired Cognee + OpenViking stack' },
  { value: 'chat', label: 'CHAT', description: 'Current chat model' },
  { value: 'ollama', label: 'OLLAMA', description: 'Local Ollama model (asks for a name)' },
  { value: 'routerai', label: 'ROUTERAI', description: 'Router AI model (asks for a name)' },
];

export const SESSION_ROTATE_CHOICES = [
  { value: 'on', label: 'ON', description: 'Rotate the session at the context threshold' },
  { value: 'off', label: 'OFF', description: 'Do not rotate' },
];
