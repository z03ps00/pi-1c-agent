export function updatesUrl(token) {
  return `https://api.telegram.org/bot${encodeURIComponent(token)}/getUpdates`;
}

export async function fetchUpdates({
  token,
  offset = 0,
  timeoutSec = 50,
  fetchImpl = globalThis.fetch,
  signal,
} = {}) {
  const response = await fetchImpl(updatesUrl(token), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ offset, timeout: timeoutSec }),
    signal,
  });
  if (!response.ok) throw new Error(`telegram getUpdates HTTP ${response.status}`);
  const body = await response.json();
  if (!body?.ok || !Array.isArray(body.result)) throw new Error('telegram getUpdates rejected');
  return body.result;
}

export async function pollLoop({
  token,
  fetchImpl,
  onUpdates,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  signal,
  log = () => {},
} = {}) {
  let offset = 0;
  while (!signal?.aborted) {
    try {
      const updates = await fetchUpdates({ token, offset, fetchImpl, signal });
      for (const update of updates) {
        if (Number.isInteger(update?.update_id)) offset = update.update_id + 1;
      }
      if (updates.length) await onUpdates(updates);
    } catch (error) {
      if (signal?.aborted) break;
      log('telegram poll retry');
      await sleep(1000);
    }
  }
}
