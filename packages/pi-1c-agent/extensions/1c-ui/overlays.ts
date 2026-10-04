import { matchesKey, SelectList, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import {
  composeApprovalView,
  composeHubDetailLines,
  composeHubRows,
  composeHubText,
  composeSubagentResultLines,
  getSnapshot,
  filterPaletteActions,
  PALETTE_ACTIONS,
  colorize,
  invokeAction,
  subscribe,
  statusIcon,
  uiAvailable,
} from "../../lib/ui/index.mjs";
import { MODE_CHOICES, MODE_INTRO } from "../../lib/ui/mode-choices.mjs";
import {
  ANON_CHOICES,
  ANON_INTRO,
  APPROVE_CHOICES,
  APPROVE_INTRO,
  CAPTURE_MODEL_CHOICES,
  CAPTURE_MODEL_INTRO,
  LEARNING_CHOICES,
  LEARNING_INTRO,
  SESSION_ROTATE_CHOICES,
  SESSION_ROTATE_INTRO,
} from "../../lib/ui/option-choices.mjs";
import { composePickerLines, pickerSpanAt } from "../../lib/ui/picker-layout.mjs";
import { TASKMODE_INTRO, taskmodeChoices } from "../../lib/taskmode-state.mjs";
import {
  INIT_MODE_CHOICES, INIT_MODE_INTRO, INIT_SOURCE_CHOICES, INIT_SOURCE_INTRO,
} from "../../lib/ui/init-copy.mjs";

function selectTheme(theme: any) {
  return {
    selectedPrefix: (t: string) => colorize(theme, "accent", t),
    selectedText: (t: string) => colorize(theme, "text", t),
    description: (t: string) => colorize(theme, "dim", t),
    scrollInfo: (t: string) => colorize(theme, "dim", t),
    noMatch: (t: string) => colorize(theme, "dim", t),
  };
}

function frame(theme: any, title: string, body: string[], width: number, footer = "Enter select    Esc cancel") {
  const inner = Math.max(24, width - 2);
  const titleText = ` ${title} `;
  const dash = Math.max(0, inner - titleText.length - 2);
  const top = colorize(theme, "borderMuted", `╭─${titleText}${"─".repeat(dash)}╮`);
  const lines = body.map((line) => {
    const clipped = truncateToWidth(line, inner);
    const pad = Math.max(0, inner - visibleWidth(clipped));
    return `${colorize(theme, "borderMuted", "│")}${clipped}${" ".repeat(pad)}${colorize(theme, "borderMuted", "│")}`;
  });
  const bottom = colorize(theme, "borderMuted", `╰${"─".repeat(inner)}╯`);
  return [top, ...lines, colorize(theme, "dim", `  ${footer}`), bottom];
}

type PickerItem = { value: string; label: string; description?: string };

export async function overlaySelect(
  ctx: any,
  title: string,
  items: PickerItem[],
  intro = "",
): Promise<string | undefined> {
  if (!ctx?.ui?.custom) return undefined;
  return ctx.ui.custom<string | null>((tui: any, theme: any, _kb: unknown, done: (v: string | null) => void) => {
    let selected = 0;
    let view = composePickerLines({ intro, items, selectedIndex: selected, width: 60 });
    const move = (next: number) => {
      if (!items.length) return;
      selected = (next + items.length) % items.length;
      tui.requestRender();
    };
    return {
      invalidate() {},
      handleInput(data: string) {
        if (matchesKey(data, "up")) { move(selected - 1); return; }
        if (matchesKey(data, "down")) { move(selected + 1); return; }
        if (matchesKey(data, "enter")) { done(items[selected]?.value ?? null); return; }
        if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) { done(null); }
      },
      handleMouse(event: { y: number; type?: string }) {
        const span = pickerSpanAt(view.spans, event.y - 1);
        if (!span) return undefined;
        if (event.type === "press") {
          selected = span.index;
          tui.requestRender();
          return { handled: true, focus: true };
        }
        if (event.type === "click") {
          selected = span.index;
          done(items[selected]?.value ?? null);
          return { handled: true };
        }
        return undefined;
      },
      render(width: number) {
        const inner = Math.max(24, width - 2);
        view = composePickerLines({ intro, items, selectedIndex: selected, width: inner });
        const body = view.lines.map((line, index) => {
          const span = pickerSpanAt(view.spans, index);
          if (span?.index === selected) return colorize(theme, "accent", line);
          if (!span) return colorize(theme, "dim", line);
          return line;
        });
        return frame(theme, title, body, width);
      },
    };
  }, { overlay: true, overlayOptions: { width: "70%", minWidth: 40, maxHeight: "80%", anchor: "center" } });
}

