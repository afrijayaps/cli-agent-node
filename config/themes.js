const THEMES = [
  {
    id: 'aether',
    name: 'Aether Mint',
    description: 'Deep charcoal base with mint-teal accents.',
  },
  {
    id: 'slate',
    name: 'Slate Console',
    description: 'Soft slate and blue-gray balanced look.',
  },
  {
    id: 'ember',
    name: 'Ember Signal',
    description: 'Warm copper accent with neutral dark base.',
  },
];

function getThemeById(themeId) {
  return THEMES.find((theme) => theme.id === themeId) || null;
}

module.exports = {
  THEMES,
  DEFAULT_THEME: THEMES[0].id,
  getThemeById,
};
