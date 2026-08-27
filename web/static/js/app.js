'use strict';

// ── Module state ────────────────────────────────────────────────────────────
let currentVideoFile = null;
let currentJobId = null;
let currentMode = 'Soft subtitle (toggleable)';

// Mode strings MUST match server.py exactly.
const MODE_SOFT = 'Soft subtitle (toggleable)';
const MODE_HARDCODE = 'Hardcode (burned in)';

// Slider ↔ display pairs.
const SLIDER_PAIRS = [
  ['font-size-slider', 'font-size-value'],
  ['outline-slider', 'outline-value'],
  ['shadow-slider', 'shadow-value'],
  ['margin-v-slider', 'margin-v-value'],
];

// Font field name ↔ element id.
const FONT_FIELDS = [
  ['font_name', 'font-name-select'],
  ['font_size', 'font-size-slider'],
  ['font_color', 'font-color-picker'],
  ['outline', 'outline-slider'],
  ['shadow', 'shadow-slider'],
  ['border_style', 'border-style-select'],
  ['alignment', 'alignment-select'],
  ['margin_v', 'margin-v-slider'],
];

// ── Bootstrap ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadConfig();
  loadFonts();
  setupVideoUpload();
  setupModeToggle();
  setupSliders();
  setupButtons();
  setupAccordion();
});

// ── Theme ───────────────────────────────────────────────────────────────────
const THEME_KEY = 'vs-theme';
const htmlRoot = document.documentElement;

function initTheme() {
  let stored = null;
  try { stored = localStorage.getItem(THEME_KEY); } catch (e) { stored = null; }
  const initial = stored
    || (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  applyTheme(initial, false);
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.addEventListener('click', () => {
      const cur = htmlRoot.getAttribute('data-theme') || 'dark';
      applyTheme(cur === 'dark' ? 'light' : 'dark', true);
    });
  }
}

function applyTheme(theme, persist) {
  htmlRoot.setAttribute('data-theme', theme);
  if (persist) {
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* ignore quota errors */ }
  }
  const sun = document.getElementById('theme-icon-sun');
  const moon = document.getElementById('theme-icon-moon');
  if (sun) sun.style.display = theme === 'light' ? '' : 'none';
  if (moon) moon.style.display = theme === 'light' ? 'none' : '';
}

// ── Config & Fonts ──────────────────────────────────────────────────────────
async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const cfg = await res.json();
    setSelectValue('model-select', cfg.model_size);
    setSelectValue('device-select', cfg.device);
    setSelectValue('compute-select', cfg.compute_type);
    const lang = document.getElementById('language-select');
    if (lang && Array.isArray(cfg.language_options)) {
      lang.innerHTML = '';
      for (const code of cfg.language_options) {
        const opt = document.createElement('option');
        opt.value = code;
        opt.textContent = code === 'auto' ? 'Auto-detect' : code;
        lang.appendChild(opt);
      }
    }
  } catch (err) {
    showError(`Failed to load config: ${err.message}`);
  }
}

async function loadFonts() {
  try {
    const res = await fetch('/api/fonts');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const fonts = Array.isArray(data) ? data : (Array.isArray(data.fonts) ? data.fonts : []);
    const sel = document.getElementById('font-name-select');
    if (!sel) return;
    sel.innerHTML = '';
    for (const font of fonts) {
      const opt = document.createElement('option');
      opt.value = font;
      opt.textContent = font;
      sel.appendChild(opt);
    }
    if (fonts.includes('Literata')) sel.value = 'Literata';
    else if (fonts.length) sel.value = fonts[0];
  } catch (err) {
    showError(`Failed to load fonts: ${err.message}`);
  }
}

function setSelectValue(id, value) {
  const el = document.getElementById(id);
  if (el && value != null) el.value = value;
}

// ── Video Upload ────────────────────────────────────────────────────────────
function setupVideoUpload() {
  const zone = document.getElementById('video-upload-zone');
  const input = document.getElementById('video-file-input');
  const preview = document.getElementById('video-preview');
  const nameEl = document.getElementById('video-filename');
  if (!zone || !input) return;

  const accept = (file) => {
    if (!file) return;
    currentVideoFile = file;
    if (preview) {
      if (preview.src && preview.src.startsWith('blob:')) URL.revokeObjectURL(preview.src);
      preview.src = URL.createObjectURL(file);
      preview.load();
    }
    if (nameEl) nameEl.textContent = file.name;
    const empty = document.getElementById('upload-empty');
    const filled = document.getElementById('upload-filled');
    if (empty) empty.setAttribute('hidden', '');
    if (filled) filled.removeAttribute('hidden');
    const genBtn = document.getElementById('generate-btn');
    if (genBtn) genBtn.disabled = false;
    const prevBtn = document.getElementById('preview-btn');
    if (prevBtn) prevBtn.disabled = false;
  };

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
  });
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('drag-over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    if (e.dataTransfer && e.dataTransfer.files[0]) accept(e.dataTransfer.files[0]);
  });
  input.addEventListener('change', () => { if (input.files[0]) accept(input.files[0]); });

  const removeBtn = document.getElementById('remove-video-btn');
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      currentVideoFile = null;
      input.value = '';
      if (preview && preview.src.startsWith('blob:')) URL.revokeObjectURL(preview.src);
      preview.removeAttribute('src');
      const empty = document.getElementById('upload-empty');
      const filled = document.getElementById('upload-filled');
      if (filled) filled.setAttribute('hidden', '');
      if (empty) empty.removeAttribute('hidden');
      const genBtn = document.getElementById('generate-btn');
      if (genBtn) genBtn.disabled = true;
      const prevBtn = document.getElementById('preview-btn');
      if (prevBtn) prevBtn.disabled = true;
    });
  }
}

