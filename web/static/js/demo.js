'use strict';

// ── Demo state ──────────────────────────────────────────────────────────────
let currentMode = 'hardcode';

const MODE_SOFT = 'soft';
const MODE_HARDCODE = 'hardcode';

const SLIDER_PAIRS = [
  ['font-size-slider', 'font-size-value'],
  ['outline-slider', 'outline-value'],
  ['shadow-slider', 'shadow-value'],
  ['margin-v-slider', 'margin-v-value'],
];

const MOCK_SRT = [
  '1',
  '00:00:01,200 --> 00:00:05,200',
  'yeah the cloud is climbing through the hill',
  '',
  '2',
  '00:00:05,500 --> 00:00:08,800',
  'the view from up here is incredible',
  '',
  '3',
  '00:00:09,100 --> 00:00:12,000',
  'you can see the entire valley below',
  '',
].join('\n');

// ── Bootstrap ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setupModeToggle();
  setupSliders();
  setupAccordion();
  setupColorPicker();
  setupBannerDismiss();
  setupButtons();
  setupSrtEditor();
  prefillDemoState();
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
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* ignore */ }
  }
  const sun = document.getElementById('theme-icon-sun');
  const moon = document.getElementById('theme-icon-moon');
  if (sun) sun.style.display = theme === 'light' ? '' : 'none';
  if (moon) moon.style.display = theme === 'light' ? 'none' : '';
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
    softBtn.setAttribute('aria-checked', String(isSoft));
    hardBtn.setAttribute('aria-checked', String(!isSoft));
    if (fontSection) fontSection.style.display = isSoft ? 'none' : '';
    if (!isSoft) liveUpdateFontPreview();
    updateSoftNotice();
  };

  softBtn.addEventListener('click', () => apply(MODE_SOFT));
  hardBtn.addEventListener('click', () => apply(MODE_HARDCODE));
  apply(MODE_HARDCODE);
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

// ── Banner dismiss ──────────────────────────────────────────────────────────
function setupBannerDismiss() {
  const banner = document.getElementById('demo-banner');
  const closeBtn = document.getElementById('demo-banner-close');
  if (banner && closeBtn) {
    closeBtn.addEventListener('click', () => {
      banner.style.display = 'none';
    });
  }
}

// ── Buttons ─────────────────────────────────────────────────────────────────
function setupButtons() {
  const wire = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  };
  wire('preview-btn', onPreviewFont);
  wire('generate-btn', onGenerate);
  wire('regenerate-btn', onRegenerate);
  wire('download-srt-btn', onDownloadSrt);
  wire('download-video-btn', onDownloadVideo);

  for (const id of ['font-name-select', 'border-style-select', 'alignment-select']) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', liveUpdateFontPreview);
  }

  // Upload zone click handler (demo: no real upload, but keep interactivity)
  const zone = document.getElementById('video-upload-zone');
  const fileInput = document.getElementById('video-file-input');
  if (zone) {
    zone.addEventListener('click', (e) => {
      e.preventDefault();
      showToast('Upload is disabled in demo mode');
    });
    zone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        showToast('Upload is disabled in demo mode');
      }
    });
  }

  // Remove video button resets to empty state
  const removeBtn = document.getElementById('remove-video-btn');
  if (removeBtn) {
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const empty = document.getElementById('upload-empty');
      const filled = document.getElementById('upload-filled');
      if (filled) filled.setAttribute('hidden', '');
      if (empty) empty.removeAttribute('hidden');
      // Re-enable upload zone click for real file selection (still shows toast)
    });
  }
}

// ── SRT editor ──────────────────────────────────────────────────────────────
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

// ── Pre-fill demo state ─────────────────────────────────────────────────────
function prefillDemoState() {
  // Upload zone: show "filled" state
  const empty = document.getElementById('upload-empty');
  const filled = document.getElementById('upload-filled');
  if (empty) empty.setAttribute('hidden', '');
  if (filled) filled.removeAttribute('hidden');

  // SRT editor: pre-fill with mock content
  const editor = document.getElementById('srt-editor');
  if (editor) {
    editor.value = MOCK_SRT;
    updateSrtStats();
  }

  // Video result placeholder: visible (replaces the "empty" state)
  const resultEmpty = document.getElementById('result-empty');
  if (resultEmpty) resultEmpty.setAttribute('hidden', '');

  // All action buttons enabled
  enableActionButtons();

  // Font preview placeholder shown (like "already previewed" state)
  const liveFontPreview = document.getElementById('live-font-preview');
  if (liveFontPreview) {
    updateFontPreviewStyle();
  }
}

function enableActionButtons() {
  for (const id of ['generate-btn', 'regenerate-btn', 'download-srt-btn', 'download-video-btn', 'preview-btn']) {
    const el = document.getElementById(id);
    if (el) el.disabled = false;
  }
}

// ── Font Preview ────────────────────────────────────────────────────────────
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

