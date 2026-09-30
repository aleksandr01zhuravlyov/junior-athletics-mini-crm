# Junior Athletics Mini CRM

A simple mini CRM for tracking junior athletes. Plain HTML, CSS and JavaScript.
Data is saved in the browser's `localStorage` (on the device you are using).

## Files

- `index.html` – the page (must stay in the project root)
- `style.css` – the looks
- `script.js` – the behaviour
- `.nojekyll` – tells GitHub Pages to serve the files as they are

All file links are relative (for example `href="style.css"`), so the site works
both when opened locally and when hosted under `https://<user>.github.io/<repo>/`.

## Run locally

Open `index.html` in a browser.

## Deploy with GitHub Pages

1. Merge your changes into the `main` branch.
2. In the GitHub repository go to **Settings → Pages**.
3. Under **Build and deployment → Source** choose **Deploy from a branch**.
4. Choose branch `main` and folder `/ (root)`, then click **Save**.
5. Wait 1–2 minutes. The public URL appears at the top of the Pages settings:
   `https://aleksandr01zhuravlyov.github.io/junior-athletics-mini-crm/`

Note: data is stored per browser and per device, so the phone and the laptop
each have their own separate list of students.
