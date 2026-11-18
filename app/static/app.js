const t = audioToolkitI18n.t;
const form = document.querySelector("#upload-form");
const input = document.querySelector("#audio");
const preview = document.querySelector("#preview");
const editor = document.querySelector("#editor");
const canvas = document.querySelector("#waveform");
const startInput = document.querySelector("#start");
const endInput = document.querySelector("#end");
const status = document.querySelector("#status");
const details = document.querySelector("#details");
const download = document.querySelector("#download");
const resultPanel = document.querySelector("#result-panel");
const resultPreview = document.querySelector("#result-preview");
const reuseResultButton = document.querySelector("#reuse-result");
const historyPanel = document.querySelector("#history-panel");
const historyList = document.querySelector("#history-list");
const clearHistoryButton = document.querySelector("#clear-history");
const backToTopButton = document.querySelector("#back-to-top");
const historyKey = "audio-toolkit-v0.5.0-history";
const apiErrors = {
  "Unsupported audio extension": "errors.unsupportedExtension",
  "File exceeds upload limit": "errors.uploadLimit",
  "Unsupported or invalid audio file": "errors.invalidAudio",
  "Output not found or expired": "errors.expired",
  "Audio job queue is full": "errors.queueFull",
  "File not found": "errors.fileNotFound",
  "Invalid file identifier": "errors.invalidFileId",
  "Invalid output identifier": "errors.invalidOutputId",
  "Invalid output format": "errors.invalidOutputFormat",
  "Output not found": "errors.outputNotFound",
  "Output exceeds editing size limit": "errors.editSize",
  "Invalid trim range": "errors.trimRange",
  "Trim range exceeds audio duration": "errors.trimExceeds",
  "Unable to determine audio duration": "errors.duration",
  "Combined fades exceed audio duration": "errors.fades",
  "Removal must leave some audio": "errors.removal",
  "Audio inspection failed": "errors.inspection",
  "Audio conversion failed": "errors.conversion",
  "Audio trimming failed": "errors.trimming",
  "Audio effects processing failed": "errors.effects",
  "Audio merging failed": "errors.merging",
  "Job not found": "errors.jobNotFound"
};
const jobMessages = {
  "Queued": "jobs.queued",
  "Processing audio": "jobs.processing",
  "Completed": "jobs.completed",
  "Cancelled": "jobs.cancelled",
  "Audio processing timed out": "jobs.timeout",
  "Requested audio encoder is unavailable": "jobs.encoderUnavailable",
  "Audio processing failed": "jobs.processingFailed",
  "Audio processing failed; check input codec and output format": "jobs.codecFailed"
};
const localizedError = (detail, fallback) => t(apiErrors[detail] || fallback);
const localizedJob = (message) => t(jobMessages[message] || "jobs.processingFailed");
const formatHistoryDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat(audioToolkitI18n.locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
};
let recentResults = [];
let selectedResult = null;
try {
  const stored = JSON.parse(sessionStorage.getItem(historyKey) || "[]");
  if (Array.isArray(stored)) recentResults = stored.filter((item) => item && typeof item.url === "string" && ["convert", "trim", "remove", "effects", "merge"].includes(item.operation)).slice(0, 20);
} catch (error) {
  recentResults = [];
}
function saveHistory() {
  try { sessionStorage.setItem(historyKey, JSON.stringify(recentResults)); } catch (error) { status.textContent = t("history.unavailable"); }
}
function showResult(item) {
  selectedResult = item;
  resultPreview.src = item.url;
  download.href = item.url;
  download.hidden = false;
  reuseResultButton.hidden = false;
  resultPanel.hidden = false;
}
function renderHistory() {
  historyList.replaceChildren();
  historyPanel.hidden = recentResults.length === 0;
  for (const item of recentResults) {
    const row = document.createElement("li");
    row.className = "history-item";
    const title = document.createElement("div");
    title.className = "history-item-info";
    const operation = document.createElement("strong");
    operation.textContent = t(`jobs.operation${item.operation[0].toUpperCase()}${item.operation.slice(1)}`);
    const timestamp = document.createElement("time");
    timestamp.textContent = formatHistoryDate(item.created);
    if (!Number.isNaN(Date.parse(item.created))) timestamp.dateTime = new Date(item.created).toISOString();
    title.append(operation, timestamp);
    const actions = document.createElement("div");
    actions.className = "history-item-actions";
    const listen = document.createElement("button");
    listen.type = "button";
    listen.className = "button-ghost";
    listen.textContent = t("history.preview");
    listen.addEventListener("click", () => showResult(item));
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "button-secondary";
    edit.textContent = t("history.edit");
    edit.addEventListener("click", () => reuseResult(item));
    actions.append(listen, edit);
    row.append(title, actions);
    historyList.append(row);
  }
}
clearHistoryButton.addEventListener("click", () => {
  recentResults = [];
  saveHistory();
  renderHistory();
});
renderHistory();
document.addEventListener("audioToolkit:localechange", (event) => {
  renderHistory();
  if (currentMetadata) renderMetadata(currentMetadata);
  for (const element of [status, progressLabel]) element.textContent = audioToolkitI18n.translateExisting(element.textContent, event.detail.previousLocale);
  if (latestJobState) jobState.textContent = `${t(`jobs.${latestJobState.status}`)} (${new Intl.NumberFormat(audioToolkitI18n.locale).format(latestJobState.progress)}%)`;
});
const jobControls = document.querySelector("#job-controls");
const jobState = document.querySelector("#job-state");
const cancelJobButton = document.querySelector("#cancel-job");
let activeJob = null;
let activeEvents = null;
let latestJobState = null;
const processButtons = [];
function lockProcessing(locked) {
  for (const button of processButtons) button.disabled = locked;
  refreshUndo();
}
function resetResult() {
  resultPanel.hidden = true;
  reuseResultButton.hidden = true;
  selectedResult = null;
  download.hidden = true;
  resultPreview.pause();
  resultPreview.removeAttribute("src");
  resultPreview.load();
}
function finishJob() {
  if (activeEvents) activeEvents.close();
  activeEvents = null;
  activeJob = null;
  latestJobState = null;
  jobControls.hidden = true;
  lockProcessing(false);
  clearProgress();
}
async function startJob(operation, payload) {
  if (activeJob) return;
  resetResult();
  lockProcessing(true);
  reportProgress(t("jobs.submitting"));
  try {
    const response = await fetch("/api/jobs", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation, ...payload })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(localizedError(result.detail, "jobs.startFailed"));
    activeJob = result.job_id;
    jobControls.hidden = false;
    activeEvents = new EventSource(`/api/jobs/${activeJob}/events`);
    activeEvents.onmessage = (event) => {
      const state = JSON.parse(event.data);
      latestJobState = state;
      jobState.textContent = `${t(`jobs.${state.status}`)} (${new Intl.NumberFormat(audioToolkitI18n.locale).format(state.progress)}%)`;
      reportProgress(localizedJob(state.message), state.progress);
      if (state.status === "completed") {
        const item = { url: state.download_url, operation, created: new Date().toISOString() };
        showResult(item);
        recentResults.unshift(item);
        recentResults = recentResults.slice(0, 20);
        saveHistory();
        renderHistory();
        status.textContent = t("jobs.completeNotice");
        finishJob();
      } else if (["failed", "cancelled"].includes(state.status)) {
        status.textContent = localizedJob(state.message);
        finishJob();
      }
    };
    activeEvents.onerror = async () => {
      if (!activeJob) return;
      try {
        const response = await fetch(`/api/jobs/${activeJob}`);
        if (!response.ok) throw new Error(t("jobs.statusUnavailable"));
        const state = await response.json();
        if (["failed", "cancelled", "completed"].includes(state.status)) {
          activeEvents.onmessage({ data: JSON.stringify(state) });
        }
      } catch (error) {
        status.textContent = t("jobs.connectionInterrupted");
      }
    };
  } catch (error) {
    status.textContent = typeof error.message === "string" ? error.message : t("jobs.startFailed");
    finishJob();
  }
}
cancelJobButton.addEventListener("click", async () => {
  if (!activeJob) return;
  cancelJobButton.disabled = true;
  try {
    await fetch(`/api/jobs/${activeJob}/cancel`, { method: "POST" });
  } finally {
    cancelJobButton.disabled = false;
  }
});
const position = document.querySelector("#position");
const durationLabel = document.querySelector("#duration");
const context = canvas.getContext("2d");
const progressPanel = document.querySelector("#progress-panel");
const progressLabel = document.querySelector("#progress-label");
const progress = document.querySelector("#progress");
const metadataPanel = document.querySelector("#metadata-panel");
let currentMetadata = null;
function renderMetadata(metadata) {
  currentMetadata = metadata;
  metadataPanel.hidden = !metadata;
  if (!metadata) return;
  const format = metadata.format || {};
  const stream = (metadata.streams || []).find((item) => item.codec_type === "audio") || {};
  const number = new Intl.NumberFormat(audioToolkitI18n.locale, { maximumFractionDigits: 2 });
  const numeric = (value) => Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
  const duration = numeric(format.duration);
  const bitrate = numeric(format.bit_rate);
  const sampleRate = numeric(stream.sample_rate);
  const channels = numeric(stream.channels);
  const size = numeric(format.size);
  const fields = {
    "metadata-format": format.format_long_name || format.format_name || t("metadata.unknown"),
    "metadata-duration": duration === null ? t("metadata.unknown") : t("metadata.seconds", { value: number.format(duration) }),
    "metadata-bitrate": bitrate === null ? t("metadata.unknown") : t("metadata.kbps", { value: number.format(bitrate / 1000) }),
    "metadata-sample-rate": sampleRate === null ? t("metadata.unknown") : t("metadata.hz", { value: number.format(sampleRate) }),
    "metadata-channels": channels === null ? t("metadata.unknown") : t("metadata.channelCount", { value: number.format(channels) }),
    "metadata-file-size": size === null ? t("metadata.unknown") : t("metadata.megabytes", { value: number.format(size / 1048576) })
  };
  for (const [id, value] of Object.entries(fields)) document.getElementById(id).textContent = value;
  const safe = JSON.parse(JSON.stringify(metadata));
  if (safe.format) delete safe.format.filename;
  details.textContent = JSON.stringify(safe, null, 2);
}
const uploadButton = form.querySelector('button[type="submit"]');
const trimButton = document.querySelector("#trim");
const convertButton = document.querySelector("#convert");
const effectsButton = document.querySelector("#apply-effects");
const mergeButton = document.querySelector("#merge");
const removeSelectionButton = document.querySelector("#remove-selection");
const loopSelectionInput = document.querySelector("#loop-selection");
const autoScrollInput = document.querySelector("#auto-scroll");
const mergeFilesInput = document.querySelector("#merge-files");
const mergeList = document.querySelector("#merge-list");
let uploadGeneration = 0;

