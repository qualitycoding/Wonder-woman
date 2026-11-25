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

function isIssueRead(issue) {
  return userState.read[issue.id] !== undefined ? userState.read[issue.id] : Boolean(issue.read);
}

function isEditionOwned(editionId) {
  const ed = (baseData.editions || {})[editionId];
  if (!ed) return false;
  return userState.owned[editionId] !== undefined ? userState.owned[editionId] : Boolean(ed.owned);
}

function getIssueNote(issue) {
  return userState.notes[issue.id] !== undefined ? userState.notes[issue.id] : (issue.notes || '');
}

function renderLinks(linksObj) {
  if (!linksObj) return '';
  const items = [
    linksObj.dc_wiki ? `<a class="link-pill" href="${linksObj.dc_wiki}" target="_blank" rel="noopener">DC Wiki ↗</a>` : '',
    linksObj.gcd ? `<a class="link-pill" href="${linksObj.gcd}" target="_blank" rel="noopener">GCD ↗</a>` : '',
    linksObj.dcui ? `<a class="link-pill" href="${linksObj.dcui}" target="_blank" rel="noopener">DCUI ↗</a>` : '',
    linksObj.locg_url ? `<a class="link-pill" href="${linksObj.locg_url}" target="_blank" rel="noopener">LoCG ↗</a>` : ''
  ].filter(Boolean);

  return items.length ? `<div class="link-pills">${items.join('')}</div>` : '';
}

function populateDropdowns() {
  const issues = baseData.issues || [];
  const eras = [...new Set(issues.map(i => i.era))];
  const eraSelect = document.getElementById('era-filter');
  eras.forEach(era => {
    const opt = document.createElement('option');
    opt.value = era;
    opt.textContent = era;
    eraSelect.appendChild(opt);
  });

  const chars = [...new Set(issues.flatMap(i => i.characters || []))].sort();
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

  const issues = baseData.issues || [];
  const editionsMap = baseData.editions || {};
  const tbody = document.getElementById('table-body');
  tbody.innerHTML = '';

  // Global stats
  let totalRead = 0;
  issues.forEach(issue => {
    if (isIssueRead(issue)) totalRead++;
  });

  const collectableEditionIds = Object.keys(editionsMap).filter(id => !editionsMap[id].uncollected);
  const totalOwned = collectableEditionIds.filter(id => isEditionOwned(id)).length;

  // Filtered issues
  const filtered = issues.filter(issue => {
    const read = isIssueRead(issue);
    const edIds = issue.editionIds || [];
    const issueEditions = edIds.map(id => editionsMap[id]).filter(Boolean);

    const anyOwned = edIds.some(id => isEditionOwned(id));
    const isUncollectedOnly = issueEditions.length > 0 && issueEditions.every(ed => ed.uncollected);

    if (eraFilter !== 'all' && issue.era !== eraFilter) return false;
    if (charFilter !== 'all' && !(issue.characters || []).includes(charFilter)) return false;

    if (statusFilter === 'read' && !read) return false;
    if (statusFilter === 'unread' && read) return false;
    if (statusFilter === 'owned' && !anyOwned) return false;
    if (statusFilter === 'unowned' && anyOwned) return false;
    if (statusFilter === 'uncollected' && !isUncollectedOnly) return false;

    if (query) {
      const haystack = [
        issue.issue,
        issue.storyTitle,
        issue.arc,
        getIssueNote(issue),
        ...(issue.authors || []),
        ...(issue.characters || []),
        ...issueEditions.map(e => e.title)
      ].join(' ').toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  let currentEra = null;
  filtered.forEach(issue => {
    if (issue.era !== currentEra) {
      currentEra = issue.era;
      const banner = document.createElement('tr');
      banner.className = 'era-banner';
      banner.innerHTML = `<td colspan="5">${currentEra}</td>`;
      tbody.appendChild(banner);
    }

    const read = isIssueRead(issue);
    const tr = document.createElement('tr');
    if (read) tr.className = 'is-read';

    const editionsHtml = (issue.editionIds || []).map(edId => {
      const ed = editionsMap[edId];
      if (!ed) return '';
      const owned = isEditionOwned(edId);
      const badgeClass = ed.uncollected ? 'badge badge-uncollected' : 'badge';
      const edLinks = renderLinks({ locg_url: ed.locg_url, dc_wiki: ed.dc_wiki, gcd: ed.gcd });

      return `
        <div class="edition-item">
          ${ed.uncollected ? '' : `<input type="checkbox" data-ed-id="${edId}" ${owned ? 'checked' : ''} title="Mark edition as owned across all issues" />`}
          <div>
            <div>${ed.title}</div>
            <div class="edition-meta">
              ${ed.format ? `<span class="${badgeClass}">${ed.format}</span>` : ''}
            </div>
            ${edLinks}
          </div>
        </div>
      `;
    }).join('');

    tr.innerHTML = `
      <td class="col-check"><input type="checkbox" data-read-id="${issue.id}" ${read ? 'checked' : ''} /></td>
      <td class="col-issue">
        <div class="issue-header">
          <span class="order-num">#${issue.order}</span>
          <span class="issue-code">${issue.issue}</span>
        </div>
        ${issue.storyTitle ? `<div class="story-title">"${issue.storyTitle}"</div>` : ''}
        ${renderLinks(issue.links)}
        <input type="text" class="note-input" data-note-id="${issue.id}" value="${getIssueNote(issue).replace(/"/g, '&quot;')}" placeholder="Add issue note..." />
      </td>
      <td class="col-arc">${issue.arc || ''}</td>
      <td class="col-authors">${(issue.authors || []).join(', ')}</td>
      <td class="col-editions">${editionsHtml}</td>
    `;
    tbody.appendChild(tr);
  });

  // Update stats UI
  const pct = issues.length ? Math.round((totalRead / issues.length) * 100) : 0;
  document.getElementById('stat-read').textContent = `${totalRead} / ${issues.length} (${pct}%)`;
  document.getElementById('stat-owned').textContent = `${totalOwned} / ${collectableEditionIds.length}`;
  document.getElementById('stat-showing').textContent = `${filtered.length} issues`;
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
      userState.owned[edId] = e.target.checked;
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
    (merged.issues || []).forEach(issue => {
      issue.read = isIssueRead(issue);
      issue.notes = getIssueNote(issue);
    });
    Object.keys(merged.editions || {}).forEach(edId => {
      merged.editions[edId].owned = isEditionOwned(edId);
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
      (imported.issues || []).forEach(issue => {
        userState.read[issue.id] = Boolean(issue.read);
        userState.notes[issue.id] = issue.notes || '';
      });
      Object.entries(imported.editions || {}).forEach(([edId, ed]) => {
        userState.owned[edId] = Boolean(ed.owned);
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
