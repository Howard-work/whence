'use strict';

// ===== 設定 =====
const API_URL = 'https://script.google.com/macros/s/AKfycbxfaA0qyKmyJLJ5m2edJNd1mh2iFpUKvVahDejUHfJoWQ0xc1lj8z6qeIh88jhSQVK5zw/exec';

const STATUS_LABELS = { open: '待處理', doing: '進行中', waiting: '等待中', done: '完成', cancelled: '取消' };
const TYPE_LABELS = { note: '記事', todo: '待辦' };

// ===== 狀態（資料真相在 Sheets，此處僅為視圖快取）=====
const state = {
  records: [],
  activeType: 'note',
  important: false,
  urgent: false,
  filterTag: '',
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

// ===== DOM 工具 =====
const $ = (sel) => document.querySelector(sel);
const escapeHtml = (s) => String(s).replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2500);
}

// ===== 清單 =====
async function loadList() {
  $('#list').innerHTML = '<p class="empty">載入中…</p>';
  try {
    state.records = await apiGet({ action: 'list' });
    renderTagChips();
    renderList();
  } catch (err) {
    $('#list').innerHTML = `<p class="empty">載入失敗：${escapeHtml(err.message)}</p>`;
    if (String(err.message).includes('secret')) openSettings('請輸入正確的 SECRET');
  }
}