function reportProgress(label, value = null) {
  progressPanel.hidden = false;
  progressLabel.textContent = label;
  if (value === null) {
    progress.removeAttribute("value");
  } else {
    progress.value = value;
  }
}

function clearProgress() {
  progressPanel.hidden = true;
  progress.value = 0;
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

let fileId = null;
let previewUrl = null;
let duration = 0;
let peaks = [];
let dragging = false;
let dragMode = "create";
let anchor = 0;
let selectionPlayback = false;
let selectionLooping = false;
let zoom = 1;
let viewStart = 0;
const undoButton = document.querySelector("#undo");
const redoButton = document.querySelector("#redo");
const zoomInButton = document.querySelector("#zoom-in");
const zoomOutButton = document.querySelector("#zoom-out");
const zoomResetButton = document.querySelector("#zoom-reset");
const viewPositionInput = document.querySelector("#view-position");
const zoomLevel = document.querySelector("#zoom-level");
const playheadTime = document.querySelector("#playhead-time");
const nudgeStep = document.querySelector("#nudge-step");
const editorUrls = new Set();
const undoStack = [];
const redoStack = [];
let dragSnapshot = null;

function viewLength() {
  return duration / zoom;
}
function maximumViewStart() {
  return Math.max(0, duration - viewLength());
}
function syncView() {
  viewStart = Math.max(0, Math.min(maximumViewStart(), viewStart));
  viewPositionInput.value = maximumViewStart() ? String(Math.round(viewStart / maximumViewStart() * 1000)) : "0";
  viewPositionInput.disabled = zoom === 1;
  zoomLevel.textContent = `${zoom}x`;
  zoomOutButton.disabled = zoom <= 1;
  zoomInButton.disabled = zoom >= 32;
  draw();
}
function setZoom(next) {
  const center = viewStart + viewLength() / 2;
  zoom = Math.max(1, Math.min(32, next));
  viewStart = center - viewLength() / 2;
  syncView();
}
zoomInButton.addEventListener("click", () => setZoom(zoom * 2));
zoomOutButton.addEventListener("click", () => setZoom(zoom / 2));
zoomResetButton.addEventListener("click", () => { zoom = 1; viewStart = 0; syncView(); });
viewPositionInput.addEventListener("input", () => { autoScrollInput.checked = false; viewStart = maximumViewStart() * Number(viewPositionInput.value) / 1000; draw(); });

function editorSnapshot() {
  return {
    fileId, previewUrl, label: document.querySelector("#file-label").textContent,
    format: document.querySelector("#format").value, details: details.textContent, metadata: currentMetadata,
    duration, peaks, start: startInput.value, end: endInput.value,
    zoom, viewStart
  };
}
function sameSnapshot(a, b) {
  return a.fileId === b.fileId && a.start === b.start && a.end === b.end;
}
function refreshUndo() {
  undoButton.disabled = !undoStack.length || !!activeJob;
  redoButton.disabled = !redoStack.length || !!activeJob;
}
function recordChange(previous) {
  if (sameSnapshot(previous, editorSnapshot())) return;
  undoStack.push(previous);
  if (undoStack.length > 50) undoStack.shift();
  redoStack.length = 0;
  refreshUndo();
}
function restoreSnapshot(snapshot) {
  fileId = snapshot.fileId;
  previewUrl = snapshot.previewUrl;
  preview.pause();
  preview.src = snapshot.previewUrl;
  preview.load();
  document.querySelector("#file-label").textContent = snapshot.label;
  document.querySelector("#format").value = snapshot.format;
  renderMetadata(snapshot.metadata);
  duration = snapshot.duration;
  peaks = snapshot.peaks;
  startInput.value = snapshot.start;
  endInput.value = snapshot.end;
  zoom = snapshot.zoom;
  viewStart = snapshot.viewStart;
  durationLabel.textContent = formatTime(duration);
  position.textContent = "00:00";
  selectionPlayback = false;
  selectionLooping = false;
  editor.hidden = false;
  mergeFilesInput.value = "";
  mergeList.replaceChildren();
  syncView();
}
function traverseHistory(from, to) {
  if (!from.length || activeJob || !fileId) return;
  const previous = editorSnapshot();
  const target = from.pop();
  to.push(previous);
  restoreSnapshot(target);
  refreshUndo();
  status.textContent = t("editing.restored");
}
undoButton.addEventListener("click", () => traverseHistory(undoStack, redoStack));
redoButton.addEventListener("click", () => traverseHistory(redoStack, undoStack));
document.addEventListener("keydown", (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || activeJob) return;
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || document.activeElement?.isContentEditable) return;
  if (event.key.toLowerCase() === "z") {
    event.preventDefault();
    traverseHistory(event.shiftKey ? redoStack : undoStack, event.shiftKey ? undoStack : redoStack);
  } else if (event.key.toLowerCase() === "y") {
    event.preventDefault();
    traverseHistory(redoStack, undoStack);
  }
});

