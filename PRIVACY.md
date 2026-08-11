# Privacy model

## Intended use

Personal use for converting photographed documents into an Excel spreadsheet.

## Data flow

```text
Phone photo
  ↓
Browser memory
  ↓
Cloudflare Worker request
  ↓
Gemini multimodal extraction
  ↓
JSON result
  ↓
Browser table editor
  ↓
Local Excel file
```

## What Doc2Sheet stores

The application itself stores:

- no account;
- no document history;
- no uploaded images;
- no OCR database;
- no spreadsheet database;
- no analytics profile.

## Local browser data

The application keeps only the active processing state in JavaScript memory. Preview object URLs are revoked after processing. Service-worker code does not cache API requests or uploaded documents.

## Excel

The `.xlsx` is generated in the browser. Once downloaded, it is controlled by the user's operating system and may remain in Downloads until the user deletes it.

## AI provider

The Gemini API is a third-party processing service. This project uses the stateless `generateContent` path and does not use the File API for the image, avoiding persistent File API storage. Current Google documentation states that GenerateContent requests do not store requests by default; Google also documents the Interactions API's separate `store=false` control. Always review the current Google data-use/retention documentation for the exact account tier and project settings before processing highly sensitive documents.

## Important limitation

"Deleted from the app" means the application no longer retains the data. It does not mean that every network intermediary or third-party service has physically erased every transient copy at the exact same moment. The project is designed to minimize retention and avoid application-side storage.
