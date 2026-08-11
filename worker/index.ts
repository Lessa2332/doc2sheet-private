interface Env {
  GEMINI_API_KEY: string;
  GEMINI_MODEL?: string;
  ALLOWED_ORIGIN?: string;
  ASSETS: Fetcher;
}

const MODEL_DEFAULT = 'gemini-3.6-flash';
const MAX_BASE64_CHARS = 10_500_000;
const MAX_JSON_BYTES = 12_000_000;

const extractionSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    documentType: { type: 'string' },
    language: { type: 'string' },
    overallConfidence: { type: 'number' },
    columns: { type: 'array', items: { type: 'string' } },
    rows: {
      type: 'array',
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            value: { type: 'string' },
            confidence: { type: 'number' },
          },
          required: ['value', 'confidence'],
        },
      },
    },
    warnings: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'title',
    'documentType',
    'language',
    'overallConfidence',
    'columns',
    'rows',
    'warnings',
  ],
};

const SYSTEM_INSTRUCTION = `You are Doc2Sheet, a document-to-spreadsheet extraction engine.
Primary language: Ukrainian.
Task: inspect ONE supplied document image and reconstruct its visible tabular data.

Requirements:
1. Read printed AND handwritten Ukrainian text as accurately as possible.
2. Detect whether the document contains a table or a list that can reasonably be represented as a table.
3. Infer column headers from visible headers and the spatial/semantic structure. If no explicit headers exist, create short neutral headers such as "Колонка 1".
4. Preserve visible spelling, punctuation, capitalization, dates and numbers. Do NOT invent or autocomplete missing values.
5. If a cell is blank or unreadable, return an empty string and lower confidence.
6. Keep every row aligned to the same number of columns.
7. Do not identify people or infer facts not visible in the image.
8. Confidence must be between 0 and 1 for every cell and for the overall result.
9. Add warnings for handwriting, blur, glare, cropped content, uncertain characters, ambiguous table boundaries, or anything the user should verify.
10. Return ONLY JSON matching the supplied schema.

The user will manually review every result before exporting it. Accuracy is more important than filling every cell.`;

function corsHeaders(origin: string) {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    'cache-control': 'no-store, max-age=0',
    pragma: 'no-cache',
  };
}

function jsonResponse(status: number, body: unknown, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...corsHeaders(origin),
    },
  });
}

function originAllowed(request: Request, env: Env): string | null {
  const requestOrigin = request.headers.get('Origin');
  const configured = env.ALLOWED_ORIGIN?.trim();

  if (configured) {
    if (requestOrigin !== configured) return null;
    return configured;
  }

  // Local development fallback only. Production should always set ALLOWED_ORIGIN.
  const url = new URL(request.url);
  if (requestOrigin && requestOrigin !== url.origin) return null;
  return url.origin;
}

function validImageMime(mime: string) {
  return ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(mime.toLowerCase());
}

function extractTextFromGenerateContent(payload: any): string | null {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  const text = parts
    .filter((part: any) => typeof part?.text === 'string')
    .map((part: any) => part.text)
    .join('');
  return text || null;
}

function validateModelResult(value: any) {
  if (!value || typeof value !== 'object') throw new Error('Invalid AI object');
  if (!Array.isArray(value.columns) || value.columns.length < 1 || value.columns.length > 50) {
    throw new Error('Invalid columns');
  }
  if (!Array.isArray(value.rows) || value.rows.length > 1000) throw new Error('Invalid rows');
  const columns = value.columns.map((x: unknown) => String(x ?? '').trim()).slice(0, 50);
  if (columns.some((x: string) => !x)) throw new Error('Empty column');
  for (const row of value.rows) {
    if (!Array.isArray(row) || row.length !== columns.length) throw new Error('Row width mismatch');
    for (const cell of row) {
      if (!cell || typeof cell !== 'object') throw new Error('Invalid cell');
      const confidence = Number(cell.confidence);
      if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error('Invalid confidence');
      if (String(cell.value ?? '').length > 2000) throw new Error('Cell too long');
    }
  }
  return value;
}

async function analyze(request: Request, env: Env, origin: string) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_JSON_BYTES) {
    return jsonResponse(413, { error: 'Фото завелике. Зменш роздільність або обріж документ.' }, origin);
  }

  const body = await request.json() as { mimeType?: string; image?: string };
  const mimeType = String(body.mimeType || '').toLowerCase();
  const image = String(body.image || '');

  if (!validImageMime(mimeType)) {
    return jsonResponse(400, { error: 'Підтримуються JPEG, PNG, WebP, HEIC та HEIF.' }, origin);
  }
  if (!image || image.length > MAX_BASE64_CHARS) {
    return jsonResponse(413, { error: 'Фото завелике. Спробуй зменшити його або обрізати документ.' }, origin);
  }

  const model = env.GEMINI_MODEL || MODEL_DEFAULT;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const requestBody = {
    system_instruction: {
      parts: [{ text: SYSTEM_INSTRUCTION }],
    },
    contents: [{
      parts: [
        { inline_data: { mime_type: mimeType, data: image } },
        { text: 'Analyze this document image now. Return only the requested JSON.' },
      ],
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseJsonSchema: extractionSchema,
    },
  };

  const upstream = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': env.GEMINI_API_KEY,
    },
    body: JSON.stringify(requestBody),
  });

  if (!upstream.ok) {
    console.error('Gemini request failed', upstream.status);
    return jsonResponse(502, { error: 'AI-сервіс тимчасово недоступний. Спробуй ще раз.' }, origin);
  }

  const payload = await upstream.json() as any;
  const text = extractTextFromGenerateContent(payload);
  if (!text) return jsonResponse(502, { error: 'AI не повернув результат.' }, origin);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return jsonResponse(502, { error: 'AI повернув некоректний структурований результат.' }, origin);
  }

  try {
    return jsonResponse(200, validateModelResult(parsed), origin);
  } catch {
    return jsonResponse(502, { error: 'AI повернув структуру, яку неможливо безпечно використати.' }, origin);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return new Response('ok', { status: 200, headers: { 'cache-control': 'no-store' } });
    }

    if (request.method === 'OPTIONS') {
      const origin = originAllowed(request, env);
      return origin ? new Response(null, { status: 204, headers: corsHeaders(origin) }) : new Response(null, { status: 403 });
    }

    if (url.pathname === '/api/analyze') {
      if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
      const origin = originAllowed(request, env);
      if (!origin) return new Response('Forbidden', { status: 403 });
      if (!env.GEMINI_API_KEY) return jsonResponse(500, { error: 'GEMINI_API_KEY не налаштовано.' }, origin);

      try {
        return await analyze(request, env, origin);
      } catch (error) {
        console.error('Unhandled analyze error', error instanceof Error ? error.message : 'unknown');
        return jsonResponse(500, { error: 'Не вдалося обробити документ.' }, origin);
      }
    }

    // Static assets are served by Cloudflare Workers Assets.
    return env.ASSETS.fetch(request);
  },
};