function formatTime(seconds) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  return `${String(minutes).padStart(2, "0")}:${String(Math.floor(safe % 60)).padStart(2, "0")}`;
}

function formatPreciseTime(seconds) {
  const value = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(value / 60);
  return `${String(minutes).padStart(2, "0")}:${(value % 60).toFixed(2).padStart(5, "0")}`;
}

function clamp(value) {
  return Math.max(0, Math.min(duration, Number.isFinite(value) ? value : 0));
}

function selection() {
  return { start: clamp(Number(startInput.value)), end: clamp(Number(endInput.value)) };
}

function rulerInterval(seconds) {
  const intervals = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  return intervals.find((step) => seconds / step <= 9) ?? 1200;
}

function themeColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function draw() {
  const width = canvas.width;
  const height = canvas.height;
  const ratio = window.devicePixelRatio || 1;
  const rulerHeight = 28 * ratio;
  const colors = Object.fromEntries(["waveform-background", "selection", "waveform", "surface-secondary", "border", "text", "text-muted", "selection-boundary", "playhead"].map((name) => [name, themeColor(`--color-${name}`)]));
  context.clearRect(0, 0, width, height);
  context.fillStyle = colors["waveform-background"];
  context.fillRect(0, 0, width, height);
  if (!duration || !peaks.length) return;
  const visible = viewLength();
  const x = (time) => (time - viewStart) / visible * width;
  const range = selection();
  const startX = Math.max(0, x(range.start));
  const endX = Math.min(width, x(range.end));
  if (endX > startX) {
    context.fillStyle = colors.selection;
    context.fillRect(startX, rulerHeight, endX - startX, height - rulerHeight);
  }
  const first = Math.max(0, Math.floor(viewStart / duration * peaks.length));
  const last = Math.min(peaks.length, Math.ceil((viewStart + visible) / duration * peaks.length));
  const barWidth = Math.max(1, width / peaks.length * zoom);
  const waveformHeight = height - rulerHeight;
  for (let i = first; i < last; i++) {
    const t = i / peaks.length * duration;
    const bar = Math.max(2, peaks[i] * (waveformHeight - 12 * ratio));
    context.fillStyle = colors.waveform;
    context.fillRect(x(t), rulerHeight + (waveformHeight - bar) / 2, Math.max(1, barWidth - 1), bar);
  }
  context.fillStyle = colors["surface-secondary"];
  context.fillRect(0, 0, width, rulerHeight);
  context.strokeStyle = colors.border;
  context.beginPath();
  context.moveTo(0, rulerHeight - 0.5 * ratio);
  context.lineTo(width, rulerHeight - 0.5 * ratio);
  context.stroke();
  const step = rulerInterval(visible);
  const firstTick = Math.ceil((viewStart - 0.000001) / step);
  context.fillStyle = colors.text;
  context.strokeStyle = colors["text-muted"];
  context.font = `${11 * ratio}px system-ui, sans-serif`;
  context.textBaseline = "top";
  for (let i = firstTick; i * step <= viewStart + visible + 0.000001; i++) {
    const t = i * step;
    const tickX = x(t);
    context.beginPath();
    context.moveTo(tickX, rulerHeight - 8 * ratio);
    context.lineTo(tickX, rulerHeight);
    context.stroke();
    const label = step < 1 ? formatPreciseTime(t) : formatTime(t);
    const textWidth = context.measureText(label).width;
    if (tickX + textWidth / 2 < width - 2 * ratio && tickX - textWidth / 2 > 2 * ratio) {
      context.fillText(label, tickX - textWidth / 2, 3 * ratio);
    }
  }
  for (const [index, boundary] of [range.start, range.end].entries()) {
    const boundaryX = x(boundary);
    if (boundaryX >= 0 && boundaryX <= width) {
      context.strokeStyle = colors["selection-boundary"];
      context.lineWidth = ratio;
      context.beginPath();
      context.moveTo(boundaryX, rulerHeight);
      context.lineTo(boundaryX, height);
      context.stroke();
      context.fillStyle = colors["selection-boundary"];
      context.fillRect(boundaryX - 5 * ratio, rulerHeight + 7 * ratio + index * 16 * ratio, 10 * ratio, 14 * ratio);
    }
  }
  const playheadX = x(preview.currentTime);
  if (playheadX >= 0 && playheadX <= width) {
    context.strokeStyle = colors.playhead;
    context.lineWidth = 2 * ratio;
    context.beginPath();
    context.moveTo(playheadX, 0);
    context.lineTo(playheadX, height);
    context.stroke();
    context.fillStyle = colors.playhead;
    context.beginPath();
    context.moveTo(playheadX - 5 * ratio, 0);
    context.lineTo(playheadX + 5 * ratio, 0);
    context.lineTo(playheadX, 8 * ratio);
    context.fill();
  }
  context.lineWidth = 1;
  playheadTime.textContent = formatPreciseTime(preview.currentTime);
  position.textContent = formatTime(viewStart);
  durationLabel.textContent = formatTime(Math.min(duration, viewStart + visible));
}

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(canvas.clientWidth * ratio));
  canvas.height = Math.max(1, Math.round(canvas.clientHeight * ratio));
  draw();
}

