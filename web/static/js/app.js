'use strict';

// ── Module state ────────────────────────────────────────────────────────────
let currentVideoFile = null;
let currentJobId = null;
let currentMode = 'Soft subtitle (toggleable)';

// Mode strings MUST match server.py exactly.
const MODE_SOFT = 'Toggleable (soft subtitle)';
const MODE_HARDCODE = 'Always visible (burned in)';

// Slider ↔ display pairs.
const SLIDER_PAIRS = [
  ['font-size-slider', 'font-size-value'],
  ['outline-slider', 'outline-value'],
  ['shadow-slider', 'shadow-value'],
  ['margin-v-slider', 'margin-v-value'],
  ['margin-h-slider', 'margin-h-value'],
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
  ['margin_h', 'margin-h-slider'],
];

// ── Bootstrap ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadConfig();
  loadFonts();
  setupVideoUpload();
  setupModeToggle();
  setupSliders();
  setupColorPicker();
  setupLivePreview();
  setupButtons();
  setupAccordion();
  setupAdvancedSettings();
  setupSrtEditor();
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
    liveUpdateFontPreview();
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
  if (!softBtn || !hardBtn) return;

  const apply = (mode) => {
    currentMode = mode;
    const isSoft = mode === MODE_SOFT;
    softBtn.classList.toggle('active', isSoft);
    hardBtn.classList.toggle('active', !isSoft);
    softBtn.setAttribute('aria-pressed', String(isSoft));
    hardBtn.setAttribute('aria-pressed', String(!isSoft));
    if (fontSection) fontSection.style.display = isSoft ? 'none' : '';
    if (!isSoft) liveUpdateFontPreview();
    updateSoftNotice();
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
    slider.addEventListener('input', () => {
      valueEl.textContent = slider.value;
      liveUpdateFontPreview();
    });
  }
}

// ── Color picker sync ───────────────────────────────────────────────────────
function setupColorPicker() {
  const picker = document.getElementById('font-color-picker');
  const text = document.getElementById('font-color-text');
  if (!picker || !text) return;
  picker.addEventListener('input', () => {
    text.value = picker.value.toUpperCase();
    liveUpdateFontPreview();
  });
  text.addEventListener('input', () => {
    const v = text.value.trim();
    if (/^#[0-9A-Fa-f]{6}$/.test(v)) picker.value = v;
    liveUpdateFontPreview();
  });
}

// ── Live font preview ───────────────────────────────────────────────────────
function setupLivePreview() {
  for (const id of ['font-name-select', 'border-style-select', 'alignment-select']) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', liveUpdateFontPreview);
  }
  liveUpdateFontPreview();
}

function liveUpdateFontPreview() {
  const livePreview = document.getElementById('live-font-preview');
  const renderedPreview = document.getElementById('rendered-preview');
  const hint = document.getElementById('live-preview-hint');
  if (renderedPreview && !renderedPreview.hasAttribute('hidden')) {
    renderedPreview.setAttribute('hidden', '');
  }
  if (livePreview) {
    livePreview.style.display = '';
  }
  if (hint) {
    hint.textContent = 'Live approximation — click "Render Frame" for exact ffmpeg output';
  }
  updateFontPreviewStyle();
}

