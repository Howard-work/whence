# Whence Changelog

## v0.11.0 — 2026-07-15（第一階段速度與安全性）

- 新增、編輯、轉換、批次狀態與刪除後直接更新本機視圖，不再為單筆異動重新下載全部記錄。
- 待辦勾選與狀態切換採樂觀更新，立即反映畫面；同步中停用控制，失敗會恢復原狀態。
- PWA 所有一般讀取改用 POST，SECRET 不再放在網址參數；GAS 讀取不占用寫入鎖。
- 刪除未完成待辦時先提示以「完成」保留紀錄，單筆與批次刪除均說明可從最近刪除復原。

## v0.10.1 — 2026-07-15（Google 日曆同步可靠性）

- App 從背景回到前景時自動對帳 Google Calendar，對帳節流由 10 分鐘縮短為 1 分鐘。
- 對帳完成後刷新目前畫面，避免後端已同步但畫面仍顯示舊行程。
- Whence 更新行程後立即讀回 Google Calendar 驗證時間與提醒；首次不一致會重試，仍失敗則明確提示，不再假裝儲存成功。

## v0.10.0 — 2026-07-15（效能檢測基礎）

- 設定新增預設關閉的「效能檢測」，記錄安全的操作名稱、前端總耗時與 GAS 處理時間。
- 匿名耗時僅保存在目前裝置、最多 150 筆，可直接複製或清除；不記錄記事內容、SECRET、附件或 API 參數。
- 量測首頁、設備、行程、畫面切換、完整記錄下載、資料渲染與新增記錄流程，作為後續快取及局部更新的優化依據。

## v0.9.2 — 2026-07-13

- 修正首次進入行程頁時月曆需再點一次才出現；現在切頁後立即顯示月曆，最新行程在背景載入後更新。

## v0.9.1 — 2026-07-12（穩定化）

- 完成或取消已連結行程的待辦時，移除該 Google 行程的提醒（行程保留作紀錄）；重新開啟待辦會依原設定還原提醒。
- 行程畫面的 Google 日曆對帳改為同月份視窗 10 分鐘內只執行一次，右上「重新整理」可強制立即對帳；切換分頁明顯變快。
- 設備表單「發生時間」被清空時，儲存會明確提示「請填寫發生時間」，不再無聲失敗。
- 後端同步上線：每日 03:00 自動備份試算表（保留最近 7 份日備份＋每月 1 份月備份，超出移至 Drive 垃圾桶）；gas/ 納入 git 版本控制。

## v0.9.0 — 2026-07-12

- Made an undated task a Records-only item; Calendar now contains real Whence and Google events only.
- Automatically creates one linked event when a task receives a date, with title, date, and all-day changes synchronized from either editor on save.
- Keeps task-only fields separate from event-only duration, location, notes, and reminder fields.
- Added safe delete, restore, unlink, legacy-link repair, and on-open Google Calendar reconciliation rules.
- Removed the former manual sync controls and prevented linked task/event pairs from being counted twice in Today and app badges.

## v0.8.1 — 2026-07-12

- Preserved the iPhone top safe area while the software keyboard is open so modal titles and close controls no longer sit beneath the status bar or Dynamic Island.
- Kept edit-modal headings visible and tappable while long forms scroll.
- Changed focused-field scrolling from forced centering to nearest-edge movement to avoid unnecessary form jumps.

## v0.8.0 — 2026-07-12

- Added a dedicated Notebook screen backed by the existing `idea` records, with full-text search, four Space filters, and up to eight frequent tags.
- Added a quiet preview list that uses the first line as its title and opens a focused full-content reader with photo and edit actions.
- Changed the bottom navigation to four equal destinations: Records, Notebook, Equipment, and Calendar, while preserving each screen's filters and scroll position.
- Kept v0.7.2 calendar-task editing, list inclusion, deduplication, and iPhone keyboard fixes in the same public release line.

## v0.7.2 — 2026-07-12