function updateRange(start, end) {
  startInput.value = clamp(Math.min(start, end)).toFixed(2);
  endInput.value = clamp(Math.max(start, end)).toFixed(2);
  draw();
}

function timeFromPointer(event) {
  const bounds = canvas.getBoundingClientRect();
  return clamp(viewStart + Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)) * viewLength());
}

canvas.addEventListener("pointerdown", (event) => {
  if (!duration) return;
  const bounds = canvas.getBoundingClientRect();
  if (event.clientY - bounds.top <= 28) {
    preview.currentTime = timeFromPointer(event);
    draw();
    return;
  }
  dragSnapshot = editorSnapshot();
  if (event.shiftKey) {
    updateRange(Number(startInput.value), timeFromPointer(event));
    recordChange(dragSnapshot);
    dragSnapshot = null;
    return;
  }
  const pointerTime = timeFromPointer(event);
  const range = selection();
  const threshold = Math.min(viewLength() * 14 / Math.max(1, bounds.width), 2);
  const nearStart = Math.abs(pointerTime - range.start) <= threshold;
  const nearEnd = Math.abs(pointerTime - range.end) <= threshold;
  dragMode = nearStart && (!nearEnd || Math.abs(pointerTime - range.start) <= Math.abs(pointerTime - range.end)) ? "start" : nearEnd ? "end" : "create";
  dragging = true;
  anchor = pointerTime;
  canvas.setPointerCapture(event.pointerId);
  if (dragMode === "create") updateRange(anchor, anchor);
});

