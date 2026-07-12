'use strict';
const APP_VERSION = '0.7.0';

const SHANFANG_COPY = {
  daily: [
    { id: 'd01', text: '事過留痕，歲月可尋。', source: 'Whence 原創' },
    { id: 'd02', text: '片語既存，來處可知。', source: 'Whence 原創' },
    { id: 'd03', text: '凡所經歷，皆可留一頁。', source: 'Whence 原創' },
    { id: 'd04', text: '今朝所記，他日自明。', source: 'Whence 原創' },
    { id: 'd05', text: '世事紛至，且記一筆。', source: 'Whence 原創' },
    { id: 'd06', text: '留白亦是今日之事。', source: 'Whence 原創' },
    { id: 'd07', text: '字落於此，時光有憑。', source: 'Whence 原創' },
    { id: 'd08', text: '此刻不言盡，亦可記其梗概。', source: 'Whence 原創' },
    { id: 'd09', text: '小事入冊，歲月不散。', source: 'Whence 原創' },
    { id: 'd10', text: '留存不是挽留，只為回望。', source: 'Whence 原創' },
    { id: 'd11', text: '一事既記，便有可尋之處。', source: 'Whence 原創' },
    { id: 'd12', text: '收此一事，待來日重讀。', source: 'Whence 原創' },
  ],
  empty: {
    task: ['今日諸事，暫可留白。', '案上暫無待辦。'],
    record: ['此頁尚待筆墨。', '今日還未落下一筆。'],
    equipment: ['諸機安然，暫無所記。', '此處暫無機杼之憂。'],
    search: ['遍尋未見其跡。', '此處尚無足跡。'],
    calendar: ['此日仍有餘白。', '行程未至，時光尚寬。'],
  },
  toast: {
    save: ['已收此頁。', '已藏入卷中。'],
    update: ['已續其後。', '已補入舊卷。'],
    delete: ['此頁暫歸舊卷。'],
  },
};

const previousOpenAt = Number(localStorage.getItem('whence_last_open') || 0);
localStorage.setItem('whence_last_open', String(Date.now()));

// ===== 設定 =====
const API_URL = 'https://script.google.com/macros/s/AKfycbxfaA0qyKmyJLJ5m2edJNd1mh2iFpUKvVahDejUHfJoWQ0xc1lj8z6qeIh88jhSQVK5zw/exec';

const STATUS_LABELS = { active: '保留', open: '待處理', doing: '進行中', waiting: '等待中', done: '完成', cancelled: '取消' };
const KIND_LABELS = { note: '記事', idea: '札記', task: '待辦' };
const VIEW_LABELS = { all: '全部', today: '今日', task: '待辦', idea: '札記', note: '記事' };
const EQUIPMENT_STATUS = {
  resolved: { label: '已解決', tone: 'resolved' }, watching: { label: '待觀察', tone: 'watching' },
  waiting_parts: { label: '等料件', tone: 'waiting' }, waiting_customer: { label: '等客戶', tone: 'waiting' },
  waiting_vendor: { label: '等原廠', tone: 'vendor' }, recurring: { label: '持續發生', tone: 'recurring' },
  paused: { label: '暫停處理', tone: 'paused' }, active: { label: '持續發生', tone: 'recurring' },
};

// ===== 狀態（資料真相在 Sheets，此處僅為視圖快取）=====
const state = {
  records: [],
  activeKind: localStorage.getItem('whence_last_kind') || 'note',
  activeView: 'today',
  important: false,
  urgent: false,
  filterTag: '',
  batch: false,
  selected: new Set(),
  attachment: null,
  attachmentPreviewUrl: '',
  photoBusy: false,
  editingId: '',
  editDirty: false,
  editImportant: false,
  editUrgent: false,
  editAttachment: null,
  editRemoveAttachment: false,
  editHadAttachment: false,
  editPhotoBusy: false,
  editSyncCalendar: false,
  editLinkedCalendar: null,
  editCalendarPreviewLoading: false,
  equipmentRecords: [],
  equipmentAttachment: null,
  equipmentPhotoBusy: false,
  activeScreen: 'records',
  equipmentEditingId: '',
  equipmentEditAttachment: null,
  equipmentEditRemoveAttachment: false,
  equipmentEditHadAttachment: false,
  calendarRecords: [],
  calendarCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  calendarSelected: new Date(),
  calendarView: 'month',
  customerAliases: {},
  occasionChecked: false,
};

// secret 僅為連線憑證（非資料），存 localStorage 免重複輸入
const getSecret = () => localStorage.getItem('whence_secret') || '';
const setSecret = (s) => localStorage.setItem('whence_secret', s);

