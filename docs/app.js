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
  let STF_OVERVIEW = null;
  /** Sunucudaki giriş kodu (üst üste güncelleme isteği göndermemek için) */
  let STF_PROFILE_SNAPSHOT = { loginCode: '' };
  let STU_PROFILE_SNAPSHOT = { loginCode: '' };

  function normCodeClient(code) {
    return String(code || '').trim().toUpperCase();
  }

  function bookBarGoal(pages) {
    const p = Number(pages) || 0;
    let g = 25;
    while (g <= p) g += 25;
    return g;
  }

  function cellKey(dow, slot) {
    return String(dow) + '-' + String(slot);
  }

  function weekMondayLocal(anchor) {
    const x = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate(), 12, 0, 0);
    const js = x.getDay();
    const dow = js === 0 ? 7 : js;
    x.setDate(x.getDate() - (dow - 1));
    return x;
  }
  function formatFullWeekRange(monday) {
    const sun = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6, 12, 0, 0);
    function fmt(d) {
      return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
    }
    return fmt(monday) + ' – ' + fmt(sun);
  }
  function dayDateLabel(monday, dayDow) {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + (dayDow - 1), 12, 0, 0);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return dd + '.' + mm;
  }
  function confettiBurst() {
    const layer = document.getElementById('confetti-layer');
    if (!layer) return;
    layer.innerHTML = '';
    const colors = ['#f472b6', '#22c55e', '#38bdf8', '#fbbf24', '#a78bfa', '#fb7185', '#34d399'];
    const w = window.innerWidth;
    for (let i = 0; i < 64; i++) {
      const el = document.createElement('div');
      el.className = 'confetti-bit';
      el.style.left = Math.random() * w + 'px';
      el.style.background = colors[i % colors.length];
      el.style.transform = 'rotate(' + (Math.random() * 360) + 'deg)';
      const dur = 2 + Math.random() * 1.2;
      el.style.animation = 'none';
      layer.appendChild(el);
      el.animate(
        [
          { transform: 'translateY(0) rotate(0deg)', opacity: 1 },
          { transform: 'translateY(' + (window.innerHeight + 80) + 'px) rotate(' + (360 + Math.random() * 360) + 'deg)', opacity: 0.85 },
        ],
        { duration: dur * 1000, easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)', fill: 'forwards' },
      );
    }
    setTimeout(() => { layer.innerHTML = ''; }, 3500);
  }
  function showStudentToast(msg) {
    const t = document.getElementById('stu-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('open');
    clearTimeout(showStudentToast._tm);
    showStudentToast._tm = setTimeout(() => { t.classList.remove('open'); }, 4200);
  }

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
  function moodLabel(v) {
    const m = MOODS.find((x) => x.v === v);
    return m ? m.l : v;
  }
  function setStuAuthState(loggedIn, name) {
    const auth = document.getElementById('stu-auth');
    const main = document.getElementById('stu-main');
    const tabs = document.getElementById('role-tabs');
    const img = document.getElementById('stu-avatar');
    if (auth) auth.style.display = loggedIn ? 'none' : 'block';
    if (main) main.style.display = loggedIn ? 'block' : 'none';
    if (tabs) tabs.style.display = loggedIn ? 'none' : '';
    if (!loggedIn && img) {
      img.style.display = 'none';
      img.removeAttribute('src');
    }
    if (loggedIn && name) {
      const w = document.getElementById('stu-welcome');
      if (w) w.textContent = 'Hoş geldiniz, ' + name;
    }
  }
  function setStfAuthState(loggedIn, name, avatarUrl) {
    const auth = document.getElementById('stf-auth');
    const main = document.getElementById('stf-main');
    const img = document.getElementById('stf-avatar');
    if (auth) auth.style.display = loggedIn ? 'none' : 'block';
    if (main) main.style.display = loggedIn ? 'block' : 'none';
    if (!loggedIn) {
      if (img) {
        img.style.display = 'none';
        img.removeAttribute('src');
      }
    } else if (img) {
      if (avatarUrl) {
        img.src = avatarUrl;
        img.style.display = '';
      } else {
        img.style.display = 'none';
        img.removeAttribute('src');
      }
    }
    if (loggedIn && name) {
      const w = document.getElementById('stf-welcome');
      if (w) w.textContent = 'Hoş geldiniz, ' + name;
    }
  }

  async function refreshStfHeaderFromServer() {
    if (!stfToken()) return;
    try {
      const p = await post('staffgetprofile', { staffToken: stfToken() });
      setStfAuthState(true, p.title || 'Öğretmen', p.avatarUrl || '');
    } catch (e) {}
  }

  function updateStfWeekRangeDisplay() {
    const inp = document.getElementById('stf-week');
    const el = document.getElementById('stf-week-range');
    if (!inp || !el) return;
    const mon = inp.value ? weekMondayLocal(new Date(inp.value + 'T12:00:00')) : weekMondayLocal(new Date());
    el.textContent = formatFullWeekRange(mon);
  }
  function shiftStfWeekByDays(delta) {
    const inp = document.getElementById('stf-week');
    if (!inp) return;
    const base = inp.value ? new Date(inp.value + 'T12:00:00') : new Date();
    base.setDate(base.getDate() + delta);
    inp.value = base.toISOString().slice(0, 10);
    updateStfWeekRangeDisplay();
    const sid = document.getElementById('stf-student').value;
    if (sid && stfToken()) {
      stfLoadPlan().catch((e) => {
        document.getElementById('stf-err').textContent = e.message;
      });
    }
  }
  function renderStfAnalytics(a) {
    const chips = document.getElementById('stf-analytics-chips');
    const bars = document.getElementById('mood-bars');
    const donut = document.getElementById('mood-donut');
    if (!chips || !bars) return;
    if (!a) {
      chips.innerHTML = '<span class="muted">Öğrenci seçin</span>';
      bars.innerHTML = '';
      if (donut) donut.style.display = 'none';
      return;
    }
    chips.innerHTML =
      '<div class="stat-chip"><span class="muted">Tamamlanan görev</span><strong>' + (a.lessonsCompleted || 0) + '</strong></div>' +
      '<div class="stat-chip"><span class="muted">Bilgi kitabı (sayfa)</span><strong>' + (a.bookPages || 0) + '</strong></div>' +
      '<div class="stat-chip"><span class="muted">Başarı oranı (iyi payı)</span><strong>%' + (a.successRatePercent || 0) + '</strong></div>' +
      '<div class="stat-chip"><span class="muted">Derecelendirilen</span><strong>' + (a.ratedLessons || 0) + '</strong></div>' +
      '<div class="stat-chip"><span class="muted">Plan sayısı</span><strong>' + (a.plansCount || 0) + '</strong></div>';
    const tot = Math.max(1, (a.moodIyi || 0) + (a.moodOrta || 0) + (a.moodKotu || 0));
    const pi = ((a.moodIyi || 0) / tot) * 100;
    const po = ((a.moodOrta || 0) / tot) * 100;
    const pk = ((a.moodKotu || 0) / tot) * 100;
    function barRow(label, n, cls) {
      const pct = Math.round((n / tot) * 100);
      return '<div class="bar-row"><span style="width:72px">' + label + '</span><div class="bar-track"><div class="bar-fill ' + cls + '" style="width:' + pct + '%"></div></div><span>' + n + '</span></div>';
    }
    bars.innerHTML = barRow('İyi', a.moodIyi || 0, 'iyi') + barRow('Orta', a.moodOrta || 0, 'orta') + barRow('Kötü', a.moodKotu || 0, 'kotu');
    if (donut && tot > 0) {
      const deg1 = (a.moodIyi || 0) / tot * 360;
      const deg2 = deg1 + (a.moodOrta || 0) / tot * 360;
      donut.style.display = 'block';
      donut.style.setProperty('--p1', deg1 + 'deg');
      donut.style.setProperty('--p2', deg2 + 'deg');
    } else if (donut) donut.style.display = 'none';
  }
  async function stfRefreshHistoryAndAnalytics() {
    const sid = document.getElementById('stf-student').value;
    if (!sid || !stfToken()) {
      renderStfAnalytics(null);
      return;
    }
    try {
      const hist = await post('staffplanhistory', { staffToken: stfToken(), studentId: sid });
      const sel = document.getElementById('stf-week-history');
      if (sel) {
        const cur = document.getElementById('stf-week').value;
        let h = '<option value="">— Kayıtlı plan seç —</option>';
        (hist || []).forEach((row) => {
          const ws = String(row.week_start).slice(0, 10);
          const lab = ws + ' · ' + (row.status === 'published' ? 'Yayın' : 'Taslak');
          h += '<option value="' + ws + '">' + escapeHtml(lab) + '</option>';
        });
        sel.innerHTML = h;
        if (cur) {
          const opt = Array.from(sel.options).find((o) => o.value === cur);
          if (opt) sel.value = cur;
        }
      }
    } catch (e) {}
    try {
      const a = await post('staffstudentanalytics', { staffToken: stfToken(), studentId: sid });
      renderStfAnalytics(a);
    } catch (e) {
      renderStfAnalytics(null);
    }
  }
  function fileToResizedDataUrl(file, maxSide, callback) {
    const reader = new FileReader();
    reader.onload = function () {
      const img = new Image();
      img.onload = function () {
        let w = img.width; let h = img.height;
        if (w > maxSide || h > maxSide) {
          if (w > h) {
            h = Math.round((h * maxSide) / w);
            w = maxSide;
          } else {
            w = Math.round((w * maxSide) / h);
            h = maxSide;
          }
        }
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        callback(c.toDataURL('image/jpeg', 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function studentLogHtml(log) {
    if (!log) return '';
    const done = log.kanbanStatus === 'done';
    let h = '<div class="stu-feedback">';
    h += '<span class="fb-status ' + (done ? 'done' : 'pending') + '">' + (done ? '✓ Tamamladı' : '○ Bekliyor') + '</span>';
    if (log.mood) h += '<span class="fb-mood mood-' + escapeHtml(log.mood) + '">' + escapeHtml(moodLabel(log.mood)) + '</span>';
    if (log.studentNote) h += '<p class="fb-note">' + escapeHtml(log.studentNote) + '</p>';
    const c = Number(log.correct) || 0;
    const w = Number(log.wrong) || 0;
    const b = Number(log.blank) || 0;
    if (c || w || b) h += '<p class="fb-test muted">Test: ' + c + ' doğru · ' + w + ' yanlış · ' + b + ' boş</p>';
    h += '</div>';
    return h;
  }
  function renderStfStudentPanel(ov) {
    const el = document.getElementById('stf-student-panel');
    if (!el) return;
    if (!ov || !ov.student) {
      el.innerHTML = '<p class="muted">Öğrenci seçip planı yükleyin; ad, sınıf ve ilerleme burada görünür.</p>';
      return;
    }
    const s = ov.student;
    const st = ov.stats || {};
    const pct = st.totalItems ? Math.round((st.completed / st.totalItems) * 100) : 0;
    const bp = (s.bookPages != null) ? s.bookPages : 0;
    const bg = bookBarGoal(bp);
    const bookFill = Math.min(100, Math.round((bp / bg) * 100));
    const moodTitles = { iyi: 'İyi gitti', orta: 'Orta seviye', kotu: 'Zayıf — destek gerek' };
    const moodCls = { iyi: 'mood-good', orta: 'mood-mid', kotu: 'mood-bad' };
    let moodGrid = '<div class="mood-grid">';
    ['iyi', 'orta', 'kotu'].forEach((m) => {
      const list = (ov.moodTopics && ov.moodTopics[m]) || [];
      moodGrid += '<div class="mood-col ' + moodCls[m] + '"><h4>' + moodTitles[m] + ' (' + list.length + ')</h4><ul>';
      if (!list.length) moodGrid += '<li class="muted">—</li>';
      else {
        list.forEach((x) => {
          moodGrid += '<li><strong>' + escapeHtml(x.subject) + '</strong>';
          if (x.topic) moodGrid += ' · ' + escapeHtml(x.topic);
          if (x.note) moodGrid += '<br/><span class="muted">' + escapeHtml(x.note) + '</span>';
          moodGrid += '</li>';
        });
      }
      moodGrid += '</ul></div>';
    });
    moodGrid += '</div>';
    el.innerHTML =
      '<h3 style="margin:0 0 10px;font-size:1rem;">' + escapeHtml(s.title || 'Öğrenci') + '</h3>' +
      '<div class="stf-overview">' +
      '<div class="stat"><span class="muted">Sınıf</span><strong>' + escapeHtml(String(s.grade || '—')) + '. sınıf</strong></div>' +
      '<div class="stat"><span class="muted">Bölüm</span><strong>' + escapeHtml(s.trackLabel || '—') + '</strong></div>' +
      '<div class="stat"><span class="muted">Tamamlanan</span><strong>' + (st.completed || 0) + ' / ' + (st.totalItems || 0) + '</strong></div>' +
      '<div class="stat"><span class="muted">Haftalık ilerleme</span><strong>%' + pct + '</strong></div>' +
      '<div class="stat"><span class="muted">Bilgi kitabı</span><strong>' +
      bp + ' sayfa</strong><div class="book-bar" style="margin-top:6px"><div class="book-bar-fill" style="width:' + bookFill + '%"></div></div></div>' +
      '</div>' +
      '<p class="muted" style="margin:8px 0 4px">Konu geri bildirimi (öğrenci değerlendirmesi)</p>' +
      moodGrid;
  }
  function trackOptionsHtml(grade, selected) {
    const tracks = grade <= 10
      ? [{ v: 'lgs', l: '9–10 · Lise ortak müfredat' }]
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
          studentLog: it.studentLog || null,
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
      '</div>' +
      studentLogHtml(cell.studentLog) +
      '</div>'
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
    const wPick = document.getElementById('stf-week').value;
    const monday = wPick ? weekMondayLocal(new Date(wPick + 'T12:00:00')) : weekMondayLocal(new Date());
    let html = '<thead><tr>';
    DAYS.forEach((d) => {
      const dt = dayDateLabel(monday, d.dow);
      html += '<th class="' + (d.dow === todayDow ? 'today' : '') + '">' + d.label + '<span class="day-date">' + dt + '</span></th>';
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
    sel.onchange = () => {
      SUBJECTS_CACHE = {};
      TOPIC_CACHE = {};
      STF_OVERVIEW = null;
      renderStfStudentPanel(null);
      updateStfWeekRangeDisplay();
      const w = document.getElementById('stf-week').value;
      if (sel.value && w) {
        stfLoadPlan().catch((e) => {
          document.getElementById('stf-err').textContent = e.message;
        });
      } else {
        stfRenderWeekGrid().catch(() => {});
        stfRefreshHistoryAndAnalytics();
      }
    };
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
    STF_OVERVIEW = data.overview || null;
    itemsToCells(data.items || []);
    renderStfStudentPanel(STF_OVERVIEW);
    await stfRenderWeekGrid();
    await stfRefreshHistoryAndAnalytics();
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

  async function loadStfProfileForm() {
    const errEl = document.getElementById('stf-prof-err');
    errEl.textContent = '';
    try {
      const p = await post('staffgetprofile', { staffToken: stfToken() });
      document.getElementById('stf-prof-title').value = p.title || '';
      document.getElementById('stf-prof-code').value = p.loginCode || '';
      STF_PROFILE_SNAPSHOT.loginCode = normCodeClient(p.loginCode || '');
      document.getElementById('stf-prof-pin-new').value = '';
      document.getElementById('stf-prof-pin-current').value = '';
      const prev = document.getElementById('stf-prof-avatar-preview');
      const f = document.getElementById('stf-prof-file');
      if (f) f.value = '';
      if (p.avatarUrl) {
        prev.src = p.avatarUrl;
        prev.style.display = '';
      } else {
        prev.removeAttribute('src');
        prev.style.display = 'none';
      }
    } catch (e) {
      errEl.textContent = e.message;
    }
  }

  function stfInit() {
    const weekInp = document.getElementById('stf-week');
    weekInp.valueAsDate = new Date();
    updateStfWeekRangeDisplay();
    weekInp.addEventListener('change', () => {
      if (!stfToken()) return;
      updateStfWeekRangeDisplay();
      const sid = document.getElementById('stf-student').value;
      if (sid) {
        stfLoadPlan().catch((e) => {
          document.getElementById('stf-err').textContent = e.message;
        });
      } else {
        stfRenderWeekGrid().catch(() => {});
      }
    });
    const prevBtn = document.getElementById('stf-week-prev');
    const nextBtn = document.getElementById('stf-week-next');
    if (prevBtn) prevBtn.onclick = () => shiftStfWeekByDays(-7);
    if (nextBtn) nextBtn.onclick = () => shiftStfWeekByDays(7);
    const histSel = document.getElementById('stf-week-history');
    if (histSel) {
      histSel.addEventListener('change', () => {
        const v = histSel.value;
        if (!v || !stfToken()) return;
        weekInp.value = v;
        updateStfWeekRangeDisplay();
        const sid = document.getElementById('stf-student').value;
        if (sid) {
          stfLoadPlan().catch((e) => {
            document.getElementById('stf-err').textContent = e.message;
          });
        }
      });
    }
    document.querySelectorAll('#stf-subtabs .subtab').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#stf-subtabs .subtab').forEach((b) => b.classList.remove('on'));
        btn.classList.add('on');
        const tab = btn.getAttribute('data-stf-tab');
        const panStu = document.getElementById('stf-panel-students');
        const panPr = document.getElementById('stf-panel-profile');
        if (panStu) panStu.style.display = tab === 'students' ? 'block' : 'none';
        if (panPr) panPr.style.display = tab === 'profile' ? 'block' : 'none';
        if (tab === 'profile') loadStfProfileForm();
      });
    });
    const stfProfFile = document.getElementById('stf-prof-file');
    if (stfProfFile) {
      stfProfFile.addEventListener('change', () => {
        const file = stfProfFile.files && stfProfFile.files[0];
        const prev = document.getElementById('stf-prof-avatar-preview');
        if (!file || !prev) return;
        fileToResizedDataUrl(file, 480, (url) => {
          prev.src = url;
          prev.style.display = '';
        });
      });
    }
    document.getElementById('stf-prof-save').onclick = () => {
      const errEl = document.getElementById('stf-prof-err');
      errEl.textContent = '';
      const sendPayload = (avatarUrl) => {
        const payload = {
          staffToken: stfToken(),
          title: document.getElementById('stf-prof-title').value.trim(),
          currentPin: document.getElementById('stf-prof-pin-current').value,
        };
        const pinNew = document.getElementById('stf-prof-pin-new').value;
        if (pinNew) payload.pin = pinNew;
        const codeNorm = normCodeClient(document.getElementById('stf-prof-code').value);
        if (codeNorm !== STF_PROFILE_SNAPSHOT.loginCode) payload.loginCode = codeNorm;
        if (avatarUrl !== undefined) payload.avatarUrl = avatarUrl;
        post('staffupdateprofile', payload)
          .then(() => {
            errEl.textContent = 'Profil güncellendi.';
            document.getElementById('stf-prof-pin-new').value = '';
            document.getElementById('stf-prof-pin-current').value = '';
            const fi = document.getElementById('stf-prof-file');
            if (fi) fi.value = '';
            return refreshStfHeaderFromServer();
          })
          .then(() => loadStfProfileForm())
          .catch((e) => {
            errEl.textContent = e.message;
          });
      };
      const fi = document.getElementById('stf-prof-file');
      if (fi && fi.files && fi.files[0]) {
        fileToResizedDataUrl(fi.files[0], 512, (dataUrl) => sendPayload(dataUrl));
      } else {
        sendPayload();
      }
    };
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
        setStfAuthState(true, r.displayName || '', r.avatarUrl || '');
        await stfLoadStudents();
        updateStfWeekRangeDisplay();
        document.getElementById('stf-err').textContent = '';
        try {
          if (document.getElementById('stf-student').value && document.getElementById('stf-week').value) {
            await stfLoadPlan();
          } else {
            await stfRenderWeekGrid();
            await stfRefreshHistoryAndAnalytics();
          }
        } catch (e2) {
          document.getElementById('stf-err').textContent = e2.message;
        }
      } catch (e) {
        document.getElementById('stf-login-err').textContent = e.message;
      }
    };
    document.getElementById('stf-logout-btn').onclick = async () => {
      try { await post('stafflogout', { staffToken: stfToken() }); } catch (e) {}
      stfSetToken('');
      setStfAuthState(false);
      STF_OVERVIEW = null;
      renderStfStudentPanel(null);
      renderStfAnalytics(null);
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
      setStfAuthState(true);
      refreshStfHeaderFromServer()
        .then(() => stfLoadStudents())
        .then(async () => {
          updateStfWeekRangeDisplay();
          document.getElementById('stf-err').textContent = '';
          try {
            if (document.getElementById('stf-student').value && document.getElementById('stf-week').value) {
              await stfLoadPlan();
            } else {
              await stfRenderWeekGrid();
              await stfRefreshHistoryAndAnalytics();
            }
          } catch (e) {
            document.getElementById('stf-err').textContent = e.message;
          }
        })
        .catch(() => {});
    } else {
      setStfAuthState(false);
    }
  }

  /* ---- Öğrenci ---- */
  function stuToken() { return localStorage.getItem(LS_STU) || ''; }
  function stuSetToken(t) { if (t) localStorage.setItem(LS_STU, t); else localStorage.removeItem(LS_STU); }

  function renderProgress(prog) {
    const el = document.getElementById('stu-progress');
    if (!el || !prog) return;
    const pages = Number(prog.bookPages) || 0;
    const goal = Number(prog.bookGoal) || bookBarGoal(pages);
    const fill = prog.bookFillPct != null
      ? Math.min(100, prog.bookFillPct)
      : Math.min(100, Math.round((pages / goal) * 100));
    el.innerHTML =
      '<div class="book-card">' +
      '<div class="book-spine" aria-hidden="true"></div>' +
      '<div class="book-body">' +
      '<p class="book-title">📖 Bilgi kitabım</p>' +
      '<p class="book-sub">Her tamamladığın görev kitabına bir sayfa ekler. Ne kadar çok çalışırsan kitap o kadar doluyor.</p>' +
      '<p class="book-pages">' + pages + ' <span style="font-size:0.85rem;font-weight:600;color:var(--muted)">sayfa</span></p>' +
      '<div class="book-bar"><div class="book-bar-fill" style="width:' + fill + '%"></div></div>' +
      '<p class="char-tag" style="margin:8px 0 0">Sonraki hedef: ' + goal + ' sayfa</p>' +
      '</div></div>';
  }

  function renderStuWeek(data) {
    STU_WEEK_ITEMS = data.items || [];
    const root = document.getElementById('stu-week-grid');
    const todayDow = data.dow || schoolDow(new Date());
    let monday;
    if (data.plan && data.plan.weekStart) {
      const ws = String(data.plan.weekStart).slice(0, 10);
      monday = weekMondayLocal(new Date(ws + 'T12:00:00'));
    } else {
      monday = weekMondayLocal(new Date());
    }
    let html = '<table class="week-grid week-stu"><thead><tr>';
    DAYS.forEach((d) => {
      const dt = dayDateLabel(monday, d.dow);
      html += '<th class="' + (d.dow === todayDow ? 'today' : '') + '">' + d.label + '<span class="day-date">' + dt + '</span></th>';
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
    const gainedPage = done && Number(r.xpGain) > 0;
    closeStuModal();
    await stuRefresh();
    if (gainedPage) {
      confettiBurst();
      showStudentToast('Tebrikler! Bilgi kitabına bir sayfa daha ekledik.');
    }
  }

  async function stuRefresh() {
    const tok = stuToken();
    if (!tok) {
      setStuAuthState(false);
      return;
    }
    setStuAuthState(true);
    const data = await post('studentweek', { sessionToken: tok });
    renderStuWeek(data);
    const prog = await post('studentprogress', { sessionToken: tok });
    renderProgress(prog);
    const av = document.getElementById('stu-avatar');
    if (av && prog) {
      if (prog.avatarUrl) {
        av.src = prog.avatarUrl;
        av.style.display = '';
      } else {
        av.style.display = 'none';
        av.removeAttribute('src');
      }
    }
    if (prog && prog.displayName) {
      const w = document.getElementById('stu-welcome');
      if (w) w.textContent = 'Hoş geldiniz, ' + prog.displayName;
    }
  }

  async function loadStuProfileForm() {
    const errEl = document.getElementById('stu-prof-err');
    errEl.textContent = '';
    try {
      const p = await post('studentgetprofile', { sessionToken: stuToken() });
      document.getElementById('stu-prof-title').value = p.title || '';
      document.getElementById('stu-prof-code').value = p.loginCode || '';
      STU_PROFILE_SNAPSHOT.loginCode = normCodeClient(p.loginCode || '');
      document.getElementById('stu-prof-pin-new').value = '';
      document.getElementById('stu-prof-pin-current').value = '';
      const prev = document.getElementById('stu-prof-avatar-preview');
      const f = document.getElementById('stu-prof-file');
      if (f) f.value = '';
      if (p.avatarUrl) {
        prev.src = p.avatarUrl;
        prev.style.display = '';
      } else {
        prev.removeAttribute('src');
        prev.style.display = 'none';
      }
    } catch (e) {
      errEl.textContent = e.message;
    }
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

    let stuProfileOpen = false;
    document.getElementById('stu-profile-toggle').onclick = () => {
      const p = document.getElementById('stu-profile-panel');
      stuProfileOpen = !stuProfileOpen;
      p.style.display = stuProfileOpen ? 'block' : 'none';
      if (stuProfileOpen) loadStuProfileForm();
    };
    document.getElementById('stu-prof-file').addEventListener('change', () => {
      const file = document.getElementById('stu-prof-file').files && document.getElementById('stu-prof-file').files[0];
      const prev = document.getElementById('stu-prof-avatar-preview');
      if (!file || !prev) return;
      fileToResizedDataUrl(file, 480, (url) => {
        prev.src = url;
        prev.style.display = '';
      });
    });
    document.getElementById('stu-prof-save').onclick = () => {
      const errEl = document.getElementById('stu-prof-err');
      errEl.textContent = '';
      const sendPayload = (avatarUrl) => {
        const payload = {
          sessionToken: stuToken(),
          title: document.getElementById('stu-prof-title').value.trim(),
          currentPin: document.getElementById('stu-prof-pin-current').value,
        };
        const pinNew = document.getElementById('stu-prof-pin-new').value;
        if (pinNew) payload.pin = pinNew;
        const codeNorm = normCodeClient(document.getElementById('stu-prof-code').value);
        if (codeNorm !== STU_PROFILE_SNAPSHOT.loginCode) payload.loginCode = codeNorm;
        if (avatarUrl !== undefined) payload.avatarUrl = avatarUrl;
        post('studentupdateprofile', payload)
          .then(() => {
            errEl.textContent = 'Profil güncellendi.';
            document.getElementById('stu-prof-pin-new').value = '';
            document.getElementById('stu-prof-pin-current').value = '';
            const fi = document.getElementById('stu-prof-file');
            if (fi) fi.value = '';
            return stuRefresh();
          })
          .then(() => loadStuProfileForm())
          .catch((e) => {
            errEl.textContent = e.message;
          });
      };
      const fi = document.getElementById('stu-prof-file');
      if (fi && fi.files && fi.files[0]) {
        fileToResizedDataUrl(fi.files[0], 512, (dataUrl) => sendPayload(dataUrl));
      } else {
        sendPayload();
      }
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
        setStuAuthState(true, r.displayName || '');
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
        setStuAuthState(true, r.displayName || '');
        await stuRefresh();
      } catch (e) { document.getElementById('stu-login-err').textContent = e.message; }
    };
    document.getElementById('stu-logout-btn').onclick = async () => {
      try { await post('studentlogout', { sessionToken: stuToken() }); } catch (e) {}
      stuSetToken('');
      setStuAuthState(false);
      stuProfileOpen = false;
      const pp = document.getElementById('stu-profile-panel');
      if (pp) pp.style.display = 'none';
    };
    if (stuToken()) {
      setStuAuthState(true);
      stuRefresh().catch((e) => alert(e.message));
    } else {
      setStuAuthState(false);
    }
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