canvas.addEventListener("pointermove", (event) => {
  if (dragging) {
    const time = timeFromPointer(event);
    const range = selection();
    if (dragMode === "start") updateRange(Math.min(time, range.end), range.end);
    else if (dragMode === "end") updateRange(range.start, Math.max(time, range.start));
    else updateRange(anchor, time);
  } else if (duration) {
    const time = timeFromPointer(event);
    const range = selection();
    const bounds = canvas.getBoundingClientRect();
    const near = Math.min(viewLength() * 14 / Math.max(1, bounds.width), 2);
    canvas.classList.toggle("near-boundary", Math.abs(time - range.start) <= near || Math.abs(time - range.end) <= near);
  }
});

canvas.addEventListener("pointerup", (event) => {
  if (!dragging) return;
  dragging = false;
  const time = timeFromPointer(event);
  const range = selection();
  if (dragMode === "start") updateRange(Math.min(time, range.end), range.end);
  else if (dragMode === "end") updateRange(range.start, Math.max(time, range.start));
  else updateRange(anchor, time);
  if (dragSnapshot) recordChange(dragSnapshot);
  dragSnapshot = null;
});

canvas.addEventListener("pointercancel", () => {
  dragging = false;
  if (dragSnapshot) restoreSnapshot(dragSnapshot);
  dragSnapshot = null;
});
[startInput, endInput].forEach((field) => field.addEventListener("change", () => {
  const previous = editorSnapshot();
  if (field === startInput) previous.start = field.dataset.previousValue ?? previous.start;
  if (field === endInput) previous.end = field.dataset.previousValue ?? previous.end;
  const range = selection();
  updateRange(range.start, range.end);
  recordChange(previous);
  field.dataset.previousValue = field.value;
}));
[startInput, endInput].forEach((field) => field.addEventListener("focus", () => { field.dataset.previousValue = field.value; }));