function onPreviewFont() {
  const renderedPreview = document.getElementById('rendered-preview');
  const livePreview = document.getElementById('live-font-preview');
  const hint = document.getElementById('live-preview-hint');

  if (renderedPreview) {
    renderedPreview.removeAttribute('hidden');
  }
  if (livePreview) {
    livePreview.style.display = 'none';
  }
  if (hint) {
    hint.textContent = 'Exact ffmpeg render — adjust controls to return to live preview';
  }
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
  }
  textEl.style.textAlign = alignMap[alignment] || 'center';
  textEl.style.width = (alignment === '2' || alignment === '6' || alignment === '10') ? '100%' : 'auto';
  textEl.style.paddingLeft = (alignment === '1' || alignment === '5' || alignment === '9') ? '16px' : '';
  textEl.style.paddingRight = (alignment === '3' || alignment === '7' || alignment === '11') ? '16px' : '';

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
    textEl.style.backgroundColor = 'rgba(0,0,0,0.75)';
    textEl.style.padding = '4px 12px';
    textEl.style.borderRadius = '2px';
  } else {
    textEl.style.backgroundColor = '';
    textEl.style.padding = '';
    textEl.style.borderRadius = '';
  }
}

// ── Progress circle animation (same logic as app.js) ────────────────────────
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * 52; // ≈ 326.73

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
  const demoResult = document.getElementById('demo-video-result-placeholder');
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
  if (demoResult) demoResult.style.display = 'none';

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

function setBusy(busy) {
  for (const id of ['preview-btn', 'generate-btn', 'regenerate-btn']) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.disabled = busy;
    el.setAttribute('aria-busy', String(busy));
    el.classList.toggle('is-loading', busy);
  }
}

function updateSoftNotice() {
  const notice = document.getElementById('soft-notice');
  if (!notice) return;
  const isSoft = currentMode === MODE_SOFT;
  if (isSoft) {
    notice.removeAttribute('hidden');
    notice.style.display = '';
  } else {
    notice.setAttribute('hidden', '');
    notice.style.display = 'none';
  }
}

// ── Generate (simulated) ────────────────────────────────────────────────────
function onGenerate() {
  clearError();

  const softNotice = document.getElementById('soft-notice');
  if (softNotice) {
    softNotice.setAttribute('hidden', '');
    softNotice.style.display = 'none';
  }

  showVideoProgress();
  setBusy(true);

  // Simulate stages over ~4 seconds
  const stages = [
    { delay: 0,    progress: 10,  message: 'Extracting audio...' },
    { delay: 1000, progress: 35,  message: 'Transcribing...' },
    { delay: 2500, progress: 70,  message: 'Burning subtitles...' },
    { delay: 3800, progress: 100, message: 'Done!' },
  ];

  const timers = [];
  for (const stage of stages) {
    timers.push(setTimeout(() => {
      setVideoProgress(stage.progress, stage.message);
    }, stage.delay));
  }

  // After all stages complete
  setTimeout(async () => {
    _progressFinished = true;
    await waitForProgressDone();
    hideVideoProgress();

    // Show demo video result placeholder
    const demoResult = document.getElementById('demo-video-result-placeholder');
    if (demoResult) demoResult.style.display = '';

    setBusy(false);
    enableActionButtons();
    updateSoftNotice();
    showToast('Demo complete — this is a simulated generation');
  }, 4200);
}

// ── Regenerate (simulated, shorter) ─────────────────────────────────────────
function onRegenerate() {
  clearError();

  const softNotice = document.getElementById('soft-notice');
  if (softNotice) {
    softNotice.setAttribute('hidden', '');
    softNotice.style.display = 'none';
  }

  showVideoProgress();
  setBusy(true);

  const stages = [
    { delay: 0,    progress: 20,  message: 'Regenerating...' },
    { delay: 800,  progress: 60,  message: 'Burning subtitles...' },
    { delay: 1800, progress: 100, message: 'Done!' },
  ];

  for (const stage of stages) {
    setTimeout(() => {
      setVideoProgress(stage.progress, stage.message);
    }, stage.delay);
  }

  setTimeout(async () => {
    _progressFinished = true;
    await waitForProgressDone();
    hideVideoProgress();

    const demoResult = document.getElementById('demo-video-result-placeholder');
    if (demoResult) demoResult.style.display = '';

    setBusy(false);
    enableActionButtons();
    updateSoftNotice();
    showToast('Demo regeneration complete');
  }, 2200);
}

// ── Download SRT (demo: show toast, no real download) ──────────────────────
function onDownloadSrt() {
  showToast('SRT download requires the real app running locally');
}

// ── Download Video (demo: show inline message) ──────────────────────────────
function onDownloadVideo() {
  showToast('Video download requires the real app running locally');
}

// ── Error display
function showError(message) {
  const el = document.getElementById('error-display');
  const text = document.getElementById('error-text');
  if (!el || !text) return;
  text.textContent = message;
  el.removeAttribute('hidden');
  el.style.display = '';
}

function clearError() {
  const el = document.getElementById('error-display');
  if (!el) return;
  el.setAttribute('hidden', '');
  el.style.display = 'none';
}

// ── Toast notification ──────────────────────────────────────────────────────
function showToast(message) {
  const toast = document.getElementById('demo-toast');
  const text = document.getElementById('demo-toast-text');
  if (!toast || !text) return;
  text.textContent = message;
  toast.removeAttribute('hidden');
  toast.style.display = '';

  // Auto-dismiss after 4 seconds
  setTimeout(() => {
    toast.setAttribute('hidden', '');
    toast.style.display = 'none';
  }, 4000);
}