/** TUI overlay like /mode; otherwise ctx.ui.select. Cancel returns undefined. */
export async function pickOverlay(
  ctx: any,
  title: string,
  items: PickerItem[],
  intro = "",
): Promise<string | undefined> {
  if (uiAvailable(ctx)) {
    const picked = await overlaySelect(ctx, title, items, intro);
    if (picked) return picked;
    return undefined;
  }
  if (ctx?.hasUI && typeof ctx.ui?.select === "function") {
    const selected = await ctx.ui.select(title, items.map((i) => i.value));
    return selected || undefined;
  }
  return undefined;
}

export async function overlayLearningSelect(ctx: any): Promise<string | undefined> {
  return pickOverlay(ctx, "Learning mode", LEARNING_CHOICES, LEARNING_INTRO);
}

export async function overlayApproveSelect(ctx: any): Promise<string | undefined> {
  return pickOverlay(ctx, "Approve", APPROVE_CHOICES, APPROVE_INTRO);
}

export async function overlayAnonSelect(ctx: any): Promise<string | undefined> {
  return pickOverlay(ctx, "Anon", ANON_CHOICES, ANON_INTRO);
}

export async function overlayCaptureModelSelect(ctx: any): Promise<string | undefined> {
  return pickOverlay(ctx, "Capture model", CAPTURE_MODEL_CHOICES, CAPTURE_MODEL_INTRO);
}

export async function overlaySessionRotateSelect(ctx: any): Promise<string | undefined> {
  return pickOverlay(ctx, "Session rotate", SESSION_ROTATE_CHOICES, SESSION_ROTATE_INTRO);
}

export async function overlayModeSelect(ctx: any): Promise<string | undefined> {
  return overlaySelect(ctx, "Mode", MODE_CHOICES, MODE_INTRO);
}

export async function overlayTaskmodeSelect(ctx: any): Promise<string | undefined> {
  return overlaySelect(ctx, "Taskmode", taskmodeChoices(), TASKMODE_INTRO);
}

export async function overlayInitSourceSelect(ctx: any): Promise<string | undefined> {
  return pickOverlay(ctx, "Init", INIT_SOURCE_CHOICES, INIT_SOURCE_INTRO);
}

export async function overlayInitModeSelect(ctx: any): Promise<string | undefined> {
  return pickOverlay(ctx, "Init mode", INIT_MODE_CHOICES, INIT_MODE_INTRO);
}

export async function overlayApproval(ctx: any, input: { toolName: string; action: string; reason: string }): Promise<string | undefined> {
  const view = composeApprovalView(input);
  const items = view.choices.map((c) => ({ value: c.value, label: c.label }));
  if (!ctx?.ui?.custom) return undefined;
  return ctx.ui.custom<string | null>((tui: any, theme: any, _kb: unknown, done: (v: string | null) => void) => {
    const list = new SelectList(items, 6, selectTheme(theme));
    list.onSelect = (item: { value: string }) => done(item.value);
    list.onCancel = () => done(null);
    return {
      invalidate() { list.invalidate(); },
      handleInput(data: string) { list.handleInput(data); tui.requestRender(); },
      render(width: number) {
        const body = [
          "",
          ...view.fields.flatMap((f) => [colorize(theme, "dim", f.label), f.value, ""]),
          ...list.render(Math.max(20, width - 4)),
        ];
        return frame(theme, view.title, body, width, "Enter confirm    Esc deny");
      },
    };
  }, { overlay: true, overlayOptions: { width: "72%", minWidth: 42, maxHeight: "80%", anchor: "center" } });
}

