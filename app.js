'use strict';

// ===== 設定 =====
const API_URL = 'https://script.google.com/macros/s/AKfycbxfaA0qyKmyJLJ5m2edJNd1mh2iFpUKvVahDejUHfJoWQ0xc1lj8z6qeIh88jhSQVK5zw/exec';

const STATUS_LABELS = { active: '保留', open: '待處理', doing: '進行中', waiting: '等待中', done: '完成', cancelled: '取消' };
const KIND_LABELS = { note: '記事', idea: '靈感', task: '待辦' };
const VIEW_LABELS = { today: '今日', task: '待辦', idea: '靈感', note: '記事', machine: '機況' };

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
  $('#list').setAttribute('aria-busy', 'true');
  $('#list').innerHTML = '<p class="empty">載入中…</p>';
  try {
    state.records = await fetchAllRecords();
    renderTagChips();
    renderSpaceOptions();
    renderList();
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
    if (state.activeView === 'machine') return false;
    if (state.activeView === 'today' && !isToday(r.created_at) && !isToday(r.due_date)) return false;
    if (['task', 'idea', 'note'].includes(state.activeView) && kind !== state.activeView) return false;
    if (state.activeView === 'task' && ['done', 'cancelled'].includes(r.status)) return false;
    if (fSpace && String(r.space || '') !== fSpace) return false;
    if (fStatus && r.status !== fStatus) return false;
    if (state.filterTag && !String(r.tags).split(',').includes(state.filterTag)) return false;
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

function renderList() {
  const rows = visibleRecords();
  if (!rows.length) {
    $('#list').innerHTML = state.activeView === 'machine'
      ? '<div class="empty"><strong>機況模組尚未啟用</strong><span>它會保持獨立，不會成為第四種 Kind。</span></div>'
      : '<div class="empty"><strong>目前沒有符合的記錄</strong><span>新增一筆，或調整上方的搜尋與篩選條件。</span></div>';
    return;
  }
  $('#list').innerHTML = rows.map((r) => {
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
            ${kind !== 'idea' ? '<button type="button" data-act="convert" data-kind="idea">轉為靈感</button>' : ''}
            <button type="button" class="menu-delete" data-act="delete">刪除</button>
          </div>
        </details>
        ${kind === 'task' ? `<select data-act="status" aria-label="變更「${escapeHtml(r.content)}」的狀態">${statusOptions}</select>` : ''}
      </div>`}
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
    const attachment = await apiGet({ action: 'attachment', file_id: fileId });
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
  const button = $('#btn-save-edit');
  button.disabled = true;
  button.textContent = '儲存中…';
  try {
    await apiPost('update', data);
    closeEdit(true);
    toast('修改已儲存');
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
  document.querySelectorAll('.view-btn').forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $('#records-title').textContent = VIEW_LABELS[view];
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
  $('#btn-refresh').addEventListener('click', loadList);
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
    $(selector).addEventListener('input', () => { state.editDirty = true; }));
  $('#edit-important').addEventListener('click', () => {
    state.editImportant = !state.editImportant; state.editDirty = true; updateEditFlags();
  });
  $('#edit-urgent').addEventListener('click', () => {
    state.editUrgent = !state.editUrgent; state.editDirty = true; updateEditFlags();
  });
  $('#btn-save-secret').addEventListener('click', saveSecret);
  $('#btn-undo').addEventListener('click', () => {
    if (confirm('撤回最後建立的一筆？')) withBusy(() => apiPost('undo'), '已撤回');
  });

  $('#btn-batch').addEventListener('click', () => setBatch(!state.batch));
  $('#btn-batch-apply').addEventListener('click', batchApplyStatus);
  $('#btn-batch-delete').addEventListener('click', batchDelete);
  $('#btn-batch-exit').addEventListener('click', () => setBatch(false));

  $('#search').addEventListener('input', renderList);
  $('#filter-space').addEventListener('change', renderList);
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
    if (!$('#edit-modal').hidden) closeEdit();
    else if (!$('#photo-modal').hidden) closePhotoModal();
    else if (!$('#settings-modal').hidden) closeSettings();
  });

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
