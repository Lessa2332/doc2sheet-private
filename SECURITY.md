# Security

## Threat model

The primary threats are:

1. Gemini API key exposure.
2. Unauthorized use of the analysis endpoint.
3. Accidental persistence of document images.
4. Leakage through browser caching.
5. XSS through OCR text rendered into HTML.
6. Overly permissive CORS.
7. Sensitive data appearing in application logs.
8. Malicious or oversized image payloads.
9. Incorrect AI output being exported without human review.

## Controls

### API key

Stored as a Cloudflare Worker Secret. It is never bundled into the frontend.

### CORS

The Worker compares the request Origin with `ALLOWED_ORIGIN` in production.

### No document storage

The Worker does not write the image or extracted table to D1, KV, R2, Durable Objects, Cache API or another application store.

### Logging

Application code does not log request bodies, image data, OCR output, names, table contents or API keys. Only generic upstream status/error messages are logged.

### Browser security

Security headers include CSP, no-referrer, nosniff and restrictive Permissions Policy.

### XSS

OCR-derived values are HTML-escaped before being inserted into the table editor.

### Payload limits

The Worker rejects oversized JSON/image payloads and validates the MIME type. Model output is schema-checked again server-side before returning it to the browser.

### Human-in-the-loop

Low-confidence cells are visually marked and the user must review the table before export.

## Remaining risk

An internet-exposed endpoint can still be abused to consume API quota if it is not protected. For this personal deployment, Cloudflare Access is the preferred control. A future multi-user version would need stronger authentication, rate limiting and per-user authorization.
