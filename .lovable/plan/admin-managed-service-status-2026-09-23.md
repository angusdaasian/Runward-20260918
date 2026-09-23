# Admin-managed service status

## Experience
- Add a compact service-status banner near the top of the signed-in Home tab, above today’s stats.
- Hide it completely when every service is operational.
- When an issue exists, show the highest-severity state, affected-service count, latest update time, and a short bilingual summary.
- Let users expand the banner to see each affected service and its message.

## Admin controls
- Add a **Service Status** page to the admin panel.
- Provide a fixed service-name field plus status choices: Operational, Degraded, Outage, or Maintenance.
- Let admins enter English and Traditional Chinese messages, publish updates, edit them, and restore a service to Operational.
- Operational services remain available in admin history but disappear from Home.

## Data and access
- Create a `service_statuses` table containing service name, status, bilingual messages, display order, and update timestamps.
- Allow signed-in app users to read statuses.
- Allow only verified admins to create, edit, or remove statuses, using the existing server-validated admin role system.
- Add explicit authenticated and service-role grants, row-level security, status validation, and automatic update timestamps.

## Technical details
- Build a small reusable Home status component that makes one lightweight query and fails silently if unavailable.
- Build an admin manager using the project’s existing form, status badge, toggle, and notification patterns.
- Keep status reporting manual; do not add API polling or automatic health checks.
- Verify the admin form, Home problems-only behavior, bilingual display, type checking, and final app build.