export async function overlayStatus(ctx: any, text: string): Promise<void> {
  await ctx.ui.custom<null>((tui: any, theme: any, _kb: unknown, done: (v: null) => void) => ({
    invalidate() {},
    handleInput(data: string) {
      if (matchesKey(data, "escape") || matchesKey(data, "enter") || matchesKey(data, "ctrl+c")) done(null);
    },
    render(width: number) {
      return frame(theme, "PI 1C Agent", text.split("\n"), width, "Esc close");
    },
  }), { overlay: true, overlayOptions: { width: "70%", minWidth: 40, maxHeight: "85%", anchor: "center" } });
}

export async function overlayPalette(ctx: any): Promise<string | undefined> {
  return ctx.ui.custom<string | null>((tui: any, theme: any, _kb: unknown, done: (v: string | null) => void) => {
    let query = "";
    let list = new SelectList(PALETTE_ACTIONS.map((a) => ({ value: a.id, label: a.label, description: a.command })), 12, selectTheme(theme));
    const rebuild = () => {
      const items = filterPaletteActions(query).map((a) => ({ value: a.id, label: a.label, description: a.command }));
      list = new SelectList(items.length ? items : [{ value: "", label: "No matches", description: "" }], 12, selectTheme(theme));
      list.onSelect = (item: { value: string }) => { if (item.value) done(item.value); };
      list.onCancel = () => done(null);
    };
    rebuild();
    return {
      invalidate() { list.invalidate(); },
      handleInput(data: string) {
        if (matchesKey(data, "backspace")) { query = query.slice(0, -1); rebuild(); tui.requestRender(); return; }
        if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) { done(null); return; }
        if (data.length === 1 && data >= " " && data !== "\x7f") { query += data; rebuild(); tui.requestRender(); return; }
        list.handleInput(data);
        tui.requestRender();
      },
      render(width: number) {
        const body = [`> ${query}`, "", ...list.render(Math.max(20, width - 4))];
        return frame(theme, "PI 1C", body, width, "Type to filter    Enter run    Esc close");
      },
    };
  }, { overlay: true, overlayOptions: { width: "56%", minWidth: 36, maxHeight: "70%", anchor: "center" } });
}

export async function overlayHub(ctx: any): Promise<void> {
  await ctx.ui.custom<null>((tui: any, theme: any, _kb: unknown, done: (v: null) => void) => {
    let detail: ReturnType<typeof composeHubRows>[0] | null = null;
    const rows = () => {
      const snap = getSnapshot("agents") || {};
      return composeHubRows(snap.discovered || [], snap.runs || [], Date.now());
    };
    let list: SelectList<{ value: string; label: string; description?: string }>;
    const rebuild = () => {
      const items = rows().map((r) => ({
        value: r.agent,
        label: `${statusIcon(r.status)} ${r.name}`,
        description: `${r.status.padEnd(10)} ${r.activity || r.kind}`,
      }));
      list = new SelectList(items.length ? items : [{ value: "", label: "No 1C agents discovered", description: "Run /bootstrap" }], 14, selectTheme(theme));
      list.onSelect = (item: { value: string }) => {
        if (!item.value) return;
        detail = rows().find((r) => r.agent === item.value) || null;
        tui.requestRender();
      };
      list.onCancel = () => finish();
    };
    const unsub = subscribe((source: string) => {
      if (source !== "agents") return;
      if (detail) detail = rows().find((r) => r.agent === detail?.agent) || detail;
      rebuild();
      tui.requestRender();
    });
    const tick = setInterval(() => tui.requestRender(), 1000);
    const finish = (value: null = null) => {
      unsub();
      clearInterval(tick);
      done(value);
    };
    rebuild();
    return {
      invalidate() { list.invalidate(); },
      handleInput(data: string) {
        if (detail) {
          if (matchesKey(data, "up") || matchesKey(data, "left")) {
            finish();
            return;
          }
          if (matchesKey(data, "escape") || matchesKey(data, "backspace")) {
            detail = null;
            tui.requestRender();
            return;
          }
          if (matchesKey(data, "x") || matchesKey(data, "X")) {
            const selected = list.getSelectedItem();
            const row = rows().find((r) => r.agent === selected?.value) || detail;
            if (row?.id) invokeAction("agents-stop", row.id);
            rebuild();
            tui.requestRender();
            return;
          }
          if (matchesKey(data, "down") || matchesKey(data, "right")) return;
        }
        if (matchesKey(data, "x") || matchesKey(data, "X")) {
          const selected = list.getSelectedItem();
          const row = rows().find((r) => r.agent === selected?.value);
          if (row?.id) invokeAction("agents-stop", row.id);
          rebuild();
          tui.requestRender();
          return;
        }
        if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) { finish(); return; }
        list.handleInput(data);
        tui.requestRender();
      },
      render(width: number) {
        if (detail) {
          const live = rows().find((r) => r.agent === detail?.agent) || detail;
          const log = composeSubagentResultLines({
            agent: live.agent,
            name: live.name,
            status: live.status,
            activity: live.activity,
            error: live.error,
            items: live.items,
            startedAt: live.startedAt,
            endedAt: live.endedAt,
          }, { expanded: true, isPartial: live.stoppable });
          return frame(theme, `AGENT ${live.name}`, [...log, "", ...composeHubDetailLines(live).slice(1)], width, "↑ parent    Esc back    x stop");
        }
        const body = list.render(Math.max(20, width - 4));
        if (!body.length) body.push(...composeHubText(rows()).split("\n"));
        return frame(theme, "1C AGENTS", body, width, "Enter inspect    x stop    Esc close");
      },
    };
  }, { overlay: true, overlayOptions: { width: "78%", minWidth: 44, maxHeight: "85%", anchor: "center" } });
}

