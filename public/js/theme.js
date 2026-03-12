export const THEME_PREVIEWS = {
  aether:
    'radial-gradient(circle at 12% -15%, rgba(100,181,173,0.45), transparent 40%), linear-gradient(130deg, #14181d, #0f1113)',
  slate:
    'radial-gradient(circle at 10% -20%, rgba(148,163,184,0.5), transparent 42%), linear-gradient(130deg, #f1f5f9, #dfe7f0)',
  ember:
    'radial-gradient(circle at 12% -10%, rgba(209,138,86,0.55), transparent 42%), linear-gradient(130deg, #2a1f1a, #120d0b)',
};

export function applyTheme(themeId) {
  const root = document.documentElement;
  root.setAttribute('data-theme', themeId);
}

export function formatRelative(dateText) {
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleString();
}
