# Doc2Sheet Private

Personal mobile-first PWA: **photo → Ukrainian printed/handwritten text → table structure → manual review → Excel**.

## Architecture

```text
Phone camera/gallery
       ↓
PWA frontend (Vite + TypeScript)
       ↓ HTTPS /api/analyze
Cloudflare Worker
       ↓ secret server-side API key
Gemini 3.6 Flash
       ↓ structured JSON
Worker validation
       ↓
Editable table in browser
       ↓
.xlsx generated locally
```

The app intentionally has **no application database, no document history, no user accounts, no R2/KV/D1 and no Google Drive integration in v1**.

## Why this architecture

This is a single-user, privacy-first tool. The photo is compressed in the browser, sent only for the active extraction request, and is not stored by this application. The generated Excel file is created in the browser and is not uploaded to the Worker.

Gemini 3.6 Flash is the configured production model because Google currently lists it as GA. Gemini supports image input and structured JSON output. For this one-shot extraction, the implementation uses the stateless `generateContent` request path rather than server-side conversation state.

## Local development

Requirements: Node.js 20+ recommended.

```bash
npm install
cp .dev.vars.example .dev.vars
# put your Gemini key in .dev.vars
npm run dev
```

For an end-to-end Worker + assets development session:

```bash
npm run build
npx wrangler dev
```

## Production deployment

1. Create an empty GitHub repository.
2. Put this project in the repository.
3. Do **not** commit `.dev.vars` or any API key.
4. Authenticate Wrangler:

```bash
npx wrangler login
```

5. Set the Gemini secret:

```bash
npx wrangler secret put GEMINI_API_KEY
```

6. Set `ALLOWED_ORIGIN` in `wrangler.toml` to the exact HTTPS origin you will use, or configure it as a non-secret Worker variable in the Cloudflare dashboard.
7. Build and deploy:

```bash
npm run deploy
```

Cloudflare Workers Static Assets can serve the SPA while the same Worker handles `/api/*`. `run_worker_first = ["/api/*"]` makes the API route explicit.

## Personal-access protection

For a private personal deployment, place the Worker behind Cloudflare Access. Without an authentication layer, an internet-exposed API endpoint can be called by anyone who discovers its URL and could consume your Gemini quota. The application itself does not implement an account system because that would add unnecessary data and complexity for a personal tool.

## Privacy model

- No application database.
- No uploaded-file storage.
- No history.
- No analytics SDK.
- No advertising SDK.
- No Google Drive.
- No Google Sheets.
- No user account.
- API key is server-side only.
- `Cache-Control: no-store` is applied to API responses.
- Browser preview object URLs are revoked after processing.
- Application state is cleared after Excel export/reset.

Important: clearing the app does not delete a file already saved by the operating system to the user's Downloads folder. That file is under the user's device control.

## Known limitations

1. Handwriting accuracy is not guaranteed.
2. Poor lighting, blur, perspective, cropping and complex merged cells can reduce accuracy.
3. The model can make extraction errors; manual review is mandatory.
4. One image is processed per request in v1.
5. No offline OCR/AI.
6. No server-side document history.
7. The Worker does not control third-party provider retention outside the documented API controls.
8. Cloudflare Access is recommended for a personal production deployment.

## Documentation

- `DEPLOYMENT.md` — GitHub/Cloudflare deployment
- `SECURITY.md` — threat model and security controls
- `PRIVACY.md` — data-flow and deletion model
- `TESTING.md` — test plan