// ===== API =====
async function apiGet(params = {}) {
  const q = new URLSearchParams({ secret: getSecret(), ...params });
  const res = await fetch(`${API_URL}?${q}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || '未知錯誤');
  return json.data;
}

async function apiPost(action, data = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' }, // simple request，避開 CORS preflight
    body: JSON.stringify({ secret: getSecret(), action, data }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || '未知錯誤');
  return json.data;
}

/** 分頁讀取完整清單；若暫時連到不支援 offset 的舊後端，偵測重複頁後安全停止。 */
async function fetchAllRecords() {
  const pageSize = 200;
  const all = [];
  const seen = new Set();

  for (let offset = 0; ; offset += pageSize) {
    const page = await apiGet({ action: 'list', limit: pageSize, offset });
    let added = 0;
    page.forEach((record) => {
      if (seen.has(record.id)) return;
      seen.add(record.id);
      all.push(record);
      added += 1;
    });

    if (page.length < pageSize || added === 0) break;
  }
  return all;
}

// ===== DOM 工具 =====
const $ = (sel) => document.querySelector(sel);
const escapeHtml = (s) => String(s).replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function parseAttachments(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const value = JSON.parse(String(raw));
    return Array.isArray(value) ? value : [];
  } catch (_) {
    return [];
  }
}

function textHash(value) { return [...String(value)].reduce((sum, char) => ((sum * 31) + char.charCodeAt(0)) >>> 0, 7); }
function pickCopy(items, seed) { return items[textHash(seed) % items.length]; }
function emptyNote(category) { const items = SHANFANG_COPY.empty[category] || SHANFANG_COPY.empty.record; return pickCopy(items, `${category}-${new Date().toDateString()}`); }

function renderShanfangDaily() {
  const day = new Date();
  const seed = `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`;
  $('#shanfang-daily').textContent = pickCopy(SHANFANG_COPY.daily, seed).text;
}

function showOccasionIfNeeded(count) {
  if (state.occasionChecked) return;
  state.occasionChecked = true;
  const milestoneCopy = { 1: '第一筆已留下 · 此事有了來處。', 100: '已留下百筆 · 許多細節因而未曾走失。', 1000: '已成千筆 · 來時之路仍清晰可辨。' };
  if (milestoneCopy[count] && !localStorage.getItem(`whence_milestone_${count}`)) {
    localStorage.setItem(`whence_milestone_${count}`, 'shown');
    toast(milestoneCopy[count], false);
    return;
  }
  const awayDays = previousOpenAt ? (Date.now() - previousOpenAt) / 86400000 : 0;
  if (awayDays >= 14 && !localStorage.getItem(`whence_return_${new Date(previousOpenAt).toDateString()}`)) {
    localStorage.setItem(`whence_return_${new Date(previousOpenAt).toDateString()}`, 'shown');
    toast(pickCopy(['好久不見，山房依舊。', '又見故人，今日仍可留下一筆。'], new Date().toDateString()), false);
  }
}

function toastNoteFor(message) {
  let category = '';
  if (/刪除|最近刪除/.test(message)) category = 'delete';
  else if (/更新|修改|轉為|復原/.test(message)) category = 'update';
  else if (/儲存|建立|留下/.test(message)) category = 'save';
  if (!category) return '';
  const items = SHANFANG_COPY.toast[category];
  const lastKey = `whence_last_copy_${category}`;
  const last = localStorage.getItem(lastKey);
  const choices = items.filter((item) => item !== last);
  const picked = choices[Math.floor(Math.random() * choices.length)] || items[0];
  localStorage.setItem(lastKey, picked);
  return picked;
}

let toastTimer;
function toast(msg, withNote = true) {
  const el = $('#toast');
  const note = withNote ? toastNoteFor(msg) : '';
  el.textContent = note ? `${msg} · ${note}` : msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 1900);
}

// ===== 清單 =====
async function loadList() {
  $('#list').setAttribute('aria-busy', 'true');
  $('#list').innerHTML = '<p class="empty">載入中…</p>';
  try {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 8);
    const [records, calendarRecords, equipmentRecords] = await Promise.all([
      fetchAllRecords(),
      apiGet({ action: 'calendar_live', start: monthStart.toISOString(), end: monthEnd.toISOString() }).catch(() => []),
      apiGet({ action: 'equipment_list' }).catch(() => []),
    ]);
    state.records = records;
    state.calendarRecords = calendarRecords;
    state.equipmentRecords = equipmentRecords;
    renderTagChips();
    renderSpaceOptions();
    renderList();
    showOccasionIfNeeded(records.length);
    updateAppBadge();
  } catch (err) {
    $('#list').innerHTML = `<p class="empty">載入失敗：${escapeHtml(err.message)}</p>`;
    if (String(err.message).includes('secret')) openSettings('請輸入正確的 SECRET');
  } finally {
    $('#list').setAttribute('aria-busy', 'false');
  }
}

function visibleRecords() {
  const kw = $('#search').value.trim().toLowerCase();
  const fSpace = $('#filter-space').value;
  const fStatus = $('#filter-status').value;
  const today = new Date();
  const isToday = (value) => {
    const date = new Date(value);
    return !isNaN(date) && date.getFullYear() === today.getFullYear()
      && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
  };
  return state.records.filter((r) => {
    const kind = r.kind || (r.type === 'todo' ? 'task' : 'note');
    if (state.activeView === 'today' && !isToday(r.created_at) && !isToday(r.due_date)) return false;
    if (['task', 'idea', 'note'].includes(state.activeView) && kind !== state.activeView) return false;
    if (state.activeView === 'task' && ['done', 'cancelled'].includes(r.status)) return false;
    if (fSpace && String(r.space || '') !== fSpace) return false;
    if (fStatus && r.status !== fStatus) return false;
    if (state.filterTag && !String(r.tags).split(',').map((tag) => tag.trim().toLowerCase()).includes(state.filterTag)) return false;
    if (kw && !`${r.content} ${r.tags} ${r.space || ''}`.toLowerCase().includes(kw)) return false;
    return true;
  });
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return String(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDue(r) {
  if (!r.due_date) return '';
  const d = new Date(r.due_date);
  if (isNaN(d)) return String(r.due_date);
  const base = `${d.getMonth() + 1}/${d.getDate()}`;
  if (r.all_day === 'Y') return `${base} 全天`;
  const pad = (n) => String(n).padStart(2, '0');
  return `${base} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderRecordCards(rows) {
  return rows.map((r) => {
    const kind = r.kind || (r.type === 'todo' ? 'task' : 'note');
    const done = r.status === 'done';
    const tags = String(r.tags || '').split(',').filter(Boolean)
      .map((t) => `<span class="item-tag">#${escapeHtml(t)}</span>`).join(' ');
    const statusOptions = Object.entries(STATUS_LABELS)
      .map(([v, label]) => `<option value="${v}"${r.status === v ? ' selected' : ''}>${label}</option>`).join('');
    const attachment = parseAttachments(r.attachments)[0];
    const checkbox = state.batch
      ? `<input type="checkbox" aria-label="選取：${escapeHtml(r.content)}" ${state.selected.has(r.id) ? 'checked' : ''} data-act="select">`
      : kind === 'task'
        ? `<input type="checkbox" aria-label="${done ? '重新開啟' : '標示完成'}：${escapeHtml(r.content)}" ${done ? 'checked' : ''} data-act="toggle">`
        : '<span class="kind-marker" aria-hidden="true"></span>';
    return `
    <div class="item ${done ? 'done' : ''}" data-id="${r.id}">
      ${checkbox}
      <div class="item-main">
        <div class="item-content">${escapeHtml(r.content)}</div>
        <div class="item-meta">
          <span class="badge kind-${kind}">${KIND_LABELS[kind] || kind}</span>
          ${r.space ? `<span class="space-meta">${escapeHtml(r.space)}</span>` : ''}
          ${r.important === 'Y' ? '<span class="badge important">重要</span>' : ''}
          ${r.urgent === 'Y' ? '<span class="badge urgent">緊急</span>' : ''}
          ${tags}
          ${r.due_date ? `<span class="due-meta">到期 ${fmtDue(r)}</span>` : ''}
          ${r.calendar_id ? '<span class="space-meta">已連結行程</span>' : ''}
          ${attachment ? `<button type="button" class="attachment-btn" data-act="attachment" data-file-id="${escapeHtml(attachment.file_id)}" aria-label="查看「${escapeHtml(r.content)}」的照片">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h3l1.5-2h7L17 7h3v12H4Z"/><circle cx="12" cy="13" r="3.5"/></svg> 照片
          </button>` : ''}
          <span>${fmtDate(r.created_at)}</span>
        </div>
      </div>
      ${state.batch ? '' : `
      <div class="item-actions">
        <details class="item-menu">
          <summary aria-label="更多操作：${escapeHtml(r.content)}" title="更多操作">⋯</summary>
          <div class="item-menu-panel">
            <button type="button" data-act="edit">編輯</button>
            ${kind !== 'note' ? '<button type="button" data-act="convert" data-kind="note">轉為記事</button>' : ''}
            ${kind !== 'task' ? '<button type="button" data-act="convert" data-kind="task">轉為待辦</button>' : ''}
            ${kind !== 'idea' ? '<button type="button" data-act="convert" data-kind="idea">轉為札記</button>' : ''}
            ${kind === 'task' ? `<button type="button" data-act="calendar">${r.calendar_id ? '開啟行程' : '加入行程'}</button>` : ''}
            <button type="button" class="menu-delete" data-act="delete">刪除</button>
          </div>
        </details>
        ${kind === 'task' ? `<select data-act="status" aria-label="變更「${escapeHtml(r.content)}」的狀態">${statusOptions}</select>` : ''}
      </div>`}
    </div>`;
  }).join('');
}

function sameLocalDay(value, reference = new Date()) {
  if (!value) return false;
  const date = new Date(value);
  return !isNaN(date) && date.getFullYear() === reference.getFullYear()
    && date.getMonth() === reference.getMonth() && date.getDate() === reference.getDate();
}

function renderEmptyToday(category) {
  return `<p class="today-empty">${emptyNote(category)}</p>`;
}

function renderTodaySection(title, rows, category) {
  return `<section class="today-section"><div class="today-section-heading"><h3>${title}</h3><span>${rows.length}</span></div>${rows.length ? renderRecordCards(rows) : renderEmptyToday(category)}</section>`;
}

function renderTodayCalendarSection() {
  const rows = state.calendarRecords.filter((record) => sameLocalDay(record.start_time));
  const cards = rows.map((record) => {
    const start = new Date(record.start_time);
    const time = record.all_day === 'Y' ? '全天' : start.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `<button type="button" class="today-calendar-item" data-today-calendar-id="${escapeHtml(record.id)}"><span>${escapeHtml(time)}</span><strong>${escapeHtml(record.title)}</strong>${record.location ? `<small>${escapeHtml(record.location)}</small>` : ''}</button>`;
  }).join('');
  return `<section class="today-section"><div class="today-section-heading"><h3>今日行程</h3><span>${rows.length}</span></div>${cards || renderEmptyToday('calendar')}</section>`;
}

function renderList() {
  const keyword = $('#search').value.trim().toLowerCase();
  $('#records-screen').classList.toggle('searching', !!keyword || !!state.filterTag);
  if (keyword || state.filterTag) { renderGlobalSearch(keyword, state.filterTag); return; }
  const rows = visibleRecords();
  if (state.activeView === 'today') {
    const due = rows.filter((record) => {
      const kind = record.kind || (record.type === 'todo' ? 'task' : 'note');
      return kind === 'task' && !['done', 'cancelled'].includes(record.status) && sameLocalDay(record.due_date);
    });
    const dueIds = new Set(due.map((record) => record.id));
    const created = rows.filter((record) => sameLocalDay(record.created_at) && !dueIds.has(record.id));
    $('#list').innerHTML = renderTodayCalendarSection()
      + renderTodaySection('今日到期', due, 'task')
      + renderTodaySection('今日新增', created, 'record');
    return;
  }
  $('#list').innerHTML = rows.length ? renderRecordCards(rows) : `<div class="empty"><strong>目前沒有符合的記錄</strong><span>${emptyNote('record')}</span></div>`;
}

function searchSection(title, html, count) {
  return `<section class="today-section search-section"><div class="today-section-heading"><h3>${title}</h3><span>${count}</span></div>${html || renderEmptyToday('search')}</section>`;
}

function renderGlobalSearch(keyword, filterTag = '') {
  const matches = (value) => String(value || '').toLowerCase().includes(keyword);
  const hasTag = (record) => !filterTag || String(record.tags || '').split(',').map((tag) => tag.trim().toLowerCase()).includes(filterTag);
  const records = state.records.filter((r) => matches(`${r.content} ${r.tags} ${r.space}`) && hasTag(r));
  const byKind = (kind) => records.filter((r) => (r.kind || (r.type === 'todo' ? 'task' : 'note')) === kind);
  const equipment = state.equipmentRecords.filter((r) => matches(`${r.customer} ${r.machine} ${r.description} ${r.action_taken} ${r.tags} ${(EQUIPMENT_STATUS[r.status] || EQUIPMENT_STATUS.recurring).label}`) && hasTag(r));
  const calendar = filterTag ? [] : state.calendarRecords.filter((r) => matches(`${r.title} ${r.location} ${r.notes}`));
  const equipmentHtml = equipment.map((r) => `<button type="button" class="search-result" data-search-equipment="${escapeHtml(r.id)}"><strong>${escapeHtml(r.customer || r.machine)}</strong><span>${escapeHtml(r.customer ? `${r.machine} · ${r.description}` : r.description)}</span></button>`).join('');
  const calendarHtml = calendar.map((r) => `<button type="button" class="search-result" data-search-calendar="${escapeHtml(r.id)}"><strong>${escapeHtml(r.title)}</strong><span>${fmtDate(r.start_time)}</span></button>`).join('');
  $('#list').innerHTML = searchSection('待辦', renderRecordCards(byKind('task')), byKind('task').length)
    + searchSection('記事', renderRecordCards(byKind('note')), byKind('note').length)
    + searchSection('札記', renderRecordCards(byKind('idea')), byKind('idea').length)
    + searchSection('設備', equipmentHtml, equipment.length)
    + searchSection('行程', calendarHtml, calendar.length);
}

function renderTagChips() {
  const counts = {};
  const labels = {};
  state.records.forEach((r) => {
    String(r.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean)
      .forEach((tag) => { const key = tag.toLowerCase(); counts[key] = (counts[key] || 0) + 1; if (!labels[key]) labels[key] = tag; });
  });
  const tags = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 8);
  if (state.filterTag && !tags.includes(state.filterTag)) tags.unshift(state.filterTag);
  $('#tag-chips').innerHTML = tags.map((t) =>
    `<button class="chip ${state.filterTag === t ? 'on' : ''}" data-tag="${escapeHtml(t)}">#${escapeHtml(labels[t] || t)} (${counts[t] || 0})</button>`
  ).join('');
}

function renderSpaceOptions() {
  const spaces = [...new Set(state.records.map((r) => String(r.space || '').trim()).filter(Boolean))].sort();
  $('#space-suggestions').innerHTML = spaces.map((space) => `<option value="${escapeHtml(space)}"></option>`).join('');
  const selected = $('#filter-space').value;
  $('#filter-space').innerHTML = '<option value="">全部 Space</option>'
    + spaces.map((space) => `<option value="${escapeHtml(space)}">${escapeHtml(space)}</option>`).join('');
  if (spaces.includes(selected)) $('#filter-space').value = selected;
}

// ===== 回寫動作 =====
async function withBusy(fn, okMsg) {
  try {
    await fn();
    if (okMsg) toast(okMsg);
    await loadList();
    return true;
  } catch (err) {
    toast(`失敗：${err.message}`);
    return false;
  }
}

function onListClick(e) {
  const searchCalendar = e.target.closest('[data-search-calendar]');
  if (searchCalendar) { switchScreen('calendar'); editCalendar(searchCalendar.dataset.searchCalendar); return; }
  const searchEquipment = e.target.closest('[data-search-equipment]');
  if (searchEquipment) { switchScreen('equipment'); $('#equipment-search').value = searchEquipment.querySelector('strong').textContent; renderEquipmentList(); return; }
  const calendarItem = e.target.closest('[data-today-calendar-id]');
  if (calendarItem) {
    switchScreen('calendar');
    editCalendar(calendarItem.dataset.todayCalendarId);
    return;
  }
  const item = e.target.closest('.item');
  if (!item) return;
  const id = item.dataset.id;
  const control = e.target.closest('[data-act]');
  const act = control?.dataset.act;

  if (act === 'select') {
    if (control.checked) state.selected.add(id); else state.selected.delete(id);
    updateBatchBar();
  } else if (act === 'toggle') {
    const done = control.checked;
    withBusy(() => apiPost('update', { id, status: done ? 'done' : 'open' }), done ? '已完成 ✓' : '重新開啟');
  } else if (act === 'delete') {
    if (confirm('刪除這筆？（軟刪除，資料仍在試算表）')) {
      withBusy(() => apiPost('delete', { id }), '已刪除');
    } else {
      e.preventDefault();
    }
  } else if (act === 'convert') {
    const kind = control.dataset.kind;
    const status = kind === 'task' ? 'open' : 'active';
    withBusy(() => apiPost('update', { id, kind, status }), `已轉為${KIND_LABELS[kind]}`);
  } else if (act === 'edit') {
    openEdit(id);
  } else if (act === 'calendar') {
    openTaskInCalendar(id);
  } else if (act === 'attachment') {
    openAttachment(control);
  }
}

function onListChange(e) {
  const item = e.target.closest('.item');
  if (!item || e.target.dataset.act !== 'status') return;
  withBusy(() => apiPost('update', { id: item.dataset.id, status: e.target.value }), '狀態已更新');
}

// ===== 照片附件 =====
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('照片讀取失敗'));
    reader.readAsDataURL(blob);
  });
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('手機無法解碼這張照片'));
    image.src = url;
  });
}

