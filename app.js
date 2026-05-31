/**
 * 我的日程 v2 — 暖白极简 · 标签页切换 · 桌面双栏
 */

const STORAGE_KEY = 'schedule_events';
const SETTINGS_KEY = 'schedule_settings';

// ── 分类配置 ──
const DEFAULT_CATEGORIES = {
  work:    { id:'work',    label: '工作', emoji: '💼', color: '#E8894B', bg: '#FFF3E8' },
  life:    { id:'life',    label: '生活', emoji: '🏠', color: '#5B9A6B', bg: '#EDF5EF' },
  urgent:  { id:'urgent',  label: '紧急', emoji: '🚨', color: '#E05555', bg: '#FFF0F0' },
  default: { id:'default', label: '默认', emoji: '📌', color: '#6B9CC8', bg: '#EEF4FA' },
};
const CAT_STORAGE = 'schedule_categories';
let categories = {};

function loadCategories() {
  try {
    const raw = localStorage.getItem(CAT_STORAGE);
    categories = raw ? JSON.parse(raw) : { ...DEFAULT_CATEGORIES };
  } catch { categories = { ...DEFAULT_CATEGORIES }; }
}
function saveCategories() { localStorage.setItem(CAT_STORAGE, JSON.stringify(categories)); }

// 自动分类关键词
const CAT_KEYWORDS = {
  work:   /会议|开会|汇报|项目|客户|产品|评审|发布|上线|面试|出差|周报|方案|预算|季度|年终|述职|培训|演示|竞标|签约|合同/,
  life:   /聚餐|吃饭|生日|电影|健身|医院|看牙|体检|旅游|朋友|快递|搬家|租房|聚会|婚礼|产检|疫苗|理发|购物|逛街|做饭|打扫/,
  urgent: /紧急|重要|截止|必须|deadline|立即|马上|尽快|赶紧|千万别忘|务必/,
};
function autoCat(title) {
  if (CAT_KEYWORDS.urgent?.test(title)) return 'urgent';
  if (CAT_KEYWORDS.work?.test(title)) return 'work';
  if (CAT_KEYWORDS.life?.test(title)) return 'life';
  return 'default';
}
function catColor(cat) { return categories[cat]?.color || categories.default?.color || '#6B9CC8'; }
function catBg(cat) { return categories[cat]?.bg || categories.default?.bg || '#EEF4FA'; }
function catList() { return Object.values(categories); }

// ── 状态 ──
let currentDate = new Date();
let events = [];
let selectedDate = null;
let settings = { apiKey: '', useAI: false, syncToken: '', gistId: '', lastSync: 0 };
let activeTab = 'schedule';
let calView = 'month'; // 'month' | 'week'
let weekStart = null;  // Monday of current week
let touchStartX = 0;
let touchStartY = 0;

// ── DOM ──
const $ = s => document.querySelector(s);
const dom = {
  // 问候
  greetingText: $('#greetingText'),
  todayLabel: $('#todayLabel'),
  // Hero
  heroCard: $('#heroCard'),
  heroTitle: $('#heroTitle'),
  heroTime: $('#heroTime'),
  heroCountdown: $('#heroCountdown'),
  heroCdNum: $('#heroCdNum'),
  heroCdUnit: $('#heroCdUnit'),
  // 粘贴
  pasteInput: $('#pasteInput'),
  btnExtract: $('#btnExtract'),
  btnUpload: $('#btnUpload'),
  fileInput: $('#fileInput'),
  extractResults: $('#extractResults'),
  // 标签
  tabBar: $('#tabBar'),
  tabPanels: {
    schedule: $('#panel-schedule'),
    calendar: $('#panel-calendar'),
    countdown: $('#panel-countdown'),
  },
  // 日程列表
  scheduleList: $('#scheduleList'),
  // 日历
  monthTitle: $('#monthTitle'),
  btnPrevMonth: $('#btnPrevMonth'),
  btnNextMonth: $('#btnNextMonth'),
  btnToday: $('#btnToday'),
  daysGrid: $('#daysGrid'),
  dayEvents: $('#dayEvents'),
  // 周视图
  weekView: $('#weekView'),
  weekHeader: $('#weekHeader'),
  weekBody: $('#weekBody'),
  calendarWrap: $('#calendarWrap'),
  viewBtns: () => document.querySelectorAll('.view-btn'),
  // 倒计时
  countdownList: $('#countdownList'),
  // 概览
  digestCard: $('#digestCard'),
  digestDate: $('#digestDate'),
  digestBody: $('#digestBody'),
  digestFooter: $('#digestFooter'),
  digestTomorrow: $('#digestTomorrow'),
  // 弹窗
  modalOverlay: $('#modalOverlay'),
  modalTitle: $('#modalTitle'),
  eventForm: $('#eventForm'),
  eventId: $('#eventId'),
  eventTitle: $('#eventTitle'),
  eventDate: $('#eventDate'),
  eventTime: $('#eventTime'),
  eventEndTime: $('#eventEndTime'),
  durationHint: $('#durationHint'),
  eventNote: $('#eventNote'),
  btnDelete: $('#btnDelete'),
  btnCancel: $('#btnCancel'),
  // 设置
  settingsOverlay: $('#settingsOverlay'),
  apiKeyInput: $('#apiKeyInput'),
  currentMode: $('#currentMode'),
  btnSaveSettings: $('#btnSaveSettings'),
  btnSettingsClose: $('#btnSettingsClose'),
  btnExport: $('#btnExport'),
  btnImport: $('#btnImport'),
  importFileInput: $('#importFileInput'),
  // AI
  btnAiToggle: $('#btnAiToggle'),
  // FAB
  fabAdd: $('#fabAdd'),
  // 同步
  syncTokenInput: $('#syncTokenInput'),
  btnSyncNow: $('#btnSyncNow'),
  syncStatus: $('#syncStatus'),
  // OCR
  imgPreview: $('#imgPreview'),
  imgPreviewImg: $('#imgPreviewImg'),
  imgPreviewClose: $('#imgPreviewClose'),
  btnOCR: $('#btnOCR'),
  // Toast
  toast: $('#toast'),
};

// ── 图片粘贴 + OCR ──
let pastedImageDataUrl = null;

function showImagePreview(dataUrl) {
  pastedImageDataUrl = dataUrl;
  dom.imgPreviewImg.src = dataUrl;
  dom.imgPreview.classList.remove('hidden');
  dom.btnOCR.classList.remove('hidden');
}

function clearImagePreview() {
  pastedImageDataUrl = null;
  dom.imgPreviewImg.src = '';
  dom.imgPreview.classList.add('hidden');
  dom.btnOCR.classList.add('hidden');
}

