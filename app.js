'use strict';
const APP_VERSION = '1.1.0';

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
  pendingRecordIds: new Set(),
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
  equipmentRecords: [],
  equipmentAttachment: null,
  equipmentPhotoBusy: false,
  activeScreen: 'records',
  notebookSpace: '',
  notebookTag: '',
  notebookDetailId: '',
  screenScroll: {},
  equipmentEditingId: '',
  equipmentEditAttachment: null,
  equipmentEditRemoveAttachment: false,
  equipmentEditHadAttachment: false,
  calendarRecords: [],
  calendarSearchRecords: [],
  calendarSearchLoaded: false,
  recordsLoaded: false,
  customerAliasesLoaded: false,
  calendarWindowKey: '',
  calendarCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  calendarSelected: new Date(),
  calendarView: 'month',
  customerAliases: {},
  occasionChecked: false,
};

// secret 僅為連線憑證（非資料），存 localStorage 免重複輸入
const getSecret = () => localStorage.getItem('whence_secret') || '';
const setSecret = (s) => localStorage.setItem('whence_secret', s);

// ===== 效能檢測（只記錄操作名稱與耗時，不記錄內容、SECRET 或 API 參數） =====
const PERF_DEBUG_KEY = 'whence_perf_debug';
const PERF_ENTRIES_KEY = 'whence_perf_entries';
const PERF_MAX_ENTRIES = 150;
function loadPerformanceEntries() {
  try {
    const saved = JSON.parse(localStorage.getItem(PERF_ENTRIES_KEY) || '[]');
    if (!Array.isArray(saved)) return [];
    return saved.slice(-PERF_MAX_ENTRIES).map((entry) => ({
      at: String(entry.at || ''),
      name: String(entry.name || '').slice(0, 80),
      durationMs: Math.max(0, Math.round(Number(entry.durationMs) || 0)),
      serverMs: entry.serverMs === null ? null : Math.max(0, Math.round(Number(entry.serverMs) || 0)),
      ok: entry.ok !== false,
    }));
  } catch (_) {
    return [];
  }
}
const perfEntries = loadPerformanceEntries();
const perfNow = () => window.performance?.now?.() ?? Date.now();
const perfEnabled = () => localStorage.getItem(PERF_DEBUG_KEY) === '1';

function perfRecord(name, startedAt, options = {}) {
  if (!perfEnabled()) return;
  const durationMs = Math.max(0, Math.round(perfNow() - startedAt));
  const serverMs = Number(options.serverMs);
  perfEntries.push({
    at: new Date().toISOString(),
    name: String(name).slice(0, 80),
    durationMs,
    serverMs: Number.isFinite(serverMs) ? Math.max(0, Math.round(serverMs)) : null,
    ok: options.ok !== false,
  });
  if (perfEntries.length > PERF_MAX_ENTRIES) perfEntries.splice(0, perfEntries.length - PERF_MAX_ENTRIES);
  localStorage.setItem(PERF_ENTRIES_KEY, JSON.stringify(perfEntries));
  renderPerformanceReport();
}

function performanceReportText() {
  const lines = [
    `Whence v${APP_VERSION} 效能報告`,
    `產生時間：${new Date().toLocaleString('zh-TW')}`,
    `筆數：${perfEntries.length}`,
    '說明：僅含操作名稱與耗時，不含記事內容、SECRET 或 API 參數。',
    '',
  ];
  if (!perfEntries.length) lines.push('尚無資料。啟用後照常操作 Whence，即會開始記錄。');
  perfEntries.forEach((entry) => {
    const time = new Date(entry.at).toLocaleTimeString('zh-TW', { hour12: false });
    const gas = entry.serverMs === null ? '' : `；GAS ${entry.serverMs}ms`;
    lines.push(`[${time}] ${entry.name}：${entry.durationMs}ms${gas}；${entry.ok ? '成功' : '失敗'}`);
  });
  return lines.join('\n');
}

function renderPerformanceReport() {
  const status = $('#performance-debug-status');
  const report = $('#performance-report');
  const toggle = $('#performance-debug-toggle');
  if (!status || !report || !toggle) return;
  const enabled = perfEnabled();
  status.textContent = enabled ? `已啟用 · ${perfEntries.length} 筆` : '已關閉';
  toggle.checked = enabled;
  report.textContent = performanceReportText();
}

function setPerformanceDebug(enabled) {
  localStorage.setItem(PERF_DEBUG_KEY, enabled ? '1' : '0');
  renderPerformanceReport();
  toast(enabled ? '效能檢測已啟用' : '效能檢測已關閉');
}

async function copyPerformanceReport() {
  try {
    await navigator.clipboard.writeText(performanceReportText());
    toast('效能報告已複製');
  } catch (_) {
    toast('無法複製，請長按報告內容手動複製');
  }
}

function clearPerformanceReport() {
  perfEntries.length = 0;
  localStorage.removeItem(PERF_ENTRIES_KEY);
  renderPerformanceReport();
  toast('效能紀錄已清除');
}

// ===== API =====
const READ_TIMEOUT_MS = 25 * 1000;
const READ_MAX_ATTEMPTS = 2;

function isRetryableReadError(error) {
  return error?.name === 'AbortError' || error?.name === 'TypeError';
}

async function apiRead(action, data = {}) {
  const startedAt = perfNow();
  let json;
  let ok = false;
  try {
    for (let attempt = 1; attempt <= READ_MAX_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), READ_TIMEOUT_MS);
      try {
        const res = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ secret: getSecret(), action, data }),
          signal: controller.signal,
        });
        json = await res.json();
        if (!json.ok) throw new Error(json.error || '未知錯誤');
        ok = true;
        return json.data;
      } catch (error) {
        if (!isRetryableReadError(error) || attempt === READ_MAX_ATTEMPTS) {
          if (error?.name === 'AbortError') throw new Error('讀取逾時，請檢查網路後再試');
          throw error;
        }
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new Error('讀取失敗，請稍後再試');
  } finally {
    perfRecord(`API READ ${String(action || 'unknown')}`, startedAt, { ok, serverMs: json?.server_ms });
  }
}

async function apiPost(action, data = {}) {
  const startedAt = perfNow();
  let json;
  let ok = false;
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' }, // simple request，避開 CORS preflight
      body: JSON.stringify({ secret: getSecret(), action, data }),
    });
    json = await res.json();
    if (!json.ok) throw new Error(json.error || '未知錯誤');
    invalidateFullRecordRead();
    ok = true;
    return json.data;
  } finally {
    perfRecord(`API POST ${String(action || 'unknown')}`, startedAt, { ok, serverMs: json?.server_ms });
  }
}

/** 分頁讀取完整清單；若暫時連到不支援 offset 的舊後端，偵測重複頁後安全停止。 */
let fetchAllRecordsPromise = null;

function invalidateFullRecordRead() {
  fetchAllRecordsPromise = null;
}