for (const [id, boundary, direction] of [
  ["start-back", "start", -1], ["start-forward", "start", 1],
  ["end-back", "end", -1], ["end-forward", "end", 1]
]) {
  document.querySelector(`#${id}`).addEventListener("click", () => {
    if (!fileId || activeJob) return;
    const previous = editorSnapshot();
    const range = selection();
    const step = Number(nudgeStep.value);
    const next = clamp(Math.round(((boundary === "start" ? range.start : range.end) + direction * step) * 100) / 100);
    if (boundary === "start") {
      startInput.value = Math.min(next, range.end).toFixed(2);
    } else {
      endInput.value = Math.max(next, range.start).toFixed(2);
    }
    draw();
    recordChange(previous);
  });
}

function followPlayhead() {
  if (!autoScrollInput.checked || zoom <= 1 || dragging || !duration) return;
  const time = preview.currentTime;
  const length = viewLength();
  const left = viewStart + length * 0.12;
  const right = viewStart + length * 0.88;
  if (time < left || time > right) {
    viewStart = Math.max(0, Math.min(maximumViewStart(), time - length * 0.25));
    syncView();
  }
}
function handleSelectionBoundary() {
  if (!selectionPlayback) return;
  const range = selection();
  if (range.end <= range.start) {
    selectionPlayback = false;
    selectionLooping = false;
    preview.pause();
    return;
  }
  if (preview.currentTime >= range.end - 0.025) {
    if (selectionLooping && loopSelectionInput.checked) {
      preview.currentTime = range.start;
      followPlayhead();
    } else {
      selectionPlayback = false;
      selectionLooping = false;
      preview.pause();
      preview.currentTime = range.end;
    }
  }
}
let playheadFrame = 0;
function animatePlayhead() {
  if (preview.paused || preview.ended) {
    playheadFrame = 0;
    return;
  }
  handleSelectionBoundary();
  followPlayhead();
  draw();
  playheadFrame = requestAnimationFrame(animatePlayhead);
}
preview.addEventListener("play", () => {
  if (!playheadFrame) playheadFrame = requestAnimationFrame(animatePlayhead);
});
preview.addEventListener("seeked", () => { followPlayhead(); draw(); });
preview.addEventListener("loadedmetadata", draw);
preview.addEventListener("timeupdate", () => {
  position.textContent = formatTime(preview.currentTime);
  handleSelectionBoundary();
  followPlayhead();
  draw();
});
preview.addEventListener("pause", () => {
  if (playheadFrame) cancelAnimationFrame(playheadFrame);
  playheadFrame = 0;
  selectionPlayback = false;
  selectionLooping = false;
});
loopSelectionInput.addEventListener("change", () => {
  if (selectionPlayback) selectionLooping = loopSelectionInput.checked;
});

document.querySelector("#play-selection").addEventListener("click", async () => {
  const range = selection();
  if (range.end <= range.start) {
    status.textContent = t("editing.selectRange");
    return;
  }
  selectionPlayback = true;
  selectionLooping = loopSelectionInput.checked;
  preview.currentTime = range.start;
  try {
    await preview.play();
  } catch (error) {
    selectionPlayback = false;
    selectionLooping = false;
    status.textContent = t("playback.unavailable");
  }
});