async function runOCR() {
  if (!pastedImageDataUrl) return;
  dom.btnOCR.textContent = '⏳ 加载 OCR 引擎...';
  dom.btnOCR.disabled = true;

  try {
    // 懒加载 Tesseract.js
    if (!window.Tesseract) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
        script.onload = resolve;
        script.onerror = () => reject(new Error('OCR 引擎加载失败，请检查网络'));
        document.head.appendChild(script);
      });
    }

    dom.btnOCR.textContent = '🔍 识别中...';
    const { data: { text } } = await Tesseract.recognize(pastedImageDataUrl, 'chi_sim+eng', {
      logger: m => {
        if (m.status === 'recognizing text') {
          dom.btnOCR.textContent = `🔍 识别中 ${Math.round(m.progress*100)}%`;
        }
      }
    });

    const cleanText = text.trim();
    if (cleanText) {
      dom.pasteInput.value = cleanText;
      toast(`✅ 识别到 ${cleanText.length} 个字`);
      // 自动触发提取
      const extracted = extractEvents(cleanText);
      if (extracted.length > 0) showExtractResults(extracted);
    } else {
      toast('⚠️ 未能识别到文字');
    }
    clearImagePreview();
  } catch (err) {
    toast('❌ ' + err.message);
  } finally {
    dom.btnOCR.textContent = '🔍 OCR 识别文字';
    dom.btnOCR.disabled = false;
  }
}

