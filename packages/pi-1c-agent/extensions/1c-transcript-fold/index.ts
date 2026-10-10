import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { AssistantMessageComponent, UserMessageComponent } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import {
  beginRun,
  classifyThinking,
  createFoldRun,
  formatFoldLine,
  isQuietTool,
  messageShape,
  noteCall,
  shouldHideCall,
} from "../../lib/transcript-fold/fold-state.mjs";

const HOOK = Symbol.for("pi-1c.transcript-fold.hook");
const RUN = Symbol.for("pi-1c.transcript-fold.run");
const HIDDEN_CALL = {
  render() {
    return [];
  },
  invalidate() {},
};

let current = createFoldRun();
let keySeq = 0;
const anchors = new WeakMap();
const pendingRuns = new Set();
let refreshQueued = false;
let pendingRender: (() => void) | null = null;

function keyOf(component) {
  if (!component.__pi1cFoldKey) component.__pi1cFoldKey = `fold-${++keySeq}`;
  return component.__pi1cFoldKey;
}

function thinkingHidden(component) {
  if (!component?.hideThinkingBlock) return false;
  const overrides = component.thinkingVisibilityOverrides;
  if (overrides && typeof overrides.values === "function") {
    for (const value of overrides.values()) {
      if (value === false) return false;
    }
  }
  return true;
}

function runForCall(context) {
  const state = context?.state;
  if (state && typeof state === "object") {
    if (!state[RUN]) state[RUN] = current;
    return state[RUN];
  }
  return current;
}

function scheduleRefresh(run, requestRender?: () => void) {
  pendingRuns.add(run);
  if (typeof requestRender === "function") pendingRender = requestRender;
  if (refreshQueued) return;
  refreshQueued = true;
  queueMicrotask(() => {
    refreshQueued = false;
    for (const item of pendingRuns) anchors.get(item)?.invalidate?.();
    pendingRuns.clear();
    const render = pendingRender;
    pendingRender = null;
    render?.();
  });
}

function observe(name, context, isError) {
  const run = runForCall(context);
  const changed = noteCall(run, { name, toolCallId: context?.toolCallId, isError });
  if (changed) scheduleRefresh(run, () => context?.invalidate?.());
  return run;
}

function hideCall(name, context, isError, expanded) {
  const run = observe(name, context, isError);
  return shouldHideCall(run, {
    name,
    toolCallId: context?.toolCallId,
    isError,
    expanded,
  });
}

function wrapQuietRenderers(name, renderers) {
  const originalCall = renderers.renderCall;
  const originalResult = renderers.renderResult;
  return {
    ...renderers,
    // Self shell drops the row when render() is empty. The default box keeps a blank line.
    renderShell: "self",
    renderCall(args, theme, context) {
      if (hideCall(name, context, Boolean(context?.isError), Boolean(context?.expanded))) return HIDDEN_CALL;
      if (originalCall) return originalCall(args, theme, context);
      return new Text(String(name), 0, 0);
    },
    renderResult(result, options, theme, context) {
      const isError = Boolean(result?.isError || context?.isError);
      const expanded = Boolean(options?.expanded || context?.expanded);
      if (hideCall(name, context, isError, expanded)) return HIDDEN_CALL;
      return originalResult ? originalResult(result, options, theme, context) : HIDDEN_CALL;
    },
  };
}

function paintSummary(component, original, message, isStreaming, shape) {
  const run = component.__pi1cFoldRun;
  anchors.set(run, component);
  const previous = component.hiddenThinkingLabel;
  const line = formatFoldLine(run);
  component.hiddenThinkingLabel = line;
  const result = original.call(component, message, isStreaming);
  component.hiddenThinkingLabel = previous;
  if (!shape.hasThinking && component.contentContainer?.children) {
    component.contentContainer.children.unshift(new Text(line, component.outputPad || 0, 0));
  }
  return result;
}

function hookedUpdate(original, message, isStreaming) {
  if (!this.__pi1cFoldRun) this.__pi1cFoldRun = current;
  const shape = messageShape(message);
  const action = classifyThinking(this.__pi1cFoldRun, keyOf(this), shape, thinkingHidden(this));
  if (action === "suppress") {
    this.lastMessage = message;
    if (isStreaming !== undefined) this.isStreaming = isStreaming;
    this.hasToolCalls = shape.hasTools;
    this.contentContainer?.clear?.();
    return undefined;
  }
  if (action === "summary") return paintSummary(this, original, message, isStreaming, shape);
  return original.call(this, message, isStreaming);
}

function hookedRebuild(original) {
  const fresh = !this.__pi1cFoldBound;
  const result = original.call(this);
  if (fresh) {
    this.__pi1cFoldBound = true;
    current = beginRun();
  }
  return result;
}

function installPatches() {
  const assistant = AssistantMessageComponent.prototype as any;
  const user = UserMessageComponent.prototype as any;
  if (!assistant[HOOK]) {
    const originalUpdate = assistant.updateContent;
    assistant.updateContent = function patched(message, isStreaming) {
      return assistant[HOOK].call(this, originalUpdate, message, isStreaming);
    };
  }
  assistant[HOOK] = hookedUpdate;
  if (!user[HOOK]) {
    const originalRebuild = user.rebuild;
    user.rebuild = function patched() {
      return user[HOOK].call(this, originalRebuild);
    };
  }
  user[HOOK] = hookedRebuild;
}

export default function oneCTranscriptFold(pi: ExtensionAPI): void {
  installPatches();
  pi.registerToolRenderer((toolName, next) => {
    const renderers = next();
    if (!renderers || !isQuietTool(toolName)) return renderers;
    return wrapQuietRenderers(toolName, renderers);
  });
  pi.on("session_start", () => {
    current = beginRun();
  });
}
