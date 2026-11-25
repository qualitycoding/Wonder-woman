const STORAGE_KEY = `comic_tracker_${window.location.pathname}`;
let baseData = null;
let userState = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"read":{},"owned":{},"notes":{}}');

async function init() {
  const res = await fetch('./data.json');
  baseData = await res.json();

  document.title = baseData.siteTitle;
  document.getElementById('site-title').textContent = baseData.siteTitle;
  document.getElementById('site-subtitle').textContent = baseData.subtitle || '';

  populateDropdowns();
  bindEvents();
  render();
}

function saveUserState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(userState));
}

function isItemRead(item) {
  return userState.read[item.id] !== undefined ? userState.read[item.id] : Boolean(item.read);
}

function isEditionOwned(itemId, idx, edition) {
  const key = `${itemId}::${idx}`;
  return userState.owned[key] !== undefined ? userState.owned[key] : Boolean(edition.owned);
}

function getItemNote(item) {
  return userState.notes[item.id] !== undefined ? userState.notes[item.id] : (item.notes || '');
}

function populateDropdowns() {
  const eras = [...new Set(baseData.items.map(i => i.era))];
  const eraSelect = document.getElementById('era-filter');
  eras.forEach(era => {
    const opt = document.createElement('option');
    opt.value = era;
    opt.textContent = era;
    eraSelect.appendChild(opt);
  });

  const chars = [...new Set(baseData.items.flatMap(i => i.characters || []))].sort();
  const charSelect = document.getElementById('character-filter');
  chars.forEach(ch => {
    const opt = document.createElement('option');
    opt.value = ch;
    opt.textContent = ch;
    charSelect.appendChild(opt);
  });
}