async function compressPhoto(file) {
  if (!file || !String(file.type).startsWith('image/')) throw new Error('請選擇照片檔案');
  if (file.size > 25 * 1024 * 1024) throw new Error('原始照片超過 25 MB');

  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(sourceUrl);
    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    if (!blob) throw new Error('照片壓縮失敗');
    if (blob.size > 2 * 1024 * 1024) throw new Error('壓縮後仍超過 2 MB，請改用較小照片');
    return {
      data: await blobToBase64(blob),
      mime_type: 'image/jpeg',
      size: blob.size,
      blob,
    };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function clearSelectedPhoto() {
  if (state.attachmentPreviewUrl) URL.revokeObjectURL(state.attachmentPreviewUrl);
  state.attachment = null;
  state.attachmentPreviewUrl = '';
  $('#photo-input').value = '';
  $('#photo-preview-image').removeAttribute('src');
  $('#photo-preview').hidden = true;
}

async function handlePhotoSelection(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  state.photoBusy = true;
  $('#btn-save').disabled = true;
  toast('照片壓縮中…');
  try {
    clearSelectedPhoto();
    const compressed = await compressPhoto(file);
    state.attachmentPreviewUrl = URL.createObjectURL(compressed.blob);
    state.attachment = {
      data: compressed.data,
      mime_type: compressed.mime_type,
      size: compressed.size,
    };
    $('#photo-preview-image').src = state.attachmentPreviewUrl;
    $('#photo-preview-name').textContent = file.name || '手機照片';
    $('#photo-preview-size').textContent = `壓縮後 ${formatBytes(compressed.size)}`;
    $('#photo-preview').hidden = false;
    toast('照片已準備完成');
  } catch (err) {
    clearSelectedPhoto();
    toast(`照片處理失敗：${err.message}`);
  } finally {
    state.photoBusy = false;
    $('#btn-save').disabled = false;
  }
}

let photoReturnFocus = null;
async function openAttachment(trigger) {
  const fileId = trigger.dataset.fileId;
  photoReturnFocus = trigger;
  $('#photo-modal').hidden = false;
  $('#photo-loading').hidden = false;
  $('#photo-loading').textContent = '照片載入中…';
  $('#photo-full-image').hidden = true;
  $('#btn-close-photo').focus();
  try {
    const attachment = await apiGet({ action: trigger.dataset.attachmentAction || 'attachment', file_id: fileId });
    $('#photo-full-image').src = `data:${attachment.mime_type};base64,${attachment.data}`;
    $('#photo-full-image').hidden = false;
    $('#photo-loading').hidden = true;
  } catch (err) {
    $('#photo-loading').textContent = `照片載入失敗：${err.message}`;
  }
}

function closePhotoModal() {
  $('#photo-modal').hidden = true;
  $('#photo-full-image').removeAttribute('src');
  if (photoReturnFocus) photoReturnFocus.focus();
}

function localDateParts(value) {
  if (!value) return { date: '', time: '' };
  const date = new Date(value);
  if (isNaN(date)) return { date: '', time: '' };
  const pad = (number) => String(number).padStart(2, '0');
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

function updateEditKindUI() {
  $('#edit-task-options').hidden = $('#edit-kind').value !== 'task';
  renderTaskCalendarSync();
}

function syncTimeLabel(value, allDay) {
  if (!value) return '未設定時間';
  const date = new Date(value);
  if (isNaN(date)) return '未設定時間';
  const dateLabel = date.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' });
  if (allDay) return `${dateLabel} 全天`;
  return `${dateLabel} ${date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
}

function editedTaskSyncData(record) {
  const date = $('#edit-due-date').value;
  const time = $('#edit-due-time').value;
  return {
    title: $('#edit-content').value.trim() || record.content || '',
    due_date: date ? (time ? `${date}T${time}:00+08:00` : `${date}T00:00:00+08:00`) : '',
    all_day: !!date && !time,
  };
}

function renderTaskCalendarSync() {
  const card = $('#edit-calendar-sync');
  const checkbox = $('#edit-sync-calendar');
  const preview = $('#edit-calendar-sync-preview');
  const record = state.records.find((item) => item.id === state.editingId);
  const kind = $('#edit-kind').value;
  const linked = record && kind === 'task' && record.calendar_id;
  card.hidden = !linked;
  if (!linked) {
    state.editSyncCalendar = false;
    checkbox.checked = false;
    $('#btn-save-edit').textContent = '儲存修改';
    return;
  }

  const next = editedTaskSyncData(record);
  checkbox.checked = state.editSyncCalendar;
  checkbox.disabled = !next.due_date || state.editCalendarPreviewLoading || !!state.editCalendarPreviewError;
  $('#btn-save-edit').textContent = state.editSyncCalendar ? '儲存並同步行程' : '儲存修改';
  if (!next.due_date) {
    state.editSyncCalendar = false;
    checkbox.checked = false;
    $('#btn-save-edit').textContent = '儲存修改';
    preview.textContent = '待辦尚未設定到期時間，因此不會同步到行程。';
    return;
  }
  if (state.editCalendarPreviewLoading) { preview.textContent = '正在讀取已關聯行程…'; return; }
  if (state.editCalendarPreviewError) { preview.textContent = state.editCalendarPreviewError; return; }
  if (!state.editSyncCalendar) {
    preview.textContent = '不勾選時，只會儲存待辦本身。';
    return;
  }
  if (!state.editLinkedCalendar) { preview.textContent = '找不到已關聯行程，無法安全同步。'; return; }

  const event = state.editLinkedCalendar;
  const changes = [];
  if (String(event.title || '') !== next.title) changes.push(`名稱：${event.title || '未命名'} → ${next.title}`);
  const sameTime = new Date(event.start_time).getTime() === new Date(next.due_date).getTime() && (event.all_day === 'Y') === next.all_day;
  if (!sameTime) changes.push(`時間：${syncTimeLabel(event.start_time, event.all_day === 'Y')} → ${syncTimeLabel(next.due_date, next.all_day)}`);
  preview.textContent = changes.length ? `儲存後將更新行程\n${changes.join('\n')}` : '名稱與時間已一致；儲存待辦後不需要變更行程。';
}

async function loadLinkedCalendarForEdit(record) {
  if (!record?.calendar_id) return;
  state.editCalendarPreviewLoading = true;
  state.editCalendarPreviewError = '';
  renderTaskCalendarSync();
  try {
    const records = await apiGet({ action: 'calendar_list' });
    const linked = records.find((item) => item.id === record.calendar_id) || null;
    if (state.editingId !== record.id) return;
    state.editLinkedCalendar = linked;
    if (!linked) state.editCalendarPreviewError = '找不到已關聯行程，請先從行程頁確認連結。';
  } catch (_) {
    if (state.editingId !== record.id) return;
    state.editCalendarPreviewError = '暫時無法讀取已關聯行程，為避免誤改已暫停同步。';
  } finally {
    if (state.editingId === record.id) {
      state.editCalendarPreviewLoading = false;
      renderTaskCalendarSync();
    }
  }
}

function updateEditFlags() {
  $('#edit-important').classList.toggle('on', state.editImportant);
  $('#edit-urgent').classList.toggle('on', state.editUrgent);
  $('#edit-important').setAttribute('aria-pressed', String(state.editImportant));
  $('#edit-urgent').setAttribute('aria-pressed', String(state.editUrgent));
}

function renderEditPhotoState() {
  const hasPhoto = state.editAttachment || (state.editHadAttachment && !state.editRemoveAttachment);
  $('#edit-photo-label').textContent = state.editAttachment ? '已選新照片' : (hasPhoto ? '更換照片' : '新增照片');
  $('#btn-remove-edit-photo').hidden = !hasPhoto;
  if (state.editAttachment) $('#edit-photo-status').textContent = `新照片 ${formatBytes(state.editAttachment.size)}`;
  else if (state.editRemoveAttachment) $('#edit-photo-status').textContent = '儲存後會將舊照片移至待清理附件';
  else if (state.editHadAttachment) $('#edit-photo-status').textContent = '目前有 1 張照片';
  else $('#edit-photo-status').textContent = '沒有照片';
}

async function handleEditPhotoSelection(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  state.editPhotoBusy = true;
  $('#edit-photo-status').textContent = '照片處理中…';
  try {
    state.editAttachment = await compressPhoto(file);
    state.editRemoveAttachment = false;
    state.editDirty = true;
    renderEditPhotoState();
  } catch (err) {
    $('#edit-photo-input').value = '';
    toast(err.message);
    renderEditPhotoState();
  } finally {
    state.editPhotoBusy = false;
  }
}

function removeEditPhoto() {
  state.editAttachment = null;
  state.editRemoveAttachment = state.editHadAttachment;
  state.editDirty = true;
  $('#edit-photo-input').value = '';
  renderEditPhotoState();
}

function openEdit(id) {
  const record = state.records.find((item) => item.id === id);
  if (!record) return;
  const kind = record.kind || (record.type === 'todo' ? 'task' : 'note');
  const due = localDateParts(record.due_date);
  state.editingId = id;
  state.editImportant = record.important === 'Y';
  state.editUrgent = record.urgent === 'Y';
  state.editAttachment = null;
  state.editRemoveAttachment = false;
  state.editHadAttachment = parseAttachments(record.attachments).length > 0;
  state.editSyncCalendar = false;
  state.editLinkedCalendar = null;
  state.editCalendarPreviewLoading = false;
  state.editCalendarPreviewError = '';
  $('#edit-content').value = record.content || '';
  $('#edit-kind').value = kind;
  $('#edit-space').value = record.space || '';
  $('#edit-tags').value = record.tags || '';
  $('#edit-due-date').value = due.date;
  $('#edit-due-time').value = record.all_day === 'Y' ? '' : due.time;
  $('#edit-photo-input').value = '';
  renderEditPhotoState();
  updateEditKindUI();
  updateEditFlags();
  state.editDirty = false;
  $('#edit-modal').hidden = false;
  $('#edit-content').focus();
  if (kind === 'task' && record.calendar_id) loadLinkedCalendarForEdit(record);
}

function closeEdit(force = false) {
  if (!force && state.editDirty && !confirm('放棄尚未儲存的修改？')) return;
  $('#edit-modal').hidden = true;
  state.editingId = '';
  state.editDirty = false;
  state.editSyncCalendar = false;
  state.editLinkedCalendar = null;
  state.editCalendarPreviewLoading = false;
  state.editCalendarPreviewError = '';
}

async function saveEdit() {
  const record = state.records.find((item) => item.id === state.editingId);
  const content = $('#edit-content').value.trim();
  if (!record || !content) { toast('內容不可為空'); return; }
  if (state.editPhotoBusy) { toast('照片仍在處理中，請稍候'); return; }
  const previousKind = record.kind || (record.type === 'todo' ? 'task' : 'note');
  const kind = $('#edit-kind').value;
  const data = {
    id: record.id,
    content,
    kind,
    space: $('#edit-space').value,
    tags: $('#edit-tags').value,
    important: state.editImportant,
    urgent: state.editUrgent,
  };
  if (kind !== previousKind) data.status = kind === 'task' ? 'open' : 'active';
  if (state.editAttachment) {
    data.attachment = {
      data: state.editAttachment.data,
      mime_type: state.editAttachment.mime_type,
    };
  } else if (state.editRemoveAttachment) {
    data.remove_attachment = true;
  }
  if (kind === 'task' && $('#edit-due-date').value) {
    const date = $('#edit-due-date').value;
    const time = $('#edit-due-time').value;
    data.due_date = time ? `${date}T${time}:00+08:00` : `${date}T00:00:00+08:00`;
    data.all_day = !time;
  } else {
    data.due_date = '';
    data.all_day = false;
  }
  const syncCalendar = kind === 'task' && state.editSyncCalendar && !!record.calendar_id;
  const button = $('#btn-save-edit');
  button.disabled = true;
  button.textContent = '儲存中…';
  try {
    await apiPost('update', data);
    let syncError = '';
    if (syncCalendar) {
      try {
        await apiPost('task_calendar_sync', { direction: 'task_to_calendar', task_id: record.id });
      } catch (err) {
        syncError = err.message;
      }
    }
    closeEdit(true);
    toast(syncError ? `待辦已儲存；行程未同步：${syncError}` : (syncCalendar ? '待辦與行程已更新' : '修改已儲存'));
    await loadList();
  } catch (err) {
    toast(`儲存失敗：${err.message}`);
  } finally {
    button.disabled = false;
    button.textContent = '儲存修改';
  }
}

// ===== 輸入區 =====
function setActiveKind(kind) {
  state.activeKind = kind;
  localStorage.setItem('whence_last_kind', kind);
  document.querySelectorAll('.type-btn[data-kind]').forEach((b) => {
    const active = b.dataset.kind === kind;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', String(active));
  });
  $('#todo-options').hidden = kind !== 'task';
}

function setActiveView(view) {
  state.activeView = view;
  $('#records-panel').open = true;
  document.querySelectorAll('.view-btn').forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $('#records-title').textContent = '搜尋';
  renderList();
}

function syncSpaceButtons() {
  const value = $('#space').value.trim();
  document.querySelectorAll('.space-btn').forEach((button) => {
    const active = button.dataset.space === value;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function toggleQuickSpace(space) {
  $('#space').value = $('#space').value.trim() === space ? '' : space;
  syncSpaceButtons();
}

async function save() {
  const content = $('#content').value.trim();
  if (!content) { toast('內容不可為空'); return; }
  if (state.photoBusy) { toast('照片仍在處理中，請稍候'); return; }

  const data = {
    kind: state.activeKind,
    space: $('#space').value,
    content,
    tags: $('#tags').value,
    important: state.important,
    urgent: state.urgent,
    source: 'manual',
  };
  if (state.attachment) data.attachment = state.attachment;
  if (state.activeKind === 'task' && $('#due-date').value) {
    const date = $('#due-date').value;
    const time = $('#due-time').value;
    data.due_date = time ? `${date}T${time}:00+08:00` : `${date}T00:00:00+08:00`;
    data.all_day = !time;
  }

  const btn = $('#btn-save');
  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = '儲存中…';
  try {
    await apiPost('create', data);
    $('#content').value = '';
    $('#tags').value = '';
    localStorage.setItem('whence_last_space', $('#space').value.trim());
    $('#due-date').value = '';
    $('#due-time').value = '';
    clearSelectedPhoto();
    state.important = false;
    state.urgent = false;
    $('#btn-important').classList.remove('on');
    $('#btn-urgent').classList.remove('on');
    $('#btn-important').setAttribute('aria-pressed', 'false');
    $('#btn-urgent').setAttribute('aria-pressed', 'false');
    toast('已儲存 ✓');
    await loadList();
  } catch (err) {
    toast(`儲存失敗：${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

// ===== 批次操作 =====
function setBatch(on) {
  state.batch = on;
  state.selected.clear();
  document.body.classList.toggle('batch-mode', on);
  $('#btn-batch').classList.toggle('on', on);
  $('#btn-batch').setAttribute('aria-pressed', String(on));
  $('#batch-bar').hidden = !on;
  updateBatchBar();
  renderList();
}

function updateBatchBar() {
  $('#batch-count').textContent = `已選 ${state.selected.size} 筆`;
}

/** 批次呼叫；後端若為未更新部署的舊版（不認 ids），自動退回逐筆執行 */
async function batchCall(action, extra = {}) {
  const ids = [...state.selected];
  try {
    await apiPost(action, { ids, ...extra });
  } catch (err) {
    if (/需要 id/.test(err.message)) {
      for (const id of ids) await apiPost(action, { id, ...extra });
    } else {
      throw err;
    }
  }
}

async function batchApplyStatus() {
  if (!state.selected.size) { toast('尚未選取任何項目'); return; }
  const status = $('#batch-status').value;
  const count = state.selected.size;
  const ok = await withBusy(() => batchCall('update', { status }), `已更新 ${count} 筆`);
  if (ok) setBatch(false);
}

async function batchDelete() {
  if (!state.selected.size) { toast('尚未選取任何項目'); return; }
  if (!confirm(`刪除選取的 ${state.selected.size} 筆？（軟刪除，資料仍在試算表）`)) return;
  const count = state.selected.size;
  const ok = await withBusy(() => batchCall('delete'), `已刪除 ${count} 筆`);
  if (ok) setBatch(false);
}

// ===== 設定面板 =====
function openSettings(hint) {
  const input = $('#secret-input');
  input.value = getSecret();
  input.type = 'password';
  $('#btn-toggle-secret').textContent = '顯示';
  $('#btn-toggle-secret').setAttribute('aria-pressed', 'false');
  $('#settings-hint').textContent = hint || '';
  $('#settings-modal').hidden = false;
  input.focus();
}

function closeSettings() {
  $('#settings-modal').hidden = true;
  $('#btn-settings').focus();
}

function toggleSecretVisibility() {
  const input = $('#secret-input');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  $('#btn-toggle-secret').textContent = show ? '隱藏' : '顯示';
  $('#btn-toggle-secret').setAttribute('aria-pressed', String(show));
}

async function saveSecret() {
  const s = $('#secret-input').value.trim();
  if (!s) { $('#settings-hint').textContent = '請輸入 SECRET'; return; }
  setSecret(s);
  $('#settings-hint').textContent = '連線測試中…';
  try {
    await apiGet({ action: 'ping' });
    $('#settings-modal').hidden = true;
    toast('連線成功 ✓');
    await loadList();
  } catch (err) {
    $('#settings-hint').textContent = `連線失敗：${err.message}`;
  }
}

// ===== 設備畫面 =====
function renderEquipmentSuggestions() {
  const uniqueText = (values) => {
    const seen = new Set();
    return values.filter(Boolean).filter((value) => { const key = value.trim().toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; }).sort();
  };
  const customers = uniqueText(state.equipmentRecords.map((r) => r.customer));
  $('#equipment-customer-suggestions').innerHTML = customers.map((v) => `<option value="${escapeHtml(v)}"></option>`).join('');
  renderEquipmentFormMachineSuggestions();
  renderEquipmentMachineFilter();
}

function renderEquipmentFormMachineSuggestions() {
  const customer = $('#equipment-customer').value.trim().toLowerCase();
  const seen = new Set();
  const machines = state.equipmentRecords
    .filter((r) => !customer || String(r.customer || '').trim().toLowerCase() === customer)
    .map((r) => r.machine).filter(Boolean)
    .filter((machine) => { const key = machine.trim().toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; }).sort();
  $('#equipment-machine-suggestions').innerHTML = machines.map((v) => `<option value="${escapeHtml(v)}"></option>`).join('');
}

function equipmentMatchesKeyword(record, keyword) {
  const status = EQUIPMENT_STATUS[record.status] || EQUIPMENT_STATUS.recurring;
  return !keyword || [record.customer, record.machine, record.description, record.action_taken, record.tags, status.label].join(' ').toLowerCase().includes(keyword);
}

function rawCustomerKey(value) { return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase(); }
function customerKey(value) { const key = rawCustomerKey(value); return rawCustomerKey(state.customerAliases[key] || key); }

function renderEquipmentCustomerFilter() {
  const selected = $('#equipment-customer-filter').value;
  const customers = new Map();
  state.equipmentRecords.forEach((record) => { const rawLabel = String(record.customer || '').trim(); const rawKey = rawCustomerKey(rawLabel); const label = state.customerAliases[rawKey] || rawLabel; const key = customerKey(rawLabel); if (key && !customers.has(key)) customers.set(key, label); });
  $('#equipment-customer-filter').innerHTML = '<option value="">全部客戶</option>' + [...customers.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([key, label]) => `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`).join('');
  if (customers.has(selected)) $('#equipment-customer-filter').value = selected;
}

function renderEquipmentCurrentSummary(customer) {
  const latest = new Map();
  state.equipmentRecords.filter((record) => customerKey(record.customer) === customer).forEach((record) => {
    const key = String(record.machine || '').trim().toLowerCase();
    const time = new Date(record.occurred_at || record.created_at).getTime();
    if (key && (!latest.has(key) || time > latest.get(key).time)) latest.set(key, { record, time });
  });
  const rows = [...latest.values()].sort((a, b) => a.record.machine.localeCompare(b.record.machine));
  $('#equipment-current-summary').hidden = !rows.length;
  $('#equipment-current-summary').innerHTML = rows.length ? '<h3>設備目前狀態</h3>' + rows.map(({ record }) => { const status = EQUIPMENT_STATUS[record.status] || EQUIPMENT_STATUS.recurring; return `<div class="equipment-current-row"><strong>${escapeHtml(record.machine)}</strong><div class="equipment-status-badge status-${status.tone}"><span aria-hidden="true"></span>${status.label}</div></div>`; }).join('') : '';
}

function renderEquipmentMachineFilter() {
  const keyword = $('#equipment-search').value.trim().toLowerCase();
  const statusFilter = $('#equipment-status-filter').value;
  const customer = $('#equipment-customer-filter').value;
  const pairs = new Map();
  state.equipmentRecords.filter((r) => (!customer || customerKey(r.customer) === customer) && equipmentMatchesKeyword(r, keyword)).forEach((r) => {
    const customer = String(r.customer || '').trim();
    const machine = String(r.machine || '').trim();
    const key = JSON.stringify([customer.toLowerCase(), machine.toLowerCase()]);
    if (!pairs.has(key)) pairs.set(key, { customer, machine });
  });
  const selected = $('#equipment-machine-filter').value;
  $('#equipment-machine-filter').innerHTML = '<option value="">全部設備</option>' + [...pairs.values()].sort((a, b) => `${a.customer}${a.machine}`.localeCompare(`${b.customer}${b.machine}`)).map((pair) => {
    const value = JSON.stringify([pair.customer, pair.machine]);
    const label = pair.customer ? `${pair.customer} · ${pair.machine}` : pair.machine;
    return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
  }).join('');
  if ([...$('#equipment-machine-filter').options].some((option) => option.value === selected)) $('#equipment-machine-filter').value = selected;
}

function timelineDateAllowed(value) {
  const time = new Date(value).getTime(); if (!isFinite(time)) return false;
  const from = $('#equipment-date-from').value ? new Date(`${$('#equipment-date-from').value}T00:00:00`).getTime() : -Infinity;
  const to = $('#equipment-date-to').value ? new Date(`${$('#equipment-date-to').value}T23:59:59`).getTime() : Infinity;
  return time >= from && time <= to;
}

function renderCustomerTimeline(customer) {
  renderEquipmentCurrentSummary(customer);
  const keyword = $('#equipment-search').value.trim().toLowerCase();
  const statusFilter = $('#equipment-status-filter').value;
  const machineFilter = $('#equipment-machine-filter').value;
  let pair = null; try { pair = machineFilter ? JSON.parse(machineFilter) : null; } catch (_) {}
  const equipment = state.equipmentRecords.filter((record) => customerKey(record.customer) === customer)
    .filter((record) => !pair || record.machine === pair[1])
    .filter((record) => !statusFilter || (record.status === statusFilter || (record.status === 'active' && statusFilter === 'recurring')))
    .filter((record) => equipmentMatchesKeyword(record, keyword) && timelineDateAllowed(record.occurred_at || record.created_at));
  const equipmentIds = new Set(equipment.map((record) => record.id));
  const linkedRecordIds = new Set(equipment.map((record) => record.linked_event_id).filter(Boolean));
  const customerLabel = state.equipmentRecords.find((record) => customerKey(record.customer) === customer)?.customer || customer;
  const customerText = customerLabel.toLowerCase();
  const records = statusFilter ? [] : state.records.filter((record) => !linkedRecordIds.has(record.id) && (equipmentIds.has(record.equipment_id) || `${record.content} ${record.tags}`.toLowerCase().includes(customerText)))
    .filter((record) => (!keyword || `${record.content} ${record.tags} ${record.space}`.toLowerCase().includes(keyword)) && timelineDateAllowed(record.created_at));
  const recordIds = new Set(records.map((record) => record.id));
  const calendar = statusFilter ? [] : state.calendarRecords.filter((record) => recordIds.has(record.linked_event_id) || `${record.title} ${record.location} ${record.notes}`.toLowerCase().includes(customerText))
    .filter((record) => (!keyword || `${record.title} ${record.location} ${record.notes}`.toLowerCase().includes(keyword)) && timelineDateAllowed(record.start_time));
  const items = equipment.map((data) => ({ type: 'equipment', date: data.occurred_at || data.created_at, data }))
    .concat(records.map((data) => ({ type: data.kind || 'note', date: data.created_at, data })), calendar.map((data) => ({ type: 'calendar', date: data.start_time, data })))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  $('#equipment-timeline-context').textContent = `${customerLabel} · ${items.length} 筆相關紀錄`;
  if (!items.length) { $('#equipment-list').innerHTML = '<div class="empty"><strong>沒有符合的客戶紀錄</strong><span>調整設備、狀態或日期範圍。</span></div>'; return; }
  $('#equipment-list').innerHTML = items.map((item) => {
    if (item.type === 'equipment') {
      const r = item.data; const status = EQUIPMENT_STATUS[r.status] || EQUIPMENT_STATUS.recurring; const attachment = parseAttachments(r.attachments)[0];
      return `<article class="customer-timeline-item type-equipment equipment-item" data-id="${escapeHtml(r.id)}"><div class="equipment-item-head"><div><span>設備 · ${escapeHtml(r.machine)}</span><strong>${escapeHtml(r.description)}</strong></div><div class="equipment-head-side"><time>${fmtDate(item.date)}</time><div class="equipment-status-badge status-${status.tone}"><span aria-hidden="true"></span>${status.label}</div></div></div>${r.action_taken ? `<div class="equipment-action"><span>處理</span>${escapeHtml(r.action_taken)}</div>` : ''}<div class="item-meta">${attachment ? `<button type="button" class="attachment-btn" data-equipment-act="attachment" data-file-id="${escapeHtml(attachment.file_id)}" data-attachment-action="equipment_attachment">照片</button>` : ''}</div><button type="button" class="equipment-edit" data-equipment-act="edit">編輯</button></article>`;
    }
    if (item.type === 'calendar') return `<article class="customer-timeline-item type-calendar"><div><span>行程</span><strong>${escapeHtml(item.data.title)}</strong></div><time>${fmtDate(item.date)}</time></article>`;
    return `<article class="customer-timeline-item type-record"><div><span>${escapeHtml(KIND_LABELS[item.type] || '記錄')}</span><strong>${escapeHtml(item.data.content)}</strong></div><time>${fmtDate(item.date)}</time></article>`;
  }).join('');
}

function renderEquipmentList() {
  const customer = $('#equipment-customer-filter').value;
  $('#btn-customer-alias').hidden = !customer;
  if (customer) { renderCustomerTimeline(customer); return; }
  $('#equipment-current-summary').hidden = true;
  const keyword = $('#equipment-search').value.trim().toLowerCase();
  const statusFilter = $('#equipment-status-filter').value;
  const machineFilter = $('#equipment-machine-filter').value;
  let pair = null;
  try { pair = machineFilter ? JSON.parse(machineFilter) : null; } catch (_) { pair = null; }
  const rows = state.equipmentRecords.filter((r) => (!pair || (r.customer === pair[0] && r.machine === pair[1])) && (!statusFilter || r.status === statusFilter || (r.status === 'active' && statusFilter === 'recurring')) && equipmentMatchesKeyword(r, keyword) && timelineDateAllowed(r.occurred_at || r.created_at));
  $('#equipment-timeline-context').textContent = `${pair ? `${pair[0] ? `${pair[0]} · ` : ''}${pair[1]} · ` : ''}${rows.length} 筆設備紀錄`;
  if (!rows.length) {
    $('#equipment-list').innerHTML = `<div class="empty"><strong>還沒有設備紀錄</strong><span>${emptyNote('equipment')}</span></div>`;
    return;
  }
  $('#equipment-list').innerHTML = rows.map((r) => {
    const attachment = parseAttachments(r.attachments)[0];
    const equipmentStatus = EQUIPMENT_STATUS[r.status] || EQUIPMENT_STATUS.recurring;
    const tags = String(r.tags || '').split(',').filter(Boolean).map((tag) => `<span class="item-tag">#${escapeHtml(tag)}</span>`).join(' ');
    return `<article class="equipment-item" data-id="${escapeHtml(r.id)}">
      <div class="equipment-item-head"><div><strong>${escapeHtml(r.customer || r.machine)}</strong>${r.customer && r.machine ? `<span>${escapeHtml(r.machine)}</span>` : ''}</div><div class="equipment-head-side"><time>${fmtDate(r.occurred_at || r.created_at)}</time><div class="equipment-status-badge status-${equipmentStatus.tone}"><span aria-hidden="true"></span>${equipmentStatus.label}</div></div></div>
      <p>${escapeHtml(r.description)}</p>
      ${r.action_taken ? `<div class="equipment-action"><span>處理</span>${escapeHtml(r.action_taken)}</div>` : ''}
      <div class="item-meta">${tags}${r.linked_event_id ? '<span class="space-meta">已關聯記錄</span>' : ''}${attachment ? `<button type="button" class="attachment-btn" data-equipment-act="attachment" data-file-id="${escapeHtml(attachment.file_id)}" data-attachment-action="equipment_attachment">照片</button>` : ''}</div>
      <button type="button" class="equipment-edit" data-equipment-act="edit">編輯</button>
      <button type="button" class="equipment-delete" data-equipment-act="delete" aria-label="刪除設備紀錄：${escapeHtml(r.machine)}">刪除</button>
    </article>`;
  }).join('');
}

async function loadEquipment() {
  $('#equipment-list').setAttribute('aria-busy', 'true');
  try {
    const [equipmentRecords, records, calendarRecords, aliases] = await Promise.all([apiGet({ action: 'equipment_list' }), fetchAllRecords(), apiGet({ action: 'calendar_list' }).catch(() => []), apiGet({ action: 'customer_aliases' }).catch(() => ({}))]);
    state.equipmentRecords = equipmentRecords; state.records = records; state.calendarRecords = calendarRecords; state.customerAliases = aliases;
    renderEquipmentSuggestions();
    renderEquipmentCustomerFilter();
    renderEquipmentList();
  } catch (err) {
    $('#equipment-list').innerHTML = `<div class="empty">設備紀錄載入失敗：${escapeHtml(err.message)}</div>`;
  } finally {
    $('#equipment-list').setAttribute('aria-busy', 'false');
  }
}

async function mergeSelectedCustomer() {
  const selected = $('#equipment-customer-filter').value;
  if (!selected) return;
  const sourceLabel = $('#equipment-customer-filter').selectedOptions[0]?.textContent || selected;
  const canonical = prompt(`將「${sourceLabel}」合併顯示到哪個標準客戶名稱？`, sourceLabel);
  if (!canonical || rawCustomerKey(canonical) === selected) return;
  if (!confirm(`之後將「${sourceLabel}」統一顯示為「${canonical.trim()}」，不改寫歷史紀錄。確定嗎？`)) return;
  try {
    state.customerAliases = await apiPost('customer_alias_set', { alias: sourceLabel, canonical: canonical.trim() });
    renderEquipmentCustomerFilter(); $('#equipment-customer-filter').value = customerKey(sourceLabel); renderEquipmentMachineFilter(); renderEquipmentList(); toast('客戶名稱已合併顯示');
  } catch (err) { toast(`合併失敗：${err.message}`); }
}

async function checkForAppUpdate() {
  $('#app-version').textContent = `Whence v${APP_VERSION}`;
  try {
    const response = await fetch(`./manifest.json?update=${Date.now()}`, { cache: 'no-store' });
    const manifest = await response.json();
    if (manifest.version && manifest.version !== APP_VERSION) $('#app-version').textContent = `Whence v${APP_VERSION} · 有新版 ${manifest.version}，請重新開啟`;
  } catch (_) {}
}

async function handleEquipmentPhoto(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  state.equipmentPhotoBusy = true;
  $('#equipment-photo-status').textContent = '照片處理中…';
  try {
    state.equipmentAttachment = await compressPhoto(file);
    $('#equipment-photo-status').textContent = `已選 ${formatBytes(state.equipmentAttachment.size)}`;
  } catch (err) {
    state.equipmentAttachment = null;
    $('#equipment-photo-input').value = '';
    $('#equipment-photo-status').textContent = '';
    toast(err.message);
  } finally { state.equipmentPhotoBusy = false; }
}

async function saveEquipment() {
  const machine = $('#equipment-machine').value.trim();
  const description = $('#equipment-description').value.trim();
  if (!machine || !description) { toast('請填寫設備名稱與發生什麼'); return; }
  if (state.equipmentPhotoBusy) { toast('照片仍在處理中'); return; }
  const data = {
    customer: $('#equipment-customer').value,
    machine, description,
    action_taken: $('#equipment-action').value,
    status: $('#equipment-status').value,
    tags: $('#equipment-tags').value,
    occurred_at: new Date($('#equipment-occurred').value).toISOString(),
  };
  const linkedKind = $('#equipment-linked-kind').value;
  if (linkedKind) {
    data.linked_kind = linkedKind;
    data.linked_content = $('#equipment-linked-content').value.trim() || `${machine}：${description}`;
    if (linkedKind === 'task' && $('#equipment-linked-due').value) data.linked_due_date = `${$('#equipment-linked-due').value}T00:00:00+08:00`;
  }
  if (state.equipmentAttachment) data.attachment = { data: state.equipmentAttachment.data, mime_type: state.equipmentAttachment.mime_type };
  const button = $('#btn-save-equipment');
  button.disabled = true; button.textContent = '儲存中…';
  try {
    await apiPost('equipment_create', data);
    ['#equipment-description', '#equipment-action', '#equipment-tags'].forEach((selector) => { $(selector).value = ''; });
    state.equipmentAttachment = null;
    $('#equipment-photo-input').value = '';
    $('#equipment-photo-status').textContent = '';
    $('#equipment-linked-kind').value = '';
    $('#equipment-linked-fields').hidden = true;
    setEquipmentNow();
    toast('設備紀錄已儲存');
    await loadEquipment();
  } catch (err) { toast(`儲存失敗：${err.message}`); }
  finally { button.disabled = false; button.textContent = '儲存設備紀錄'; }
}

function setEquipmentNow() {
  const date = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  $('#equipment-occurred').value = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toLocalDateTime(value) {
  const date = new Date(value);
  if (isNaN(date)) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function renderEquipmentEditPhoto() {
  const has = state.equipmentEditAttachment || (state.equipmentEditHadAttachment && !state.equipmentEditRemoveAttachment);
  $('#btn-remove-equipment-edit-photo').hidden = !has;
  $('#equipment-edit-photo-status').textContent = state.equipmentEditAttachment ? `已選新照片 ${formatBytes(state.equipmentEditAttachment.size)}` : (state.equipmentEditRemoveAttachment ? '儲存後移除舊照片' : (has ? '目前有照片' : '沒有照片'));
}

function openEquipmentEdit(id) {
  const r = state.equipmentRecords.find((item) => item.id === id);
  if (!r) return;
  state.equipmentEditingId = id; state.equipmentEditAttachment = null; state.equipmentEditRemoveAttachment = false;
  state.equipmentEditHadAttachment = parseAttachments(r.attachments).length > 0;
  $('#equipment-edit-customer').value = r.customer || '';
  $('#equipment-edit-machine').value = r.machine || '';
  $('#equipment-edit-description').value = r.description || '';
  $('#equipment-edit-action').value = r.action_taken || '';
  $('#equipment-edit-status').value = r.status === 'active' ? 'recurring' : (r.status || 'recurring');
  $('#equipment-edit-tags').value = r.tags || '';
  $('#equipment-edit-occurred').value = toLocalDateTime(r.occurred_at || r.created_at);
  $('#equipment-edit-photo').value = '';
  renderEquipmentEditPhoto();
  $('#equipment-edit-modal').hidden = false;
}

function closeEquipmentEdit() { $('#equipment-edit-modal').hidden = true; state.equipmentEditingId = ''; }

async function handleEquipmentEditPhoto(event) {
  const file = event.target.files?.[0]; if (!file) return;
  try { state.equipmentEditAttachment = await compressPhoto(file); state.equipmentEditRemoveAttachment = false; renderEquipmentEditPhoto(); }
  catch (err) { toast(err.message); }
}

async function saveEquipmentEdit() {
  const data = { id: state.equipmentEditingId, customer: $('#equipment-edit-customer').value, machine: $('#equipment-edit-machine').value, description: $('#equipment-edit-description').value, action_taken: $('#equipment-edit-action').value, status: $('#equipment-edit-status').value, tags: $('#equipment-edit-tags').value, occurred_at: new Date($('#equipment-edit-occurred').value).toISOString() };
  if (state.equipmentEditAttachment) data.attachment = { data: state.equipmentEditAttachment.data, mime_type: state.equipmentEditAttachment.mime_type };
  if (state.equipmentEditRemoveAttachment) data.remove_attachment = true;
  try { await apiPost('equipment_update', data); closeEquipmentEdit(); toast('設備紀錄已更新'); await loadEquipment(); }
  catch (err) { toast(`更新失敗：${err.message}`); }
}

function localDateTimeValue(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function setCalendarDefaults() {
  const start = new Date();
  start.setMinutes(Math.ceil(start.getMinutes() / 30) * 30, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  $('#calendar-start').value = localDateTimeValue(start);
  $('#calendar-end').value = localDateTimeValue(end);
}

async function openTaskInCalendar(id) {
  const task = state.records.find((record) => record.id === id);
  if (!task) return;
  switchScreen('calendar');
  if (!state.calendarRecords.length) await loadCalendar();
  if (task.calendar_id) {
    const linked = state.calendarRecords.find((record) => record.id === task.calendar_id);
    if (linked) { editCalendar(linked.id); return; }
  }
  resetCalendarForm();
  setCalendarView('month');
  $('#calendar-title-input').value = task.content || '';
  $('#calendar-linked-task').value = task.id;
  if (task.due_date) {
    const due = new Date(task.due_date);
    $('#calendar-all-day').checked = task.all_day === 'Y';
    $('#calendar-end-wrap').hidden = task.all_day === 'Y';
    $('#calendar-start').value = localDateTimeValue(due);
    $('#calendar-end').value = localDateTimeValue(new Date(due.getTime() + 60 * 60 * 1000));
  }
  $('#calendar-title-input').focus();
  toast('已帶入待辦，確認後儲存到行程');
}

function renderCalendarTaskOptions() {
  const current = $('#calendar-linked-task').value;
  const tasks = state.records.filter((r) => (r.kind || (r.type === 'todo' ? 'task' : 'note')) === 'task' && !['done', 'cancelled'].includes(r.status));
  $('#calendar-linked-task').innerHTML = '<option value="">不關聯</option>' + tasks.map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.content)}</option>`).join('');
  if (tasks.some((r) => r.id === current)) $('#calendar-linked-task').value = current;
  renderCalendarTaskSync();
}

async function loadCalendar() {
  $('#calendar-list').setAttribute('aria-busy', 'true');
  try {
    if (!state.records.length) state.records = await fetchAllRecords();
    const start = new Date(state.calendarCursor); start.setDate(start.getDate() - 7);
    const end = new Date(state.calendarCursor.getFullYear(), state.calendarCursor.getMonth() + 2, 8);
    state.calendarRecords = await apiGet({ action: 'calendar_live', start: start.toISOString(), end: end.toISOString() });
    renderCalendarTaskOptions();
    renderCalendarList();
    renderMonthCalendar();
    updateAppBadge();
  } catch (err) {
    $('#calendar-list').innerHTML = `<p class="empty">行程載入失敗：${escapeHtml(err.message)}</p>`;
  } finally { $('#calendar-list').setAttribute('aria-busy', 'false'); }
}

async function moveCalendarMonth(offset) {
  state.calendarCursor = new Date(state.calendarCursor.getFullYear(), state.calendarCursor.getMonth() + offset, 1);
  await loadCalendar();
}

function dayKey(value) {
  const d = new Date(value); const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function calendarItemsForDay(date) {
  const key = dayKey(date);
  const events = state.calendarRecords.filter((r) => dayKey(r.start_time) === key).map((r) => ({ type: 'event', data: r }));
  const linked = new Set(events.map((x) => x.data.linked_event_id).filter(Boolean));
  const tasks = state.records.filter((r) => (r.kind || '') === 'task' && r.due_date && dayKey(r.due_date) === key && !linked.has(r.id) && !['done', 'cancelled'].includes(r.status)).map((r) => ({ type: 'task', data: r }));
  return events.concat(tasks).sort((a, b) => new Date(a.data.start_time || a.data.due_date) - new Date(b.data.start_time || b.data.due_date));
}

function renderMonthCalendar() {
  const cursor = state.calendarCursor;
  $('#calendar-month-label').textContent = `${cursor.getFullYear()} 年 ${cursor.getMonth() + 1} 月`;
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first); start.setDate(1 - first.getDay());
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(start); date.setDate(start.getDate() + i);
    const items = calendarItemsForDay(date); const selected = dayKey(date) === dayKey(state.calendarSelected); const today = dayKey(date) === dayKey(new Date());
    cells.push(`<button type="button" class="calendar-day${date.getMonth() !== cursor.getMonth() ? ' outside' : ''}${selected ? ' selected' : ''}${today ? ' today' : ''}" data-calendar-date="${dayKey(date)}"><span>${date.getDate()}</span>${items.length ? `<small>${items.length}</small>` : ''}</button>`);
  }
  $('#calendar-grid').innerHTML = cells.join('');
  const items = calendarItemsForDay(state.calendarSelected);
  $('#calendar-selected-label').textContent = state.calendarSelected.toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'long' });
  $('#calendar-day-list').innerHTML = items.length ? items.map((item) => item.type === 'event'
    ? `<button type="button" class="calendar-day-entry" data-calendar-id="${escapeHtml(item.data.id)}"><span>${item.data.all_day === 'Y' ? '全天' : new Date(item.data.start_time).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })}</span><strong>${escapeHtml(item.data.title)}</strong></button>`
    : `<button type="button" class="calendar-day-entry task" data-task-id="${escapeHtml(item.data.id)}"><span>待辦</span><strong>${escapeHtml(item.data.content)}</strong></button>`).join('') : '<p class="today-empty">這天沒有行程或到期待辦</p>';
}

function renderCalendarList() {
  const kw = $('#calendar-search').value.trim().toLowerCase();
  const rows = state.calendarRecords.filter((r) => !kw || `${r.title} ${r.location} ${r.notes}`.toLowerCase().includes(kw));
  if (!rows.length) { $('#calendar-list').innerHTML = `<div class="empty"><strong>還沒有行程</strong><span>${emptyNote('calendar')}</span></div>`; return; }
  $('#calendar-list').innerHTML = rows.map((r) => {
    const start = new Date(r.start_time);
    const time = r.all_day === 'Y' ? '全天' : start.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
    const day = start.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric', weekday: 'short' });
    return `<article class="item calendar-item" data-id="${escapeHtml(r.id)}"><div class="calendar-item-time">${escapeHtml(day)}<br>${escapeHtml(time)}</div><div class="item-main"><div class="item-content">${escapeHtml(r.title)}</div><div class="item-meta">${r.location ? `<span>${escapeHtml(r.location)}</span>` : ''}${r.linked_event_id ? '<span class="space-meta">已關聯待辦</span>' : ''}${r.read_only ? '<span class="space-meta">Google 日曆 · 唯讀</span>' : `<span>提前 ${escapeHtml(r.reminder_minutes || '0')} 分鐘</span>`}</div></div>${r.read_only ? '' : '<div class="calendar-item-actions"><button class="secondary-btn" data-calendar-act="edit">編輯</button><button class="del-btn" data-calendar-act="delete">刪除</button></div>'}</article>`;
  }).join('');
}

function calendarFormSaveLabel() {
  return $('#calendar-editing-id').value ? '更新行程' : '儲存行程';
}

function renderCalendarTaskSync() {
  const card = $('#calendar-task-sync');
  const checkbox = $('#calendar-sync-task');
  const preview = $('#calendar-sync-task-preview');
  const taskId = $('#calendar-linked-task').value;
  const task = state.records.find((item) => item.id === taskId);
  card.hidden = !taskId;
  if (!taskId) {
    checkbox.checked = false;
    checkbox.disabled = false;
    $('#btn-save-calendar').textContent = calendarFormSaveLabel();
    return;
  }
  checkbox.disabled = !task;
  if (!task) {
    checkbox.checked = false;
    preview.textContent = '找不到已關聯待辦，無法安全同步。';
    $('#btn-save-calendar').textContent = calendarFormSaveLabel();
    return;
  }
  $('#btn-save-calendar').textContent = checkbox.checked ? `${$('#calendar-editing-id').value ? '更新' : '儲存'}並同步待辦` : calendarFormSaveLabel();
  if (!checkbox.checked) {
    preview.textContent = '不勾選時，只會儲存行程本身。';
    return;
  }
  const start = $('#calendar-start').value;
  const allDay = $('#calendar-all-day').checked;
  const nextTitle = $('#calendar-title-input').value.trim() || '未命名';
  if (!start) { preview.textContent = '請先填寫行程開始時間，才能同步待辦。'; return; }
  const changes = [];
  if (String(task.content || '') !== nextTitle) changes.push(`名稱：${task.content || '未命名'} → ${nextTitle}`);
  const nextDue = `${start}:00+08:00`;
  const sameTime = task.due_date && new Date(task.due_date).getTime() === new Date(nextDue).getTime() && (task.all_day === 'Y') === allDay;
  if (!sameTime) changes.push(`到期：${syncTimeLabel(task.due_date, task.all_day === 'Y')} → ${syncTimeLabel(nextDue, allDay)}`);
  preview.textContent = changes.length ? `儲存後將更新待辦\n${changes.join('\n')}` : '名稱與時間已一致；儲存行程後不需要變更待辦。';
}

function calendarPayload() {
  const allDay = $('#calendar-all-day').checked;
  const startValue = $('#calendar-start').value;
  const endValue = allDay ? startValue : $('#calendar-end').value;
  if (!startValue || !endValue) throw new Error('請填寫行程時間');
  return { title: $('#calendar-title-input').value.trim(), all_day: allDay, start_time: new Date(startValue).toISOString(), end_time: new Date(endValue).toISOString(), location: $('#calendar-location').value.trim(), notes: $('#calendar-notes').value.trim(), reminder_minutes: $('#calendar-reminder').value, linked_event_id: $('#calendar-linked-task').value };
}

function resetCalendarForm() {
  $('#calendar-editing-id').value = '';
  $('#calendar-title-input').value = ''; $('#calendar-location').value = ''; $('#calendar-notes').value = '';
  $('#calendar-all-day').checked = false; $('#calendar-end-wrap').hidden = false; $('#calendar-reminder').value = '30'; $('#calendar-linked-task').value = '';
  $('#calendar-sync-task').checked = false;
  $('#calendar-title').textContent = '新增行程';
  $('#btn-save-calendar').textContent = '儲存行程'; $('#btn-cancel-calendar-edit').hidden = true;
  setCalendarDefaults();
  renderCalendarTaskSync();
}

function closeCalendarEdit() {
  resetCalendarForm();
  $('#calendar-form').hidden = true;
}

async function saveCalendar() {
  try {
    const data = calendarPayload();
    if (!data.title) throw new Error('請填寫行程名稱');
    const id = $('#calendar-editing-id').value;
    if (id) data.id = id;
    const syncTask = $('#calendar-sync-task').checked && !!data.linked_event_id;
    const saved = await apiPost(id ? 'calendar_update' : 'calendar_create', data);
    let syncError = '';
    if (syncTask) {
      try {
        await apiPost('task_calendar_sync', { direction: 'calendar_to_task', calendar_id: saved.id });
      } catch (err) {
        syncError = err.message;
      }
    }
    toast(syncError ? `行程已儲存；待辦未同步：${syncError}` : (syncTask ? '行程與待辦已更新' : (id ? '行程已更新' : '行程已建立')));
    closeCalendarEdit(); await loadCalendar();
  } catch (err) { toast(err.message); }
}

function editCalendar(id) {
  const r = state.calendarRecords.find((item) => item.id === id); if (!r) return;
  if (r.read_only) { toast('這筆行程請在 Google 日曆中編輯'); return; }
  if (!$('#calendar-form').hidden && $('#calendar-editing-id').value === r.id) {
    closeCalendarEdit();
    return;
  }
  $('#calendar-form').hidden = false;
  $('#calendar-editing-id').value = r.id; $('#calendar-title-input').value = r.title || ''; $('#calendar-location').value = r.location || ''; $('#calendar-notes').value = r.notes || '';
  $('#calendar-all-day').checked = r.all_day === 'Y'; $('#calendar-end-wrap').hidden = r.all_day === 'Y'; $('#calendar-start').value = localDateTimeValue(r.start_time); $('#calendar-end').value = localDateTimeValue(r.end_time); $('#calendar-reminder').value = String(r.reminder_minutes || '0'); $('#calendar-linked-task').value = r.linked_event_id || '';
  $('#calendar-sync-task').checked = false;
  $('#calendar-title').textContent = '編輯行程';
  $('#btn-save-calendar').textContent = '更新行程'; $('#btn-cancel-calendar-edit').hidden = false; renderCalendarTaskSync(); window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateAppBadge() {
  if (!navigator.setAppBadge) return;
  const now = new Date();
  const today = now.toDateString();
  const due = state.records.filter((r) => (r.kind || '') === 'task' && !['done', 'cancelled'].includes(r.status) && r.due_date && new Date(r.due_date).toDateString() === today).length;
  const schedule = state.calendarRecords.filter((r) => new Date(r.start_time).toDateString() === today).length;
  const count = due + schedule;
  count ? navigator.setAppBadge(count).catch(() => {}) : navigator.clearAppBadge?.().catch(() => {});
}

function setCalendarView(view) {
  state.calendarView = view === 'list' ? 'list' : 'month';
  const month = state.calendarView === 'month';
  $('#calendar-month-view').hidden = !month;
  $('#calendar-list-filter').hidden = month;
  $('#calendar-list').hidden = month;
  $('#calendar-view-month').classList.toggle('active', month);
  $('#calendar-view-list').classList.toggle('active', !month);
  $('#calendar-view-month').setAttribute('aria-pressed', String(month));
  $('#calendar-view-list').setAttribute('aria-pressed', String(!month));
}

async function enableNotificationBadge() {
  if (!('Notification' in window)) { toast('這台裝置不支援網頁通知'); return; }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') { toast('未允許通知，無法顯示紅點'); return; }
  updateAppBadge();
  toast('通知紅點已啟用');
}

const TRASH_TYPE_LABELS = { record: '記錄', equipment: '設備', calendar: '行程' };

async function openTrash() {
  closeSettings();
  $('#trash-modal').hidden = false;
  $('#trash-list').setAttribute('aria-busy', 'true');
  $('#trash-list').innerHTML = '<p class="today-empty">載入中…</p>';
  try {
    const rows = await apiGet({ action: 'trash_list' });
    $('#trash-list').innerHTML = rows.length ? rows.map((item) => `<article class="trash-item" data-trash-id="${escapeHtml(item.id)}" data-trash-type="${escapeHtml(item.entity_type)}"><div><strong>${escapeHtml(item.title || '未命名')}</strong><span>${escapeHtml(TRASH_TYPE_LABELS[item.entity_type] || item.entity_type)}${item.subtitle ? ` · ${escapeHtml(item.subtitle)}` : ''} · ${fmtDate(item.deleted_at)}</span></div><button type="button" class="secondary-btn" data-trash-act="restore">復原</button></article>`).join('') : '<p class="today-empty">最近沒有刪除的資料</p>';
  } catch (err) { $('#trash-list').innerHTML = `<p class="today-empty">載入失敗：${escapeHtml(err.message)}</p>`; }
  finally { $('#trash-list').setAttribute('aria-busy', 'false'); }
}

function closeTrash() { $('#trash-modal').hidden = true; }

async function restoreTrashItem(item) {
  const button = item.querySelector('[data-trash-act="restore"]'); button.disabled = true;
  try {
    await apiPost('trash_restore', { id: item.dataset.trashId, entity_type: item.dataset.trashType });
    toast('資料已復原'); await openTrash();
  } catch (err) { button.disabled = false; toast(`復原失敗：${err.message}`); }
}

function switchScreen(screen, updateHash = true) {
  state.activeScreen = ['equipment', 'calendar'].includes(screen) ? screen : 'records';
  $('#records-screen').hidden = state.activeScreen !== 'records';
  $('#equipment-screen').hidden = state.activeScreen !== 'equipment';
  $('#calendar-screen').hidden = state.activeScreen !== 'calendar';
  document.querySelectorAll('.app-nav-btn').forEach((button) => {
    const active = button.dataset.screen === state.activeScreen;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (updateHash) history.replaceState(null, '', `#${state.activeScreen}`);
  if (state.activeScreen === 'equipment' && getSecret()) loadEquipment();
  if (state.activeScreen === 'calendar' && getSecret()) loadCalendar();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

// ===== 初始化 =====
function init() {
  setActiveKind(KIND_LABELS[state.activeKind] ? state.activeKind : 'note');
  $('#space').value = localStorage.getItem('whence_last_space') || '';
  syncSpaceButtons();
  document.querySelectorAll('.type-btn[data-kind]').forEach((b) =>
    b.addEventListener('click', () => setActiveKind(b.dataset.kind)));
  document.querySelectorAll('.view-btn').forEach((button) =>
    button.addEventListener('click', () => setActiveView(button.dataset.view)));
  document.querySelectorAll('.space-btn').forEach((button) =>
    button.addEventListener('click', () => toggleQuickSpace(button.dataset.space)));
  $('#space').addEventListener('input', syncSpaceButtons);

  $('#btn-important').addEventListener('click', () => {
    state.important = !state.important;
    $('#btn-important').classList.toggle('on', state.important);
    $('#btn-important').setAttribute('aria-pressed', String(state.important));
  });
  $('#btn-urgent').addEventListener('click', () => {
    state.urgent = !state.urgent;
    $('#btn-urgent').classList.toggle('on', state.urgent);
    $('#btn-urgent').setAttribute('aria-pressed', String(state.urgent));
  });

  $('#btn-save').addEventListener('click', save);
  $('#photo-input').addEventListener('change', handlePhotoSelection);
  $('#btn-remove-photo').addEventListener('click', clearSelectedPhoto);
  $('#btn-refresh').addEventListener('click', () => state.activeScreen === 'equipment' ? loadEquipment() : state.activeScreen === 'calendar' ? loadCalendar() : loadList());
  $('#btn-settings').addEventListener('click', () => openSettings());
  $('#btn-close-settings').addEventListener('click', closeSettings);
  $('#btn-toggle-secret').addEventListener('click', toggleSecretVisibility);
  $('#btn-close-photo').addEventListener('click', closePhotoModal);
  $('#btn-close-edit').addEventListener('click', () => closeEdit());
  $('#btn-save-edit').addEventListener('click', saveEdit);
  $('#edit-photo-input').addEventListener('change', handleEditPhotoSelection);
  $('#btn-remove-edit-photo').addEventListener('click', removeEditPhoto);
  $('#edit-kind').addEventListener('change', () => { state.editDirty = true; updateEditKindUI(); });
  ['#edit-content', '#edit-space', '#edit-tags', '#edit-due-date', '#edit-due-time'].forEach((selector) =>
    $(selector).addEventListener('input', () => { state.editDirty = true; if (state.editSyncCalendar) renderTaskCalendarSync(); }));
  $('#edit-sync-calendar').addEventListener('change', async () => {
    state.editSyncCalendar = $('#edit-sync-calendar').checked;
    state.editDirty = true;
    if (state.editSyncCalendar && !state.editLinkedCalendar && !state.editCalendarPreviewLoading) {
      const record = state.records.find((item) => item.id === state.editingId);
      if (record) await loadLinkedCalendarForEdit(record);
    }
    renderTaskCalendarSync();
  });
  $('#edit-important').addEventListener('click', () => {
    state.editImportant = !state.editImportant; state.editDirty = true; updateEditFlags();
  });
  $('#edit-urgent').addEventListener('click', () => {
    state.editUrgent = !state.editUrgent; state.editDirty = true; updateEditFlags();
  });
  $('#btn-save-secret').addEventListener('click', saveSecret);
  $('#btn-enable-notifications').addEventListener('click', enableNotificationBadge);
  $('#btn-open-trash').addEventListener('click', openTrash);
  $('#btn-close-trash').addEventListener('click', closeTrash);
  $('#trash-list').addEventListener('click', (event) => { const button = event.target.closest('[data-trash-act="restore"]'); if (button) restoreTrashItem(button.closest('.trash-item')); });
  $('#trash-modal').addEventListener('click', (event) => { if (event.target === $('#trash-modal')) closeTrash(); });
  $('#btn-undo').addEventListener('click', () => {
    if (confirm('撤回最後建立的一筆？')) withBusy(() => apiPost('undo'), '已撤回');
  });

  $('#btn-batch').addEventListener('click', () => setBatch(!state.batch));
  $('#btn-batch-apply').addEventListener('click', batchApplyStatus);
  $('#btn-batch-delete').addEventListener('click', batchDelete);
  $('#btn-batch-exit').addEventListener('click', () => setBatch(false));

  $('#search').addEventListener('input', () => { if ($('#search').value.trim()) $('#records-panel').open = true; renderList(); });
  $('#filter-space').addEventListener('change', renderList);
  $('#filter-status').addEventListener('change', renderList);
  $('#tag-chips').addEventListener('click', (e) => {
    const tag = e.target.closest('.chip')?.dataset.tag;
    if (!tag) return;
    state.filterTag = state.filterTag === tag.toLowerCase() ? '' : tag.toLowerCase();
    if (state.filterTag) $('#records-panel').open = true;
    renderTagChips();
    renderList();
  });

  $('#list').addEventListener('click', onListClick);
  $('#list').addEventListener('change', onListChange);
  document.querySelectorAll('.app-nav-btn').forEach((button) =>
    button.addEventListener('click', () => switchScreen(button.dataset.screen)));
  $('#equipment-photo-input').addEventListener('change', handleEquipmentPhoto);
  $('#btn-save-equipment').addEventListener('click', saveEquipment);
  $('#equipment-search').addEventListener('input', () => { renderEquipmentMachineFilter(); renderEquipmentList(); });
  $('#equipment-machine-filter').addEventListener('change', renderEquipmentList);
  $('#equipment-customer-filter').addEventListener('change', () => { renderEquipmentMachineFilter(); renderEquipmentList(); });
  $('#btn-customer-alias').addEventListener('click', mergeSelectedCustomer);
  $('#equipment-status-filter').addEventListener('change', renderEquipmentList);
  $('#equipment-date-from').addEventListener('change', renderEquipmentList);
  $('#equipment-date-to').addEventListener('change', renderEquipmentList);
  $('#equipment-customer').addEventListener('input', renderEquipmentFormMachineSuggestions);
  $('#equipment-linked-kind').addEventListener('change', () => {
    const kind = $('#equipment-linked-kind').value;
    $('#equipment-linked-fields').hidden = !kind;
    $('#equipment-linked-task-due').hidden = kind !== 'task';
    if (kind && !$('#equipment-linked-content').value) $('#equipment-linked-content').value = `${$('#equipment-machine').value.trim()}：${$('#equipment-description').value.trim()}`;
  });
  setEquipmentNow();
  $('#btn-close-equipment-edit').addEventListener('click', closeEquipmentEdit);
  $('#btn-save-equipment-edit').addEventListener('click', saveEquipmentEdit);
  $('#equipment-edit-photo').addEventListener('change', handleEquipmentEditPhoto);
  $('#btn-remove-equipment-edit-photo').addEventListener('click', () => { state.equipmentEditAttachment = null; state.equipmentEditRemoveAttachment = state.equipmentEditHadAttachment; renderEquipmentEditPhoto(); });
  $('#equipment-edit-modal').addEventListener('click', (event) => { if (event.target === $('#equipment-edit-modal')) closeEquipmentEdit(); });
  $('#equipment-list').addEventListener('click', (event) => {
    const control = event.target.closest('[data-equipment-act]');
    if (!control) return;
    const item = control.closest('.equipment-item');
    if (control.dataset.equipmentAct === 'attachment') openAttachment(control);
    if (control.dataset.equipmentAct === 'edit') openEquipmentEdit(item.dataset.id);
    if (control.dataset.equipmentAct === 'delete' && confirm('刪除這筆設備紀錄？')) {
      apiPost('equipment_delete', { id: item.dataset.id })
        .then(() => { toast('設備紀錄已刪除'); return loadEquipment(); })
        .catch((err) => toast(`刪除失敗：${err.message}`));
    }
  });
  $('#calendar-all-day').addEventListener('change', () => { $('#calendar-end-wrap').hidden = $('#calendar-all-day').checked; renderCalendarTaskSync(); });
  $('#calendar-linked-task').addEventListener('change', () => { $('#calendar-sync-task').checked = false; renderCalendarTaskSync(); });
  $('#calendar-sync-task').addEventListener('change', renderCalendarTaskSync);
  ['#calendar-title-input', '#calendar-start', '#calendar-end'].forEach((selector) => $(selector).addEventListener('input', renderCalendarTaskSync));
  $('#calendar-add').addEventListener('click', () => { resetCalendarForm(); $('#calendar-form').hidden = false; $('#calendar-title-input').focus(); });
  $('#calendar-prev').addEventListener('click', () => moveCalendarMonth(-1));
  $('#calendar-next').addEventListener('click', () => moveCalendarMonth(1));
  $('#calendar-today').addEventListener('click', () => { state.calendarSelected = new Date(); state.calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1); renderMonthCalendar(); });
  $('#calendar-view-month').addEventListener('click', () => setCalendarView('month'));
  $('#calendar-view-list').addEventListener('click', () => setCalendarView('list'));
  $('#calendar-grid').addEventListener('click', (event) => { const day = event.target.closest('[data-calendar-date]'); if (!day) return; state.calendarSelected = new Date(`${day.dataset.calendarDate}T12:00:00`); renderMonthCalendar(); });
  $('#calendar-day-list').addEventListener('click', (event) => { const eventButton = event.target.closest('[data-calendar-id]'); const taskButton = event.target.closest('[data-task-id]'); if (eventButton) editCalendar(eventButton.dataset.calendarId); if (taskButton) openTaskInCalendar(taskButton.dataset.taskId); });
  $('#btn-save-calendar').addEventListener('click', saveCalendar);
  $('#btn-cancel-calendar-edit').addEventListener('click', closeCalendarEdit);
  $('#calendar-search').addEventListener('input', renderCalendarList);
  $('#calendar-list').addEventListener('click', (event) => {
    const control = event.target.closest('[data-calendar-act]'); if (!control) return;
    const id = control.closest('.calendar-item').dataset.id;
    if (control.dataset.calendarAct === 'edit') editCalendar(id);
    if (control.dataset.calendarAct === 'delete' && confirm('刪除這筆行程？Google Calendar 內的行程也會刪除。')) apiPost('calendar_delete', { id }).then(() => { toast('行程已刪除'); return loadCalendar(); }).catch((err) => toast(err.message));
  });

  $('#settings-modal').addEventListener('click', (e) => {
    if (e.target === $('#settings-modal')) closeSettings();
  });
  $('#photo-modal').addEventListener('click', (e) => {
    if (e.target === $('#photo-modal')) closePhotoModal();
  });
  $('#edit-modal').addEventListener('click', (e) => {
    if (e.target === $('#edit-modal')) closeEdit();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#equipment-edit-modal').hidden) closeEquipmentEdit();
    else if (!$('#trash-modal').hidden) closeTrash();
    else if (!$('#edit-modal').hidden) closeEdit();
    else if (!$('#photo-modal').hidden) closePhotoModal();
    else if (!$('#settings-modal').hidden) closeSettings();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js?v=0.7.0').catch(() => {});
  }

  resetCalendarForm();
  renderShanfangDaily();
  checkForAppUpdate();
  const initialScreen = location.hash === '#equipment' ? 'equipment' : location.hash === '#calendar' ? 'calendar' : 'records';
  switchScreen(initialScreen, false);
  if (getSecret()) {
    if (initialScreen === 'records') loadList();
  } else {
    openSettings('第一次使用：貼上你在 GAS 指令碼屬性設定的 SECRET');
  }
}

init();