function fetchAllRecords() {
  if (fetchAllRecordsPromise) return fetchAllRecordsPromise;
  const request = fetchAllRecordsOnce();
  const wrapped = request.finally(() => {
    if (fetchAllRecordsPromise === wrapped) fetchAllRecordsPromise = null;
  });
  fetchAllRecordsPromise = wrapped;
  return wrapped;
}

async function fetchAllRecordsOnce() {
  const startedAt = perfNow();
  const pageSize = 200;
  const all = [];
  const seen = new Set();
  let ok = false;
  try {
    for (let offset = 0; ; offset += pageSize) {
      const page = await apiRead('list', { limit: pageSize, offset });
      let added = 0;
      page.forEach((record) => {
        if (seen.has(record.id)) return;
        seen.add(record.id);
        all.push(record);
        added += 1;
      });

      if (page.length < pageSize || added === 0) break;
    }
    ok = true;
    return all;
  } finally {
    perfRecord('完整記錄下載', startedAt, { ok });
  }
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
  const message = String(msg || '');
  el.dataset.tone = /失敗|錯誤|無法|不可/.test(message)
    ? 'error'
    : /成功|已完成|已儲存|已更新|已建立|已復原|連線成功/.test(message)
      ? 'success'
      : 'info';
  el.textContent = note ? `${msg} · ${note}` : msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 1900);
}

// ===== 清單 =====
async function loadList() {
  const startedAt = perfNow();
  let ok = false;
  $('#list').setAttribute('aria-busy', 'true');
  $('#list').innerHTML = '<p class="empty">載入中…</p>';
  $('#notebook-list').setAttribute('aria-busy', 'true');
  if (state.activeScreen === 'notebook') $('#notebook-list').innerHTML = '<p class="empty">札記載入中…</p>';
  try {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 8);
    const [records, calendarRecords, equipmentRecords] = await Promise.all([
      fetchAllRecords(),
      apiRead('calendar_live', { start: monthStart.toISOString(), end: monthEnd.toISOString() }).catch(() => []),
      apiRead('equipment_list').catch(() => []),
    ]);
    state.records = records;
    state.recordsLoaded = true;
    state.calendarRecords = calendarRecords;
    state.equipmentRecords = equipmentRecords;
    const renderStartedAt = perfNow();
    try {
      renderTagChips();
      renderSpaceOptions();
      renderList();
      renderNotebook();
      showOccasionIfNeeded(records.length);
      updateAppBadge();
    } finally {
      perfRecord('首頁資料渲染', renderStartedAt);
    }
    ok = true;
  } catch (err) {
    $('#list').innerHTML = `<p class="empty">載入失敗：${escapeHtml(err.message)}</p>`;
    $('#notebook-list').innerHTML = `<p class="empty">札記載入失敗：${escapeHtml(err.message)}</p>`;
    if (String(err.message).includes('secret')) openSettings('請輸入正確的 SECRET');
  } finally {
    $('#list').setAttribute('aria-busy', 'false');
    $('#notebook-list').setAttribute('aria-busy', 'false');
    perfRecord('首頁完整載入', startedAt, { ok });
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
    const pending = state.pendingRecordIds.has(r.id);
    const tags = String(r.tags || '').split(',').filter(Boolean)
      .map((t) => `<span class="item-tag">#${escapeHtml(t)}</span>`).join(' ');
    const statusOptions = Object.entries(STATUS_LABELS)
      .map(([v, label]) => `<option value="${v}"${r.status === v ? ' selected' : ''}>${label}</option>`).join('');
    const attachment = parseAttachments(r.attachments)[0];
    const checkbox = state.batch
      ? `<input type="checkbox" aria-label="選取：${escapeHtml(r.content)}" ${state.selected.has(r.id) ? 'checked' : ''} data-act="select">`
      : kind === 'task'
        ? `<input type="checkbox" aria-label="${done ? '重新開啟' : '標示完成'}：${escapeHtml(r.content)}" ${done ? 'checked' : ''} ${pending ? 'disabled' : ''} data-act="toggle">`
        : '<span class="kind-marker" aria-hidden="true"></span>';
    return `
    <div class="item ${done ? 'done' : ''} ${pending ? 'syncing' : ''}" data-id="${r.id}" aria-busy="${pending}">
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
            ${kind === 'task' && r.calendar_id ? '<button type="button" data-act="calendar">開啟行程</button>' : ''}
            <button type="button" class="menu-delete" data-act="delete">刪除</button>
          </div>
        </details>
        ${pending ? '<span class="syncing-label" role="status">同步中…</span>' : ''}
        ${kind === 'task' ? `<select data-act="status" aria-label="變更「${escapeHtml(r.content)}」的狀態" ${pending ? 'disabled' : ''}>${statusOptions}</select>` : ''}
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

function isDailyDigestRecord(record) {
  return String(record?.notes || record?.description || '').includes('[whence-digest]');
}

function visibleCalendarRecords() {
  return state.calendarRecords.filter((record) => !isDailyDigestRecord(record));
}

function renderEmptyToday(category) {
  return `<p class="today-empty">${emptyNote(category)}</p>`;
}

function renderTodaySection(title, rows, category) {
  const tone = category === 'task' ? 'task' : 'record';
  return `<section class="today-section today-${tone}"><div class="today-section-heading"><h3>${title}</h3><span>${rows.length}</span></div>${rows.length ? renderRecordCards(rows) : renderEmptyToday(category)}</section>`;
}

function renderTodayOverview(calendarCount, taskCount, recordCount) {
  const today = new Date();
  const date = today.toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'long' });
  const attentionCount = calendarCount + taskCount;
  const summary = attentionCount
    ? `有 ${calendarCount} 個行程、${taskCount} 件待辦需要留意。`
    : recordCount
      ? `眼前無急事，今日已留下 ${recordCount} 筆記錄。`
      : '今天沒有急著要處理的事。';
  return `<section class="today-overview" aria-labelledby="today-overview-title">
    <p class="today-date">${escapeHtml(date)}</p>
    <h2 id="today-overview-title">今天</h2>
    <p class="today-summary">${escapeHtml(summary)}</p>
    <div class="today-stats" aria-label="今日摘要">
      <span class="calendar"><b>${calendarCount}</b> 行程</span>
      <span class="task"><b>${taskCount}</b> 待辦</span>
      <span class="record"><b>${recordCount}</b> 新記</span>
    </div>
  </section>`;
}

function todayOverviewData() {
  const todayCalendar = visibleCalendarRecords().filter((record) => sameLocalDay(record.start_time));
  const linkedTodayTaskIds = new Set(todayCalendar.map((record) => record.linked_event_id).filter(Boolean));
  const due = state.records.filter((record) => {
    const kind = record.kind || (record.type === 'todo' ? 'task' : 'note');
    return kind === 'task' && !linkedTodayTaskIds.has(record.id) && !['done', 'cancelled'].includes(record.status) && sameLocalDay(record.due_date);
  });
  const dueIds = new Set(due.map((record) => record.id));
  const created = state.records.filter((record) => sameLocalDay(record.created_at) && !dueIds.has(record.id));
  return { todayCalendar, due, created };
}

function renderTodayCalendarSection(rows = visibleCalendarRecords().filter((record) => sameLocalDay(record.start_time))) {
  const cards = rows.map((record) => {
    const start = new Date(record.start_time);
    const time = record.all_day === 'Y' ? '全天' : start.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `<button type="button" class="today-calendar-item" data-today-calendar-id="${escapeHtml(record.id)}"><span>${escapeHtml(time)}</span><strong>${escapeHtml(record.title)}</strong>${record.location ? `<small>${escapeHtml(record.location)}</small>` : ''}</button>`;
  }).join('');
  return `<section class="today-section today-calendar"><div class="today-section-heading"><h3>今日行程</h3><span>${rows.length}</span></div>${cards || renderEmptyToday('calendar')}</section>`;
}

function renderList() {
  const keyword = $('#search').value.trim().toLowerCase();
  $('#records-screen').classList.toggle('searching', !!keyword || !!state.filterTag);
  const today = todayOverviewData();
  $('#today-overview-slot').innerHTML = renderTodayOverview(today.todayCalendar.length, today.due.length, today.created.length);
  if (keyword || state.filterTag) { renderGlobalSearch(keyword, state.filterTag); return; }
  const rows = visibleRecords();
  if (state.activeView === 'today') {
    $('#list').innerHTML = renderTodayCalendarSection(today.todayCalendar)
      + renderTodaySection('今日到期', today.due, 'task')
      + renderTodaySection('今日新增', today.created, 'record');
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
  const calendar = filterTag ? [] : state.calendarSearchRecords.filter((r) => matches(`${r.title} ${r.location} ${r.notes}`));
  const equipmentHtml = equipment.map((r) => `<button type="button" class="search-result" data-search-equipment="${escapeHtml(r.id)}"><strong>${escapeHtml(r.customer || r.machine)}</strong><span>${escapeHtml(r.customer ? `${r.machine} · ${r.description}` : r.description)}</span></button>`).join('');
  const calendarHtml = calendar.map((r) => `<button type="button" class="search-result" data-search-calendar="${escapeHtml(r.id)}"><strong>${escapeHtml(r.title)}</strong><span>${fmtDate(r.start_time)}</span></button>`).join('');
  $('#list').innerHTML = searchSection('待辦', renderRecordCards(byKind('task')), byKind('task').length)
    + searchSection('記事', renderRecordCards(byKind('note')), byKind('note').length)
    + searchSection('札記', renderRecordCards(byKind('idea')), byKind('idea').length)
    + searchSection('設備', equipmentHtml, equipment.length)
    + searchSection('行程', calendarHtml, calendar.length);
}

async function ensureCalendarSearchRecords() {
  if (state.calendarSearchLoaded) return;
  try {
    state.calendarSearchRecords = await apiRead('calendar_list');
    state.calendarSearchLoaded = true;
    if ($('#search').value.trim()) renderList();
  } catch (_) {}
}

function notebookRecords() {
  const keyword = $('#notebook-search').value.trim().toLowerCase();
  return state.records
    .filter((record) => (record.kind || (record.type === 'todo' ? 'task' : 'note')) === 'idea')
    .filter((record) => !state.notebookSpace || String(record.space || '') === state.notebookSpace)
    .filter((record) => !state.notebookTag || String(record.tags || '').split(',').map((tag) => tag.trim().toLowerCase()).includes(state.notebookTag))
    .filter((record) => !keyword || `${record.content} ${record.tags} ${record.space || ''}`.toLowerCase().includes(keyword))
    .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));
}

function notebookTitle(content) {
  return String(content || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean) || '未命名札記';
}

function notebookExcerpt(content) {
  const lines = String(content || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.length > 1 ? lines.slice(1).join(' ') : '';
}

function notebookBody(content) {
  const lines = String(content || '').split(/\r?\n/);
  const titleIndex = lines.findIndex((line) => line.trim());
  return titleIndex < 0 ? '' : lines.slice(titleIndex + 1).join('\n').trim();
}

function renderNotebookTags() {
  const counts = new Map();
  const labels = new Map();
  state.records
    .filter((record) => (record.kind || (record.type === 'todo' ? 'task' : 'note')) === 'idea')
    .forEach((record) => String(record.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean).forEach((tag) => {
      const key = tag.toLowerCase();
      counts.set(key, (counts.get(key) || 0) + 1);
      if (!labels.has(key)) labels.set(key, tag);
    }));
  const tags = [...counts.entries()].sort((a, b) => b[1] - a[1] || labels.get(a[0]).localeCompare(labels.get(b[0]))).slice(0, 8);
  $('#notebook-tags').innerHTML = tags.length
    ? tags.map(([key, count]) => `<button type="button" class="chip ${state.notebookTag === key ? 'on' : ''}" data-notebook-tag="${escapeHtml(key)}" aria-pressed="${state.notebookTag === key}">#${escapeHtml(labels.get(key))} (${count})</button>`).join('')
    : '<span class="notebook-filter-empty">有標籤的札記會顯示在這裡</span>';
}

