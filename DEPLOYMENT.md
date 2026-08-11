# Deployment

## 1. GitHub

The repository may start empty. Copy the project files into the repository root:

```bash
git init
git add .
git commit -m "Initial production Doc2Sheet"
git branch -M main
git remote add origin YOUR_GITHUB_REPOSITORY
 git push -u origin main
```

Remove the leading space before `git push` if copying the command manually.

## 2. Cloudflare

This project uses a Cloudflare Worker with Static Assets. The Worker serves the frontend and `/api/analyze` from one deployment.

```bash
npm install
npx wrangler login
```

## 3. Secret

Set the Gemini API key as a Worker secret:

```bash
npx wrangler secret put GEMINI_API_KEY
```

Never put the key in `wrangler.toml`, HTML, TypeScript, GitHub Actions logs, or client-side environment variables.

## 4. Origin

Set `ALLOWED_ORIGIN` to the exact origin, for example:

```toml
[vars]
GEMINI_MODEL = "gemini-3.6-flash"
ALLOWED_ORIGIN = "https://your-app.example"
```

For local development you may use `http://localhost:5173` in `.dev.vars`.

## 5. Deploy

```bash
npm run deploy
```

## 6. Cloudflare Access

Because this is a personal tool, protect the deployment with Cloudflare Access. Configure the application so only your identity can reach the site/API.

## 7. Post-deploy smoke test

Open the deployed HTTPS URL on the phone and verify:

- camera permission works;
- gallery upload works;
- Ukrainian printed text works;
- handwriting test works;
- a table is detected;
- low-confidence cells are visible;
- cells can be edited;
- Excel downloads;
- after export, the app returns to an empty state;
- `/api/health` returns `ok`;
- browser DevTools shows no API key in frontend assets.
