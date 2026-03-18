const DEFAULTS = {
  blockShorts: true,
  hideRecommended: true,
  redirectHome: true
};

const checkboxIds = Object.keys(DEFAULTS);

// Load current settings and set checkbox states
browser.storage.sync.get(DEFAULTS).then((settings) => {
  for (const id of checkboxIds) {
    const el = document.getElementById(id);
    if (el) el.checked = settings[id];
  }
});

// Save on change
for (const id of checkboxIds) {
  const el = document.getElementById(id);
  if (!el) continue;

  el.addEventListener('change', () => {
    browser.storage.sync.set({ [id]: el.checked });
  });
}
