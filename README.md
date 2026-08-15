# Pegboard — Hot Wheels Collection Tracker

A installable PWA for tracking your Hot Wheels collection. Scan a package,
it OCRs the name/number/series off the card, you confirm the details, and
it's saved to your collection — with the photo — right on your phone.

No backend, no account, no build step. Everything (including your photos)
is stored locally on your device using IndexedDB.

## Deploying to GitHub Pages

1. Create a new **public** GitHub repo (e.g. `hotwheels-pegboard`).
2. Upload every file in this folder to the repo root, keeping the `icons/`
   folder structure intact:
   ```
   index.html
   styles.css
   app.js
   manifest.json
   service-worker.js
   icons/icon-192.png
   icons/icon-512.png
   icons/icon-maskable-512.png
   ```
   (Easiest way: on GitHub, "Add file" → "Upload files", drag the whole
   folder in.)
3. In the repo, go to **Settings → Pages**.
4. Under "Build and deployment", set **Source** to `Deploy from a branch`,
   branch `main`, folder `/ (root)`. Save.
5. GitHub will give you a URL like:
   `https://<your-username>.github.io/hotwheels-pegboard/`
   It can take a minute or two to go live the first time.

## Adding it to your phone's homescreen

**iPhone (Safari):** open the URL → tap the Share icon → "Add to Home
Screen".

**Android (Chrome):** open the URL → tap the ⋮ menu → "Add to Home
screen" / "Install app".

Once installed it opens full-screen like a native app, and the app shell
works offline (scanning still needs an internet connection the first time,
since it loads the OCR engine from a CDN — after that first load it's
cached and works offline too).

## How scanning works

Tap **Scan**, take a photo of the front of the package (the panel with the
car's photo, name, number, and series). The app runs on-device OCR
(Tesseract.js) and takes its best guess at the name, number (e.g.
`180/250`), and series, then shows you an editable form so you can fix
anything it misread before saving — packaging fonts are stylized, so it
won't always be perfect. You can also always fix details later by tapping
a car in your collection.

## Notes / limitations

- **Storage lives on the device.** Your collection won't sync between your
  phone and a computer unless you add that yourself later — this was kept
  intentionally simple with no backend or account system.
- **OCR is on-device and free**, but less accurate than a cloud AI vision
  model on heavily stylized card art. The confirm-before-save step exists
  specifically to make that a non-issue.
- Clearing your browser's site data/storage for this app will delete your
  collection, since everything lives in IndexedDB. There's currently no
  export/backup feature — worth adding if your collection grows large and
  you want a safety net.
