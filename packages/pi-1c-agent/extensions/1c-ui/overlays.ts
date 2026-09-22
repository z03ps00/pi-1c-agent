import { matchesKey, SelectList, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import {
  composeApprovalView,
  composeHubRows,
  composeHubText,
  getSnapshot,
  filterPaletteActions,
  PALETTE_ACTIONS,
  colorize,
  invokeAction,
  subscribe,
  statusIcon,
  statusLabel,
  kindLabel,
} from "../../lib/ui/index.mjs";
import { MODE_CHOICES } from "../../lib/ui/mode-choices.mjs";

function selectTheme(theme: any) {
  return {
    selectedPrefix: (t: string) => colorize(theme, "accent", t),
    selectedText: (t: string) => colorize(theme, "text", t),
    description: (t: string) => colorize(theme, "dim", t),
    scrollInfo: (t: string) => colorize(theme, "dim", t),
    noMatch: (t: string) => colorize(theme, "dim", t),
  };
}

function frame(theme: any, title: string, body: string[], width: number, footer = "Enter — выбрать    Esc — отмена") {
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

export async function overlaySelect(
  ctx: any,
  title: string,
  items: { value: string; label: string; description?: string }[],
): Promise<string | undefined> {
  if (!ctx?.ui?.custom) return undefined;
  return ctx.ui.custom<string | null>((tui: any, theme: any, _kb: unknown, done: (v: string | null) => void) => {
    const list = new SelectList(items, 12, selectTheme(theme));
    list.onSelect = (item: { value: string }) => done(item.value);
    list.onCancel = () => done(null);
    return {
      invalidate() { list.invalidate(); },
      handleInput(data: string) { list.handleInput(data); tui.requestRender(); },
      render(width: number) {
        return frame(theme, title, list.render(Math.max(20, width - 4)), width);
      },
    };
  }, { overlay: true, overlayOptions: { width: "70%", minWidth: 40, maxHeight: "80%", anchor: "center" } });
}

export async function overlayModeSelect(ctx: any): Promise<string | undefined> {
  return overlaySelect(ctx, "Режим", MODE_CHOICES.map((m) => ({
    value: m.value,
    label: m.label,
    description: m.description,
  })));
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
        return frame(theme, view.title, body, width, "Enter — подтвердить    Esc — отклонить");
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
      return frame(theme, "PI 1C Agent", text.split("\n"), width, "Esc — закрыть");
    },
  }), { overlay: true, overlayOptions: { width: "70%", minWidth: 40, maxHeight: "85%", anchor: "center" } });
}

export async function overlayPalette(ctx: any): Promise<string | undefined> {
  return ctx.ui.custom<string | null>((tui: any, theme: any, _kb: unknown, done: (v: string | null) => void) => {
    let query = "";
    let list = new SelectList(PALETTE_ACTIONS.map((a) => ({ value: a.id, label: a.label, description: a.command })), 12, selectTheme(theme));
    const rebuild = () => {
      const items = filterPaletteActions(query).map((a) => ({ value: a.id, label: a.label, description: a.command }));
      list = new SelectList(items.length ? items : [{ value: "", label: "Нет совпадений", description: "" }], 12, selectTheme(theme));
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
        return frame(theme, "PI 1C", body, width, "Пишите для фильтра    Enter — выполнить    Esc — закрыть");
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
        description: `${statusLabel(r.status).padEnd(10)} ${r.activity || kindLabel(r.kind)}`,
      }));
      list = new SelectList(items.length ? items : [{ value: "", label: "1C-агенты не найдены", description: "Запустите /bootstrap" }], 14, selectTheme(theme));
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
    const finish = (value: null = null) => {
      unsub();
      done(value);
    };
    rebuild();
    return {
      invalidate() { list.invalidate(); },
      handleInput(data: string) {
        if (detail && (matchesKey(data, "escape") || matchesKey(data, "backspace"))) {
          detail = null;
          tui.requestRender();
          return;
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
          const body = [
            `${live.name}  ${statusLabel(live.status)}`,
            `тип      ${kindLabel(live.kind)}`,
            live.mode ? `режим    ${live.mode}` : "",
            live.model ? `модель   ${live.model}` : "",
            `время    ${live.duration}`,
            live.activity ? `сейчас   ${live.activity}` : "",
            live.error ? `ошибка   ${live.error}` : "",
            "",
            "Управление живым субагентом недоступно (нет stdin). x останавливает работающего агента.",
          ].filter(Boolean);
          return frame(theme, "АГЕНТ", body, width, "Esc — назад    x — стоп");
        }
        const body = list.render(Math.max(20, width - 4));
        if (!body.length) body.push(...composeHubText(rows()).split("\n"));
        return frame(theme, "АГЕНТЫ 1C", body, width, "Enter — карточка    x — стоп    Esc — закрыть");
      },
    };
  }, { overlay: true, overlayOptions: { width: "78%", minWidth: 44, maxHeight: "85%", anchor: "center" } });
}
