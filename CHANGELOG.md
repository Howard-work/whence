# Whence Changelog

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