export async function overlayChild(ctx: any, agentName?: string): Promise<void> {
  if (!ctx?.ui?.custom) return;
  await ctx.ui.custom<null>((tui: any, theme: any, _kb: unknown, done: (v: null) => void) => {
    const pick = () => {
      const snap = getSnapshot("agents") || {};
      const rows = composeHubRows(snap.discovered || [], snap.runs || [], Date.now());
      const wanted = String(agentName || "").replace(/^1c-/, "");
      if (wanted) {
        const hit = rows.find((r) => r.agent === agentName || r.name === wanted || r.agent === `1c-${wanted}`);
        if (hit) return hit;
      }
      return rows.find((r) => r.stoppable) || rows.find((r) => r.status !== "idle") || null;
    };
    const unsub = subscribe((source: string) => {
      if (source === "agents") tui.requestRender();
    });
    const tick = setInterval(() => tui.requestRender(), 1000);
    const finish = () => {
      unsub();
      clearInterval(tick);
      done(null);
    };
    return {
      invalidate() {},
      handleInput(data: string) {
        if (matchesKey(data, "up") || matchesKey(data, "left") || matchesKey(data, "escape") || matchesKey(data, "backspace") || matchesKey(data, "ctrl+c")) {
          finish();
          return;
        }
        if (matchesKey(data, "x") || matchesKey(data, "X")) {
          const row = pick();
          if (row?.id) invokeAction("agents-stop", row.id);
          tui.requestRender();
        }
      },
      render(width: number) {
        const live = pick();
        if (!live) return frame(theme, "AGENT", ["No 1C subagent to inspect."], width, "↑ parent");
        const log = composeSubagentResultLines({
          agent: live.agent,
          name: live.name,
          status: live.status,
          activity: live.activity,
          error: live.error,
          items: live.items,
          startedAt: live.startedAt,
          endedAt: live.endedAt,
        }, { expanded: true, isPartial: live.stoppable });
        return frame(theme, `AGENT ${live.name}`, [...log, "", ...composeHubDetailLines(live).slice(1)], width, "↑ parent    x stop");
      },
    };
  }, { overlay: true, overlayOptions: { width: "82%", minWidth: 48, maxHeight: "90%", anchor: "center" } });
}

export async function overlayText(ctx: any, title: string, body: string): Promise<void> {
  if (!ctx?.ui?.custom) {
    ctx?.ui?.notify?.(body, "info");
    return;
  }
  await ctx.ui.custom<null>((_tui: any, theme: any, _kb: unknown, done: (v: null) => void) => ({
    invalidate() {},
    handleInput(data: string) {
      if (matchesKey(data, "escape") || matchesKey(data, "enter") || matchesKey(data, "ctrl+c")) done(null);
    },
    render(width: number) {
      return frame(theme, title, String(body || "").split("\n"), width, "Esc close");
    },
  }), { overlay: true, overlayOptions: { width: "70%", minWidth: 40, maxHeight: "80%", anchor: "center" } });
}
