# UPMC2: officer data verification

UPMC2 is a web app for field operators of the Directorate of Forests, West Bengal. An operator signs in with Google and picks a circle and a division. They then open each officer's card, check the details, and either **verify** them or **send corrections for approval**. Each officer's information sheet can be downloaded as a PDF, one at a time or as one file for the whole division.

```
GitHub Pages (docs/)  ──►  Apps Script API (apps-script/Code.gs)  ──►  Unified PMC Google Sheet
  screens · PDFs           checks the Google sign-in, reads/writes      FR · DFR · FG-HFG · Change Log
```

- The website holds no officer data and no secrets. With `API_URL` empty in `docs/js/config.js`, it runs on made-up **demo data**, which is useful for training.
- **Verify** is saved straight away. **Edits** wait in the Change Log until an admin approves them on the **Approvals** screen.
- The design follows the Acads-Notion design system. The emblem is the National Emblem of India, from Wikimedia Commons (public domain).

## Setup (once)

### 1. Google OAuth client ID (5 minutes)
1. Open https://console.cloud.google.com, signed in as the account that owns the Google Sheet. Create a project, e.g. `UPMC2`.
2. Go to **APIs & Services → OAuth consent screen**.
   - Set User type to **External** and App name to **UPMC2**.
   - Fill in the support email and the developer email, then save.
   - On the Scopes step, add nothing.
   - Set Publishing status to **In production**, so that any Google account can sign in. No Google review is needed, because only basic sign-in is used.
3. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   - Application type: **Web application**.
   - Authorised JavaScript origins: `https://priyanshaias.github.io`. Add `http://localhost:8770` too if you want to test locally.
   - Copy the **Client ID**. It ends in `.apps.googleusercontent.com`.

### 2. Apps Script API
1. Open the Unified PMC Google Sheet and go to **Extensions → Apps Script**. This is a new script project; it can sit alongside the old one.
2. Replace `Code.gs` with `apps-script/Code.gs`. Set `CLIENT_ID` at the top to your Client ID, and `ADMINS` to the admin emails.
3. In Project Settings, tick **Show appsscript.json**, then replace it with `apps-script/appsscript.json`.
4. Run the function **setup** once.
   - Allow both permissions: the spreadsheet, and "Connect to an external service". The second one is used to check Google sign-ins.
   - The log should list the officer counts.
5. Go to **Deploy → New deployment → Web app**, and set **Execute as: Me** and **Who has access: Anyone**. Copy the URL that ends in `/exec`.

### 3. Connect the website
1. Put both values in `docs/js/config.js`:
   ```js
   API_URL: 'https://script.google.com/macros/s/…/exec',
   CLIENT_ID: '….apps.googleusercontent.com',
   ```
2. Push to GitHub. In the repo, go to **Settings → Pages**: Source **Deploy from a branch**, branch `main`, folder `/docs`.

### Updating the API later
- Go to **Deploy → Manage deployments → ✎ → Version: New version → Deploy**.
- The `/exec` URL stays the same.

## Local testing
```bash
cd docs && python3 -m http.server 8770
```
Open http://localhost:8770. With no `API_URL` set, use **Try with demo data**.