function visibleRecords() {
  const kw = $('#search').value.trim().toLowerCase();
  const fType = $('#filter-type').value;
  const fStatus = $('#filter-status').value;
  return state.records.filter((r) => {
    if (fType && r.type !== fType) return false;
    if (fStatus && r.status !== fStatus) return false;
    if (state.filterTag && !String(r.tags).split(',').includes(state.filterTag)) return false;
    if (kw && !`${r.content} ${r.tags}`.toLowerCase().includes(kw)) return false;
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

function renderList() {
  const rows = visibleRecords();
  if (!rows.length) {
    $('#list').innerHTML = '<p class="empty">沒有資料</p>';
    return;
  }
  $('#list').innerHTML = rows.map((r) => {
    const done = r.status === 'done';
    const tags = String(r.tags || '').split(',').filter(Boolean)
      .map((t) => `<span class="item-tag">#${escapeHtml(t)}</span>`).join(' ');
    const statusOptions = Object.entries(STATUS_LABELS)
      .map(([v, label]) => `<option value="${v}"${r.status === v ? ' selected' : ''}>${label}</option>`).join('');
    return `
    <div class="item ${done ? 'done' : ''}" data-id="${r.id}">
      <input type="checkbox" ${done ? 'checked' : ''} data-act="toggle">
      <div class="item-main">
        <div class="item-content">${escapeHtml(r.content)}</div>
        <div class="item-meta">
          <span class="badge type-${r.type}">${TYPE_LABELS[r.type] || r.type}</span>
          ${r.important === 'Y' ? '<span class="badge important">重要</span>' : ''}
          ${r.urgent === 'Y' ? '<span class="badge urgent">緊急</span>' : ''}
          ${tags}
          ${r.due_date ? `<span>⏰ ${fmtDue(r)}</span>` : ''}
          <span>${fmtDate(r.created_at)}</span>
        </div>
      </div>
      <div class="item-actions">
        <button class="del-btn" data-act="delete" title="刪除">✕</button>
        <select data-act="status">${statusOptions}</select>
      </div>
    </div>`;
  }).join('');
}

function renderTagChips() {
  const counts = {};
  state.records.forEach((r) => {
    String(r.tags || '').split(',').filter(Boolean)
      .forEach((t) => { counts[t] = (counts[t] || 0) + 1; });
  });
  const tags = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 12);
  if (state.filterTag && !tags.includes(state.filterTag)) tags.unshift(state.filterTag);
  $('#tag-chips').innerHTML = tags.map((t) =>
    `<button class="chip ${state.filterTag === t ? 'on' : ''}" data-tag="${escapeHtml(t)}">#${escapeHtml(t)} (${counts[t] || 0})</button>`
  ).join('');
}

// ===== 回寫動作 =====
async function withBusy(fn, okMsg) {
  try {
    await fn();
    if (okMsg) toast(okMsg);
    await loadList();
  } catch (err) {
    toast(`失敗：${err.message}`);
  }
}

function onListClick(e) {
  const item = e.target.closest('.item');
  if (!item) return;
  const id = item.dataset.id;
  const act = e.target.dataset.act;

  if (act === 'toggle') {
    const done = e.target.checked;
    withBusy(() => apiPost('update', { id, status: done ? 'done' : 'open' }), done ? '已完成 ✓' : '重新開啟');
  } else if (act === 'delete') {
    if (confirm('刪除這筆？（軟刪除，資料仍在試算表）')) {
      withBusy(() => apiPost('delete', { id }), '已刪除');
    } else {
      e.preventDefault();
    }
  }
}

function onListChange(e) {
  const item = e.target.closest('.item');
  if (!item || e.target.dataset.act !== 'status') return;
  withBusy(() => apiPost('update', { id: item.dataset.id, status: e.target.value }), '狀態已更新');
}

// ===== 輸入區 =====
function setActiveType(type) {
  state.activeType = type;
  document.querySelectorAll('.type-btn[data-type]').forEach((b) =>
    b.classList.toggle('active', b.dataset.type === type));
  $('#todo-options').hidden = type !== 'todo';
}

async function save() {
  const content = $('#content').value.trim();
  if (!content) { toast('內容不可為空'); return; }

  const data = {
    type: state.activeType,
    content,
    tags: $('#tags').value,
    important: state.important,
    urgent: state.urgent,
    source: 'manual',
  };
  if (state.activeType === 'todo' && $('#due-date').value) {
    const date = $('#due-date').value;
    const time = $('#due-time').value;
    data.due_date = time ? `${date}T${time}:00+08:00` : `${date}T00:00:00+08:00`;
    data.all_day = !time;
  }

  const btn = $('#btn-save');
  btn.disabled = true;
  try {
    await apiPost('create', data);
    $('#content').value = '';
    $('#tags').value = '';
    $('#due-date').value = '';
    $('#due-time').value = '';
    state.important = false;
    state.urgent = false;
    $('#btn-important').classList.remove('on');
    $('#btn-urgent').classList.remove('on');
    toast('已儲存 ✓');
    await loadList();
  } catch (err) {
    toast(`儲存失敗：${err.message}`);
  } finally {
    btn.disabled = false;
  }
}

// ===== 設定面板 =====
function openSettings(hint) {
  $('#secret-input').value = getSecret();
  $('#settings-hint').textContent = hint || '';
  $('#settings-modal').hidden = false;
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

// ===== 初始化 =====
function init() {
  document.querySelectorAll('.type-btn[data-type]').forEach((b) =>
    b.addEventListener('click', () => setActiveType(b.dataset.type)));

  $('#btn-important').addEventListener('click', () => {
    state.important = !state.important;
    $('#btn-important').classList.toggle('on', state.important);
  });
  $('#btn-urgent').addEventListener('click', () => {
    state.urgent = !state.urgent;
    $('#btn-urgent').classList.toggle('on', state.urgent);
  });

  $('#btn-save').addEventListener('click', save);
  $('#btn-refresh').addEventListener('click', loadList);
  $('#btn-settings').addEventListener('click', () => openSettings());
  $('#btn-save-secret').addEventListener('click', saveSecret);
  $('#btn-undo').addEventListener('click', () => {
    if (confirm('撤回最後建立的一筆？')) withBusy(() => apiPost('undo'), '已撤回');
  });

  $('#search').addEventListener('input', renderList);
  $('#filter-type').addEventListener('change', renderList);
  $('#filter-status').addEventListener('change', renderList);
  $('#tag-chips').addEventListener('click', (e) => {
    const tag = e.target.closest('.chip')?.dataset.tag;
    if (!tag) return;
    state.filterTag = state.filterTag === tag ? '' : tag;
    renderTagChips();
    renderList();
  });

  $('#list').addEventListener('click', onListClick);
  $('#list').addEventListener('change', onListChange);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  if (getSecret()) {
    loadList();
  } else {
    openSettings('第一次使用：貼上你在 GAS 指令碼屬性設定的 SECRET');
  }
}

init();
