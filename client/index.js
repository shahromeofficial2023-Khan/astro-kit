// Browser helpers for fleet calculators. Import from '@shahrome/astro-kit/client'.

/**
 * Guards the result area. ok() marks the result current; error(msg) dims it and relabels it so an old
 * answer never looks current; reset() restores the build-time example (e.g. when the input is cleared).
 */
export function createResult(out, { tagId = 'r-tag', errorTag = 'No result — check the input' } = {}) {
  const example = out.innerHTML;
  return {
    ok() { out.classList.remove('stale'); },
    error() { out.classList.add('stale'); const t = out.querySelector(`#${tagId}`); if (t) t.textContent = errorTag; },
    reset() { out.innerHTML = example; out.classList.remove('stale'); },
  };
}

/** Show only the fields whose data-for matches the chosen option (fields without data-for always show). */
export function showFieldsFor(form, value) {
  form.querySelectorAll('[data-for]').forEach((el) => { el.hidden = el.dataset.for !== value; });
}

/** Today on the user's own calendar (not UTC), as YYYY-MM-DD. */
export function localToday() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}
