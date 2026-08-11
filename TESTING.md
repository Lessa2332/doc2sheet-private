# Testing

## Automated

```bash
npm test
npm run typecheck
npm run build
```

## Functional test matrix

### Images

- JPEG
- PNG
- WebP
- HEIC/HEIF on supported mobile browser/device path
- portrait
- landscape
- low light
- perspective distortion
- cropped document

### Text

- printed Ukrainian
- handwritten Ukrainian
- mixed printed/handwritten
- digits
- dates
- punctuation
- Cyrillic characters: І, Ї, Є, Ґ

### Tables

- explicit headers
- no headers
- empty cells
- uneven values
- merged cells
- multiple columns
- 100+ rows

### Failure cases

- unsupported file
- oversized payload
- malformed API response
- Gemini 4xx/5xx
- network timeout/offline
- camera permission denied
- clipboard permission denied
- empty AI result

## Security tests

- Search built frontend for `GEMINI_API_KEY`.
- Confirm `/api/*` responses have `Cache-Control: no-store`.
- Confirm a different Origin is rejected when `ALLOWED_ORIGIN` is configured.
- Confirm OCR values containing `<script>` render as text, not HTML.
- Confirm no document bytes are written to Cloudflare storage bindings.

## Acceptance criterion

A document is considered successfully processed only when the user can inspect and edit the table and then create a valid `.xlsx` without the server receiving the resulting spreadsheet.