function updateFontPreviewStyle() {
  const textEl = document.getElementById('live-font-preview-text');
  if (!textEl) return;

  const fontName = document.getElementById('font-name-select')?.value || 'Literata';
  const fontSize = document.getElementById('font-size-slider')?.value || 12;
  const fontColor = document.getElementById('font-color-picker')?.value || '#FFFFFF';
  const outline = document.getElementById('outline-slider')?.value || 0;
  const shadow = document.getElementById('shadow-slider')?.value || 0;
  const borderStyle = document.getElementById('border-style-select')?.value || '1';
  const alignment = document.getElementById('alignment-select')?.value || '2';
  const marginV = document.getElementById('margin-v-slider')?.value || 20;
  const marginH = document.getElementById('margin-h-slider')?.value || 10;

  textEl.style.fontFamily = `"${fontName}", sans-serif`;
  textEl.style.fontSize = `${fontSize}px`;
  textEl.style.color = fontColor;

  const alignMap = { '1': 'left', '2': 'center', '3': 'right', '5': 'left', '6': 'center', '7': 'right', '9': 'left', '10': 'center', '11': 'right' };
  const vAlignMap = { '1': 'flex-end', '2': 'flex-end', '3': 'flex-end', '5': 'flex-start', '6': 'flex-start', '7': 'flex-start', '9': 'center', '10': 'center', '11': 'center' };
  const justifyMap = { '1': 'flex-start', '2': 'center', '3': 'flex-end', '5': 'flex-start', '6': 'center', '7': 'flex-end', '9': 'flex-start', '10': 'center', '11': 'flex-end' };
  const container = textEl.parentElement;
  if (container) {
    container.style.alignItems = vAlignMap[alignment] || 'flex-end';
    container.style.justifyContent = justifyMap[alignment] || 'center';
    container.style.paddingBottom = `${marginV}px`;
    container.style.paddingTop = (alignment >= 5 && alignment <= 7) ? `${marginV}px` : '0';
    container.style.paddingLeft = `${marginH}px`;
    container.style.paddingRight = `${marginH}px`;
  }

  textEl.style.textAlign = alignMap[alignment] || 'center';
  textEl.style.width = (alignment === '2' || alignment === '6' || alignment === '10') ? '100%' : 'auto';

  if (outline > 0) {
    textEl.style.webkitTextStroke = `${outline}px rgba(0,0,0,0.8)`;
    textEl.style.paintOrder = 'stroke fill';
  } else {
    textEl.style.webkitTextStroke = '';
    textEl.style.paintOrder = '';
  }

  if (shadow > 0) {
    textEl.style.textShadow = `${shadow}px ${shadow}px 2px rgba(0,0,0,0.7)`;
  } else {
    textEl.style.textShadow = '';
  }

  if (borderStyle === '3') {
    const boxPadding = Math.max(outline, 3);
    textEl.style.backgroundColor = 'rgba(0,0,0,0.75)';
    textEl.style.padding = `${boxPadding}px ${boxPadding * 2}px`;
    textEl.style.borderRadius = '2px';
  } else {
    textEl.style.backgroundColor = '';
    textEl.style.padding = '';
    textEl.style.borderRadius = '';
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
  wire('download-video-btn', onDownloadVideo);
}

// ── Accordion ────────────────────────────────────────────────────────────────
function setupAccordion() {
  const toggle = document.getElementById('font-accordion-toggle');
  const section = document.getElementById('font-section');
  if (!toggle || !section) return;
  toggle.addEventListener('click', (e) => {
    e.preventDefault();
    section.classList.toggle('open');
    const expanded = section.classList.contains('open');
    toggle.setAttribute('aria-expanded', String(expanded));
  });
}

function setupAdvancedSettings() {
  const toggle = document.getElementById('advanced-toggle');
  const section = document.getElementById('advanced-section');
  if (!toggle || !section) return;
  toggle.addEventListener('click', (e) => {
    e.preventDefault();
    section.classList.toggle('open');
    const expanded = section.classList.contains('open');
    toggle.setAttribute('aria-expanded', String(expanded));
  });
}

function setupSrtEditor() {
  const editor = document.getElementById('srt-editor');
  if (!editor) return;
  editor.addEventListener('input', updateSrtStats);
}

function updateSrtStats() {
  const editor = document.getElementById('srt-editor');
  const lineCountEl = document.getElementById('srt-line-count');
  const charCountEl = document.getElementById('srt-charcount');
  if (!editor) return;
  const text = editor.value;
  const lines = text ? text.split('\n').length : 0;
  const chars = text.length;
  if (lineCountEl) lineCountEl.textContent = `${lines} line${lines !== 1 ? 's' : ''}`;
  if (charCountEl) charCountEl.textContent = `${chars} char${chars !== 1 ? 's' : ''}`;
}

// ── Progress / Error UI ─────────────────────────────────────────────────────
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * 52;

let _progressAnimId = null;
let _progressDisplayed = 0;
let _progressFloor = 0;
let _progressCeiling = 100;
let _progressFinished = false;
let _onProgressDone = null;
const DRIFT_RATE = 0.15;

function _animateProgress() {
  const diff = _progressCeiling - _progressDisplayed;
  if (!_progressFinished && Math.abs(diff) < 0.5) {
    if (_progressDisplayed < _progressCeiling - 0.3) {
      _progressDisplayed += DRIFT_RATE;
      _progressDisplayed = Math.min(_progressDisplayed, _progressCeiling);
    } else {
      _progressDisplayed = _progressCeiling;
    }
  } else if (!_progressFinished) {
    _progressDisplayed += diff * 0.15;
  } else {
    const finalDiff = 100 - _progressDisplayed;
    if (finalDiff < 0.5) {
      _progressDisplayed = 100;
      _applyVideoProgress(100);
      _progressAnimId = null;
      if (_onProgressDone) { const cb = _onProgressDone; _onProgressDone = null; cb(); }
      return;
    }
    _progressDisplayed += finalDiff * 0.2;
  }
  _applyVideoProgress(_progressDisplayed);
  _progressAnimId = requestAnimationFrame(_animateProgress);
}

function _applyVideoProgress(percent) {
  const pctEl = document.getElementById('video-progress-pct');
  const fillEl = document.getElementById('progress-circle-fill');
  if (!fillEl) return;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = CIRCLE_CIRCUMFERENCE - (clamped / 100) * CIRCLE_CIRCUMFERENCE;
  fillEl.style.strokeDashoffset = offset;
  if (pctEl) pctEl.textContent = `${Math.round(clamped)}%`;
}

function setVideoProgress(percent, message) {
  const labelEl = document.getElementById('video-progress-label');
  const p = Math.max(0, Math.min(100, percent));
  _progressFloor = p;
  _progressCeiling = Math.min(p + 9, _progressFinished ? 100 : 99);
  if (p >= 100) _progressFinished = true;
  if (!_progressAnimId) _progressAnimId = requestAnimationFrame(_animateProgress);
  if (labelEl && typeof message === 'string') {
    const short = message.replace(/\.\.\.$/, '').split(' (')[0].trim();
    labelEl.textContent = short || 'Processing';
  }
}

function waitForProgressDone() {
  return new Promise((resolve) => {
    if (!_progressAnimId) { resolve(); return; }
    _onProgressDone = resolve;
  });
}

function showVideoProgress() {
  const overlay = document.getElementById('video-progress-overlay');
  const empty = document.getElementById('result-empty');
  const video = document.getElementById('result-video');
  if (overlay) {
    overlay.removeAttribute('hidden');
    overlay.style.display = '';
  }
  if (empty) {
    empty.setAttribute('hidden', '');
    empty.style.display = 'none';
  }
  if (video) {
    video.setAttribute('hidden', '');
    video.style.display = 'none';
  }
  _progressDisplayed = 0;
  _progressFloor = 0;
  _progressCeiling = 9;
  _progressFinished = false;
  _onProgressDone = null;
  _applyVideoProgress(0);
  const labelEl = document.getElementById('video-progress-label');
  if (labelEl) labelEl.textContent = 'Starting';
  if (_progressAnimId) { cancelAnimationFrame(_progressAnimId); _progressAnimId = null; }
  _progressAnimId = requestAnimationFrame(_animateProgress);
}

function hideVideoProgress() {
  const overlay = document.getElementById('video-progress-overlay');
  if (overlay) {
    overlay.setAttribute('hidden', '');
    overlay.style.display = 'none';
  }
  if (_progressAnimId) {
    cancelAnimationFrame(_progressAnimId);
    _progressAnimId = null;
  }
}

function updateSoftNotice() {
  const notice = document.getElementById('soft-notice');
  if (!notice) return;
  const isSoft = currentMode === MODE_SOFT;
  const hasResult = !!currentJobId;
  if (isSoft && hasResult) {
    notice.removeAttribute('hidden');
    notice.style.display = '';
  } else {
    notice.setAttribute('hidden', '');
    notice.style.display = 'none';
  }
}

function setProgress(percent, message) {
  setVideoProgress(percent, message);
}

function showProgress() {
  setProgress(0, 'Starting...');
  showVideoProgress();
}

function hideProgress() {
  hideVideoProgress();
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
  const dlVideoBtn = document.getElementById('download-video-btn');
  if (dlVideoBtn) dlVideoBtn.disabled = true;
  const softNotice = document.getElementById('soft-notice');
  if (softNotice) {
    softNotice.setAttribute('hidden', '');
    softNotice.style.display = 'none';
  }
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

async function handleDone(result) {
  await waitForProgressDone();
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
  if (editor && result.srt_content != null) {
    editor.value = result.srt_content;
    updateSrtStats();
  }
  if (result.video_url) {
    const m = result.video_url.match(/\/api\/files\/([^/]+)\//);
    if (m) currentJobId = m[1];
    const dlVideoBtn = document.getElementById('download-video-btn');
    if (dlVideoBtn) dlVideoBtn.disabled = false;
  }
  hideProgress();
  const dlBtn = document.getElementById('download-srt-btn');
  if (dlBtn) dlBtn.disabled = false;
  const regBtn = document.getElementById('regenerate-btn');
  if (regBtn) regBtn.disabled = false;
  const genBtn = document.getElementById('generate-btn');
  if (genBtn) genBtn.disabled = false;
  updateSoftNotice();
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
    const renderedPreview = document.getElementById('rendered-preview');
    const livePreview = document.getElementById('live-font-preview');
    const hint = document.getElementById('live-preview-hint');
    if (img) {
      if (img.src && img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
      img.src = URL.createObjectURL(blob);
    }
    if (renderedPreview) {
      renderedPreview.removeAttribute('hidden');
    }
    if (livePreview) {
      livePreview.style.display = 'none';
    }
    if (hint) {
      hint.textContent = 'Exact ffmpeg render — adjust controls to return to live preview';
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
  const dlVideoBtn = document.getElementById('download-video-btn');
  if (dlVideoBtn) dlVideoBtn.disabled = true;
  const softNotice = document.getElementById('soft-notice');
  if (softNotice) {
    softNotice.setAttribute('hidden', '');
    softNotice.style.display = 'none';
  }
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
  const stem = currentVideoFile ? currentVideoFile.name.replace(/\.[^.]+$/, '') : 'video';
  a.download = `${stem}.srt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Download Video ────────────────────────────────────────────────────────────
function onDownloadVideo() {
  if (!currentJobId) { showError('No video to download. Generate subtitles first.'); return; }
  const a = document.createElement('a');
  a.href = `/api/files/${currentJobId}/video`;
  const stem = currentVideoFile ? currentVideoFile.name.replace(/\.[^.]+$/, '') : 'video';
  a.download = `${stem}_subtitled.mp4`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
