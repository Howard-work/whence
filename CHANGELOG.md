# Whence Changelog

## v1.3.5 — 2026-07-18（新增表單重設）

- 行程建立成功後會重設名稱、地點、備註、提醒與關聯欄位，時間更新為新的預設時段。
- 快速記錄建立成功後完整清空主題、Space、標籤、照片、日期與重要／緊急狀態，並收合更多選項。

## v1.3.4 — 2026-07-18（行程刪除入口修正）

- 行程編輯表單加入明確的「刪除行程」按鈕，月曆檢視不必切到清單才能刪除。
- 月曆與清單共用同一刪除流程、關聯待辦提醒與錯誤訊息。

## v1.3.3 — 2026-07-18（設備報告層疊修正）

- 提高設備報告遮罩規則的選擇器明確度，避免被後方通用彈窗 Flex 規則覆寫。

## v1.3.2 — 2026-07-18（報告觸控捲動修正）

- 報告遮罩改為一般區塊流，讓完整內容高度確實成為手機的可捲動範圍。
- 保留單一垂直捲動層、iOS 慣性捲動與安全區處理。

## v1.3.1 — 2026-07-18（手機報告捲動修正）

- 手機設備報告改用單一全螢幕捲動層，避免 iPhone 巢狀捲動造成無法上下滑動。
- 載入中的空白報告區縮短，關閉、範圍設定與列印按鈕仍可在安全區內操作。

## v1.3.0 — 2026-07-18（單一設備維修報告）

- 單一設備可依日期與案件範圍產生正式報告，並以 A4 列印或另存 PDF。
- 報告包含摘要、處理時間線、停機時間、追蹤資訊與最多 12 張現場照片。
- 缺少重要欄位時顯示資料完整性提醒，不推論或補寫歷史資料。
- 報告使用完整後端設備歷程，設備改名後仍依穩定 `device_id` 產生同一份履歷。

## v1.2.1 — 2026-07-18（設備追蹤修正）

- 設備編輯補齊狀態、嚴重程度、下次追蹤、處理方式與案件欄位。
- 修正艾森豪矩陣左右方向，並在設備新增成功後完整清空表單。
- 客戶篩選可顯示同一客戶的多套設備；設備歷史改以穩定 `device_id` 分組。
- 舊紀錄只在可唯一判定設備時才合併，避免同名設備或改名紀錄串錯。

## v1.2.0 — 2026-07-17（設備案件與待辦矩陣）

- 設備工作台改為待處理／全部設備摘要，並以客戶、設備、案件三層導覽整理維修歷程。
- 新增案件進度、追蹤日期、嚴重度、處理人員、根因、結案摘要與停機分鐘等設備欄位。
- 支援設備摘要、游標分頁歷程與完整 CSV 匯出，避免前端受最新 500 筆限制。
- 待辦改為艾森豪矩陣，今日摘要持續呈現逾期、今日到期與無日期未完成項目。
- 手機設備表單採漸進揭露，並維持 375px 無水平溢位與單欄觸控配置。

## v1.1.0 — 2026-07-15（Whence 視覺語言）

- 四個主畫面建立共同的畫面開場、標題節奏與各自語意色：記錄金、札記紫、設備綠、行程藍。
- 記錄頁補齊共同的中文主標題；移除設備與行程無功能的裝飾字母，讓四頁只保留有意義的右側控制。
- 今日摘要固定在全部／今日／待辦／記事頁籤上方；頂部新增「快速記錄」按鈕，可直接定位到下方輸入區。
- 設備頁以歷史時間線優先，新增表單移至下方；頂部新增快捷按鈕可直接定位到設備輸入區。
- 設備搜尋與篩選預設收摺，套用條件後在收摺標題顯示數量，減少手機畫面的常駐負擔。
- 設備歷史預設顯示最新 20 筆，可逐批顯示更多並清楚標示目前筆數與總筆數。
- 客戶與機型名稱改為獨立入口：客戶開啟設備、記事及行程的完整時間流；機型開啟純設備歷史與最新狀態。
- Header 改為安靜的黏性品牌列；底部導覽加入同一筆觸的 SVG 圖示、畫面色與清楚的選取指示。
- 札記、設備與行程不再只是功能表單，新增各自的內容定位文字與視覺層級。
- 卡片、折疊區、空狀態與 Toast 改用一致的 Whence 表面、留白及回饋語言。
- Space 快選移除平台相依 emoji，改為可控制的文字標記；保留原有按鈕、資料值與操作方式。
- 僅修改 PWA 呈現層與版本標記；API、資料模型、寫入與 Google Calendar 同步流程不變。

## v1.0.2 — 2026-07-15（Today 首頁層級）

- 首頁預設先呈現 Today 摘要，再保留原有快速記錄入口與所有導覽。
- Today 依當日行程、到期待辦與新增記錄產生動態摘要，內容多寡自然決定版面高度。
- 行程、待辦、記錄使用克制的語意色與文字標籤，強化辨識但不依賴顏色傳意。
- 統一 Today 區塊留白、標題節奏與空狀態邊界；未修改資料讀取、寫入或同步流程。

## v1.0.1 — 2026-07-15（載入速度與讀取韌性）

- 行程頁立即呈現現有月曆，Google Calendar 對帳在背景完成後安全刷新；手動重新整理仍維持完整同步語意。
- 移除行程開頁時的例行資料修復，記錄與行程改為平行讀取，並合併同時發生的重複讀取／對帳請求。
- 唯讀請求超過 25 秒會中止並安全重試一次；所有寫入維持單次送出，不會因重試造成重複資料。
- 設備頁重用工作階段快取，避免每次切入重抓未變動的記錄、行程索引與客戶別名。

## v1.0.0 — 2026-07-15（每日晨報）

- 每日建立一則 Google Calendar 摘要，整合今日待辦、今日行程與逾期件數，以 07:30 為提醒送達目標。
- 摘要空日跳過、同日原地刷新、舊日自動清除，且不會出現在 Whence 行程、今日區塊或 App badge。
- 首次需在 GAS 編輯器執行 `setupDailyDigest()` 完成 Google Calendar 與觸發器授權。

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
