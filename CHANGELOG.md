# Whence Changelog

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