async function analyzeWaveform(file) {
  if (file.size > 64 * 1024 * 1024) throw new Error(t("waveform.tooLarge"));
  reportProgress(t("waveform.reading"), 5);
  await nextFrame();
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  try {
    const buffer = await file.arrayBuffer();
    reportProgress(t("waveform.decoding"));
    await nextFrame();
    const decoded = await audioContext.decodeAudioData(buffer);
    reportProgress(t("waveform.generating"), 10);
    await nextFrame();
    duration = decoded.duration;
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i));
    const count = 4096;
    const samplesPerBar = Math.max(1, Math.ceil(decoded.length / count));
    peaks = new Array(count);
    for (let i = 0; i < count; i++) {
      const start = i * samplesPerBar;
      const end = Math.min(decoded.length, start + samplesPerBar);
      let peak = 0;
      for (let j = start; j < end; j += Math.max(1, Math.floor(samplesPerBar / 160))) {
        for (const channel of channels) peak = Math.max(peak, Math.abs(channel[j] || 0));
      }
      peaks[i] = peak;
      if (i % 128 === 127 || i === count - 1) {
        reportProgress(t("waveform.generating"), 10 + Math.round((i + 1) / count * 90));
        await nextFrame();
      }
    }
    updateRange(0, duration);
    zoom = 1;
    viewStart = 0;
    syncView();
  } finally {
    await audioContext.close();
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = input.files[0];
  if (!file || activeJob) return;
  const generation = ++uploadGeneration;
  uploadButton.disabled = true;
  status.textContent = t("upload.analyzing");
  reportProgress(t("upload.uploading"));
  resetResult();
  undoStack.length = 0;
  redoStack.length = 0;
  refreshUndo();
  editor.hidden = true;
  renderMetadata(null);
  fileId = null;
  selectionPlayback = false;
  for (const url of editorUrls) URL.revokeObjectURL(url);
  editorUrls.clear();
  previewUrl = URL.createObjectURL(file);
  editorUrls.add(previewUrl);
  preview.src = previewUrl;
  document.querySelector("#file-label").textContent = file.name;
  const body = new FormData();
  body.append("file", file);
  try {
    const response = await fetch("/api/upload", { method: "POST", body });
    const result = await response.json();
    if (!response.ok) throw new Error(localizedError(result.detail, "upload.failed"));
    if (generation !== uploadGeneration) return;
    fileId = result.file_id;
    reportProgress(t("upload.inspecting"));
    const probeResponse = await fetch(`/api/probe/${fileId}`);
    const metadata = await probeResponse.json();
    if (!probeResponse.ok) throw new Error(localizedError(metadata.detail, "upload.inspectionFailed"));
    renderMetadata(metadata);
    await analyzeWaveform(file);
    editor.hidden = false;
    await nextFrame();
    resizeCanvas();
    status.textContent = t("upload.ready");
  } catch (error) {
    status.textContent = error.message || t("upload.audioFailed");
  } finally {
    if (generation === uploadGeneration) {
      uploadButton.disabled = false;
      clearProgress();
    }
  }
});

async function reuseResult(item) {
  if (activeJob) {
    status.textContent = t("results.wait");
    return;
  }
  const match = /^\/api\/download\/([0-9a-f-]{36})\/(mp3|wav|flac|ogg|opus|m4a)$/.exec(item.url);
  if (!match) {
    status.textContent = t("results.invalidReference");
    return;
  }
  const generation = ++uploadGeneration;
  uploadButton.disabled = true;
  reuseResultButton.disabled = true;
  status.textContent = t("results.loading");
  reportProgress(t("results.preparing"));
  try {
    const response = await fetch("/api/reuse", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ output_id: match[1], extension: match[2] })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(localizedError(result.detail, "results.reuseFailed"));
    const audioResponse = await fetch(result.preview_url);
    if (!audioResponse.ok) throw new Error(t("results.unavailable"));
    const blob = await audioResponse.blob();
    if (generation !== uploadGeneration) return;
    const file = new File([blob], result.filename, { type: blob.type || `audio/${match[2]}` });
    const probeResponse = await fetch(`/api/probe/${result.file_id}`);
    const metadata = await probeResponse.json();
    if (!probeResponse.ok) throw new Error(localizedError(metadata.detail, "upload.inspectionFailed"));
    const previousEditor = editorSnapshot();
    fileId = result.file_id;
    selectionPlayback = false;
    previewUrl = URL.createObjectURL(file);
    editorUrls.add(previewUrl);
    preview.src = previewUrl;
    document.querySelector("#file-label").textContent = file.name;
    renderMetadata(metadata);
    document.querySelector("#format").value = match[2];
    mergeFilesInput.value = "";
    mergeList.replaceChildren();
    await analyzeWaveform(file);
    editor.hidden = false;
    await nextFrame();
    resizeCanvas();
    recordChange(previousEditor);
    status.textContent = t("results.loaded");
  } catch (error) {
    status.textContent = error.message || t("results.reuseFailed");
  } finally {
    if (generation === uploadGeneration) {
      uploadButton.disabled = false;
      reuseResultButton.disabled = false;
      clearProgress();
    }
  }
}
reuseResultButton.addEventListener("click", () => {
  if (selectedResult) reuseResult(selectedResult);
});

async function processAudio(endpoint, payload) {
  if (!fileId) return;
  const operation = endpoint.split("/").pop();
  await startJob(operation, payload);
}

document.querySelector("#trim").addEventListener("click", () => {
  const range = selection();
  if (range.end <= range.start) {
    status.textContent = t("editing.selectRange");
    return;
  }
  processAudio("/api/trim", {
    file_id: fileId, start: range.start, end: range.end,
    output_format: document.querySelector("#format").value
  });
});

removeSelectionButton.addEventListener("click", () => {
  const range = selection();
  if (!fileId || activeJob) return;
  if (range.end <= range.start || range.end - range.start >= duration - 0.02) {
    status.textContent = t("editing.selectRemoval");
    return;
  }
  preview.pause();
  processAudio("/api/remove", {
    file_id: fileId, start: range.start, end: range.end,
    output_format: document.querySelector("#format").value,
    crossfade_ms: Number(document.querySelector("#crossfade-ms").value)
  });
});