// ── 工具函数 ──
const fmt = (d, sep = '-') => `${d.getFullYear()}${sep}${String(d.getMonth()+1).padStart(2,'0')}${sep}${String(d.getDate()).padStart(2,'0')}`;
const fmtCN = d => `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
const fmtTm = d => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
const sameDay = (a, b) => a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
const esc = s => { const d=document.createElement('div'); d.textContent=s; return d.innerHTML; };

// ── 持久化 ──
function loadEvents() {
  try { events = (JSON.parse(localStorage.getItem(STORAGE_KEY))||[]).map(e=>({...e,date:new Date(e.date)})); }
  catch { events = []; }
}
function saveEvents() { localStorage.setItem(STORAGE_KEY, JSON.stringify(events)); }
function loadSettings() {
  try { const r = localStorage.getItem(SETTINGS_KEY); if(r) settings={...settings,...JSON.parse(r)}; }
  catch {}
  updateAiUI();
}
function saveSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }

// ── Toast ──
let toastTimer;
function toast(msg, ms=2000) {
  clearTimeout(toastTimer);
  dom.toast.textContent = msg;
  dom.toast.classList.remove('hidden');
  toastTimer = setTimeout(() => dom.toast.classList.add('hidden'), ms);
}

// ── 问候语 ──
function updateGreeting() {
  const h = new Date().getHours();
  const g = h<6?'夜深了':h<9?'早上好':h<12?'上午好':h<14?'中午好':h<18?'下午好':h<22?'晚上好':'夜深了';
  dom.greetingText.textContent = g + ' 👋';
  const days = '日一二三四五六';
  dom.todayLabel.textContent = `${new Date().getMonth()+1}月${new Date().getDate()}日 星期${days[new Date().getDay()]}`;
}

// ═════════════════════════════════
//  Hero — 下一个日程
// ═════════════════════════════════
function renderHero() {
  const now = new Date();
  const upcoming = events.filter(e => e.date >= now).sort((a,b) => a.date - b.date);
  const next = upcoming[0];

  if (!next) {
    dom.heroTitle.textContent = '暂无日程';
    dom.heroTime.textContent = '添加你的第一个日程吧';
    dom.heroCountdown.classList.add('hidden');
    return;
  }

  dom.heroTitle.textContent = next.title;
  dom.heroTime.textContent = `${fmtCN(next.date)} ${fmtTm(next.date)}`;

  const diff = next.date - now;
  dom.heroCountdown.classList.remove('hidden');

  if (diff < 60*1000) {
    dom.heroCdNum.textContent = '现在';
    dom.heroCdUnit.textContent = '';
  } else {
    const d = Math.floor(diff/(86400000));
    const h = Math.floor((diff%86400000)/3600000);
    const m = Math.floor((diff%3600000)/60000);
    if (d > 0) { dom.heroCdNum.textContent = d; dom.heroCdUnit.textContent = '天'; }
    else if (h > 0) { dom.heroCdNum.textContent = h; dom.heroCdUnit.textContent = '小时'; }
    else { dom.heroCdNum.textContent = m; dom.heroCdUnit.textContent = '分钟'; }
  }
}

// ═════════════════════════════════
//  标签切换
// ═════════════════════════════════
function switchTab(name) {
  activeTab = name;
  dom.tabBar.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  Object.entries(dom.tabPanels).forEach(([k, el]) => el.classList.toggle('active', k === name));

  if (name === 'schedule') renderSchedule();
  if (name === 'calendar') renderCalendar();
  if (name === 'countdown') renderCountdown();
}

// ═════════════════════════════════
//  日程列表（按日期分组）
// ═════════════════════════════════
function renderSchedule() {
  const now = new Date();
  const upcoming = filterEvents(events).sort((a,b) => a.date - b.date);

  if (upcoming.length === 0) {
    dom.scheduleList.innerHTML = `<div class="empty-state">
      <div class="empty-icon-wrap">☀️</div>
      <p class="empty-title">新的一天</p>
      <p class="empty-desc">在上方粘贴一条消息<br>或点月历中的日期来添加日程</p>
    </div>`;
    return;
  }

  // 按日期分组
  const groups = new Map();
  for (const ev of upcoming) {
    const key = fmt(ev.date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ev);
  }

  let html = '';
  for (const [key, evs] of groups) {
    const d = evs[0].date;
    const isToday = sameDay(d, now);
    const isPast = d < now && !sameDay(d, now);
    const label = isToday ? '今天' : isPast ? fmtCN(d)+' · 已过' : fmtCN(d);
    html += `<div class="date-header">${label}</div>`;
    for (const ev of evs) {
      const dotColor = isPast ? 'var(--text-muted)' : catColor(ev.cat||'default');
      html += `<div class="event-row" data-id="${ev.id}" onclick="editEvent('${ev.id}')">
        <span class="event-color-dot" style="background:${dotColor}"></span>
        <div class="event-info">
          <div class="event-title">${esc(ev.title)}</div>
          <div class="event-time-label">${fmtTm(ev.date)}${ev.note?' · '+esc(ev.note):''}</div>
        </div>
        <span class="event-check">›</span>
      </div>`;
    }
  }

  dom.scheduleList.innerHTML = html;
}

// ═════════════════════════════════
//  日历
// ═════════════════════════════════
function renderCalendar() {
  const y = currentDate.getFullYear();
  const m = currentDate.getMonth();
  dom.monthTitle.textContent = `${y}年${m+1}月`;

  const first = new Date(y,m,1);
  const last = new Date(y,m+1,0);
  const startDow = first.getDay();
  const totalDays = last.getDate();
  const prevLast = new Date(y,m,0).getDate();

  let html = '';
  for (let i=0; i<startDow; i++) {
    html += `<div class="day-cell other-month">${prevLast-startDow+i+1}</div>`;
  }
  const today = new Date();
  for (let d=1; d<=totalDays; d++) {
    const date = new Date(y,m,d);
    const isToday = sameDay(date,today);
    const isSel = selectedDate && sameDay(date,selectedDate);
    const hasEv = events.some(e=>sameDay(e.date,date));
    const cls = ['day-cell', isToday?'today':'', isSel?'selected':'', hasEv?'has-event':''].filter(Boolean).join(' ');
    html += `<div class="${cls}" data-date="${fmt(date)}" data-d="${d}">${d}</div>`;
  }
  const total = startDow+totalDays;
  const rem = total%7===0?0:7-(total%7);
  for (let d=1; d<=rem; d++) html += `<div class="day-cell other-month">${d}</div>`;

  dom.daysGrid.innerHTML = html;

  // 点击日期
  dom.daysGrid.querySelectorAll('.day-cell:not(.other-month)').forEach(cell => {
    cell.addEventListener('click', () => {
      const ds = cell.dataset.date;
      selectedDate = new Date(ds+'T00:00:00');
      renderCalendar();
      renderDayEvents(selectedDate);
    });
  });

  if (selectedDate) renderDayEvents(selectedDate);
}

function renderDayEvents(date) {
  const dayEvents = events.filter(e => sameDay(e.date, date));
  if (dayEvents.length === 0) {
    dom.dayEvents.innerHTML = '<p style="text-align:center;color:var(--text-muted);font-size:13px;padding:12px;">这天没有日程</p>';
    return;
  }
  dom.dayEvents.innerHTML = dayEvents.map(ev => `
    <div class="event-row" data-id="${ev.id}" onclick="editEvent('${ev.id}')" style="margin-top:4px;">
      <span class="event-color-dot" style="background:${catColor(ev.cat||'default')}"></span>
      <div class="event-info">
        <div class="event-title">${esc(ev.title)}</div>
        <div class="event-time-label">${fmtTm(ev.date)}</div>
      </div>
      <span class="event-check">›</span>
    </div>
  `).join('');
}

// ═════════════════════════════════
//  周视图
// ═════════════════════════════════
function getMondayOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // Mon = start
  d.setDate(d.getDate() + diff);
  d.setHours(0,0,0,0);
  return d;
}

function switchCalView(view) {
  calView = view;
  dom.viewBtns().forEach(b => b.classList.toggle('active', b.dataset.view === view));
  if (view === 'month') {
    dom.calendarWrap.classList.remove('hidden');
    dom.weekView.classList.add('hidden');
    dom.dayEvents.classList.remove('hidden');
    renderCalendar();
  } else {
    dom.calendarWrap.classList.add('hidden');
    dom.weekView.classList.remove('hidden');
    dom.dayEvents.classList.add('hidden');
    if (!weekStart) weekStart = getMondayOfWeek(currentDate);
    renderWeek();
  }
}

const HOUR_HEIGHT = 48;
const VISIBLE_START = 6;  // 6AM
const VISIBLE_END = 23;   // 11PM
const VISIBLE_HOURS = VISIBLE_END - VISIBLE_START;

function renderWeek() {
  if (!weekStart) weekStart = getMondayOfWeek(currentDate);
  const ws = weekStart;

  // 更新标题
  const we = new Date(ws); we.setDate(we.getDate() + 6);
  const sm = ws.getMonth() + 1, sd = ws.getDate();
  const em = we.getMonth() + 1, ed = we.getDate();
  dom.monthTitle.textContent = sm === em
    ? `${ws.getFullYear()}年${sm}月${sd}-${ed}日`
    : `${ws.getFullYear()}年${sm}月${sd}日 - ${em}月${ed}日`;

  const today = new Date();
  const days = '日一二三四五六';
  const hours = Array.from({length: VISIBLE_HOURS}, (_, i) => i + VISIBLE_START);

  // 表头
  let headerHtml = '<div class="wh-time-gutter"></div>';
  for (let i = 0; i < 7; i++) {
    const d = new Date(ws); d.setDate(d.getDate() + i);
    const isToday = sameDay(d, today);
    headerHtml += `<div class="week-header-cell${isToday ? ' today' : ''}">
      ${days[d.getDay()]}<br><span class="wh-day">${d.getMonth()+1}/${d.getDate()}</span>
    </div>`;
  }
  dom.weekHeader.innerHTML = headerHtml;

  // 表体
  let bodyHtml = '';
  for (const h of hours) {
    bodyHtml += `<div class="wh-hour-label">${String(h).padStart(2,'0')}:00</div>`;
    for (let i = 0; i < 7; i++) {
      const d = new Date(ws); d.setDate(d.getDate() + i);
      const isToday = sameDay(d, today);
      bodyHtml += `<div class="wh-slot${isToday ? ' today-col' : ''}" data-date="${fmt(d)}" data-hour="${h}"></div>`;
    }
  }
  dom.weekBody.innerHTML = bodyHtml;

  // 收集本周事件
  const weekEnd = new Date(ws); weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEvents = events.filter(e => e.date < weekEnd && (e.endDate || calcEndTime(e.date)) >= ws);

  // 按天+重叠分组
  const dayColumns = Array.from({length: 7}, () => []);

  for (const ev of weekEvents) {
    const evStart = ev.date;
    const evEnd = ev.endDate || calcEndTime(evStart);
    const dayIdx = Math.floor((evStart - ws) / 86400000);
    if (dayIdx < 0 || dayIdx > 6) continue;

    // 裁剪到可见范围
    const visibleStart = Math.max(evStart.getHours() + evStart.getMinutes()/60, VISIBLE_START);
    const visibleEnd = Math.min(evEnd.getHours() + evEnd.getMinutes()/60, VISIBLE_END);
    if (visibleEnd <= visibleStart) continue;

    const topPx = (visibleStart - VISIBLE_START) * HOUR_HEIGHT;
    const heightPx = (visibleEnd - visibleStart) * HOUR_HEIGHT;
    const color = catColor(ev.cat || 'default');

    dayColumns[dayIdx].push({ ev, topPx, heightPx, color, visibleStart, visibleEnd });
  }

  // 处理每天的重叠事件
  for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
    const colEvents = dayColumns[dayIdx];
    if (colEvents.length === 0) continue;

    // 按开始时间排序
    colEvents.sort((a, b) => a.visibleStart - b.visibleStart);

    // 简单重叠检测：分配列
    const lanes = [];
    for (const item of colEvents) {
      let placed = false;
      for (let l = 0; l < lanes.length; l++) {
        const last = lanes[l][lanes[l].length - 1];
        if (last.visibleEnd <= item.visibleStart) {
          lanes[l].push(item);
          item.lane = l;
          placed = true;
          break;
        }
      }
      if (!placed) {
        lanes.push([item]);
        item.lane = lanes.length - 1;
      }
    }
    const totalLanes = lanes.length;

    // 渲染
    for (const item of colEvents) {
      const d = new Date(ws); d.setDate(d.getDate() + dayIdx);
      // 找到第一个 slot
      const startHour = Math.floor(item.visibleStart);
      const slotEl = dom.weekBody.querySelector(`[data-date="${fmt(d)}"][data-hour="${startHour}"]`);
      if (!slotEl) continue;

      const laneWidth = totalLanes > 0 ? (100 / totalLanes) : 100;
      const laneLeft = (item.lane || 0) * laneWidth;

      const el = document.createElement('div');
      el.className = 'wh-event';
      el.style.cssText = [
        `top:${item.topPx}px`,
        `height:${Math.max(item.heightPx, 18)}px`,
        `background:${item.color}`,
        `left:${laneLeft + 1}%`,
        `width:${laneWidth - 2}%`,
      ].join(';');
      el.textContent = item.ev.title;
      el.title = `${item.ev.title} · ${fmtTm(item.ev.date)}-${fmtTm(item.ev.endDate||calcEndTime(item.ev.date))}`;
      el.addEventListener('click', (e) => { e.stopPropagation(); editEvent(item.ev.id); });
      slotEl.appendChild(el);
    }
  }

  // 点击空白格 — 快速添加
  dom.weekBody.querySelectorAll('.wh-slot').forEach(slot => {
    slot.addEventListener('click', function(e) {
      if (e.target.classList.contains('wh-event')) return;
      const ds = this.dataset.date;
      const h = parseInt(this.dataset.hour);
      const date = new Date(ds + 'T00:00:00');
      date.setHours(h, 0, 0, 0);
      openModal(date);
    });
  });
}

// ═════════════════════════════════
//  倒计时
// ═════════════════════════════════
function renderCountdown() {
  const now = new Date();
  const upcoming = events.filter(e => e.date>=now || sameDay(e.date,now)).sort((a,b)=>a.date-b.date);

  if (upcoming.length===0) {
    dom.countdownList.innerHTML = `<div class="empty-state">
      <div class="empty-icon-wrap">⏳</div><p class="empty-title">没有倒计时</p><p class="empty-desc">添加日程后自动显示</p>
    </div>`;
    return;
  }

  dom.countdownList.innerHTML = upcoming.slice(0,15).map(ev => {
    const diff = ev.date - now;
    const isPast = diff < 0;
    let cdStr, icon='📅';
    if (isPast) { cdStr='已过'; icon='✅'; }
    else {
      const abs=Math.abs(diff);
      const d=Math.floor(abs/86400000), h=Math.floor((abs%86400000)/3600000), m=Math.floor((abs%3600000)/60000);
      if (d>30) { cdStr=Math.floor(d/30)+'月'; icon='🗓️'; }
      else if (d>0) { cdStr=d+'天'; icon='📅'; }
      else if (h>0) { cdStr=h+'时'+m+'分'; icon='⏳'; }
      else if (m>0) { cdStr=m+'分'; icon='🔔'; }
      else { cdStr='现在'; icon='🚨'; }
    }
    const isUrgent = diff>0 && diff<86400000;
    return `<div class="cd-card${isPast?' past':''}" data-id="${ev.id}" onclick="editEvent('${ev.id}')">
      <span class="cd-icon">${icon}</span>
      <div class="cd-info"><div class="cd-title">${esc(ev.title)}</div><div class="cd-date">${fmtCN(ev.date)} ${fmtTm(ev.date)}</div></div>
      <span class="cd-time${isUrgent?' urgent':''}">${cdStr}</span>
    </div>`;
  }).join('');
}

// ═════════════════════════════════
//  CRUD
// ═════════════════════════════════
function genId() { return 'ev_'+Date.now()+'_'+Math.random().toString(36).slice(2,8); }
let selectedCat = 'default';

function addEvent(title, date, note='', cat='default', endDate=null) {
  events.push({ id:genId(), title, date:new Date(date), endDate:endDate?new Date(endDate):null, note, cat, createdAt:new Date(), _n30:false,_n10:false,_n5:false,_n0:false });
  saveEvents();
  refreshAll();
  autoSync();
  toast('已添加');
}

function updateEvent(id, title, date, note, cat, endDate) {
  const ev = events.find(e=>e.id===id);
  if (!ev) return;
  ev.title=title; ev.date=new Date(date); ev.endDate=endDate?new Date(endDate):null; ev.note=note; ev.cat=cat;
  saveEvents();
  refreshAll();
  autoSync();
  toast('已更新');
}

function deleteEvent(id) {
  events = events.filter(e=>e.id!==id);
  saveEvents();
  closeModal();
  refreshAll();
  autoSync();
  toast('已删除');
}

window.editEvent = id => {
  const ev = events.find(e=>e.id===id);
  if (!ev) return;
  openModal(ev.date, ev);
};

// ── 弹窗 ──
function renderCatPicker() {
  const picker = document.getElementById('catPicker');
  if (!picker) return;
  picker.innerHTML = catList().map(c => `
    <button type="button" class="cat-chip${selectedCat===c.id?' active':''}" data-cat="${c.id}">
      ${c.emoji} ${c.label}
    </button>
  `).join('');
}

function setCatChip(cat) {
  selectedCat = cat;
  renderCatPicker();
}

function fmtTmStr(h,m) { return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`; }