// ── Mode Toggle ─────────────────────────────────────────────────────────────
function setupModeToggle() {
  const softBtn = document.getElementById('mode-soft');
  const hardBtn = document.getElementById('mode-hardcode');
  const fontSection = document.getElementById('font-section');
  const previewImg = document.getElementById('preview-image');
  if (!softBtn || !hardBtn) return;

  const apply = (mode) => {
    currentMode = mode;
    const isSoft = mode === MODE_SOFT;
    softBtn.classList.toggle('active', isSoft);
    hardBtn.classList.toggle('active', !isSoft);
    softBtn.setAttribute('aria-pressed', String(isSoft));
    hardBtn.setAttribute('aria-pressed', String(!isSoft));
    if (fontSection) fontSection.style.display = isSoft ? 'none' : '';
    if (previewImg) previewImg.style.display = isSoft ? 'none' : '';
  };

  softBtn.addEventListener('click', () => apply(MODE_SOFT));
  hardBtn.addEventListener('click', () => apply(MODE_HARDCODE));
  apply(MODE_SOFT); // default per spec
}

// ── Sliders ─────────────────────────────────────────────────────────────────
function setupSliders() {
  for (const [sliderId, valueId] of SLIDER_PAIRS) {
    const slider = document.getElementById(sliderId);
    const valueEl = document.getElementById(valueId);
    if (!slider || !valueEl) continue;
    valueEl.textContent = slider.value;
    slider.addEventListener('input', () => { valueEl.textContent = slider.value; });
  }
}

// ── Buttons ─────────────────────────────────────────────────────────────────
function setupButtons() {
  const wire = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  };
  wire('preview-btn', onPreview);
  wire('generate-btn', onGenerate);
  wire('regenerate-btn', onRegenerate);
  wire('download-srt-btn', onDownloadSrt);
}

// ── Accordion ────────────────────────────────────────────────────────────────
function setupAccordion() {
  const toggle = document.getElementById('font-accordion-toggle');
  const section = document.getElementById('font-section');
  if (!toggle || !section) return;
  toggle.addEventListener('click', () => {
    section.classList.toggle('open');
    const expanded = section.classList.contains('open');
    toggle.setAttribute('aria-expanded', String(expanded));
  });
}

// ── Progress / Error UI ─────────────────────────────────────────────────────
function setProgress(percent, message) {
  const bar = document.getElementById('progress-bar');
  const text = document.getElementById('progress-text');
  const pct = document.getElementById('progress-pct');
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  if (text && typeof message === 'string') text.textContent = message;
  if (pct) pct.textContent = `${Math.round(percent)}%`;
}

function showProgress() {
  const c = document.getElementById('progress-container');
  if (c) {
    c.removeAttribute('hidden');
    c.style.display = '';
  }
  setProgress(0, 'Starting...');
}

function hideProgress() {
  const c = document.getElementById('progress-container');
  if (c) {
    c.setAttribute('hidden', '');
    c.style.display = 'none';
  }
}

function showError(message) {
  const el = document.getElementById('error-display');
  if (!el) return;
  el.textContent = message;
  el.removeAttribute('hidden');
  el.style.display = '';
}

function clearError() {
  const el = document.getElementById('error-display');
  if (!el) return;
  el.textContent = '';
  el.setAttribute('hidden', '');
  el.style.display = 'none';
}

function setBusy(busy) {
  for (const id of ['preview-btn', 'generate-btn', 'regenerate-btn']) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.disabled = busy;
    el.setAttribute('aria-busy', String(busy));
    el.classList.toggle('is-loading', busy);
  }
}

// ── Form builders ───────────────────────────────────────────────────────────
function appendFontFields(target) {
  for (const [name, id] of FONT_FIELDS) {
    const el = document.getElementById(id);
    if (el) target.append(name, el.value);
  }
}