function renderNotebook() {
  const rows = notebookRecords();
  $('#notebook-count').textContent = `${rows.length} 筆`;
  document.querySelectorAll('[data-notebook-space]').forEach((button) => {
    const active = button.dataset.notebookSpace === state.notebookSpace;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  renderNotebookTags();
  $('#notebook-list').innerHTML = rows.length ? rows.map((record) => {
    const tags = String(record.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 3)
      .map((tag) => `<span>#${escapeHtml(tag)}</span>`).join('');
    const excerpt = notebookExcerpt(record.content);
    const attachment = parseAttachments(record.attachments)[0];
    return `<button type="button" class="notebook-card" data-notebook-id="${escapeHtml(record.id)}"><span class="notebook-card-title">${escapeHtml(notebookTitle(record.content))}</span>${excerpt ? `<span class="notebook-card-excerpt">${escapeHtml(excerpt)}</span>` : ''}<span class="notebook-card-meta">${record.space ? `<b>${escapeHtml(record.space)}</b>` : ''}${tags}${attachment ? '<span>照片</span>' : ''}<time>${fmtDate(record.updated_at || record.created_at)}</time></span></button>`;
  }).join('') : `<div class="empty"><strong>這一頁尚無筆墨</strong><span>${emptyNote('record')}</span></div>`;
}

function openNotebookDetail(id) {
  const record = state.records.find((item) => item.id === id && (item.kind || (item.type === 'todo' ? 'task' : 'note')) === 'idea');
  if (!record) return;
  state.notebookDetailId = id;
  $('#notebook-detail-title').textContent = notebookTitle(record.content);
  const body = notebookBody(record.content);
  $('#notebook-detail-content').textContent = body;
  $('#notebook-detail-content').hidden = !body;
  const tags = String(record.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean).map((tag) => `<span>#${escapeHtml(tag)}</span>`).join('');
  $('#notebook-detail-meta').innerHTML = `${record.space ? `<b>${escapeHtml(record.space)}</b>` : ''}${tags}<time>建立於 ${fmtDate(record.created_at)}</time>${record.updated_at && record.updated_at !== record.created_at ? `<time>修改於 ${fmtDate(record.updated_at)}</time>` : ''}`;
  const attachment = parseAttachments(record.attachments)[0];
  const photo = $('#notebook-detail-photo');
  photo.hidden = !attachment;
  if (attachment) { photo.dataset.fileId = attachment.file_id; photo.dataset.attachmentAction = 'attachment'; }
  else { delete photo.dataset.fileId; delete photo.dataset.attachmentAction; }
  $('#notebook-detail-modal').hidden = false;
  $('#btn-close-notebook-detail').focus();
}

function closeNotebookDetail() {
  $('#notebook-detail-modal').hidden = true;
  state.notebookDetailId = '';
}

function editNotebookDetail() {
  const id = state.notebookDetailId;
  closeNotebookDetail();
  if (id) openEdit(id);
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
function refreshRecordViews() {
  renderTagChips();
  renderSpaceOptions();
  renderList();
  renderNotebook();
  updateAppBadge();
}

function mutationRows(result) {
  return (Array.isArray(result) ? result : [result]).filter((record) => record && record.id);
}

function syncLocalCalendarProjection(record) {
  const kind = record.kind || (record.type === 'todo' ? 'task' : 'note');
  if (kind !== 'task' || !record.calendar_id || !record.due_date) return;
  const existing = state.calendarRecords.find((item) => item.id === record.calendar_id)
    || state.calendarSearchRecords.find((item) => item.id === record.calendar_id);
  const start = new Date(record.due_date);
  const oldStart = new Date(existing?.start_time || '');
  const oldEnd = new Date(existing?.end_time || '');
  const oldDuration = oldEnd.getTime() - oldStart.getTime();
  const duration = Number.isFinite(oldDuration) && oldDuration > 0 && existing?.all_day !== 'Y' ? oldDuration : 60 * 60 * 1000;
  const projection = {
    ...(existing || {}),
    id: record.calendar_id,
    title: record.content,
    location: existing?.location || '',
    notes: existing?.notes || '',
    start_time: record.due_date,
    end_time: record.all_day === 'Y' ? record.due_date : new Date(start.getTime() + duration).toISOString(),
    all_day: record.all_day || 'N',
    reminder_minutes: existing?.reminder_minutes || '30',
    linked_event_id: record.id,
    read_only: false,
  };
  const calendarIndex = state.calendarRecords.findIndex((item) => item.id === projection.id);
  if (calendarIndex >= 0) state.calendarRecords.splice(calendarIndex, 1, projection);
  else state.calendarRecords.push(projection);
  if (state.calendarSearchLoaded) {
    const searchIndex = state.calendarSearchRecords.findIndex((item) => item.id === projection.id);
    if (searchIndex >= 0) state.calendarSearchRecords.splice(searchIndex, 1, projection);
    else state.calendarSearchRecords.push(projection);
  }
}

/** 以後端回傳資料更新記憶體，不再為一筆異動重抓全部 Sheets。 */
function upsertLocalRecords(result, refresh = true) {
  mutationRows(result).forEach((record) => {
    const index = state.records.findIndex((item) => item.id === record.id);
    const previous = index >= 0 ? state.records[index] : null;
    if (previous?.calendar_id && previous.calendar_id !== record.calendar_id) {
      state.calendarRecords = state.calendarRecords.filter((item) => item.id !== previous.calendar_id);
      state.calendarSearchRecords = state.calendarSearchRecords.filter((item) => item.id !== previous.calendar_id);
      state.calendarSearchLoaded = false;
    }
    if (index >= 0) state.records.splice(index, 1, record);
    else state.records.unshift(record);
    syncLocalCalendarProjection(record);
  });
  if (refresh) refreshRecordViews();
  return result;
}

function removeLocalRecords(result, refresh = true) {
  const rows = mutationRows(result);
  const ids = new Set(rows.map((record) => record.id));
  const calendarIds = new Set(rows.map((record) => record.calendar_id).filter(Boolean));
  state.records = state.records.filter((record) => !ids.has(record.id));
  ids.forEach((id) => state.selected.delete(id));
  state.calendarRecords = state.calendarRecords.filter((record) => !calendarIds.has(record.id) && !ids.has(record.linked_event_id));
  state.calendarSearchRecords = state.calendarSearchRecords.filter((record) => !calendarIds.has(record.id) && !ids.has(record.linked_event_id));
  if (calendarIds.size) state.calendarSearchLoaded = false;
  if (refresh) refreshRecordViews();
  return result;
}

async function withBusy(fn, okMsg, applyResult = upsertLocalRecords) {
  try {
    const result = await fn();
    applyResult(result);
    if (okMsg) toast(okMsg);
    return true;
  } catch (err) {
    toast(`失敗：${err.message}`);
    return false;
  }
}

function deleteConfirmationMessage(record) {
  const kind = record?.kind || (record?.type === 'todo' ? 'task' : 'note');
  if (kind === 'task' && !['done', 'cancelled'].includes(record?.status)) {
    const linked = record?.calendar_id ? '已連結的 Whence 行程也會移入最近刪除。' : '';
    return `這筆待辦如果已做完，建議按「完成」保留紀錄。\n\n仍要刪除嗎？${linked}刪除後仍可從「最近刪除」復原。`;
  }
  return record?.calendar_id
    ? '刪除這筆待辦？已連結的 Whence 行程也會移入最近刪除，之後可復原。'
    : '刪除這筆？之後仍可從「最近刪除」復原。';
}

async function updateTaskStatusOptimistically(id, status) {
  const index = state.records.findIndex((record) => record.id === id);
  if (index < 0 || state.pendingRecordIds.has(id)) return false;
  const previous = { ...state.records[index] };
  state.pendingRecordIds.add(id);
  state.records.splice(index, 1, { ...previous, status });
  refreshRecordViews();
  try {
    const updated = await apiPost('update', { id, status });
    upsertLocalRecords(updated, false);
    toast(status === 'done' ? '已完成 ✓' : status === 'open' ? '重新開啟' : '狀態已更新');
    return true;
  } catch (err) {
    const rollbackIndex = state.records.findIndex((record) => record.id === id);
    if (rollbackIndex >= 0) state.records.splice(rollbackIndex, 1, previous);
    toast(`同步失敗，已恢復原狀態：${err.message}`, false);
    return false;
  } finally {
    state.pendingRecordIds.delete(id);
    refreshRecordViews();
  }
}

async function onListClick(e) {
  const searchCalendar = e.target.closest('[data-search-calendar]');
  if (searchCalendar) {
    const record = state.calendarSearchRecords.find((item) => item.id === searchCalendar.dataset.searchCalendar);
    if (record?.start_time) {
      const date = new Date(record.start_time);
      state.calendarCursor = new Date(date.getFullYear(), date.getMonth(), 1);
      state.calendarSelected = date;
    }
    switchScreen('calendar');
    await loadCalendar();
    editCalendar(searchCalendar.dataset.searchCalendar);
    return;
  }
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
  const record = state.records.find((entry) => entry.id === id);
  const control = e.target.closest('[data-act]');
  const act = control?.dataset.act;
  if (state.pendingRecordIds.has(id)) return;

  if (act === 'select') {
    if (control.checked) state.selected.add(id); else state.selected.delete(id);
    updateBatchBar();
  } else if (act === 'toggle') {
    const done = control.checked;
    updateTaskStatusOptimistically(id, done ? 'done' : 'open');
  } else if (act === 'delete') {
    if (confirm(deleteConfirmationMessage(record))) {
      withBusy(() => apiPost('delete', { id }), '已移至最近刪除', removeLocalRecords);
    } else {
      e.preventDefault();
    }
  } else if (act === 'convert') {
    const kind = control.dataset.kind;
    const status = kind === 'task' ? 'open' : 'active';
    if (record?.calendar_id && kind !== 'task' && !confirm('轉換後會移除待辦日期，並將已連結行程移入最近刪除。繼續嗎？')) return;
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
  updateTaskStatusOptimistically(item.dataset.id, e.target.value);
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
    const attachment = await apiRead(trigger.dataset.attachmentAction || 'attachment', { file_id: fileId });
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
}

function closeEdit(force = false) {
  if (!force && state.editDirty && !confirm('放棄尚未儲存的修改？')) return;
  $('#edit-modal').hidden = true;
  state.editingId = '';
  state.editDirty = false;
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
  if (record.calendar_id && (kind !== 'task' || !data.due_date) && !confirm('移除日期後，已連結的 Whence 行程會移入最近刪除。繼續嗎？')) return;
  const button = $('#btn-save-edit');
  button.disabled = true;
  button.textContent = '儲存中…';
  try {
    const updated = await apiPost('update', data);
    upsertLocalRecords(updated);
    closeEdit(true);
    toast(kind === 'task' && data.due_date ? '待辦與行程已更新' : '修改已儲存');
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
  const startedAt = perfNow();
  let ok = false;
  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = '儲存中…';
  try {
    const created = await apiPost('create', data);
    upsertLocalRecords(created);
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
    toast(state.activeKind === 'task' && data.due_date ? '待辦與行程已建立' : '已儲存 ✓');
    ok = true;
  } catch (err) {
    toast(`儲存失敗：${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
    perfRecord('新增記錄完整流程', startedAt, { ok });
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
    return await apiPost(action, { ids, ...extra });
  } catch (err) {
    if (/需要 id/.test(err.message)) {
      const results = [];
      for (const id of ids) results.push(await apiPost(action, { id, ...extra }));
      return results;
    } else {
      throw err;
    }
  }
}

async function batchApplyStatus() {
  if (!state.selected.size) { toast('尚未選取任何項目'); return; }
  const nonTasks = [...state.selected].filter((id) => {
    const record = state.records.find((item) => item.id === id);
    return !record || (record.kind || (record.type === 'todo' ? 'task' : 'note')) !== 'task';
  });
  if (nonTasks.length) { toast('處理狀態只能套用在待辦'); return; }
  const status = $('#batch-status').value;
  const count = state.selected.size;
  const ok = await withBusy(() => batchCall('update', { status }), `已更新 ${count} 筆`);
  if (ok) setBatch(false);
}

async function batchDelete() {
  if (!state.selected.size) { toast('尚未選取任何項目'); return; }
  const unfinishedTasks = [...state.selected].filter((id) => {
    const record = state.records.find((item) => item.id === id);
    const kind = record?.kind || (record?.type === 'todo' ? 'task' : 'note');
    return kind === 'task' && !['done', 'cancelled'].includes(record?.status);
  }).length;
  const guidance = unfinishedTasks ? `\n\n其中 ${unfinishedTasks} 筆待辦尚未完成；若只是做完，建議先批次改為「完成」保留紀錄。` : '';
  if (!confirm(`刪除選取的 ${state.selected.size} 筆？刪除後仍可從「最近刪除」復原。${guidance}`)) return;
  const count = state.selected.size;
  const ok = await withBusy(() => batchCall('delete'), `已移至最近刪除 ${count} 筆`, removeLocalRecords);
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
  renderPerformanceReport();
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
    await apiRead('ping');
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
  const calendar = statusFilter ? [] : state.calendarSearchRecords.filter((record) => recordIds.has(record.linked_event_id) || `${record.title} ${record.location} ${record.notes}`.toLowerCase().includes(customerText))
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
  const activeFilterCount = [
    $('#equipment-search').value.trim(),
    $('#equipment-customer-filter').value,
    $('#equipment-machine-filter').value,
    $('#equipment-status-filter').value,
    $('#equipment-date-from').value,
    $('#equipment-date-to').value,
  ].filter(Boolean).length;
  $('#equipment-search-panel').dataset.active = String(activeFilterCount > 0);
  $('#equipment-filter-state').textContent = activeFilterCount ? `已套用 ${activeFilterCount} 項` : '需要時再展開';
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
  const startedAt = perfNow();
  let ok = false;
  $('#equipment-list').setAttribute('aria-busy', 'true');
  try {
    if (state.equipmentRecords.length) {
      renderEquipmentSuggestions();
      renderEquipmentCustomerFilter();
      renderEquipmentList();
    }
    const recordsRequest = state.recordsLoaded ? Promise.resolve(state.records) : fetchAllRecords();
    const calendarRequest = state.calendarSearchLoaded ? Promise.resolve(state.calendarSearchRecords) : apiRead('calendar_list').catch(() => null);
    const aliasesRequest = state.customerAliasesLoaded ? Promise.resolve(state.customerAliases) : apiRead('customer_aliases').catch(() => null);
    const [equipmentRecords, records, calendarRecords, aliases] = await Promise.all([
      apiRead('equipment_list'), recordsRequest, calendarRequest, aliasesRequest,
    ]);
    state.equipmentRecords = equipmentRecords;
    state.records = records;
    state.recordsLoaded = true;
    if (calendarRecords) {
      state.calendarSearchRecords = calendarRecords;
      state.calendarSearchLoaded = true;
    }
    if (aliases) {
      state.customerAliases = aliases;
      state.customerAliasesLoaded = true;
    }
    const renderStartedAt = perfNow();
    try {
      renderEquipmentSuggestions();
      renderEquipmentCustomerFilter();
      renderEquipmentList();
    } finally {
      perfRecord('設備資料渲染', renderStartedAt);
    }
    ok = true;
  } catch (err) {
    $('#equipment-list').innerHTML = `<div class="empty">設備紀錄載入失敗：${escapeHtml(err.message)}</div>`;
  } finally {
    $('#equipment-list').setAttribute('aria-busy', 'false');
    perfRecord('設備完整載入', startedAt, { ok });
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
    state.customerAliasesLoaded = true;
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
  const occurredValue = $('#equipment-occurred').value;
  if (!occurredValue || isNaN(new Date(occurredValue))) { toast('請填寫發生時間'); return; }
  const data = {
    customer: $('#equipment-customer').value,
    machine, description,
    action_taken: $('#equipment-action').value,
    status: $('#equipment-status').value,
    tags: $('#equipment-tags').value,
    occurred_at: new Date(occurredValue).toISOString(),
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
  const occurredValue = $('#equipment-edit-occurred').value;
  if (!occurredValue || isNaN(new Date(occurredValue))) { toast('請填寫發生時間'); return; }
  const data = { id: state.equipmentEditingId, customer: $('#equipment-edit-customer').value, machine: $('#equipment-edit-machine').value, description: $('#equipment-edit-description').value, action_taken: $('#equipment-edit-action').value, status: $('#equipment-edit-status').value, tags: $('#equipment-edit-tags').value, occurred_at: new Date(occurredValue).toISOString() };
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
  if (!task.calendar_id) { openEdit(id); return; }
  switchScreen('calendar');
  if (!state.calendarRecords.length) await loadCalendar(false, true);
  const linked = state.calendarRecords.find((record) => record.id === task.calendar_id);
  if (linked) editCalendar(linked.id);
  else toast('找不到已連結行程，請重新整理後再試');
}

/** 同月份視窗一分鐘內只對帳一次；App 回到前景時也會自動檢查。 */
const reconcileDoneAt = new Map();
const RECONCILE_TTL = 60 * 1000;
const reconcileInFlight = new Map();

function currentCalendarWindow() {
  const start = new Date(state.calendarCursor); start.setDate(start.getDate() - 7);
  const end = new Date(state.calendarCursor.getFullYear(), state.calendarCursor.getMonth() + 2, 8);
  return { start, end };
}

async function reconcileCurrentCalendar(force = false) {
  const { start, end } = currentCalendarWindow();
  const reconcileKey = `${state.calendarCursor.getFullYear()}-${state.calendarCursor.getMonth()}`;
  if (!force && Date.now() - (reconcileDoneAt.get(reconcileKey) || 0) <= RECONCILE_TTL) return { start, end, skipped: true };
  if (reconcileInFlight.has(reconcileKey)) {
    await reconcileInFlight.get(reconcileKey);
    return { start, end, skipped: false };
  }
  const request = apiPost('calendar_reconcile', { start: start.toISOString(), end: end.toISOString() });
  reconcileInFlight.set(reconcileKey, request);
  try {
    await request;
    reconcileDoneAt.set(reconcileKey, Date.now());
  } finally {
    if (reconcileInFlight.get(reconcileKey) === request) reconcileInFlight.delete(reconcileKey);
  }
  return { start, end, skipped: false };
}

let calendarResumeSyncPromise = null;
function syncCalendarOnResume(event) {
  if (event?.type === 'pageshow' && !event.persisted) return;
  if ((document.visibilityState && document.visibilityState !== 'visible') || !getSecret() || calendarResumeSyncPromise) return;
  calendarResumeSyncPromise = reconcileCurrentCalendar(false)
    .then((result) => {
      if (result.skipped) return null;
      if (state.activeScreen === 'calendar') return loadCalendar(false, true);
      if (state.activeScreen === 'equipment') return loadEquipment();
      return loadList();
    })
    .catch((err) => toast(`日曆同步失敗：${err.message}`))
    .finally(() => { calendarResumeSyncPromise = null; });
}

let calendarLoadGeneration = 0;

function calendarWindowKey(start, end) {
  return `${start.toISOString()}|${end.toISOString()}`;
}

async function fetchCalendarSnapshot(start, end) {
  const [records, calendarRecords] = await Promise.all([fetchAllRecords(), apiRead('calendar_live', {
    start: start.toISOString(), end: end.toISOString(),
  })]);
  return { records, calendarRecords };
}

function applyCalendarSnapshot(snapshot, start, end, generation) {
  if (generation !== calendarLoadGeneration) return false;
  state.records = snapshot.records;
  state.recordsLoaded = true;
  state.calendarRecords = snapshot.calendarRecords;
  state.calendarWindowKey = calendarWindowKey(start, end);
  state.calendarSearchLoaded = false;
  const renderStartedAt = perfNow();
  try {
    renderCalendarList();
    renderMonthCalendar();
    updateAppBadge();
  } finally {
    perfRecord('行程資料渲染', renderStartedAt);
  }
  return true;
}

function refreshCalendarInBackground(start, end, generation) {
  const startedAt = perfNow();
  const expectedKey = calendarWindowKey(start, end);
  reconcileCurrentCalendar(false)
    .then(async (result) => {
      if (generation !== calendarLoadGeneration) return;
      if (result.skipped && state.calendarWindowKey === expectedKey) return;
      const snapshot = await fetchCalendarSnapshot(start, end);
      applyCalendarSnapshot(snapshot, start, end, generation);
    })
    .catch((error) => {
      if (generation === calendarLoadGeneration) toast(`日曆同步失敗：${error.message}`);
    })
    .finally(() => perfRecord('行程背景同步', startedAt));
}

async function loadCalendar(forceReconcile = false, snapshotOnly = false) {
  const startedAt = perfNow();
  const generation = ++calendarLoadGeneration;
  let ok = false;
  $('#calendar-list').setAttribute('aria-busy', 'true');
  try {
    const { start, end } = currentCalendarWindow();
    if (!forceReconcile && !snapshotOnly && state.recordsLoaded) {
      renderCalendarList();
      renderMonthCalendar();
      updateAppBadge();
      refreshCalendarInBackground(start, end, generation);
      ok = true;
      return;
    }
    if (forceReconcile) {
      await reconcileCurrentCalendar(true);
      if (generation !== calendarLoadGeneration) return;
    }
    const snapshot = await fetchCalendarSnapshot(start, end);
    applyCalendarSnapshot(snapshot, start, end, generation);
    if (!forceReconcile && !snapshotOnly) refreshCalendarInBackground(start, end, generation);
    ok = true;
  } catch (err) {
    $('#calendar-list').innerHTML = `<p class="empty">行程載入失敗：${escapeHtml(err.message)}</p>`;
  } finally {
    $('#calendar-list').setAttribute('aria-busy', 'false');
    perfRecord('行程完整載入', startedAt, { ok });
  }
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
  return visibleCalendarRecords().filter((r) => dayKey(r.start_time) === key).sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
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
  $('#calendar-day-list').innerHTML = items.length ? items.map((item) => `<button type="button" class="calendar-day-entry" data-calendar-id="${escapeHtml(item.id)}"><span>${item.all_day === 'Y' ? '全天' : new Date(item.start_time).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })}</span><strong>${escapeHtml(item.title)}</strong></button>`).join('') : '<p class="today-empty">這天沒有行程</p>';
}

function calendarListItems() {
  return visibleCalendarRecords().slice().sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
}

function renderCalendarList() {
  const kw = $('#calendar-search').value.trim().toLowerCase();
  const rows = calendarListItems().filter((record) => !kw || `${record.title} ${record.location} ${record.notes}`.toLowerCase().includes(kw));
  if (!rows.length) { $('#calendar-list').innerHTML = `<div class="empty"><strong>還沒有行程</strong><span>${emptyNote('calendar')}</span></div>`; return; }
  $('#calendar-list').innerHTML = rows.map((r) => {
    const start = new Date(r.start_time);
    const allDay = r.all_day === 'Y';
    const time = allDay ? '全天' : start.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
    const day = start.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric', weekday: 'short' });
    return `<article class="item calendar-item" data-id="${escapeHtml(r.id)}"><div class="calendar-item-time">${escapeHtml(day)}<br>${escapeHtml(time)}</div><div class="item-main"><div class="item-content">${escapeHtml(r.title)}</div><div class="item-meta">${r.location ? `<span>${escapeHtml(r.location)}</span>` : ''}${r.linked_event_id ? '<span class="space-meta">已關聯待辦</span>' : ''}${r.read_only ? '<span class="space-meta">Google 日曆 · 唯讀</span>' : `<span>提前 ${escapeHtml(r.reminder_minutes || '0')} 分鐘</span>`}</div></div>${r.read_only ? '' : '<div class="calendar-item-actions"><button class="secondary-btn" data-calendar-act="edit">編輯</button><button class="del-btn" data-calendar-act="delete">刪除</button></div>'}</article>`;
  }).join('');
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
  $('#calendar-title').textContent = '新增行程';
  $('#btn-save-calendar').textContent = '儲存行程'; $('#btn-cancel-calendar-edit').hidden = true;
  setCalendarDefaults();
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
    await apiPost(id ? 'calendar_update' : 'calendar_create', data);
    toast(data.linked_event_id ? '行程與待辦已更新' : (id ? '行程已更新' : '行程已建立'));
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
  $('#calendar-title').textContent = '編輯行程';
  $('#btn-save-calendar').textContent = '更新行程'; $('#btn-cancel-calendar-edit').hidden = false; window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateAppBadge() {
  if (!navigator.setAppBadge) return;
  const now = new Date();
  const today = now.toDateString();
  const scheduleRows = visibleCalendarRecords().filter((r) => new Date(r.start_time).toDateString() === today);
  const linkedTaskIds = new Set(scheduleRows.map((r) => r.linked_event_id).filter(Boolean));
  const due = state.records.filter((r) => (r.kind || '') === 'task' && !linkedTaskIds.has(r.id) && !['done', 'cancelled'].includes(r.status) && r.due_date && new Date(r.due_date).toDateString() === today).length;
  const schedule = scheduleRows.length;
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
    const rows = await apiRead('trash_list');
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

function syncVisualViewport() {
  const viewport = window.visualViewport;
  const root = document.documentElement;
  const height = Math.round(viewport?.height || window.innerHeight || root?.clientHeight || 0);
  const offsetTop = Math.round(viewport?.offsetTop || 0);
  if (height && root?.style) {
    root.style.setProperty('--visual-viewport-height', `${height}px`);
    root.style.setProperty('--visual-viewport-top', `${offsetTop}px`);
  }
  const layoutHeight = Math.max(window.innerHeight || 0, root?.clientHeight || 0, height);
  const keyboardOpen = !!viewport && layoutHeight - height > 120;
  document.body.classList.toggle('keyboard-open', keyboardOpen);
}

function keepFocusedControlVisible() {
  const active = document.activeElement;
  if (!document.body.classList.contains?.('keyboard-open') || !active?.matches?.('input, textarea, select')) return;
  setTimeout(() => active.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }), 120);
}

function switchScreen(screen, updateHash = true) {
  const startedAt = perfNow();
  const nextScreen = ['notebook', 'equipment', 'calendar'].includes(screen) ? screen : 'records';
  if (state.activeScreen === 'calendar' && nextScreen !== 'calendar') calendarLoadGeneration += 1;
  state.screenScroll[state.activeScreen] = window.scrollY || 0;
  state.activeScreen = nextScreen;
  if (document.body?.dataset) document.body.dataset.screen = state.activeScreen;
  $('#records-screen').hidden = state.activeScreen !== 'records';
  $('#notebook-screen').hidden = state.activeScreen !== 'notebook';
  $('#equipment-screen').hidden = state.activeScreen !== 'equipment';
  $('#calendar-screen').hidden = state.activeScreen !== 'calendar';
  document.querySelectorAll('.app-nav-btn').forEach((button) => {
    const active = button.dataset.screen === state.activeScreen;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (updateHash) history.replaceState(null, '', `#${state.activeScreen}`);
  if (state.activeScreen === 'notebook') {
    if (state.records.length) renderNotebook();
  }
  if (state.activeScreen === 'equipment' && getSecret()) loadEquipment();
  if (state.activeScreen === 'calendar') {
    // 先同步目前的檢視狀態並立即畫出月曆，避免等待遠端對帳時整頁空白。
    setCalendarView(state.calendarView);
    renderMonthCalendar();
    if (getSecret()) loadCalendar();
  }
  const restoreScroll = () => window.scrollTo({ top: state.screenScroll[state.activeScreen] || 0, behavior: 'instant' });
  if (window.requestAnimationFrame) window.requestAnimationFrame(restoreScroll); else restoreScroll();
  perfRecord(`切換畫面 ${state.activeScreen}`, startedAt);
}

// ===== 初始化 =====
function init() {
  syncVisualViewport();
  window.visualViewport?.addEventListener('resize', syncVisualViewport);
  window.visualViewport?.addEventListener('scroll', syncVisualViewport);
  window.addEventListener?.('resize', syncVisualViewport);
  document.addEventListener('focusin', keepFocusedControlVisible);
  document.addEventListener('visibilitychange', syncCalendarOnResume);
  window.addEventListener?.('pageshow', syncCalendarOnResume);
  setActiveKind(KIND_LABELS[state.activeKind] ? state.activeKind : 'note');
  $('#space').value = localStorage.getItem('whence_last_space') || '';
  syncSpaceButtons();
  document.querySelectorAll('.type-btn[data-kind]').forEach((b) =>
    b.addEventListener('click', () => setActiveKind(b.dataset.kind)));
  document.querySelectorAll('.view-btn').forEach((button) =>
    button.addEventListener('click', () => setActiveView(button.dataset.view)));
  const jumpToCapture = (selector) => {
    const capture = $(selector);
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    capture.classList.remove('capture-attention');
    capture.classList.add('capture-attention');
    capture.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    setTimeout(() => capture.classList.remove('capture-attention'), reducedMotion ? 0 : 900);
  };
  $('#btn-jump-capture').addEventListener('click', () => jumpToCapture('#input-card'));
  $('#btn-jump-equipment-capture').addEventListener('click', () => jumpToCapture('.equipment-capture'));
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
  $('#btn-refresh').addEventListener('click', () => state.activeScreen === 'equipment' ? loadEquipment() : state.activeScreen === 'calendar' ? loadCalendar(true) : loadList());
  $('#btn-settings').addEventListener('click', () => openSettings());
  $('#btn-close-settings').addEventListener('click', closeSettings);
  $('#btn-toggle-secret').addEventListener('click', toggleSecretVisibility);
  $('#performance-debug-toggle').addEventListener('change', (event) => setPerformanceDebug(event.target.checked));
  $('#btn-copy-performance').addEventListener('click', copyPerformanceReport);
  $('#btn-clear-performance').addEventListener('click', clearPerformanceReport);
  $('#btn-close-photo').addEventListener('click', closePhotoModal);
  $('#btn-close-edit').addEventListener('click', () => closeEdit());
  $('#btn-save-edit').addEventListener('click', saveEdit);
  $('#edit-photo-input').addEventListener('change', handleEditPhotoSelection);
  $('#btn-remove-edit-photo').addEventListener('click', removeEditPhoto);
  $('#edit-kind').addEventListener('change', () => { state.editDirty = true; updateEditKindUI(); });
  ['#edit-content', '#edit-space', '#edit-tags', '#edit-due-date', '#edit-due-time'].forEach((selector) =>
    $(selector).addEventListener('input', () => { state.editDirty = true; }));
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
    if (confirm('撤回最後建立的一筆記錄？')) withBusy(() => apiPost('undo'), '已撤回', removeLocalRecords);
  });

  $('#btn-batch').addEventListener('click', () => setBatch(!state.batch));
  $('#btn-batch-apply').addEventListener('click', batchApplyStatus);
  $('#btn-batch-delete').addEventListener('click', batchDelete);
  $('#btn-batch-exit').addEventListener('click', () => setBatch(false));

  $('#search').addEventListener('input', () => { if ($('#search').value.trim()) { $('#records-panel').open = true; ensureCalendarSearchRecords(); } renderList(); });
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
  $('#notebook-search').addEventListener('input', renderNotebook);
  $('#notebook-spaces').addEventListener('click', (event) => {
    const button = event.target.closest('[data-notebook-space]');
    if (!button) return;
    state.notebookSpace = state.notebookSpace === button.dataset.notebookSpace ? '' : button.dataset.notebookSpace;
    renderNotebook();
  });
  $('#notebook-tags').addEventListener('click', (event) => {
    const button = event.target.closest('[data-notebook-tag]');
    if (!button) return;
    state.notebookTag = state.notebookTag === button.dataset.notebookTag ? '' : button.dataset.notebookTag;
    renderNotebook();
  });
  $('#notebook-list').addEventListener('click', (event) => {
    const card = event.target.closest('[data-notebook-id]');
    if (card) openNotebookDetail(card.dataset.notebookId);
  });
  $('#btn-close-notebook-detail').addEventListener('click', closeNotebookDetail);
  $('#notebook-detail-edit').addEventListener('click', editNotebookDetail);
  $('#notebook-detail-photo').addEventListener('click', (event) => openAttachment(event.currentTarget));
  $('#notebook-detail-modal').addEventListener('click', (event) => { if (event.target === $('#notebook-detail-modal')) closeNotebookDetail(); });
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
  $('#calendar-all-day').addEventListener('change', () => { $('#calendar-end-wrap').hidden = $('#calendar-all-day').checked; });
  $('#calendar-add').addEventListener('click', () => { resetCalendarForm(); $('#calendar-form').hidden = false; $('#calendar-title-input').focus(); });
  $('#calendar-prev').addEventListener('click', () => moveCalendarMonth(-1));
  $('#calendar-next').addEventListener('click', () => moveCalendarMonth(1));
  $('#calendar-today').addEventListener('click', () => { state.calendarSelected = new Date(); state.calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1); renderMonthCalendar(); });
  $('#calendar-view-month').addEventListener('click', () => setCalendarView('month'));
  $('#calendar-view-list').addEventListener('click', () => setCalendarView('list'));
  $('#calendar-grid').addEventListener('click', (event) => { const day = event.target.closest('[data-calendar-date]'); if (!day) return; state.calendarSelected = new Date(`${day.dataset.calendarDate}T12:00:00`); renderMonthCalendar(); });
  $('#calendar-day-list').addEventListener('click', (event) => { const eventButton = event.target.closest('[data-calendar-id]'); if (eventButton) editCalendar(eventButton.dataset.calendarId); });
  $('#btn-save-calendar').addEventListener('click', saveCalendar);
  $('#btn-cancel-calendar-edit').addEventListener('click', closeCalendarEdit);
  $('#calendar-search').addEventListener('input', renderCalendarList);
  $('#calendar-list').addEventListener('click', (event) => {
    const item = event.target.closest('.calendar-item'); if (!item) return;
    const control = event.target.closest('[data-calendar-act]');
    const id = item.dataset.id;
    if (!control) { editCalendar(id); return; }
    if (control.dataset.calendarAct === 'edit') editCalendar(id);
    if (control.dataset.calendarAct === 'delete') {
      const record = state.calendarRecords.find((item) => item.id === id);
      const message = record?.linked_event_id ? '刪除這筆行程？Google 行程會刪除，關聯待辦會保留但移除日期。' : '刪除這筆行程？Google Calendar 內的行程也會刪除。';
      if (confirm(message)) apiPost('calendar_delete', { id }).then(() => { toast('行程已刪除'); return loadCalendar(); }).catch((err) => toast(err.message));
    }
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
    else if (!$('#notebook-detail-modal').hidden) closeNotebookDetail();
    else if (!$('#settings-modal').hidden) closeSettings();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js?v=1.1.0').catch(() => {});
  }

  resetCalendarForm();
  renderShanfangDaily();
  checkForAppUpdate();
  const initialScreen = location.hash === '#notebook' ? 'notebook' : location.hash === '#equipment' ? 'equipment' : location.hash === '#calendar' ? 'calendar' : 'records';
  switchScreen(initialScreen, false);
  if (getSecret()) {
    if (['records', 'notebook'].includes(initialScreen)) loadList();
  } else {
    openSettings('第一次使用：貼上你在 GAS 指令碼屬性設定的 SECRET');
  }
}

init();