function calcEndTime(startDate) {
  // 默认 +1 小时，取整到半小时
  const end = new Date(startDate);
  end.setHours(end.getHours() + 1);
  end.setMinutes(0,0,0);
  return end;
}

function updateDurationHint() {
  const ds = dom.eventDate.value, ts = dom.eventTime.value, te = dom.eventEndTime.value;
  if (!ds || !ts || !te) { dom.durationHint.textContent = ''; return; }
  const [y,m,d] = ds.split('-').map(Number);
  const [sh,sm] = ts.split(':').map(Number);
  const [eh,em] = te.split(':').map(Number);
  const start = new Date(y,m-1,d,sh,sm);
  const end = new Date(y,m-1,d,eh,em);
  const diffMin = Math.round((end - start) / 60000);
  if (diffMin <= 0) { dom.durationHint.textContent = '⚠️ 结束需晚于开始'; return; }
  if (diffMin < 60) dom.durationHint.textContent = `${diffMin} 分钟`;
  else { const h = Math.floor(diffMin/60), m = diffMin%60; dom.durationHint.textContent = `约 ${h}小时${m?m+'分':''}`; }
}

function openModal(date, existing=null) {
  dom.modalOverlay.classList.remove('hidden');
  if (existing) {
    dom.modalTitle.textContent='编辑日程';
    dom.eventId.value=existing.id;
    dom.eventTitle.value=existing.title;
    dom.eventDate.value=fmt(existing.date);
    dom.eventTime.value=fmtTm(existing.date);
    dom.eventEndTime.value=existing.endDate ? fmtTm(existing.endDate) : fmtTm(calcEndTime(existing.date));
    dom.eventNote.value=existing.note||'';
    setCatChip(existing.cat||'default');
    dom.btnDelete.classList.remove('hidden');
  } else {
    dom.modalTitle.textContent='新日程';
    dom.eventId.value='';
    dom.eventTitle.value='';
    const d = date||new Date();
    dom.eventDate.value=fmt(d);
    dom.eventTime.value=fmtTm(d);
    dom.eventEndTime.value=fmtTm(calcEndTime(d));
    dom.eventNote.value='';
    setCatChip(autoCat(''));
    dom.btnDelete.classList.add('hidden');
  }
  updateDurationHint();
}