function render() {
  const query = document.getElementById('search-input').value.toLowerCase().trim();
  const eraFilter = document.getElementById('era-filter').value;
  const statusFilter = document.getElementById('status-filter').value;
  const charFilter = document.getElementById('character-filter').value;

  const tbody = document.getElementById('table-body');
  tbody.innerHTML = '';

  let totalRead = 0;
  let totalEditions = 0;
  let totalOwned = 0;

  // Global stats
  baseData.items.forEach(item => {
    if (isItemRead(item)) totalRead++;
    (item.editions || []).forEach((ed, idx) => {
      if (!ed.uncollected) {
        totalEditions++;
        if (isEditionOwned(item.id, idx, ed)) totalOwned++;
      }
    });
  });

  // Filtered rows
  const filtered = baseData.items.filter(item => {
    const read = isItemRead(item);
    const editions = item.editions || [];
    const anyOwned = editions.some((ed, idx) => isEditionOwned(item.id, idx, ed));
    const hasUncollected = editions.some(ed => ed.uncollected);

    if (eraFilter !== 'all' && item.era !== eraFilter) return false;
    if (charFilter !== 'all' && !(item.characters || []).includes(charFilter)) return false;

    if (statusFilter === 'read' && !read) return false;
    if (statusFilter === 'unread' && read) return false;
    if (statusFilter === 'owned' && !anyOwned) return false;
    if (statusFilter === 'unowned' && anyOwned) return false;
    if (statusFilter === 'uncollected' && !hasUncollected) return false;

    if (query) {
      const haystack = [
        item.title,
        item.arcs,
        getItemNote(item),
        ...(item.authors || []),
        ...(item.characters || []),
        ...editions.map(e => e.title)
      ].join(' ').toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  let currentEra = null;
  filtered.forEach(item => {
    if (item.era !== currentEra) {
      currentEra = item.era;
      const banner = document.createElement('tr');
      banner.className = 'era-banner';
      banner.innerHTML = `<td colspan="7">${currentEra}</td>`;
      tbody.appendChild(banner);
    }

    const read = isItemRead(item);
    const tr = document.createElement('tr');
    if (read) tr.className = 'is-read';

    const editionsHtml = (item.editions || []).map((ed, idx) => {
      const owned = isEditionOwned(item.id, idx, ed);
      const badgeClass = ed.uncollected ? 'badge badge-uncollected' : 'badge';
      const titleHtml = ed.locg_url
        ? `<a href="${ed.locg_url}" target="_blank" rel="noopener" style="color:inherit">${ed.title}</a>`
        : ed.title;

      return `
        <div class="edition-item">
          ${ed.uncollected ? '' : `<input type="checkbox" data-ed-id="${item.id}" data-ed-idx="${idx}" ${owned ? 'checked' : ''} />`}
          <div>
            <div>${titleHtml}</div>
            ${ed.format ? `<span class="${badgeClass}">${ed.format}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');

    const links = item.links || {};
    const linksHtml = [
      links.dc_wiki ? `<a href="${links.dc_wiki}" target="_blank" rel="noopener">DC Wiki ↗</a>` : '',
      links.gcd ? `<a href="${links.gcd}" target="_blank" rel="noopener">GCD ↗</a>` : '',
      links.dcui ? `<a href="${links.dcui}" target="_blank" rel="noopener">DCUI ↗</a>` : ''
    ].filter(Boolean).join('');

    tr.innerHTML = `
      <td><input type="checkbox" data-read-id="${item.id}" ${read ? 'checked' : ''} /></td>
      <td>${item.order}</td>
      <td>
        <strong>${item.title}</strong>
        <input type="text" class="note-input" data-note-id="${item.id}" value="${getItemNote(item).replace(/"/g, '&quot;')}" placeholder="Add personal note..." />
      </td>
      <td>${(item.authors || []).join(', ')}</td>
      <td>${item.arcs || ''}</td>
      <td>${editionsHtml}</td>
      <td><div class="ext-links">${linksHtml}</div></td>
    `;
    tbody.appendChild(tr);
  });

  // Update stats UI
  const pct = baseData.items.length ? Math.round((totalRead / baseData.items.length) * 100) : 0;
  document.getElementById('stat-read').textContent = `${totalRead} / ${baseData.items.length} (${pct}%)`;
  document.getElementById('stat-owned').textContent = `${totalOwned} / ${totalEditions}`;
  document.getElementById('stat-showing').textContent = `${filtered.length} entries`;
  document.getElementById('progress-fill').style.width = `${pct}%`;
}

function bindEvents() {
  ['search-input', 'era-filter', 'status-filter', 'character-filter'].forEach(id => {
    document.getElementById(id).addEventListener('input', render);
  });

  document.getElementById('table-body').addEventListener('change', e => {
    const readId = e.target.getAttribute('data-read-id');
    if (readId) {
      userState.read[readId] = e.target.checked;
      saveUserState();
      render();
      return;
    }
    const edId = e.target.getAttribute('data-ed-id');
    if (edId) {
      const idx = e.target.getAttribute('data-ed-idx');
      userState.owned[`${edId}::${idx}`] = e.target.checked;
      saveUserState();
      render();
    }
  });

  document.getElementById('table-body').addEventListener('input', e => {
    const noteId = e.target.getAttribute('data-note-id');
    if (noteId) {
      userState.notes[noteId] = e.target.value;
      saveUserState();
    }
  });

  // Export merged data.json so you can commit your progress back to GitHub
  document.getElementById('export-btn').addEventListener('click', () => {
    const merged = structuredClone(baseData);
    merged.items.forEach(item => {
      item.read = isItemRead(item);
      item.notes = getItemNote(item);
      (item.editions || []).forEach((ed, idx) => {
        ed.owned = isEditionOwned(item.id, idx, ed);
      });
    });
    const blob = new Blob([JSON.stringify(merged, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'data.json';
    a.click();
  });

  // Import JSON backup
  document.getElementById('import-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const imported = JSON.parse(ev.target.result);
      (imported.items || []).forEach(item => {
        userState.read[item.id] = Boolean(item.read);
        userState.notes[item.id] = item.notes || '';
        (item.editions || []).forEach((ed, idx) => {
          userState.owned[`${item.id}::${idx}`] = Boolean(ed.owned);
        });
      });
      saveUserState();
      render();
    };
    reader.readAsText(file);
  });

  document.getElementById('reset-btn').addEventListener('click', () => {
    if (confirm('Clear local browser changes and revert to the committed data.json?')) {
      localStorage.removeItem(STORAGE_KEY);
      userState = { read: {}, owned: {}, notes: {} };
      render();
    }
  });
}

init();
