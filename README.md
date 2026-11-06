# Daymark 2.0 — Calendar & Personal Command Centre

A tablet-first, light-blue + warm-beige calendar and task planner. Daymark is a local-first Progressive Web App: no framework, build step, user account, subscription, or paid backend is required.

## What's new in 2.0

- **Real Home screen:** opening the app lands on a command centre with today's progress, remaining focus tasks, a seven-day upcoming horizon, workload by label, and one-line quick capture.
- **Navigation that always has a way home:** Home is available from the sidebar, the Daymark logo, the mobile/tablet bottom dock, and the calendar's three-dot menu. Browser/Android Back closes an open day/task/settings overlay before navigating between app views.
- **Date-detail overlay:** tapping a date in Month, Week, Year, or the Day view opens that specific date's task list in a modal. The permanent side agenda has been removed.
- **All / Open / Completed day tabs:** completed tasks are visible inside each date's details, alongside open tasks and day totals.
- **Completed archive:** a dedicated view lists finished tasks, supports text search, label and date-range filters, and lets you reopen a task.
- **Calendar display menu:** the three-dot menu now navigates to Home, Calendar, Completed and Settings, and switches calendar colors between label and priority.
- **Drag-to-reschedule:** on browsers that support HTML drag-and-drop (primarily mouse/trackpad), drag a task chip onto another calendar date. On touch screens, edit the task and change its date instead.

## Full feature set

- Month, week, day, and year calendar views.
- Task title, date, label, priority, start/end times, reminder, recurrence, tags and notes.
- Complete, reopen, edit and delete tasks; completed history remains available.
- Daily, weekly, monthly and yearly recurring tasks. Completing a recurring task creates its next occurrence.
- Today, upcoming and overdue focus views.
- Search across task titles, notes, labels and tags; filter by label, priority and completion status.
- Calendar task colors by label or priority.
- IndexedDB task storage, JSON backup/restore, CSV import/export, and iCalendar (.ics) export.
- PWA offline shell and responsive tablet/phone layouts.
- Daily review and task reminders while the app is open or when it returns to the foreground.

## Upgrade an existing Daymark deployment

1. Download and extract the project ZIP.
2. In the existing GitHub repository, replace the old project files with the contents of the `blue-beige-planner` folder. Keep the files at the repository root (do not upload an extra wrapper folder).
3. Commit and push the change to the branch used by GitHub Pages.
4. Wait for the Pages deployment action to finish successfully, then open the site and refresh it.
5. On the Samsung tablet, close the installed Daymark app and reopen it. The service-worker cache was bumped to v2 so it installs the updated app shell and removes the old cached shell.

**Existing task data is preserved.** Daymark 2.0 continues using the same IndexedDB database (`daymark-planner`, store `tasks`) and the same localStorage keys for labels and settings. The service-worker update clears old cached web assets only; it does not clear IndexedDB. Still, export a JSON backup before updating any app that contains important records.

## Install on the Samsung tablet

1. Open the HTTPS GitHub Pages URL in Chrome.
2. Open Chrome's menu and select **Install app** or **Add to Home screen**.
3. Launch Daymark from the new home-screen icon.
4. Use the Home destination in the app whenever you need to return to the command centre. The Android/browser Back action dismisses an open overlay first.

There is no build step. Do not open `index.html` directly as a local file if you want PWA/offline capabilities; use HTTPS hosting or a local web server.

## Notifications — important limitation

The app requests notification permission only after you tap **Enable notifications**. Per-task reminders and the daily morning review are checked on app startup, when the app returns to the foreground, and while the app remains open. A browser-only PWA cannot promise an exact recurring morning alarm while fully closed on every Android/browser configuration. For dependable closed-app alarms, package this UI as a native Android app and use Android's local notification scheduling, or add a push server. The current project does not claim either service.

For notifications, allow site notifications in Chrome/Android and avoid restricting the app's background activity. Even with permission, browser and battery policies can affect delivery.

## Data and privacy

Tasks are stored locally in this browser profile using IndexedDB. They do not sync to another device or browser. Export a JSON backup before clearing site data, changing browsers, or uninstalling. Restoring merges by task ID; it does not erase unrelated tasks. The app contains no analytics, advertising, external API calls, or account system.

## CSV import format

Required columns: `Title`, `Date` (YYYY-MM-DD). Optional columns: `Start Time`, `End Time`, `Label`, `Priority`, `Status`, `Repeat`, `Tags`, `Notes`.

## Calendar interoperability

Use **Export calendar (.ics)** to import open tasks into calendar apps that support iCalendar (.ics) import. This export is a snapshot, not a live two-way sync.
