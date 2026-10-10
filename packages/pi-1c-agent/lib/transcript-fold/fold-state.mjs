/** One agent turn of quiet tool calls, collapsed into a single thinking line. */

export const QUIET_TOOLS = Object.freeze(["read", "grep", "find", "ls"]);

const QUIET = new Set(QUIET_TOOLS);

export function isQuietTool(name) {
  return QUIET.has(name);
}

export function createFoldRun() {
  return {
    counts: Object.create(null),
    seen: Object.create(null),
    errors: Object.create(null),
    anchorKey: null,
  };
}

export function beginRun() {
  return createFoldRun();
}

export function messageShape(message) {
  const content = Array.isArray(message?.content) ? message.content : [];
  let hasText = false;
  let hasThinking = false;
  let hasTools = false;
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    if (block.type === "text" && String(block.text ?? "").trim()) hasText = true;
    else if (block.type === "thinking" && String(block.thinking ?? "").trim()) hasThinking = true;
    else if (block.type === "toolCall") hasTools = true;
  }
  return { hasText, hasThinking, hasTools };
}

export function formatFoldLine(run) {
  const parts = [];
  for (const name of QUIET_TOOLS) {
    const count = run?.counts?.[name] || 0;
    if (count > 0) parts.push(`${name} ×${count}`);
  }
  if (parts.length === 0) return "Thinking…";
  return `Thinking… · ${parts.join(" · ")}`;
}

/**
 * Record a quiet call once. An error drops back out of the hidden tally so the
 * row can stay on screen by itself. Returns whether the summary line changed.
 */
export function noteCall(run, call) {
  const name = call?.name;
  const id = call?.toolCallId;
  if (!run || !id || !isQuietTool(name)) return false;
  if (call.isError) {
    if (run.errors[id]) return false;
    run.errors[id] = true;
    if (!run.seen[id]) {
      run.seen[id] = true;
      return false;
    }
    run.counts[name] = Math.max(0, (run.counts[name] || 1) - 1);
    if (run.counts[name] === 0) delete run.counts[name];
    return true;
  }
  if (run.errors[id] || run.seen[id]) return false;
  run.seen[id] = true;
  run.counts[name] = (run.counts[name] || 0) + 1;
  return true;
}

export function shouldHideCall(run, call) {
  if (!isQuietTool(call?.name)) return false;
  if (call?.expanded) return false;
  if (call?.isError) return false;
  if (call?.toolCallId && run?.errors?.[call.toolCallId]) return false;
  return true;
}

/**
 * Hidden thinking-only messages after the first one in a run draw nothing.
 * The first one is the summary line. Visible thoughts and the written answer pass through.
 */
export function classifyThinking(run, componentKey, shape, hidden) {
  const foldable = Boolean(shape?.hasThinking || shape?.hasTools);
  if (!hidden || !foldable) return "passthrough";
  if (run.anchorKey == null) {
    run.anchorKey = componentKey;
    return "summary";
  }
  if (run.anchorKey === componentKey) return "summary";
  if (shape?.hasText) return "passthrough";
  return "suppress";
}
