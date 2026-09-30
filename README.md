# Junior Athletics Mini CRM

A simple mini CRM for tracking junior athletes. Plain HTML, CSS and JavaScript.
Students are stored in a Supabase database; staff log in with email + password.

## Files

- `index.html` – the page (must stay in the project root)
- `style.css` – the looks
- `config.js` – Supabase Project URL + publishable key (public values only)
- `script.js` – the behaviour (login, logout, Supabase CRUD)
- `supabase/trainings_attendance.sql` – creates the `trainings` and `attendance` tables + RLS policies
- `.nojekyll` – tells GitHub Pages to serve the files as they are

All file links are relative (for example `href="style.css"`), so the site works
both when opened locally and when hosted under `https://<user>.github.io/<repo>/`.

## Trainings and attendance setup (one time)

1. Supabase > **SQL Editor** > New query.
2. Paste the contents of `supabase/trainings_attendance.sql` and click **Run** (safe to re-run).
3. Reload the CRM. The **Trainings** tab shows sessions by month; open a session to mark
   students Present/Absent. Each student's **View** window shows Attendance History by month.

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
