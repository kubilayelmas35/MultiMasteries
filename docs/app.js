/* Ders programı — haftalık grid, müfredat, öğrenci tamamlama + karakter */
(function () {
  const cfg = window.SUPABASE_CONFIG || {};
  const SUPABASE_URL = cfg.url || 'https://greqjbcfphmvjpfumkcy.supabase.co';
  const SUPABASE_ANON_KEY = cfg.anonKey || '';
  const API_URL = SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/ders-api';
  const LS_STU = 'dp_student_token';
  const LS_STF = 'dp_staff_token';
  const LS_THEME = 'dp_theme';

  const DAYS = [
    { dow: 1, label: 'Pazartesi' },
    { dow: 2, label: 'Salı' },
    { dow: 3, label: 'Çarşamba' },
    { dow: 4, label: 'Perşembe' },
    { dow: 5, label: 'Cuma' },
    { dow: 6, label: 'Cumartesi' },
    { dow: 7, label: 'Pazar' },
  ];
  const ACTIVITIES = [
    { v: 'normal', l: 'Çalışma' },
    { v: 'test', l: 'Test' },
    { v: 'tekrar', l: 'Tekrar' },
    { v: 'yeni', l: 'Yeni konu' },
    { v: 'dinlenme', l: 'Dinlenme' },
    { v: 'serbest', l: 'Serbest' },
  ];
  const MOODS = [
    { v: 'iyi', l: 'İyi' },
    { v: 'orta', l: 'Orta' },
    { v: 'kotu', l: 'Kötü' },
  ];

  let STF_CELLS = {};
  let DAY_SLOTS = { 1: [1], 2: [1], 3: [1], 4: [1], 5: [1], 6: [1], 7: [1] };
  let SUBJECTS_CACHE = {};
  let TOPIC_CACHE = {};
  let STU_WEEK_ITEMS = [];
  let MODAL_ITEM = null;

  function cellKey(dow, slot) { return dow + '-' + slot; }
  function emptyCell() {
    return {
      subjectId: '',
      durationMinutes: 45,
      topicSnapshot: '',
      topicIdsSnapshot: '',
      teacherNote: '',
      importance: 'normal',
      hasTest: false,
      curriculumGrade: 11,
      curriculumTrack: 'sayisal',
    };
  }
  function getCell(dow, slot) {
    const k = cellKey(dow, slot);
    if (!STF_CELLS[k]) STF_CELLS[k] = emptyCell();
    return STF_CELLS[k];
  }
  function nextSlotId(dow) {
    const arr = DAY_SLOTS[dow] || [1];
    return Math.max(0, ...arr) + 1;
  }
  function subjectColor(id, alpha) {
    const list = Object.values(SUBJECTS_CACHE).flat();
    const s = list.find((x) => x._id === id);
    const hex = (s && s.color) || '#64748b';
    if (!alpha) return hex;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  async function post(name, body) {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(Object.assign({ action: name }, body || {})),
    });
    let data = {};
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    return data;
  }

  function mondayISOFromAnyDate(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
    const js = x.getDay();
    const dow = js === 0 ? 7 : js;
    x.setDate(x.getDate() - (dow - 1));
    return x.toISOString();
  }
  function schoolDow(d) {
    const js = d.getDay();
    return js === 0 ? 7 : js;
  }
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function formatDuration(m) {
    const n = Number(m) || 0;
    if (n >= 60 && n % 60 === 0) return (n / 60) + ' Saat';
    return n + ' Dakika';
  }
  function activityLabel(v) {
    const a = ACTIVITIES.find((x) => x.v === v);
    return a ? a.l : v;
  }
  function trackOptionsHtml(grade, selected) {
    const tracks = grade <= 10
      ? [{ v: 'lgs', l: 'LGS' }]
      : [
        { v: 'sayisal', l: 'Sayısal' },
        { v: 'sozel', l: 'Sözel' },
        { v: 'esit', l: 'Eşit ağırlık' },
        { v: 'dil', l: 'Dil' },
        { v: 'tyt', l: 'TYT' },
      ];
    return tracks.map((t) =>
      '<option value="' + t.v + '"' + (selected === t.v ? ' selected' : '') + '>' + t.l + '</option>'
    ).join('');
  }

  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem(LS_THEME, t);
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = t === 'light' ? '☀️' : '🌙';
  }

  function cellsToItems() {
    const items = [];
    for (const day of DAYS) {
      const slots = DAY_SLOTS[day.dow] || [];
      slots.forEach((slot, idx) => {
        const c = getCell(day.dow, slot);
        if (!c.subjectId && !c.topicSnapshot && c.importance === 'normal') return;
        items.push({
          dayOfWeek: day.dow,
          slotOrder: idx + 1,
          durationMinutes: Number(c.durationMinutes) || 45,
          subjectId: c.subjectId,
          topicSnapshot: c.topicSnapshot || '',
          topicIdsSnapshot: c.topicIdsSnapshot || '',
          teacherNote: c.teacherNote || '',
          importance: c.importance || 'normal',
          hasTest: c.importance === 'test' || !!c.hasTest,
        });
      });
    }
    return items;
  }

  function itemsToCells(items) {
    STF_CELLS = {};
    DAY_SLOTS = { 1: [1], 2: [1], 3: [1], 4: [1], 5: [1], 6: [1], 7: [1] };
    const byDay = {};
    (items || []).forEach((it) => {
      const dow = Number(it.dayOfWeek) || 1;
      if (!byDay[dow]) byDay[dow] = [];
      byDay[dow].push(it);
    });
    for (const dow of Object.keys(byDay)) {
      byDay[dow].sort((a, b) => Number(a.slotOrder) - Number(b.slotOrder));
      DAY_SLOTS[dow] = [];
      byDay[dow].forEach((it, idx) => {
        const slot = idx + 1;
        DAY_SLOTS[dow].push(slot);
        STF_CELLS[cellKey(dow, slot)] = {
          subjectId: (it.subject && it.subject._id) || it.subjectId || '',
          durationMinutes: it.durationMinutes || 45,
          topicSnapshot: it.topicSnapshot || '',
          topicIdsSnapshot: it.topicIdsSnapshot || '',
          teacherNote: it.teacherNote || '',
          importance: it.importance || (it.hasTest ? 'test' : 'normal'),
          hasTest: !!it.hasTest,
          curriculumGrade: 11,
          curriculumTrack: 'sayisal',
        };
      });
    }
  }

  async function loadSubjectsForCell(grade, track) {
    const key = grade + '-' + track;
    if (SUBJECTS_CACHE[key]) return SUBJECTS_CACHE[key];
    const list = await post('staffcurriculumsubjects', {
      staffToken: stfToken(),
      grade,
      track: grade <= 10 ? 'lgs' : track,
    });
    SUBJECTS_CACHE[key] = list;
    return list;
  }

  async function loadTopics(grade, track, subjectId, studentId) {
    const key = grade + '-' + track + '-' + subjectId;
    if (TOPIC_CACHE[key]) return TOPIC_CACHE[key];
    const list = await post('stafftopics', {
      staffToken: stfToken(),
      studentId,
      subjectId,
      grade,
      track: grade <= 10 ? 'lgs' : track,
    });
    TOPIC_CACHE[key] = list;
    return list;
  }

  function renderCellEditor(dow, slot, cell) {
    const g = cell.curriculumGrade || 11;
    const tr = cell.curriculumTrack || (g <= 10 ? 'lgs' : 'sayisal');
    const showTrack = g >= 11;
    const subKey = g + '-' + (g <= 10 ? 'lgs' : tr);
    const subs = SUBJECTS_CACHE[subKey] || [];
    let subOpts = '<option value="">— Ders —</option>';
    subs.forEach((s) => {
      subOpts += '<option value="' + s._id + '"' + (cell.subjectId === s._id ? ' selected' : '') + '>' + escapeHtml(s.title) + '</option>';
    });
    const actOpts = ACTIVITIES.map((a) =>
      '<option value="' + a.v + '"' + (cell.importance === a.v ? ' selected' : '') + '>' + a.l + '</option>'
    ).join('');
    return (
      '<div class="week-cell" data-dow="' + dow + '" data-slot="' + slot + '">' +
      '<button type="button" class="ghost wc-rm" style="width:auto;padding:2px 6px;font-size:0.7rem" title="Bu satırı sil">✕</button>' +
      '<label>Sınıf (müfredat)</label><select class="wc-grade" data-dow="' + dow + '" data-slot="' + slot + '">' +
      [9, 10, 11, 12].map((x) => '<option value="' + x + '"' + (g === x ? ' selected' : '') + '>' + x + '. sınıf</option>').join('') +
      '</select>' +
      (showTrack
        ? '<label>Bölüm</label><select class="wc-track" data-dow="' + dow + '" data-slot="' + slot + '">' + trackOptionsHtml(g, tr) + '</select>'
        : '') +
      '<label>Ders</label><select class="wc-sub" data-dow="' + dow + '" data-slot="' + slot + '">' + subOpts + '</select>' +
      '<label>Süre (dk)</label><input type="number" class="wc-min" min="5" max="240" value="' + (cell.durationMinutes || 45) + '" data-dow="' + dow + '" data-slot="' + slot + '"/>' +
      '<label>Tür</label><select class="wc-act" data-dow="' + dow + '" data-slot="' + slot + '">' + actOpts + '</select>' +
      '<div class="topic-box" style="display:' + (cell.subjectId ? 'block' : 'none') + '">' +
      '<label>Konu (elle)</label><input class="wc-topic-manual" value="' + escapeHtml(cell.topicSnapshot || '') + '" data-dow="' + dow + '" data-slot="' + slot + '"/>' +
      '<label>Müfredattan</label><select class="wc-topic-cur" data-dow="' + dow + '" data-slot="' + slot + '"><option value="">Konu seç…</option></select>' +
      '<label>Not</label><input class="wc-note" value="' + escapeHtml(cell.teacherNote || '') + '" data-dow="' + dow + '" data-slot="' + slot + '"/>' +
      '</div></div>'
    );
  }

  function bindCellEvents(root) {
    root.querySelectorAll('.wc-rm').forEach((btn) => {
      btn.onclick = () => {
        const cell = btn.closest('.week-cell');
        const dow = +cell.dataset.dow;
        const slot = +cell.dataset.slot;
        DAY_SLOTS[dow] = (DAY_SLOTS[dow] || []).filter((s) => s !== slot);
        delete STF_CELLS[cellKey(dow, slot)];
        stfRenderWeekGrid();
      };
    });
    root.querySelectorAll('.wc-grade, .wc-track').forEach((el) => {
      el.onchange = async () => {
        const dow = +el.dataset.dow, slot = +el.dataset.slot;
        const c = getCell(dow, slot);
        c.curriculumGrade = +root.querySelector('.wc-grade[data-dow="' + dow + '"][data-slot="' + slot + '"]').value;
        const trackEl = root.querySelector('.wc-track[data-dow="' + dow + '"][data-slot="' + slot + '"]');
        c.curriculumTrack = trackEl ? trackEl.value : 'lgs';
        c.subjectId = '';
        c.topicIdsSnapshot = '';
        await loadSubjectsForCell(c.curriculumGrade, c.curriculumTrack);
        stfRenderWeekGrid();
      };
    });
    root.querySelectorAll('.wc-sub').forEach((el) => {
      el.onchange = async () => {
        const dow = +el.dataset.dow, slot = +el.dataset.slot;
        const c = getCell(dow, slot);
        c.subjectId = el.value;
        c.topicIdsSnapshot = '';
        const box = el.closest('.week-cell').querySelector('.topic-box');
        box.style.display = c.subjectId ? 'block' : 'none';
        if (c.subjectId) {
          const topics = await loadTopics(c.curriculumGrade, c.curriculumTrack, c.subjectId, document.getElementById('stf-student').value);
          const sel = el.closest('.week-cell').querySelector('.wc-topic-cur');
          let h = '<option value="">Konu seç…</option>';
          topics.forEach((t) => { h += '<option value="' + t._id + '">' + escapeHtml(t.title) + '</option>'; });
          sel.innerHTML = h;
        }
      };
    });
    root.querySelectorAll('.wc-min').forEach((el) => {
      el.oninput = () => { getCell(+el.dataset.dow, +el.dataset.slot).durationMinutes = +el.value || 45; };
    });
    root.querySelectorAll('.wc-act').forEach((el) => {
      el.onchange = () => {
        const c = getCell(+el.dataset.dow, +el.dataset.slot);
        c.importance = el.value;
        c.hasTest = el.value === 'test';
      };
    });
    root.querySelectorAll('.wc-topic-manual').forEach((el) => {
      el.oninput = () => { getCell(+el.dataset.dow, +el.dataset.slot).topicSnapshot = el.value; };
    });
    root.querySelectorAll('.wc-note').forEach((el) => {
      el.oninput = () => { getCell(+el.dataset.dow, +el.dataset.slot).teacherNote = el.value; };
    });
    root.querySelectorAll('.wc-topic-cur').forEach((el) => {
      el.onchange = () => {
        const c = getCell(+el.dataset.dow, +el.dataset.slot);
        const opt = el.options[el.selectedIndex];
        if (!el.value) return;
        c.topicIdsSnapshot = el.value;
        c.topicSnapshot = opt.textContent || '';
        const man = el.closest('.week-cell').querySelector('.wc-topic-manual');
        if (man) man.value = c.topicSnapshot;
      };
    });
  }

  async function stfRenderWeekGrid() {
    const table = document.getElementById('stf-week-table');
    const todayDow = schoolDow(new Date());
    const sid = document.getElementById('stf-student').value;
    let html = '<thead><tr>';
    DAYS.forEach((d) => {
      html += '<th class="' + (d.dow === todayDow ? 'today' : '') + '">' + d.label + '</th>';
    });
    html += '</tr></thead><tbody><tr>';
    for (const day of DAYS) {
      const dow = day.dow;
      const slots = DAY_SLOTS[dow] || [1];
      html += '<td class="day-col" data-dow="' + dow + '"><div class="day-col-inner">';
      html += '<button type="button" class="ghost day-add" data-dow="' + dow + '" style="width:100%;margin-bottom:6px;font-size:0.75rem">+ Satır ekle</button>';
      for (const slot of slots) {
        const c = getCell(dow, slot);
        if (c.subjectId || c.topicSnapshot) {
          await loadSubjectsForCell(c.curriculumGrade, c.curriculumTrack);
        }
        const bg = c.subjectId ? subjectColor(c.subjectId, 0.35) : 'var(--cell-empty)';
        html += '<div class="day-cell-wrap" style="background:' + bg + ';margin-bottom:8px;padding:6px;border-radius:8px">';
        html += renderCellEditor(dow, slot, c);
        html += '</div>';
      }
      html += '</div></td>';
    }
    html += '</tr></tbody>';
    table.innerHTML = html;
    table.querySelectorAll('.day-add').forEach((btn) => {
      btn.onclick = () => {
        const dow = +btn.dataset.dow;
        const id = nextSlotId(dow);
        if (!DAY_SLOTS[dow]) DAY_SLOTS[dow] = [];
        DAY_SLOTS[dow].push(id);
        if (!STF_CELLS[cellKey(dow, id)]) STF_CELLS[cellKey(dow, id)] = emptyCell();
        stfRenderWeekGrid();
      };
    });
    bindCellEvents(table);
    for (const day of DAYS) {
      for (const slot of DAY_SLOTS[day.dow] || []) {
        const c = getCell(day.dow, slot);
        if (!c.subjectId) continue;
        const topics = await loadTopics(c.curriculumGrade, c.curriculumTrack, c.subjectId, sid);
        const sel = table.querySelector('.wc-topic-cur[data-dow="' + day.dow + '"][data-slot="' + slot + '"]');
        if (!sel) continue;
        let h = '<option value="">Konu seç…</option>';
        topics.forEach((t) => {
          h += '<option value="' + t._id + '"' + (c.topicIdsSnapshot === t._id ? ' selected' : '') + '>' + escapeHtml(t.title) + '</option>';
        });
        sel.innerHTML = h;
      }
    }
  }

  function stfToken() { return localStorage.getItem(LS_STF) || ''; }
  function stfSetToken(t) { if (t) localStorage.setItem(LS_STF, t); else localStorage.removeItem(LS_STF); }

  async function stfLoadStudents() {
    const list = await post('staffstudents', { staffToken: stfToken() });
    const sel = document.getElementById('stf-student');
    sel.innerHTML = '';
    list.forEach((s) => {
      const o = document.createElement('option');
      o.value = s.studentId;
      o.textContent = s.label || s.studentId;
      sel.appendChild(o);
    });
    sel.onchange = () => { SUBJECTS_CACHE = {}; TOPIC_CACHE = {}; };
  }

  async function stfLoadPlan() {
    const sid = document.getElementById('stf-student').value;
    const w = document.getElementById('stf-week').value;
    if (!sid || !w) throw new Error('Öğrenci ve hafta seçin');
    SUBJECTS_CACHE = {};
    TOPIC_CACHE = {};
    const mon = mondayISOFromAnyDate(new Date(w + 'T12:00:00'));
    const data = await post('staffweeklyget', { staffToken: stfToken(), studentId: sid, weekStartIso: mon });
    document.getElementById('stf-title').value = (data.plan && data.plan.title) || 'Haftalık plan';
    itemsToCells(data.items || []);
    await stfRenderWeekGrid();
  }

  async function stfSave(status) {
    const sid = document.getElementById('stf-student').value;
    const w = document.getElementById('stf-week').value;
    const mon = mondayISOFromAnyDate(new Date(w + 'T12:00:00'));
    await post('staffweeklysave', {
      staffToken: stfToken(),
      studentId: sid,
      weekStartIso: mon,
      title: document.getElementById('stf-title').value || 'Haftalık plan',
      status,
      items: cellsToItems(),
    });
    await stfLoadPlan();
  }

  function stfInit() {
    document.getElementById('stf-week').valueAsDate = new Date();
    const addGlobal = document.getElementById('stf-add-slot');
    if (addGlobal) addGlobal.style.display = 'none';
    document.getElementById('stf-login-btn').onclick = async () => {
      document.getElementById('stf-login-err').textContent = '';
      try {
        const r = await post('stafflogin', {
          loginCode: document.getElementById('stf-code').value,
          pin: document.getElementById('stf-pin').value,
        });
        stfSetToken(r.sessionToken);
        document.getElementById('stf-welcome').textContent = 'Hoş geldiniz, ' + (r.displayName || '');
        document.getElementById('stf-main').style.display = 'block';
        await stfLoadStudents();
        await stfRenderWeekGrid();
      } catch (e) {
        document.getElementById('stf-login-err').textContent = e.message;
      }
    };
    document.getElementById('stf-logout-btn').onclick = async () => {
      try { await post('stafflogout', { staffToken: stfToken() }); } catch (e) {}
      stfSetToken('');
      document.getElementById('stf-main').style.display = 'none';
    };
    document.getElementById('stf-load').onclick = async () => {
      try { await stfLoadPlan(); } catch (e) { document.getElementById('stf-err').textContent = e.message; }
    };
    document.getElementById('stf-save-draft').onclick = async () => {
      try { await stfSave('draft'); document.getElementById('stf-err').textContent = 'Taslak kaydedildi.'; }
      catch (e) { document.getElementById('stf-err').textContent = e.message; }
    };
    document.getElementById('stf-publish').onclick = async () => {
      try { await stfSave('published'); document.getElementById('stf-err').textContent = 'Plan yayınlandı.'; }
      catch (e) { document.getElementById('stf-err').textContent = e.message; }
    };
    if (stfToken()) {
      document.getElementById('stf-main').style.display = 'block';
      stfLoadStudents().then(() => stfRenderWeekGrid()).catch(() => {});
    }
  }

  /* ---- Öğrenci ---- */
  function stuToken() { return localStorage.getItem(LS_STU) || ''; }
  function stuSetToken(t) { if (t) localStorage.setItem(LS_STU, t); else localStorage.removeItem(LS_STU); }

  function renderProgress(prog) {
    const el = document.getElementById('stu-progress');
    if (!el || !prog) return;
    const ch = prog.character || {};
    const pct = prog.progressPercent != null ? prog.progressPercent : 0;
    el.innerHTML =
      '<div class="char-row">' +
      '<span class="char-emoji">' + (ch.emoji || '👶') + '</span>' +
      '<div><strong>' + escapeHtml(ch.name || 'Bebek') + '</strong><br/><span class="muted">XP: ' + (prog.xp || 0) + '</span></div>' +
      '</div>' +
      '<div class="xp-bar"><div class="xp-fill" style="width:' + pct + '%"></div></div>';
  }

  function renderStuWeek(data) {
    STU_WEEK_ITEMS = data.items || [];
    const root = document.getElementById('stu-week-grid');
    const todayDow = data.dow || schoolDow(new Date());
    if (progFromWeek(data)) renderProgress(progFromWeek(data));
    let html = '<table class="week-grid week-stu"><thead><tr>';
    DAYS.forEach((d) => {
      html += '<th class="' + (d.dow === todayDow ? 'today' : '') + '">' + d.label + '</th>';
    });
    html += '</tr></thead><tbody><tr>';
    for (const day of DAYS) {
      const dayItems = STU_WEEK_ITEMS.filter((x) => x.dayOfWeek === day.dow)
        .sort((a, b) => Number(a.slotOrder) - Number(b.slotOrder));
      const isToday = day.dow === todayDow;
      html += '<td class="day-col" style="vertical-align:top"><div class="day-col-inner">';
      if (!dayItems.length) html += '<div class="stu-cell empty">—</div>';
      dayItems.forEach((it) => {
        if (!it.subject) return;
        const col = (it.subject && it.subject.color) || '#64748b';
        const done = it.log && it.log.kanbanStatus === 'done';
        html += '<button type="button" class="stu-cell-btn' + (isToday ? ' today-ring' : '') + (done ? ' done' : '') + '" data-id="' + it._id + '" style="background:' + col + '33;border-left:4px solid ' + col + ';width:100%;margin-bottom:6px;text-align:left;cursor:pointer">';
        html += '<div class="t">' + escapeHtml(it.subject.title) + '</div>';
        if (it.topicSnapshot) html += '<div class="k">' + escapeHtml(it.topicSnapshot) + '</div>';
        html += '<div class="d">' + formatDuration(it.durationMinutes) + (done ? ' · ✓' : '') + '</div>';
        html += '</button>';
      });
      html += '</div></td>';
    }
    html += '</tr></tbody></table>';
    if (!STU_WEEK_ITEMS.length) {
      root.innerHTML = '<p class="muted">Bu hafta için yayınlanmış plan yok.</p>';
    } else {
      root.innerHTML = html;
      root.querySelectorAll('.stu-cell-btn').forEach((btn) => {
        btn.onclick = () => openStuModal(btn.getAttribute('data-id'));
      });
    }
  }

  function progFromWeek(data) {
    if (!data.progress) return null;
    const xp = data.progress.xp || 0;
    const stages = [50, 150, 300, 500];
    const ch = data.progress.character || { emoji: '👶', name: 'Bebek' };
    let prev = 0, next = 50, stage = 0;
    for (let i = 0; i < stages.length; i++) {
      if (xp < stages[i]) { next = stages[i]; stage = i; break; }
      prev = stages[i];
      stage = i + 1;
    }
    const pct = Math.min(100, Math.round(((xp - prev) / (next - prev)) * 100) || 0);
    return { xp, character: ch, progressPercent: pct };
  }

  function openStuModal(itemId) {
    const it = STU_WEEK_ITEMS.find((x) => x._id === itemId);
    if (!it) return;
    MODAL_ITEM = it;
    const modal = document.getElementById('stu-modal');
    const log = it.log || {};
    const isTest = it.hasTest || it.importance === 'test';
    document.getElementById('modal-title').textContent =
      (it.subject && it.subject.title ? it.subject.title + ' — ' : '') + (it.topicSnapshot || 'Görev');
    document.getElementById('modal-done').checked = log.kanbanStatus === 'done';
    document.getElementById('modal-mood').value = log.mood || '';
    document.getElementById('modal-note').value = log.studentNote || '';
    document.getElementById('modal-test-block').style.display = isTest ? 'block' : 'none';
    document.getElementById('modal-correct').value = log.correct || 0;
    document.getElementById('modal-wrong').value = log.wrong || 0;
    document.getElementById('modal-blank').value = log.blank || 0;
    document.getElementById('modal-rating-block').style.display = log.kanbanStatus === 'done' ? 'block' : 'none';
    modal.classList.add('open');
  }

  function closeStuModal() {
    document.getElementById('stu-modal').classList.remove('open');
    MODAL_ITEM = null;
  }

  async function saveStuModal() {
    if (!MODAL_ITEM) return;
    const done = document.getElementById('modal-done').checked;
    const mood = document.getElementById('modal-mood').value;
    if (done && !mood) {
      alert('Tamamladıysanız "Bu konuda nasılsın?" seçin (İyi / Orta / Kötü).');
      return;
    }
    const r = await post('studentsavelog', {
      sessionToken: stuToken(),
      planItemId: MODAL_ITEM._id,
      kanbanStatus: done ? 'done' : 'doing',
      mood: done ? mood : '',
      studentNote: document.getElementById('modal-note').value,
      correct: Number(document.getElementById('modal-correct').value || 0),
      wrong: Number(document.getElementById('modal-wrong').value || 0),
      blank: Number(document.getElementById('modal-blank').value || 0),
    });
    if (r.character) renderProgress({ xp: r.xp, character: r.character, progressPercent: 0 });
    closeStuModal();
    await stuRefresh();
  }

  async function stuRefresh() {
    const tok = stuToken();
    document.getElementById('stu-main').style.display = tok ? 'block' : 'none';
    if (!tok) return;
    const data = await post('studentweek', { sessionToken: tok });
    renderStuWeek(data);
    const prog = await post('studentprogress', { sessionToken: tok });
    renderProgress(prog);
  }

  function stuInit() {
    document.getElementById('modal-done').onchange = () => {
      document.getElementById('modal-rating-block').style.display =
        document.getElementById('modal-done').checked ? 'block' : 'none';
    };
    document.getElementById('modal-close').onclick = closeStuModal;
    document.getElementById('modal-save').onclick = () => saveStuModal().catch((e) => alert(e.message));
    document.getElementById('stu-modal').onclick = (e) => {
      if (e.target.id === 'stu-modal') closeStuModal();
    };

    function updateRegTrackUi() {
      const g = Number(document.getElementById('reg-grade').value);
      document.getElementById('reg-track-wrap').style.display = (g >= 11 && g <= 12) ? '' : 'none';
      document.getElementById('reg-track-hint').style.display = (g >= 11 && g <= 12) ? 'none' : 'block';
    }
    document.getElementById('reg-grade').addEventListener('input', updateRegTrackUi);
    updateRegTrackUi();

    document.getElementById('stu-reg-btn').onclick = async () => {
      document.getElementById('stu-reg-err').textContent = '';
      try {
        const g = Number(document.getElementById('reg-grade').value);
        const track = g <= 10 ? 'lgs' : document.getElementById('reg-track').value;
        const r = await post('studentregister', {
          title: document.getElementById('reg-title').value,
          loginCode: document.getElementById('reg-code').value,
          pin: document.getElementById('reg-pin').value,
          grade: g,
          track,
          schoolYear: document.getElementById('reg-year') ? document.getElementById('reg-year').value : '',
        });
        stuSetToken(r.sessionToken);
        document.getElementById('stu-welcome').textContent = 'Hoş geldiniz, ' + (r.displayName || '');
        await stuRefresh();
      } catch (e) { document.getElementById('stu-reg-err').textContent = e.message; }
    };
    document.getElementById('stu-login-btn').onclick = async () => {
      document.getElementById('stu-login-err').textContent = '';
      try {
        const r = await post('studentlogin', {
          loginCode: document.getElementById('stu-code').value,
          pin: document.getElementById('stu-pin').value,
        });
        stuSetToken(r.sessionToken);
        document.getElementById('stu-welcome').textContent = 'Hoş geldiniz, ' + (r.displayName || '');
        await stuRefresh();
      } catch (e) { document.getElementById('stu-login-err').textContent = e.message; }
    };
    document.getElementById('stu-logout-btn').onclick = async () => {
      try { await post('studentlogout', { sessionToken: stuToken() }); } catch (e) {}
      stuSetToken('');
      document.getElementById('stu-main').style.display = 'none';
    };
    if (stuToken()) stuRefresh().catch((e) => alert(e.message));
  }

  function tabInit() {
    document.querySelectorAll('.tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((b) => b.classList.remove('on'));
        btn.classList.add('on');
        const t = btn.getAttribute('data-tab');
        document.querySelectorAll('.panel').forEach((p) => p.classList.remove('on'));
        document.getElementById(t === 'stu' ? 'p-stu' : 'p-stf').classList.add('on');
      });
    });
  }

  document.getElementById('theme-toggle').onclick = () => {
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(cur === 'light' ? 'dark' : 'light');
  };
  applyTheme(localStorage.getItem(LS_THEME) || 'dark');

  tabInit();
  stuInit();
  stfInit();
})();