- Tapping a due task in the calendar month view now opens the full task editor directly.
- Calendar list view now includes unlinked due tasks alongside calendar events, while linked task-event pairs appear only once.
- Improved iPhone keyboard handling by following the visual viewport, keeping focused controls visible, and temporarily hiding the bottom navigation while typing.

## v0.7.1 — 2026-07-12

- Added a direct 「開啟待辦編輯」 action inside a linked Whence calendar event.
- Calendar editing now preserves access to its linked task even when that task is completed or cancelled.
- Saving a task while the Calendar screen remains open refreshes the underlying calendar view.

## v0.7.0 — 2026-07-12

- Added explicit, previewed task ↔ Whence calendar synchronization for already-linked items.
- Task-to-calendar sync updates title, due time, and all-day state while retaining the event's duration, location, notes, and reminder.
- Calendar-to-task sync updates only task title and due time; it never changes task status, tags, or Space.
- External Google Calendar events remain read-only and are never eligible for synchronization.

## v0.6.6 — 2026-07-12

- Calendar event editing now changes the form heading from 「新增行程」 to 「編輯行程」.
- Tapping the currently open event a second time now closes and resets the edit form.
- Saving or cancelling an edit always restores the new-event form state.

## v0.6.5 — 2026-07-12

- Refined empty states so functional headings and counts are not repeated inside their message cards.
- Rewrote the initial 山房按語 collection with quieter, more literary original lines.
- Gave quiet text a restrained serif treatment and a warmer page-margin accent without adding interaction or animation.

## v0.6.4 — 2026-07-12

- Added the quiet "山房按語" writing system with one stable daily line at the bottom of Records.
- Added restrained copy for empty states and brief secondary notes after successful actions.
- Added one-time notes for the first, 100th, and 1000th record, plus a welcome-back note after 14 days.
- All initial copy is Whence original writing; functional messages always appear first.

## v0.6.3 — 2026-07-11

- Converted Records, Search, and Equipment History into consistent collapsible panels.
- Search and tag actions automatically open the Records panel so results remain visible.

## v0.6.2 — 2026-07-11

- Moved equipment status and date-range controls into a collapsed advanced-filter section.
- Added visible labels and an explanation for optional start/end dates on mobile.

## v0.6.1 — 2026-07-11

- Added shared customer aliases without rewriting historical equipment records.
- Added latest-state summaries for every machine in a selected customer timeline.
- Added an app-version display and update check.

## v0.6.0 — 2026-07-11

- Added customer-first unified timelines for equipment, records, and Whence calendar events.
- Added customer, machine, equipment-state, and date-range filters.
- Deduplicated records explicitly linked to equipment incidents.
- Moved the equipment status badge under the upper-right timestamp and increased its prominence.

## v0.5.1 — 2026-07-11

- Versioned PWA CSS, JavaScript, and service-worker URLs so mobile standalone mode cannot mix new HTML with stale rendering code.
- Fixes missing equipment status badges after the v0.5.0 release.

## v0.5.0 — 2026-07-11

- Added seven equipment states with compact color-dot badges.
- Equipment and global search now match localized state labels.
- Renamed the Idea presentation label to 札記 while retaining the compatible `idea` data kind.

## v0.4.1 — 2026-07-11

- Added an All view so completed and cancelled tasks remain discoverable.
- Tag chips now open global grouped results instead of inheriting the current view.
- Limited visible frequent tags to eight.
- Tag counts and filters are case-insensitive, merging variants such as demo and Demo.

## v0.4.0 — 2026-07-11

- Consistent calendar month/list switching.
- Read-only presentation for events created directly in Google Calendar.
- Global grouped search across records, equipment, and calendar events.
- Recently deleted view with restore for records, equipment, and Whence events.
- Improved Traditional Chinese headings and customer-first equipment cards.

Earlier milestones: v0.3.0 calendar and Today integration; v0.2.0 equipment history; v0.1.0 capture MVP.