// 监听标题输入，自动检测分类
document.addEventListener('DOMContentLoaded', () => {
  const titleInput = document.getElementById('eventTitle');
  if (titleInput) {
    titleInput.addEventListener('input', () => {
      if (!dom.eventId.value) { // only auto-detect when creating new
        const cat = autoCat(titleInput.value);
        setCatChip(cat);
      }
    });
  }
  // 分类选择器点击
  const catPicker = document.getElementById('catPicker');
  if (catPicker) {
    catPicker.addEventListener('click', e => {
      const chip = e.target.closest('.cat-chip');
      if (chip) setCatChip(chip.dataset.cat);
    });
  }
});
function closeModal() {
  dom.modalOverlay.classList.add('hidden');
  dom.extractResults.classList.add('hidden');
}

// ── 提取结果 ──
function showExtractResults(extracted) {
  if (extracted.length===0) {
    dom.extractResults.innerHTML='<p style="text-align:center;color:var(--text-muted);padding:16px;font-size:14px;">🔍 未识别到日期<br><span style="font-size:12px;">试试"明天下午3点开会"这样的格式</span></p>';
    dom.extractResults.classList.remove('hidden');
    return;
  }
  dom.extractResults.innerHTML = extracted.map((item,i)=>`
    <div class="extract-item">
      <div class="event-info"><span class="event-date">${fmtCN(item.date)} ${fmtTm(item.date)}</span><span class="event-label">${esc(item.text)}</span></div>
      <button class="btn-add" data-idx="${i}">+</button>
    </div>
  `).join('');
  dom.extractResults.classList.remove('hidden');
  dom.extractResults.querySelectorAll('.btn-add').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const item=extracted[parseInt(btn.dataset.idx)];
      addEvent(item.text,item.date);
      btn.textContent='✓'; btn.style.background='var(--green)'; btn.disabled=true;
    });
  });
}

// ── AI ──
function updateAiUI() {
  if (settings.useAI && settings.apiKey) {
    dom.btnAiToggle.textContent='AI'; dom.btnAiToggle.classList.add('active');
    dom.currentMode.textContent='AI 提取 (DeepSeek)';
  } else {
    dom.btnAiToggle.textContent='本地'; dom.btnAiToggle.classList.remove('active');
    dom.currentMode.textContent='本地正则';
  }
}

// ── 今日概览 ──
function renderDigest() {
  const now = new Date();
  const today = events.filter(e => sameDay(e.date, now)).sort((a,b) => a.date - b.date);
  const tomorrowStart = new Date(now); tomorrowStart.setDate(tomorrowStart.getDate()+1); tomorrowStart.setHours(0,0,0,0);
  const tomorrowEnd = new Date(tomorrowStart); tomorrowEnd.setDate(tomorrowEnd.getDate()+1);
  const tomorrow = events.filter(e => e.date >= tomorrowStart && e.date < tomorrowEnd).sort((a,b) => a.date - b.date);

  dom.digestDate.textContent = `${now.getMonth()+1}月${now.getDate()}日`;

  // Today body
  if (today.length === 0) {
    dom.digestBody.innerHTML = '<p class="digest-empty">今天没有日程 ☀️</p>';
  } else {
    const show = today.slice(0, 3);
    const overflow = today.length - 3;
    dom.digestBody.innerHTML = show.map(e => `
      <div class="digest-item" data-id="${e.id}" onclick="editEvent('${e.id}')">
        <span class="digest-dot" style="background:${catColor(e.cat||'default')}"></span>
        <span class="digest-item-title">${esc(e.title)}</span>
        <span class="digest-item-time">${fmtTm(e.date)}</span>
      </div>
    `).join('') + (overflow > 0 ? `<p class="digest-overflow">还有 ${overflow} 个日程...</p>` : '');
  }

  // Tomorrow footer
  if (tomorrow.length === 0) {
    dom.digestFooter.classList.add('hidden');
  } else {
    dom.digestFooter.classList.remove('hidden');
    const tmr = tomorrow[0];
    dom.digestTomorrow.textContent = `${tmr.title} · ${fmtTm(tmr.date)}${tomorrow.length>1?` 等${tomorrow.length}个` : ''}`;
  }
}

// ── 早安通知 ──
let morningBriefed = false;
function morningBriefing() {
  const h = new Date().getHours();
  if (h >= 8 && h <= 11 && !morningBriefed && 'Notification' in window && Notification.permission === 'granted') {
    const today = events.filter(e => sameDay(e.date, new Date()));
    if (today.length > 0) {
      const titles = today.slice(0, 3).map(e => `${fmtTm(e.date)} ${e.title}`).join(' · ');
      new Notification('☀️ 早安！今日概览', { body: titles + (today.length > 3 ? ` ...等${today.length}个日程` : ''), tag: 'morning-brief' });
    }
    morningBriefed = true;
  }
  // 中午后重置，第二天再发
  if (h >= 13) morningBriefed = false;
}

// ── 分类筛选 ──
let activeFilter = 'all';

