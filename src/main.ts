import './styles.css';
import * as XLSX from 'xlsx';

type Cell = { value: string; confidence: number };
type DocumentResult = {
  title: string;
  columns: string[];
  rows: Cell[][];
  overallConfidence: number;
  warnings: string[];
  language: string;
  documentType: string;
};

const app = document.querySelector<HTMLDivElement>('#app')!;
const MAX_INPUT_BYTES = 15 * 1024 * 1024;
const MAX_OUTPUT_ROWS = 1000;
let current: DocumentResult | null = null;
let previewUrl: string | null = null;

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]!);
}

function escapeAttr(value: string) { return escapeHtml(value); }

function resetMemory() {
  current = null;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
}

function renderHome(message = '') {
  resetMemory();
  app.innerHTML = `
    <main class="shell">
      <header class="topbar">
        <div class="brand"><span class="brand-mark">DS</span><span>Doc2Sheet</span></div>
        <span class="privacy-badge">🔒 Private</span>
      </header>
      <section class="hero">
        <p class="eyebrow">PERSONAL AI DOCUMENT TOOL</p>
        <h1>Фото документа<br><span>→ готовий Excel</span></h1>
        <p class="lead">Розпізнає друкований і рукописний український текст, знаходить структуру таблиці та дає тобі перевірити кожну клітинку перед експортом.</p>
      </section>
      <section class="card upload-card">
        ${message ? `<div class="notice" role="status">${escapeHtml(message)}</div>` : ''}
        <button class="primary big" id="cameraBtn" type="button">📷 <span>Сфотографувати документ</span></button>
        <button class="secondary big" id="fileBtn" type="button">🖼️ <span>Обрати фото з телефону</span></button>
        <input class="hidden" id="cameraInput" type="file" accept="image/*" capture="environment">
        <input class="hidden" id="fileInput" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif">
        <div class="privacy-note"><strong>Приватний режим</strong><br>Застосунок не має історії документів і не має власного файлового сховища. Після завершення обробки робочі дані очищаються з вебсесії.</div>
      </section>
      <section class="steps" aria-label="Процес">
        <div><b>01</b><span>Фото</span></div><i>→</i><div><b>02</b><span>AI</span></div><i>→</i><div><b>03</b><span>Перевірка</span></div><i>→</i><div><b>04</b><span>Excel</span></div>
      </section>
      <p class="footer">AI може помилятися, особливо з рукописним текстом. Перевір результат перед використанням.</p>
    </main>`;

  const camera = document.querySelector<HTMLInputElement>('#cameraInput')!;
  const file = document.querySelector<HTMLInputElement>('#fileInput')!;
  document.querySelector('#cameraBtn')!.addEventListener('click', () => camera.click());
  document.querySelector('#fileBtn')!.addEventListener('click', () => file.click());
  camera.addEventListener('change', () => camera.files?.[0] && handleFile(camera.files[0]));
  file.addEventListener('change', () => file.files?.[0] && handleFile(file.files[0]));
}

async function handleFile(file: File) {
  if (!file.type.startsWith('image/')) return renderHome('Обери файл-зображення.');
  if (file.size > MAX_INPUT_BYTES) return renderHome('Оригінал фото завеликий. Спробуй інше фото або обріж документ.');

  try {
    const prepared = await prepareImage(file);
    previewUrl = URL.createObjectURL(prepared);
    await analyze(prepared);
  } catch (error) {
    resetMemory();
    renderHome(error instanceof Error ? error.message : 'Не вдалося підготувати фото.');
  }
}

async function prepareImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const maxSide = 3000;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Браузер не підтримує обробку зображення.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error('Не вдалося підготувати зображення.')),
    'image/jpeg',
    0.9,
  ));
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error || new Error('Не вдалося прочитати фото.'));
    reader.readAsDataURL(blob);
  });
}

async function analyze(blob: Blob) {
  const activePreview = previewUrl;
  app.innerHTML = `
    <main class="shell compact">
      <header class="topbar"><div class="brand"><span class="brand-mark">DS</span><span>Doc2Sheet</span></div><span class="privacy-badge">🔒 Private</span></header>
      <section class="card processing">
        ${activePreview ? `<img class="preview" src="${escapeAttr(activePreview)}" alt="Попередній перегляд документа">` : ''}
        <div class="spinner" aria-hidden="true"></div>
        <h2>Аналізую документ…</h2>
        <p>Розпізнаю український текст, визначаю рядки й колонки та готую результат для перевірки.</p>
        <p class="small">Фото передається тільки для поточного AI-запиту. Doc2Sheet не має сховища документів.</p>
      </section>
    </main>`;

  try {
    const base64 = await blobToBase64(blob);
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ mimeType: 'image/jpeg', image: base64 }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(data?.error || 'AI-сервіс не зміг обробити документ.'));
    current = validateResult(data);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    renderResult();
  } catch (error) {
    resetMemory();
    renderHome(error instanceof Error ? error.message : 'Помилка аналізу.');
  }
}

