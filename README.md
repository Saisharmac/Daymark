# Daymark — Calendar & Planner

A tablet-first, light blue + warm beige calendar and to-do planner. Built as a static Progressive Web App with no framework, build step, account, or paid service required.

## Included

- Month, week, day, and year calendar views.
- Click any date to open its agenda and see task totals, completion, and label count.
- Label-aware calendar chips, task priorities, search across task titles/notes/tags, and filters for label, priority, and status.
- Add, edit, complete, reopen, and delete tasks; time slots; notes; tags; task reminders; recurring daily/weekly/monthly/yearly tasks.
- Completing a recurring task creates its next scheduled occurrence.
- Today, upcoming, and overdue focus filters.
- Local IndexedDB storage, JSON backup/restore, CSV import/export, and iCalendar (.ics) export for Google Calendar, Samsung Calendar, and compatible apps.
- Installable PWA shell and offline app assets after first load.
- Daily review reminder and per-task reminder checks while the app is open or when it returns to the foreground.

## Deploy on GitHub Pages

1. Create a new GitHub repository (for example `daymark-planner`).
2. Upload the contents of this folder to the repository root.
3. Open **Settings → Pages** and publish from the `main` branch / root folder.
4. Open the HTTPS Pages URL in Chrome on the Samsung tablet.
5. In Chrome, use **⋮ → Add to Home screen** or **Install app**.
6. Open Daymark from the new home-screen icon. Create one task and download a JSON backup to test your setup.

There is no build step. Do not open `index.html` directly as a local file if you want PWA/offline capabilities; use HTTPS hosting or a local web server.

## Notifications — important limitation

The app asks for notification permission only after you tap **Enable notifications**. Per-task reminders and the daily morning review are checked on app startup, when the app returns to the foreground, and while the app remains open. A browser-only PWA cannot promise an exact recurring morning alarm while fully closed on every Android/browser configuration. For dependable closed-app alarms, package this UI as a native Android app and use Android's local notification scheduling, or add a push server. The current project does not pretend to provide either service.

For notifications, allow site notifications in Chrome/Android and avoid restricting the app's background activity. Even with permission, browser and battery policies can affect delivery.

## Data and privacy

Tasks are stored locally in this browser profile using IndexedDB. They do not sync to another device or browser. Export a JSON backup before clearing site data, changing browsers, or uninstalling. Restoring merges by task ID; it does not erase unrelated tasks. The app contains no analytics, advertising, external API calls, or account system. Google Fonts are requested for typography when online; system fallback fonts are used offline.

## CSV import format

Required columns: `Title`, `Date` (YYYY-MM-DD). Optional columns: `Start Time`, `End Time`, `Label`, `Priority`, `Status`, `Repeat`, `Tags`, `Notes`.

## Calendar interoperability

Use **Export calendar (.ics)** to import open tasks into calendar apps that support iCalendar (.ics) import. This export is a snapshot, not a live two-way sync.
