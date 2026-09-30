# Junior Athletics Mini CRM

A simple mini CRM for tracking junior athletes. Plain HTML, CSS and JavaScript.
Students are stored in a Supabase database; staff log in with email + password.

## Files

- `index.html` – the page (must stay in the project root)
- `style.css` – the looks
- `config.js` – Supabase Project URL + publishable key (public values only)
- `script.js` – the behaviour (login, logout, Supabase CRUD)
- `memberships.js` – membership rules that need no database (labels, expired-by-date, current membership)
- `supabase/trainings_attendance.sql` – creates the `trainings` and `attendance` tables + RLS policies
- `supabase/memberships.sql` – creates `memberships`, the session-charge ledger, and the attendance trigger
- `tests/` – SQL, unit and browser tests for memberships (see below)
- `.nojekyll` – tells GitHub Pages to serve the files as they are

All file links are relative (for example `href="style.css"`), so the site works
both when opened locally and when hosted under `https://<user>.github.io/<repo>/`.

## Trainings and attendance setup (one time)

1. Supabase > **SQL Editor** > New query.
2. Paste the contents of `supabase/trainings_attendance.sql` and click **Run** (safe to re-run).
3. Reload the CRM. The **Trainings** tab shows sessions by month; open a session to mark
   students Present/Absent. Each student's **View** window shows Attendance History by month.

## Memberships setup (one time)

1. Run `supabase/trainings_attendance.sql` first (if not done yet), then paste
   `supabase/memberships.sql` into the SQL Editor and click **Run** (safe to re-run).
2. Open a student's **View** window: it shows the current membership (with sessions
   remaining for Flex / Custom-with-counter) and the full membership history.
   Add memberships there. Types: Monthly Unlimited, Monthly 1x/week, Flex 5, Flex 10, Custom.

Rules (enforced in the database, so they hold no matter how attendance is written):

- Marking a student **Present** in a training subtracts one session from their active
  membership that has sessions left (the one expiring first). Monthly memberships have no counter.
- Present twice never subtracts twice (one charge per attendance record).
- Present -> Absent (or deleting the attendance) returns the session. Sessions never go below 0.
- A membership past its expiration date shows as **expired** automatically (nothing is stored).
- Memberships are never deleted from the app: use **Cancel** to keep the history.
- The old `students.membership_type` / `sessions_remaining` columns are no longer used.

Tests: `node --test tests/memberships.test.js` (unit), `bash tests/run_sql_tests.sh`
(triggers, needs a local Postgres, never touches Supabase) and
`NODE_PATH=$(npm root -g) node tests/ui_smoke.js` (browser, needs Playwright).

## Run locally

1. Put your Project URL and publishable key in `config.js`.
   **Never** put a secret / `service_role` key in the frontend.
2. Create a user in Supabase (Authentication > Users). Sign-up is not in the app.
3. Open `index.html` in a browser and log in.

## Deploy with GitHub Pages

1. Merge your changes into the `main` branch.
2. In the GitHub repository go to **Settings → Pages**.
3. Under **Build and deployment → Source** choose **Deploy from a branch**.
4. Choose branch `main` and folder `/ (root)`, then click **Save**.
5. Wait 1–2 minutes. The public URL appears at the top of the Pages settings:
   `https://aleksandr01zhuravlyov.github.io/junior-athletics-mini-crm/`

Data now lives in Supabase, so every device sees the same students.
Access is protected by Row Level Security (authenticated users only).