function validateResult(data: any): DocumentResult {
  if (!data || !Array.isArray(data.columns) || !Array.isArray(data.rows)) throw new Error('AI повернув неповну таблицю.');
  const columns = data.columns.map((v: unknown) => String(v ?? '').trim()).slice(0, 50);
  if (!columns.length || columns.some((column) => !column)) throw new Error('Не вдалося визначити колонки.');
  const rows: Cell[][] = data.rows.slice(0, MAX_OUTPUT_ROWS).map((row: any[]) => columns.map((_, index) => {
    const cell = row?.[index];
    const confidence = Number(cell?.confidence ?? 0.5);
    return {
      value: String(cell?.value ?? ''),
      confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5,
    };
  }));
  return {
    title: String(data.title || 'Розпізнаний документ'),
    documentType: String(data.documentType || 'table'),
    language: String(data.language || 'uk'),
    overallConfidence: Math.min(1, Math.max(0, Number(data.overallConfidence ?? 0.5))),
    columns,
    rows,
    warnings: Array.isArray(data.warnings) ? data.warnings.map(String).slice(0, 20) : [],
  };
}

function renderResult() {
  if (!current) return renderHome();
  const lowCount = current.rows.flat().filter((cell) => cell.confidence < 0.75).length;
  const confidence = Math.round(current.overallConfidence * 100);
  app.innerHTML = `
    <main class="shell wide">
      <header class="topbar"><div class="brand"><span class="brand-mark">DS</span><span>Doc2Sheet</span></div><button class="text-button" id="resetBtn" type="button">Новий документ</button></header>
      <section class="card">
        <div class="result-head"><div><p class="eyebrow">КРОК 03</p><h2>Перевір результат</h2></div><span class="confidence ${confidence < 75 ? 'warn-chip' : ''}">${confidence}%</span></div>
        <div class="chips"><span>${current.columns.length} колонок</span><span>${current.rows.length} рядків</span><span>${escapeHtml(current.language)}</span></div>
        ${lowCount ? `<div class="warning" role="alert">⚠️ ${lowCount} клітин${lowCount === 1 ? 'ка має' : 'ки мають'} низьку впевненість. Перевір жовті поля.</div>` : `<div class="success" role="status">✓ Структуру визначено. Перевір дані перед експортом.</div>`}
        <div class="table-wrap" role="region" aria-label="Редактор таблиці" tabindex="0">
          <table class="sheet"><thead><tr>${current.columns.map((column, index) => `<th><label class="sr-only" for="h-${index}">Назва колонки</label><input id="h-${index}" class="cell head-cell" value="${escapeAttr(column)}" data-head="${index}"></th>`).join('')}</tr></thead>
          <tbody>${current.rows.map((row, rowIndex) => `<tr>${row.map((cell, colIndex) => `<td class="${cell.confidence < 0.75 ? 'low-cell' : ''}"><label class="sr-only" for="c-${rowIndex}-${colIndex}">${escapeHtml(current!.columns[colIndex])}, рядок ${rowIndex + 1}</label><input id="c-${rowIndex}-${colIndex}" class="cell" value="${escapeAttr(cell.value)}" data-row="${rowIndex}" data-col="${colIndex}"></td>`).join('')}</tr>`).join('')}</tbody></table>
        </div>
        ${current.warnings.length ? `<div class="warning-list"><strong>AI попереджає:</strong><ul>${current.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul></div>` : ''}
        <div class="actions"><button class="primary" id="exportBtn" type="button">⬇️ Завантажити Excel</button><button class="secondary" id="copyBtn" type="button">📋 Скопіювати таблицю</button></div>
      </section>
      <p class="footer">Excel створюється локально у твоєму браузері. Doc2Sheet не отримує готовий Excel-файл.</p>
    </main>`;
  document.querySelector('#resetBtn')!.addEventListener('click', () => renderHome());
  document.querySelector('#exportBtn')!.addEventListener('click', exportExcel);
  document.querySelector('#copyBtn')!.addEventListener('click', copyTable);
}

function syncFromUi() {
  if (!current) return;
  document.querySelectorAll<HTMLInputElement>('[data-head]').forEach((element) => {
    current!.columns[Number(element.dataset.head)] = element.value.trim();
  });
  document.querySelectorAll<HTMLInputElement>('[data-row]').forEach((element) => {
    const row = Number(element.dataset.row);
    const col = Number(element.dataset.col);
    current!.rows[row][col].value = element.value;
  });
}

function columnLetter(number: number) {
  let result = '';
  while (number > 0) {
    const remainder = (number - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    number = Math.floor((number - 1) / 26);
  }
  return result || 'A';
}

function exportExcel() {
  if (!current) return;
  syncFromUi();
  if (current.columns.some((column) => !column)) return alert('Кожна колонка повинна мати назву.');
  const values = [current.columns, ...current.rows.map((row) => row.map((cell) => cell.value))];
  const worksheet = XLSX.utils.aoa_to_sheet(values);
  worksheet['!autofilter'] = { ref: `A1:${columnLetter(current.columns.length)}${values.length}` };
  worksheet['!freeze'] = { xSplit: 0, ySplit: 1 };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Таблиця');
  XLSX.writeFile(workbook, `doc2sheet-${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: true });
  resetMemory();
  renderHome('Excel створено. Дані цієї обробки очищено з вебсесії.');
}

async function copyTable() {
  if (!current) return;
  syncFromUi();
  const text = [current.columns.join('\t'), ...current.rows.map((row) => row.map((cell) => cell.value).join('\t'))].join('\n');
  await navigator.clipboard.writeText(text);
  const button = document.querySelector<HTMLButtonElement>('#copyBtn');
  if (button) {
    const old = button.textContent;
    button.textContent = '✓ Скопійовано';
    setTimeout(() => { button.textContent = old || '📋 Скопіювати таблицю'; }, 1200);
  }
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
renderHome();