function renderFilterBar() {
  const bar = document.getElementById('filterBar');
  if (!bar) return;
  const cats = [{id:'all',label:'全部',emoji:'',color:'var(--text-muted)'}, ...catList()];
  bar.innerHTML = cats.map(c => `
    <button class="filter-chip${activeFilter===c.id?' active':''}" data-cat="${c.id}">
      ${c.id!=='all'?`<span class="fchip-dot" style="background:${c.color}"></span>`:''}${c.emoji} ${c.label}
    </button>
  `).join('');

  bar.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      activeFilter = chip.dataset.cat;
      renderFilterBar();
      renderSchedule();
    });
  });
}

function filterEvents(list) {
  if (activeFilter === 'all') return list;
  return list.filter(e => (e.cat || 'default') === activeFilter);
}

// ── 分类管理 ──
function renderCatManage() {
  const el = document.getElementById('catManage');
  if (!el) return;
  el.innerHTML = catList()
    .filter(c => c.id !== 'default')
    .map(c => `
    <div class="cat-row">
      <span class="cat-dot" style="background:${c.color}"></span>
      <span class="cat-label">${c.emoji} ${c.label}</span>
      <button class="cat-del" data-id="${c.id}">✕</button>
    </div>
  `).join('');

  el.querySelectorAll('.cat-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      delete categories[id];
      // 将该分类的日程归为 default
      events.forEach(e => { if (e.cat === id) e.cat = 'default'; });
      saveCategories();
      saveEvents();
      renderCatManage();
      renderFilterBar();
      renderCatPicker();
      refreshAll();
    });
  });
}

function addCustomCategory() {
  const labelInput = document.getElementById('newCatLabel');
  const colorInput = document.getElementById('newCatColor');
  const label = labelInput.value.trim();
  if (!label) { toast('请输入分类名称'); return; }
  const id = 'cat_' + Date.now();
  const color = colorInput.value;
  const bg = color + '22'; // 8-digit hex with alpha
  const emojis = ['📋','🎯','🎓','✈️','❤️','🎵','📚','🏃','🍔','💡','🎁','🏖️'];
  const emoji = emojis[Object.keys(categories).length % emojis.length];
  categories[id] = { id, label, emoji, color, bg };
  saveCategories();
  labelInput.value = '';
  renderCatManage();
  renderFilterBar();
  renderCatPicker();
  toast(`已添加「${label}」`);
}

// ── 云同步（GitHub Gist）──
const GIST_API = 'https://api.github.com/gists';
const GIST_DESC = 'schedule-app-data';
let syncBusy = false;

function updateSyncUI() {
  if (!dom.syncStatus) return;
  if (settings.gistId && settings.syncToken) {
    dom.syncStatus.textContent = `已配置 · ${new Date(settings.lastSync).toLocaleString('zh-CN').slice(5)}`;
    dom.syncStatus.className = 'sync-status synced';
  } else if (settings.syncToken) {
    dom.syncStatus.textContent = '点击同步创建';
    dom.syncStatus.className = 'sync-status';
  } else {
    dom.syncStatus.textContent = '未配置';
    dom.syncStatus.className = 'sync-status';
  }
}

// 查找已有 Gist（跨设备时自动发现）
async function findExistingGist() {
  try {
    const resp = await fetch(`${GIST_API}?per_page=50`, {
      headers: { Authorization: `Bearer ${settings.syncToken}` },
    });
    if (!resp.ok) return null;
    const gists = await resp.json();
    const found = gists.find(g =>
      g.description === GIST_DESC &&
      g.files && g.files['schedule-data.json']
    );
    return found ? found.id : null;
  } catch { return null; }
}

async function syncPush(silent = true) {
  if (!settings.syncToken || syncBusy) return;
  syncBusy = true;
  try {
    // 如果没有 gistId，先查找已有的
    if (!settings.gistId) {
      const existing = await findExistingGist();
      if (existing) settings.gistId = existing;
    }

    const payload = {
      description: GIST_DESC,
      public: false,
      files: {
        'schedule-data.json': {
          content: JSON.stringify({
            events: events.map(e => ({
              ...e,
              date: e.date.toISOString(),
              endDate: e.endDate?.toISOString() || null,
              createdAt: e.createdAt?.toISOString() || null,
            })),
            categories,
            updatedAt: Date.now(),
          }),
        },
      },
    };

    const method = settings.gistId ? 'PATCH' : 'POST';
    const url = settings.gistId ? `${GIST_API}/${settings.gistId}` : GIST_API;

    const resp = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${settings.syncToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      if (resp.status === 401) throw new Error('Token 无效或缺少 gist 权限');
      if (resp.status === 404) { settings.gistId = ''; saveSettings(); throw new Error('Gist 已删除，请重新同步'); }
      throw new Error(`同步失败 (${resp.status})`);
    }

    const data = await resp.json();
    if (!settings.gistId) {
      settings.gistId = data.id;
    }
    settings.lastSync = Date.now();
    saveSettings();
    updateSyncUI();
    if (!silent) toast('☁️ 已同步到云端');
  } catch (err) {
    if (!silent) toast('❌ ' + err.message);
    if (dom.syncStatus) { dom.syncStatus.textContent = err.message; dom.syncStatus.className = 'sync-status error'; }
  } finally {
    syncBusy = false;
  }
}

async function syncPull(silent = true) {
  if (!settings.syncToken || !settings.gistId || syncBusy) return;
  syncBusy = true;
  try {
    const resp = await fetch(`${GIST_API}/${settings.gistId}`, {
      headers: { Authorization: `Bearer ${settings.syncToken}` },
    });
    if (!resp.ok) {
      if (resp.status === 404) { settings.gistId = ''; saveSettings(); updateSyncUI(); return; }
      throw new Error(`拉取失败 (${resp.status})`);
    }

    const data = await resp.json();
    const file = data.files?.['schedule-data.json'];
    if (!file?.content) return;

    const remote = JSON.parse(file.content);
    const remoteTime = remote.updatedAt || 0;

    // 远程不比本地新，跳过
    if (remoteTime <= settings.lastSync) return;

    // 合并数据（以远程为准）
    events = (remote.events || []).map(e => ({
      ...e,
      date: new Date(e.date),
      endDate: e.endDate ? new Date(e.endDate) : null,
      createdAt: e.createdAt ? new Date(e.createdAt) : new Date(),
      _n30: false, _n10: false, _n5: false, _n0: false,
    }));

    if (remote.categories) {
      categories = remote.categories;
      saveCategories();
    }

    saveEvents();
    settings.lastSync = remoteTime;
    saveSettings();
    updateSyncUI();
    refreshAll();
    if (!silent) toast('☁️ 已从云端同步');
  } catch (err) {
    if (!silent) console.warn('Sync pull:', err);
  } finally {
    syncBusy = false;
  }
}

