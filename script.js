(function () {
  'use strict';

  var STORAGE_KEY = 'roster.cards.v1';
  var THEME_KEY = 'roster.theme.v1';
  var SORT_KEY = 'roster.sort.v1';
  var ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  var cards = [];
  var editingId = null;
  var pendingPhoto = null; // data URL staged in the form
  var searchTerm = '';
  var sortMode = 'last';   // 'last' | 'first' | 'age' | 'recent'
  var deptFilter = null;   // null = all departments

  var pendingDelete = null;   // { card, index, timer } awaiting undo
  var toastTimer = null;

  var el = {
    rail: document.getElementById('rail'),
    roster: document.getElementById('roster'),
    emptyState: document.getElementById('emptyState'),
    subtitle: document.getElementById('subtitle'),
    searchInput: document.getElementById('searchInput'),
    openFormBtn: document.getElementById('openFormBtn'),
    emptyNewBtn: document.getElementById('emptyNewBtn'),
    closeFormBtn: document.getElementById('closeFormBtn'),
    cancelFormBtn: document.getElementById('cancelFormBtn'),
    drawer: document.getElementById('cardDrawer'),
    backdrop: document.getElementById('drawerBackdrop'),
    form: document.getElementById('cardForm'),
    drawerTitle: document.getElementById('drawerTitle'),
    firstName: document.getElementById('firstName'),
    lastName: document.getElementById('lastName'),
    age: document.getElementById('age'),
    contact: document.getElementById('contact'),
    department: document.getElementById('department'),
    pinned: document.getElementById('pinned'),
    formError: document.getElementById('formError'),
    themeToggle: document.getElementById('themeToggle'),
    themeToggleLabel: document.getElementById('themeToggleLabel'),
    photoInput: document.getElementById('photoInput'),
    photoDrop: document.getElementById('photoDrop'),
    photoPreview: document.getElementById('photoPreview'),
    removePhotoBtn: document.getElementById('removePhotoBtn'),
    saveBtn: document.getElementById('saveBtn'),
    sortSelect: document.getElementById('sortSelect'),
    exportBtn: document.getElementById('exportBtn'),
    statStrip: document.getElementById('statStrip'),
    deptChips: document.getElementById('deptChips'),
    toast: document.getElementById('toast'),
    toastText: document.getElementById('toastText'),
    toastUndo: document.getElementById('toastUndo')
  };

  function uid() {
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ---------- Theme ----------

  function loadTheme() {
    var theme = 'dark';
    try {
      var saved = localStorage.getItem(THEME_KEY);
      if (saved === 'dark' || saved === 'light') theme = saved;
    } catch (e) {}
    applyTheme(theme);
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    el.themeToggleLabel.textContent = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
  }

  function toggleTheme() {
    var current = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  }

  // ---------- Sort preference ----------

  function loadSort() {
    try {
      var saved = localStorage.getItem(SORT_KEY);
      if (saved) sortMode = saved;
    } catch (e) {}
    el.sortSelect.value = sortMode;
  }

  function saveSort() {
    try { localStorage.setItem(SORT_KEY, sortMode); } catch (e) {}
  }

  // ---------- Storage ----------

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      cards = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(cards)) cards = [];
    } catch (e) {
      cards = [];
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
    } catch (e) {
      /* storage unavailable — app still works for this session */
    }
  }

  function initials(first, last) {
    var a = (first || '').trim().charAt(0);
    var b = (last || '').trim().charAt(0);
    return (a + b).toUpperCase() || '?';
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  // ---------- Alphabet rail ----------

  function buildRail() {
    el.rail.innerHTML = '';
    ALPHABET.forEach(function (letter) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = letter;
      btn.setAttribute('data-letter', letter);
      btn.addEventListener('click', function () {
        var target = document.getElementById('group-' + letter);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      el.rail.appendChild(btn);
    });
  }

  function updateRailState(activeLetters) {
    Array.prototype.forEach.call(el.rail.querySelectorAll('button'), function (btn) {
      var letter = btn.getAttribute('data-letter');
      btn.classList.toggle('has-entries', activeLetters.indexOf(letter) !== -1);
    });
  }

  function groupLetter(card) {
    var l = (card.lastName || card.firstName || '#').trim().charAt(0).toUpperCase();
    return ALPHABET.indexOf(l) !== -1 ? l : '#';
  }

  // ---------- Filtering / sorting ----------

  function visibleCards() {
    return cards.filter(function (c) { return !c.pendingDelete; });
  }

  function matchesSearch(card) {
    if (!searchTerm) return true;
    var hay = (card.firstName + ' ' + card.lastName + ' ' + card.contact + ' ' + (card.department || '')).toLowerCase();
    return hay.indexOf(searchTerm) !== -1;
  }

  function matchesDept(card) {
    if (!deptFilter) return true;
    return (card.department || 'Unassigned') === deptFilter;
  }

  function sortCards(list) {
    var sorted = list.slice();
    sorted.sort(function (a, b) {
      if (sortMode === 'first') {
        var fa = (a.firstName + a.lastName).toLowerCase();
        var fb = (b.firstName + b.lastName).toLowerCase();
        return fa < fb ? -1 : fa > fb ? 1 : 0;
      }
      if (sortMode === 'age') {
        return (a.age || 0) - (b.age || 0);
      }
      if (sortMode === 'recent') {
        return (b.createdAt || 0) - (a.createdAt || 0);
      }
      var ka = (a.lastName + a.firstName).toLowerCase();
      var kb = (b.lastName + b.firstName).toLowerCase();
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    return sorted;
  }

  // ---------- Stats + department chips ----------

  function renderStats(all) {
    var departments = {};
    all.forEach(function (c) {
      var d = c.department || 'Unassigned';
      departments[d] = (departments[d] || 0) + 1;
    });
    var deptCount = Object.keys(departments).length;
    var pinnedCount = all.filter(function (c) { return c.pinned; }).length;

    el.statStrip.innerHTML =
      '<div class="stat-chip"><span class="num">' + all.length + '</span><span class="lbl">cards</span></div>' +
      '<div class="stat-chip"><span class="num">' + deptCount + '</span><span class="lbl">departments</span></div>' +
      '<div class="stat-chip"><span class="num">' + pinnedCount + '</span><span class="lbl">pinned</span></div>';

    return departments;
  }

  function renderDeptChips(departments) {
    var names = Object.keys(departments).sort();
    if (names.length === 0) {
      el.deptChips.innerHTML = '';
      return;
    }
    var html = '<button type="button" class="dept-chip' + (deptFilter === null ? ' active' : '') + '" data-dept="">All</button>';
    names.forEach(function (name) {
      html += '<button type="button" class="dept-chip' + (deptFilter === name ? ' active' : '') + '" data-dept="' +
        escapeHtml(name) + '">' + escapeHtml(name) + ' (' + departments[name] + ')</button>';
    });
    el.deptChips.innerHTML = html;
  }

  // ---------- Render ----------

  function render() {
    var all = visibleCards();
    var departments = renderStats(all);
    renderDeptChips(departments);

    var filtered = all.filter(matchesSearch).filter(matchesDept);

    el.subtitle.textContent = all.length === 0
      ? 'no cards filed yet'
      : all.length + (all.length === 1 ? ' card filed' : ' cards filed') +
        ((searchTerm || deptFilter) ? ' · ' + filtered.length + ' shown' : '');

    el.roster.innerHTML = '';

    if (all.length === 0) {
      el.emptyState.classList.add('show');
      el.emptyState.querySelector('h2').textContent = 'The roster is empty';
      el.emptyState.querySelector('p').textContent = 'File your first card to begin building the directory.';
      updateRailState([]);
      return;
    }

    if (filtered.length === 0) {
      el.emptyState.classList.add('show');
      el.emptyState.querySelector('h2').textContent = 'No matches';
      el.emptyState.querySelector('p').textContent = 'Nothing matches the current search or department filter.';
      updateRailState([]);
      return;
    }

    el.emptyState.classList.remove('show');

    var pinned = filtered.filter(function (c) { return c.pinned; });
    var rest = filtered.filter(function (c) { return !c.pinned; });

    if (pinned.length > 0) {
      var pinnedSection = document.createElement('div');
      pinnedSection.className = 'letter-group';
      var pinnedHeading = document.createElement('div');
      pinnedHeading.className = 'letter-heading pinned-heading';
      pinnedHeading.innerHTML = '<span class="big">★ Pinned</span><span class="rule"></span>';
      pinnedSection.appendChild(pinnedHeading);
      sortCards(pinned).forEach(function (card) {
        pinnedSection.appendChild(renderRow(card));
      });
      el.roster.appendChild(pinnedSection);
    }

    var sorted = sortCards(rest);
    var groups = {};
    var order = [];
    sorted.forEach(function (card) {
      var g = groupLetter(card);
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(card);
    });

    order.forEach(function (letter) {
      var section = document.createElement('div');
      section.className = 'letter-group';
      section.id = 'group-' + letter;

      var heading = document.createElement('div');
      heading.className = 'letter-heading';
      heading.innerHTML = '<span class="big">' + letter + '</span><span class="rule"></span>';
      section.appendChild(heading);

      groups[letter].forEach(function (card) {
        section.appendChild(renderRow(card));
      });

      el.roster.appendChild(section);
    });

    updateRailState(order.filter(function (l) { return l !== '#'; }));
  }

  function renderRow(card) {
    var row = document.createElement('div');
    row.className = 'card-row' + (card.pinned ? ' is-pinned' : '');
    row.setAttribute('data-id', card.id);

    var avatarInner = card.photo
      ? '<img src="' + card.photo + '" alt="">'
      : escapeHtml(initials(card.firstName, card.lastName));

    row.innerHTML =
      '<div class="avatar">' + avatarInner + '</div>' +
      '<div class="card-info">' +
        '<div class="card-name"><span class="surname">' + escapeHtml(card.lastName) + '</span>, ' + escapeHtml(card.firstName) + '</div>' +
        '<div class="card-meta">' +
          '<span>age ' + escapeHtml(card.age) + '</span>' +
          '<span>·</span>' +
          '<span>' + escapeHtml(card.contact) + '</span>' +
          (card.department ? '<span>·</span><span class="department">' + escapeHtml(card.department) + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="card-actions">' +
        '<button class="icon-btn pin-btn' + (card.pinned ? ' pinned' : '') + '" data-action="pin" aria-label="' + (card.pinned ? 'Unpin card' : 'Pin card') + '">' +
          '<svg width="15" height="15" viewBox="0 0 16 16" fill="' + (card.pinned ? 'currentColor' : 'none') + '"><path d="M8 1.5l1.6 3.6 3.9.4-2.9 2.7.8 3.9L8 10.3l-3.4 1.8.8-3.9-2.9-2.7 3.9-.4L8 1.5z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>' +
        '</button>' +
        '<button class="icon-btn" data-action="edit" aria-label="Edit card">' +
          '<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M11.3 2.3a1.5 1.5 0 012.1 2.1L5.5 12.3l-2.8.7.7-2.8 7.9-7.9z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>' +
        '</button>' +
        '<button class="icon-btn danger" data-action="delete" aria-label="Delete card">' +
          '<svg width="15" height="15" viewBox="0 0 14 14" fill="none"><path d="M2 3.5H12M5.5 3.5V2.2C5.5 1.9 5.7 1.7 6 1.7H8C8.3 1.7 8.5 1.9 8.5 2.2V3.5M6 6.5V10M8 6.5V10M3.2 3.5L3.7 11.3C3.72 11.68 4.03 12 4.4 12H9.6C9.97 12 10.28 11.68 10.3 11.3L10.8 3.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>' +
        '</button>' +
      '</div>';

    return row;
  }

  // ---------- Toast / undo delete ----------

  function showToast(text, onUndo) {
    el.toastText.textContent = text;
    el.toast.classList.add('show');
    el.toastUndo.onclick = function () {
      if (onUndo) onUndo();
      hideToast();
    };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 5000);
  }

  function hideToast() {
    el.toast.classList.remove('show');
    clearTimeout(toastTimer);
  }

  function deleteCard(id) {
    var card = cards.find(function (c) { return c.id === id; });
    if (!card) return;
    card.pendingDelete = true;
    save();
    render();

    var label = (card.firstName + ' ' + card.lastName).trim() || 'Card';
    showToast(label + ' removed.', function () {
      card.pendingDelete = false;
      save();
      render();
    });

    setTimeout(function () {
      if (card.pendingDelete) {
        cards = cards.filter(function (c) { return c.id !== id; });
        save();
      }
    }, 5100);
  }

  // ---------- CSV export ----------

  function exportCsv() {
    var rows = [['First name', 'Last name', 'Age', 'Contact number', 'Department', 'Pinned']];
    visibleCards().forEach(function (c) {
      rows.push([c.firstName, c.lastName, c.age, c.contact, c.department || '', c.pinned ? 'yes' : 'no']);
    });
    var csv = rows.map(function (row) {
      return row.map(function (val) {
        var s = String(val == null ? '' : val).replace(/"/g, '""');
        return /[",\n]/.test(s) ? '"' + s + '"' : s;
      }).join(',');
    }).join('\n');

    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'the-roster.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // ---------- Drawer / form ----------

  function openDrawer(card) {
    editingId = card ? card.id : null;
    pendingPhoto = card ? card.photo || null : null;

    el.drawerTitle.textContent = card ? 'Edit card' : 'New card';
    el.firstName.value = card ? card.firstName : '';
    el.lastName.value = card ? card.lastName : '';
    el.age.value = card ? card.age : '';
    el.contact.value = card ? card.contact : '';
    el.department.value = card ? (card.department || '') : '';
    el.pinned.checked = card ? !!card.pinned : false;
    el.formError.textContent = '';

    updatePhotoPreview();

    el.drawer.classList.add('open');
    el.drawer.setAttribute('aria-hidden', 'false');
    el.backdrop.hidden = false;
    setTimeout(function () { el.firstName.focus(); }, 50);
  }

  function closeDrawer() {
    el.drawer.classList.remove('open');
    el.drawer.setAttribute('aria-hidden', 'true');
    el.backdrop.hidden = true;
    editingId = null;
    pendingPhoto = null;
    el.form.reset();
  }

  function updatePhotoPreview() {
    if (pendingPhoto) {
      el.photoPreview.src = pendingPhoto;
      el.photoDrop.classList.add('has-photo');
      el.removePhotoBtn.hidden = false;
    } else {
      el.photoPreview.src = '';
      el.photoDrop.classList.remove('has-photo');
      el.removePhotoBtn.hidden = true;
    }
  }

  el.photoDrop.addEventListener('click', function () { el.photoInput.click(); });
  el.photoDrop.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.photoInput.click(); }
  });

  el.photoInput.addEventListener('change', function () {
    var file = el.photoInput.files && el.photoInput.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      pendingPhoto = e.target.result;
      updatePhotoPreview();
    };
    reader.readAsDataURL(file);
  });

  el.removePhotoBtn.addEventListener('click', function () {
    pendingPhoto = null;
    el.photoInput.value = '';
    updatePhotoPreview();
  });

  el.openFormBtn.addEventListener('click', function () { openDrawer(null); });
  el.emptyNewBtn.addEventListener('click', function () { openDrawer(null); });
  el.closeFormBtn.addEventListener('click', closeDrawer);
  el.cancelFormBtn.addEventListener('click', closeDrawer);
  el.backdrop.addEventListener('click', closeDrawer);

  document.addEventListener('keydown', function (e) {
    var typingInField = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);

    if (e.key === 'Escape' && el.drawer.classList.contains('open')) {
      closeDrawer();
      return;
    }
    if (el.drawer.classList.contains('open')) return;

    if (e.key === '/' && !typingInField) {
      e.preventDefault();
      el.searchInput.focus();
    } else if ((e.key === 'n' || e.key === 'N') && !typingInField) {
      e.preventDefault();
      openDrawer(null);
    }
  });

  el.form.addEventListener('submit', function (e) {
    e.preventDefault();

    var firstName = el.firstName.value.trim();
    var lastName = el.lastName.value.trim();
    var age = el.age.value.trim();
    var contact = el.contact.value.trim();
    var department = el.department.value.trim();
    var pinned = el.pinned.checked;

    if (!firstName || !lastName || !age || !contact) {
      el.formError.textContent = 'Please fill in every field before saving.';
      return;
    }
    var ageNum = Number(age);
    if (isNaN(ageNum) || ageNum < 0 || ageNum > 130) {
      el.formError.textContent = 'Enter a valid age.';
      return;
    }

    if (editingId) {
      var existing = cards.find(function (c) { return c.id === editingId; });
      if (existing) {
        existing.firstName = firstName;
        existing.lastName = lastName;
        existing.age = ageNum;
        existing.contact = contact;
        existing.department = department;
        existing.photo = pendingPhoto;
        existing.pinned = pinned;
      }
    } else {
      cards.push({
        id: uid(),
        firstName: firstName,
        lastName: lastName,
        age: ageNum,
        contact: contact,
        department: department,
        photo: pendingPhoto,
        pinned: pinned,
        createdAt: Date.now()
      });
    }

    save();
    closeDrawer();
    render();
  });

  el.roster.addEventListener('click', function (e) {
    var row = e.target.closest('.card-row');
    if (!row) return;
    var id = row.getAttribute('data-id');
    var card = cards.find(function (c) { return c.id === id; });
    if (!card) return;

    if (e.target.closest('[data-action="edit"]')) {
      openDrawer(card);
    } else if (e.target.closest('[data-action="delete"]')) {
      deleteCard(id);
    } else if (e.target.closest('[data-action="pin"]')) {
      card.pinned = !card.pinned;
      save();
      render();
    }
  });

  el.deptChips.addEventListener('click', function (e) {
    var chip = e.target.closest('.dept-chip');
    if (!chip) return;
    var dept = chip.getAttribute('data-dept');
    deptFilter = dept ? dept : null;
    render();
  });

  el.sortSelect.addEventListener('change', function () {
    sortMode = el.sortSelect.value;
    saveSort();
    render();
  });

  el.exportBtn.addEventListener('click', exportCsv);

  el.searchInput.addEventListener('input', function () {
    searchTerm = el.searchInput.value.trim().toLowerCase();
    render();
  });

  el.themeToggle.addEventListener('click', toggleTheme);

  loadTheme();
  loadSort();
  buildRail();
  load();
  render();
})();