document.querySelector("#convert").addEventListener("click", () => {
  processAudio("/api/convert", {
    file_id: fileId, output_format: document.querySelector("#format").value
  });
});

window.addEventListener("resize", resizeCanvas);


function numericValue(selector) {
  return Number(document.querySelector(selector).value);
}

effectsButton.addEventListener("click", () => {
  if (!fileId) return;
  const volumeDb = numericValue("#volume-db");
  const fadeIn = numericValue("#fade-in");
  const fadeOut = numericValue("#fade-out");
  if (![volumeDb, fadeIn, fadeOut].every(Number.isFinite) || volumeDb < -40 || volumeDb > 20 || fadeIn < 0 || fadeOut < 0 || fadeIn + fadeOut > duration) {
    status.textContent = t("effects.invalid");
    return;
  }
  processAudio("/api/effects", {
    file_id: fileId,
    output_format: document.querySelector("#format").value,
    volume_db: volumeDb,
    fade_in: fadeIn,
    fade_out: fadeOut
  });
});

mergeFilesInput.addEventListener("change", () => {
  mergeList.replaceChildren();
  for (const file of mergeFilesInput.files) {
    const item = document.createElement("li");
    item.textContent = file.name;
    mergeList.append(item);
  }
});

mergeButton.addEventListener("click", async () => {
  if (!fileId) return;
  const files = Array.from(mergeFilesInput.files);
  if (!files.length || files.length > 9) {
    status.textContent = t("merge.selectFiles");
    return;
  }
  const buttons = [uploadButton, trimButton, removeSelectionButton, convertButton, effectsButton, mergeButton];
  buttons.forEach((button) => { button.disabled = true; });
  download.hidden = true;
  reportProgress(t("upload.mergeUploading"));
  try {
    const ids = [fileId];
    for (let i = 0; i < files.length; i++) {
      reportProgress(t("upload.mergeItem", { index: i + 1, total: files.length }));
      const body = new FormData();
      body.append("file", files[i]);
      const response = await fetch("/api/upload", { method: "POST", body });
      const result = await response.json();
      if (!response.ok) throw new Error(localizedError(result.detail, "upload.audioUploadFailed"));
      ids.push(result.file_id);
    }
    buttons.forEach((button) => { button.disabled = false; });
    clearProgress();
    await startJob("merge", { file_ids: ids, output_format: document.querySelector("#format").value });
  } catch (error) {
    status.textContent = error.message || t("merge.failed");
  } finally {
    if (!activeJob) {
      buttons.forEach((button) => { button.disabled = false; });
      clearProgress();
    }
  }
});

processButtons.push(uploadButton, trimButton, removeSelectionButton, convertButton, effectsButton, mergeButton);

document.addEventListener("keydown", (event) => {
  if (!fileId || activeJob || event.ctrlKey || event.metaKey || event.altKey) return;
  const tag = document.activeElement?.tagName;
  if (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(tag) || document.activeElement?.isContentEditable || event.repeat && [" ", "p", "l"].includes(event.key.toLowerCase())) return;
  const key = event.key.toLowerCase();
  if (key === "?" || (event.shiftKey && key === "/")) {
    event.preventDefault();
    status.textContent = t("shortcuts.help");
    return;
  }
  if (key === " ") {
    event.preventDefault();
    if (preview.paused) preview.play().catch(() => { status.textContent = t("playback.failed"); });
    else preview.pause();
    return;
  }
  if (key === "p") {
    event.preventDefault();
    document.querySelector("#play-selection").click();
    return;
  }
  if (key === "l") {
    event.preventDefault();
    loopSelectionInput.checked = !loopSelectionInput.checked;
    loopSelectionInput.dispatchEvent(new Event("change"));
    return;
  }
  if (key === "arrowleft" || key === "arrowright") {
    event.preventDefault();
    preview.currentTime = clamp(preview.currentTime + (key === "arrowright" ? 1 : -1) * (event.shiftKey ? 0.1 : 1));
    draw();
    return;
  }
  if (key === "[" || key === "]" || key === "{" || key === "}") {
    event.preventDefault();
    const previous = editorSnapshot();
    const range = selection();
    const delta = (key === "]" || key === "}" ? 1 : -1) * Number(nudgeStep.value);
    if (event.shiftKey || key === "{" || key === "}") updateRange(range.start, Math.max(range.start, range.end + delta));
    else updateRange(Math.min(range.end, Math.max(0, range.start + delta)), range.end);
    recordChange(previous);
    return;
  }
  if (key === "+" || key === "=") { event.preventDefault(); setZoom(zoom * 2); }
  if (key === "-" || key === "_") { event.preventDefault(); setZoom(zoom / 2); }
});

function updateBackToTop() {
  backToTopButton.hidden = window.scrollY <= 200;
}

window.addEventListener("scroll", updateBackToTop, { passive: true });
backToTopButton.addEventListener("click", () => {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
});
updateBackToTop();