async function syncNow() {
  if (!settings.syncToken) {
    toast('请先填写 GitHub Token（需要勾选 gist 权限）');
    return;
  }
  dom.btnSyncNow.textContent = '⏳...';
  dom.btnSyncNow.disabled = true;
  try {
    // 先拉取远程数据
    if (settings.gistId) {
      await syncPull(true);
    } else {
      // 新设备：尝试查找已有 Gist
      const existing = await findExistingGist();
      if (existing) {
        settings.gistId = existing;
        saveSettings();
        await syncPull(false);
      }
    }
    // 再推送本地数据
    await syncPush(false);
  } finally {
    dom.btnSyncNow.textContent = '🔄 立即同步';
    dom.btnSyncNow.disabled = false;
  }
}

function autoSync() {
  if (settings.syncToken) syncPush(true);
}

async function initSync() {
  if (dom.syncTokenInput) dom.syncTokenInput.value = settings.syncToken || '';
  updateSyncUI();
  if (settings.syncToken && settings.gistId) {
    await syncPull(true);
  } else if (settings.syncToken && !settings.gistId) {
    // 新设备：尝试自动发现已有 Gist
    const existing = await findExistingGist();
    if (existing) {
      settings.gistId = existing;
      saveSettings();
      await syncPull(true);
    }
  }
}

// ── 刷新全部 ──
function refreshAll() {
  renderHero();
  renderDigest();
  renderFilterBar();
  if (activeTab==='schedule') renderSchedule();
  if (activeTab==='calendar' && calView==='month') renderCalendar();
  if (activeTab==='calendar' && calView==='week') renderWeek();
  if (activeTab==='countdown') renderCountdown();
}

// ── 递进式强提醒 ──
const NOTIFY_STAGES = [
  { label: '30分钟后开始', emoji: '📅', minutes: 30, flag: '_n30', urgent: false },
  { label: '10分钟后开始', emoji: '⏰', minutes: 10, flag: '_n10', urgent: true  },
  { label: '5分钟！',       emoji: '⚠️', minutes: 5,  flag: '_n5',  urgent: true  },
  { label: '就是现在！',    emoji: '🔔', minutes: 0,  flag: '_n0',  urgent: true  },
];

function checkNotifications() {
  if (!('Notification' in window) || Notification.permission!=='granted') return;
  const now = new Date();

  for (const ev of events) {
    const diff = ev.date - now;
    if (diff <= 0) continue; // skip past events

    for (const stage of NOTIFY_STAGES) {
      if (diff <= stage.minutes * 60 * 1000 && !ev[stage.flag]) {
        const opts = {
          body: `「${ev.title}」${stage.label}`,
          tag: `${ev.id}-${stage.flag}`,
          requireInteraction: stage.urgent,
          vibrate: stage.urgent ? [200, 100, 200] : undefined,
        };
        new Notification(`${stage.emoji} ${stage.urgent ? ev.title : '日程提醒'}`, opts);
        ev[stage.flag] = true;
        break; // only fire one stage per cycle
      }
    }
  }
}

// ── 导出导入 ──
function exportData() {
  const data=JSON.stringify(events.map(e=>({
    ...e,
    date:e.date.toISOString(),
    endDate:e.endDate?.toISOString()||null,
    createdAt:e.createdAt?.toISOString()||null,
  })),null,2);
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([data])); a.download='schedule_'+fmt(new Date())+'.json'; a.click();
  toast('已导出');
}
function importData(file) {
  const r=new FileReader();
  r.onload=e=>{
    try {
      const data=JSON.parse(e.target.result); if(!Array.isArray(data)) throw 0;
      events.push(...data.map(x=>({
        ...x,
        date:new Date(x.date),
        endDate:x.endDate?new Date(x.endDate):null,
        createdAt:x.createdAt?new Date(x.createdAt):new Date(),
        _n30:false,_n10:false,_n5:false,_n0:false,
      })));
      saveEvents(); refreshAll(); toast(`导入了 ${data.length} 条`);
    } catch { toast('格式错误'); }
  };
  r.readAsText(file);
}