function buildProcessFormData() {
  const fd = new FormData();
  if (currentVideoFile) fd.append('video', currentVideoFile, currentVideoFile.name);
  const v = (id) => (document.getElementById(id)?.value ?? '');
  fd.append('language', v('language-select'));
  fd.append('mode', currentMode);
  fd.append('model_size', v('model-select'));
  fd.append('device', v('device-select'));
  fd.append('compute_type', v('compute-select'));
  appendFontFields(fd);
  return fd;
}

// ── SSE parser — handles partial chunks split across TCP packets ────────────
async function consumeSSE(response, onEvent) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  const dispatch = (chunk) => {
    for (const line of chunk.split('\n')) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      try { onEvent(JSON.parse(payload)); } catch (e) { /* ignore malformed frame */ }
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const event = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      if (event.trim()) dispatch(event);
    }
  }
  // Drain any trailing event without final blank line.
  if (buffer.trim()) dispatch(buffer);
}

// ── Generate ────────────────────────────────────────────────────────────────
async function onGenerate() {
  if (!currentVideoFile) { showError('Please upload a video first.'); return; }
  clearError();
  showProgress();
  setBusy(true);
  try {
    const res = await fetch('/api/process', { method: 'POST', body: buildProcessFormData() });
    await runStream(res);
  } catch (err) {
    showError(err.message || String(err));
    hideProgress();
  } finally {
    setBusy(false);
  }
}

function handleDone(result) {
  const video = document.getElementById('result-video');
  const empty = document.getElementById('result-empty');
  if (video && result.video_url) {
    video.src = result.video_url;
    video.load();
    video.removeAttribute('hidden');
    video.style.display = '';
  }
  if (empty) {
    empty.setAttribute('hidden', '');
    empty.style.display = 'none';
  }
  const editor = document.getElementById('srt-editor');
  if (editor && result.srt_content != null) editor.value = result.srt_content;
  if (result.video_url) {
    const m = result.video_url.match(/\/api\/files\/([^/]+)\//);
    if (m) currentJobId = m[1];
  }
  hideProgress();
  // Enable download and regenerate buttons now that we have results
  const dlBtn = document.getElementById('download-srt-btn');
  if (dlBtn) dlBtn.disabled = false;
  const regBtn = document.getElementById('regenerate-btn');
  if (regBtn) regBtn.disabled = false;
  // Re-enable generate button
  const genBtn = document.getElementById('generate-btn');
  if (genBtn) genBtn.disabled = false;
}

// ── Preview ─────────────────────────────────────────────────────────────────
async function onPreview() {
  if (!currentVideoFile) { showError('Please upload a video first.'); return; }
  clearError();
  setBusy(true);
  try {
    const fd = new FormData();
    fd.append('video', currentVideoFile, currentVideoFile.name);
    appendFontFields(fd);
    const res = await fetch('/api/preview', { method: 'POST', body: fd });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const img = document.getElementById('preview-image');
    const empty = document.getElementById('preview-empty');
    if (img) {
      if (img.src && img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
      img.src = URL.createObjectURL(blob);
      img.removeAttribute('hidden');
      img.style.display = '';
    }
    if (empty) {
      empty.setAttribute('hidden', '');
      empty.style.display = 'none';
    }
  } catch (err) {
    showError(`Preview failed: ${err.message || err}`);
  } finally {
    setBusy(false);
  }
}

// ── Regenerate ──────────────────────────────────────────────────────────────
async function onRegenerate() {
  const editor = document.getElementById('srt-editor');
  if (!editor || !editor.value.trim()) {
    showError('No SRT to regenerate. Generate subtitles first.');
    return;
  }
  if (!currentJobId) {
    showError('No job available. Generate subtitles first.');
    return;
  }
  clearError();
  showProgress();
  setBusy(true);
  try {
    const params = new URLSearchParams();
    params.append('srt_text', editor.value);
    params.append('mode', currentMode);
    params.append('job_id', currentJobId);
    appendFontFields(params);
    const res = await fetch('/api/regenerate', { method: 'POST', body: params });
    await runStream(res);
  } catch (err) {
    showError(err.message || String(err));
    hideProgress();
  } finally {
    setBusy(false);
  }
}

async function runStream(response) {
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
  let result = null;
  let finished = false;
  await consumeSSE(response, (evt) => {
    if (finished) return;
    setProgress(evt.progress ?? 0, evt.message ?? '');
    if (evt.stage === 'done' && evt.result) {
      result = evt.result;
      finished = true;
    } else if (evt.stage === 'error') {
      showError(evt.message || 'Unknown error');
      hideProgress();
      finished = true;
    }
  });
  if (result) handleDone(result);
  else hideProgress();
}

// ── Download SRT ────────────────────────────────────────────────────────────
function onDownloadSrt() {
  const editor = document.getElementById('srt-editor');
  if (!editor || !editor.value) { showError('No SRT to download.'); return; }
  const blob = new Blob([editor.value], { type: 'application/x-subrip;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'subtitles.srt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
