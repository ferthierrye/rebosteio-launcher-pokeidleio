'use strict';

function kickRewardCatalog(raw) {
  if (!Array.isArray(raw?.data)) return [];
  return raw.data.flatMap(r => {
    const title = String(r.title || '').toLowerCase();
    if ((!String(r.description || '').toLowerCase().includes('pokeidle') && !title.includes('pokeidle')) ||
        !/^[A-Z0-9]{26}$/.test(r.id || '')) return [];
    const [key, cost] = (title.includes('xp') || title.includes('exp')) ? ['exp', 300]
      : (title.includes('capture') || title.includes('catch')) ? ['catch', 500]
      : (title.includes('lure') || title.includes('secret') || title.includes('isca')) ? ['lure', 1000] : [];
    return key ? [{ key, cost, id: r.id, available: r.cost === cost && r.is_enabled === true &&
      r.is_paused === false && r.is_user_input_required === false }] : [];
  });
}

module.exports = { kickRewardCatalog };