// ═════════════════════════════════
//  事件绑定
// ═════════════════════════════════
function bind() {
  // Hero 卡片 — 点击跳转编辑
  dom.heroCard.addEventListener('click', () => {
    const now = new Date();
    const next = events.filter(e => e.date >= now).sort((a,b) => a.date - b.date)[0];
    if (next) editEvent(next.id);
  });

  // 标签切换
  dom.tabBar.addEventListener('click', e => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    switchTab(tab.dataset.tab);
  });

  // 触屏滑动切换
  const main = $('.main-content');
  main.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, {passive:true});
  main.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
    const tabs = ['schedule','calendar','countdown'];
    const idx = tabs.indexOf(activeTab);
    if (dx < 0 && idx < 2) switchTab(tabs[idx+1]);
    if (dx > 0 && idx > 0) switchTab(tabs[idx-1]);
  });

  // 月份/周切换
  dom.btnPrevMonth.addEventListener('click',()=>{
    if (calView==='week') { weekStart.setDate(weekStart.getDate()-7); renderWeek(); }
    else { currentDate.setMonth(currentDate.getMonth()-1); renderCalendar(); }
  });
  dom.btnNextMonth.addEventListener('click',()=>{
    if (calView==='week') { weekStart.setDate(weekStart.getDate()+7); renderWeek(); }
    else { currentDate.setMonth(currentDate.getMonth()+1); renderCalendar(); }
  });
  dom.btnToday.addEventListener('click',()=>{
    currentDate=new Date(); selectedDate=null;
    if (calView==='week') { weekStart=getMondayOfWeek(new Date()); renderWeek(); }
    else renderCalendar();
  });

  // 视图切换
  dom.viewBtns().forEach(btn => {
    btn.addEventListener('click', () => switchCalView(btn.dataset.view));
  });

  // FAB
  dom.fabAdd.addEventListener('click',()=>{ selectedDate=new Date(); openModal(new Date()); });

  // 提取
  dom.btnExtract.addEventListener('click', async ()=>{
    const text = dom.pasteInput.value.trim();
    if (!text) { toast('请先粘贴文字'); return; }
    if (settings.useAI && settings.apiKey) {
      dom.btnExtract.textContent='分析中...'; dom.btnExtract.style.opacity='0.7';
      try {
        const extracted = await aiExtractEvents(text, settings.apiKey);
        showExtractResults(extracted);
        toast(`AI 找到 ${extracted.length} 个日程`);
      } catch(err) {
        toast('❌ '+err.message);
        dom.extractResults.innerHTML=`<p style="text-align:center;color:var(--red);padding:12px;font-size:14px;">${esc(err.message)}</p>`;
        dom.extractResults.classList.remove('hidden');
      }
      dom.btnExtract.textContent='智能提取'; dom.btnExtract.style.opacity='';
      return;
    }
    const extracted = extractEvents(text);
    showExtractResults(extracted);
    if (extracted.length===0) toast('未识别到日期');
    else toast(`找到 ${extracted.length} 个日程`);
  });

  // 粘贴自动提取
  // 粘贴 — 支持文字和图片
  dom.pasteInput.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (items) {
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const blob = item.getAsFile();
          const reader = new FileReader();
          reader.onload = ev => showImagePreview(ev.target.result);
          reader.readAsDataURL(blob);
          return;
        }
      }
    }
    // 文字粘贴
    setTimeout(()=>{
      const text=dom.pasteInput.value.trim();
      if (text.length>20) { const r=extractEvents(text); if(r.length>0) showExtractResults(r); }
    },200);
  });

  // OCR 按钮
  dom.btnOCR.addEventListener('click', runOCR);
  dom.imgPreviewClose.addEventListener('click', clearImagePreview);

  // 上传 — 支持 txt 和图片
  dom.btnUpload.addEventListener('click',()=>dom.fileInput.click());
  dom.fileInput.addEventListener('change',e=>{
    const f=e.target.files[0]; if(!f) return;
    if (f.type.startsWith('image/')) {
      const r=new FileReader(); r.onload=ev=>showImagePreview(ev.target.result); r.readAsDataURL(f);
    } else {
      const r=new FileReader(); r.onload=ev=>{ dom.pasteInput.value=ev.target.result; toast('文件已读取'); }; r.readAsText(f);
    }
    e.target.value='';
  });

  // 表单提交
  dom.eventForm.addEventListener('submit',e=>{
    e.preventDefault();
    const id=dom.eventId.value, title=dom.eventTitle.value.trim(), ds=dom.eventDate.value;
    const ts=dom.eventTime.value||'09:00', te=dom.eventEndTime.value||'';
    if (!title||!ds) { toast('请填写名称和日期'); return; }
    const [y,m,d]=ds.split('-').map(Number);
    const [sh,sm]=ts.split(':').map(Number);
    const date=new Date(y,m-1,d,sh,sm);
    if (isNaN(date.getTime())) { toast('日期无效'); return; }
    let endDate=null;
    if (te) {
      const [eh,em]=te.split(':').map(Number);
      endDate=new Date(y,m-1,d,eh,em);
      if (endDate<=date) endDate=calcEndTime(date);
    }
    const cat = selectedCat || 'default';
    if (id) updateEvent(id,title,date,dom.eventNote.value.trim(),cat,endDate);
    else addEvent(title,date,dom.eventNote.value.trim(),cat,endDate);
    closeModal();
  });

  // 时间变更时更新时长提示
  [dom.eventTime, dom.eventEndTime, dom.eventDate].forEach(el => {
    if (el) el.addEventListener('change', updateDurationHint);
  });
  dom.btnDelete.addEventListener('click',()=>{ if(confirm('删除？')) deleteEvent(dom.eventId.value); });
  dom.btnCancel.addEventListener('click',closeModal);
  dom.modalOverlay.addEventListener('click',e=>{ if(e.target===dom.modalOverlay) closeModal(); });

  // 设置
  const openSettings = () => {
    dom.apiKeyInput.value=settings.apiKey||'';
    if (dom.syncTokenInput) dom.syncTokenInput.value=settings.syncToken||'';
    updateAiUI();
    updateSyncUI();
    renderCatManage();
    dom.settingsOverlay.classList.remove('hidden');
  };
  dom.btnAiToggle.addEventListener('click',()=>{
    if (!settings.apiKey) { openSettings(); return; }
    settings.useAI=!settings.useAI; saveSettings(); updateAiUI();
    toast(settings.useAI?'AI 模式已开启':'已切换本地模式');
  });
  $('#btnSettings')?.addEventListener('click', openSettings);
  dom.btnSettingsClose?.addEventListener('click',()=>dom.settingsOverlay.classList.add('hidden'));

  // 添加自定义分类
  const btnAddCat = document.getElementById('btnAddCat');
  if (btnAddCat) btnAddCat.addEventListener('click', addCustomCategory);

  // 同步
  if (dom.btnSyncNow) dom.btnSyncNow.addEventListener('click', syncNow);
  if (dom.syncTokenInput) {
    dom.syncTokenInput.addEventListener('change', () => {
      settings.syncToken = dom.syncTokenInput.value.trim();
      settings.gistId = ''; // reset gist so new token creates fresh gist
      saveSettings();
      updateSyncUI();
    });
  }
  dom.settingsOverlay.addEventListener('click',e=>{ if(e.target===dom.settingsOverlay) dom.settingsOverlay.classList.add('hidden'); });
  dom.btnSaveSettings.addEventListener('click',()=>{
    const key=dom.apiKeyInput.value.trim();
    if (key && !key.startsWith('sk-')) { toast('API Key 格式不对'); return; }
    settings.apiKey=key;
    if (key) settings.useAI=true;
    // 同步 token
    if (dom.syncTokenInput) settings.syncToken = dom.syncTokenInput.value.trim();
    saveSettings(); updateAiUI(); dom.settingsOverlay.classList.add('hidden');
    toast(key?'AI 已启用':'已切换本地');
    if (settings.syncToken) initSync();
  });
  dom.btnExport.addEventListener('click',exportData);
  dom.btnImport.addEventListener('click',()=>dom.importFileInput.click());
  dom.importFileInput.addEventListener('change',e=>{ if(e.target.files[0]){ importData(e.target.files[0]); e.target.value=''; } });

  // 键盘
  document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ closeModal(); dom.settingsOverlay.classList.add('hidden'); } });

  // 拖放导入
  document.addEventListener('dragover',e=>e.preventDefault());
  document.addEventListener('drop',e=>{
    e.preventDefault();
    const f=e.dataTransfer.files[0];
    if (f?.name.endsWith('.json')) importData(f);
  });
}

// ── 初始化 ──
function init() {
  loadSettings();
  loadCategories();
  loadEvents();
  initSync();
  updateGreeting();
  renderHero();
  renderDigest();
  renderFilterBar();
  switchTab('schedule');
  bind();

  if ('Notification' in window && Notification.permission==='default') Notification.requestPermission();

  setInterval(renderHero, 5000);
  setInterval(renderDigest, 30000);
  setInterval(renderCountdown, activeTab==='countdown'?1000:10000);
  setInterval(checkNotifications, 30000);
  setInterval(morningBriefing, 60000);

  // 动态刷新倒计时面板
  setInterval(()=>{ if (activeTab==='countdown') renderCountdown(); }, 1000);
}

document.addEventListener('DOMContentLoaded', init);
