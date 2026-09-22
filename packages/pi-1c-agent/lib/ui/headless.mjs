export function uiAvailable(ctx) {
  if (!ctx || typeof ctx !== 'object') return false;
  return ctx.hasUI === true && ctx.mode === 'tui';
}

export function hasDialogUi(ctx) {
  return Boolean(ctx && ctx.hasUI === true);
}
