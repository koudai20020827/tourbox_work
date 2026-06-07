let state = null;
let selectedControlId = "";
const pulseTimers = new Map();
const pendingFlashes = new Set();
let tapStatusTimer = null;
let scrollTimer = null;

const elements = {
  connectionCard: document.querySelector("#connectionCard"),
  connectionText: document.querySelector("#connectionText"),
  connectionSubtext: document.querySelector("#connectionSubtext"),
  detectedCount: document.querySelector("#detectedCount"),
  assignmentList: document.querySelector("#assignmentList"),
  deviceCount: document.querySelector("#deviceCount"),
  deviceDetailCount: document.querySelector("#deviceDetailCount"),
  deviceList: document.querySelector("#deviceList"),
  log: document.querySelector("#log"),
  assignDialog: document.querySelector("#assignDialog"),
  controlLabel: document.querySelector("#controlLabel"),
  shortcutInput: document.querySelector("#shortcutInput"),
  editorTitle: document.querySelector("#editorTitle"),
  controlIdText: document.querySelector("#controlIdText"),
  captureButton: document.querySelector("#captureButton"),
  cancelCaptureButton: document.querySelector("#cancelCaptureButton"),
  clearShortcutButton: document.querySelector("#clearShortcutButton"),
  refreshButton: document.querySelector("#refreshButton"),
  scanButton: document.querySelector("#scanButton"),
  themeButton: document.querySelector("#themeButton"),
  themeIcon: document.querySelector("#themeIcon"),
  tapStatus: document.querySelector("#tapStatus"),
  tapStatusText: document.querySelector("#tapStatusText"),
  signalCount: document.querySelector("#signalCount"),
  signalStatusText: document.querySelector("#signalStatusText"),
  signalLive: document.querySelector("#signalLive"),
  signalLiveTitle: document.querySelector("#signalLiveTitle"),
  signalLiveDetail: document.querySelector("#signalLiveDetail"),
  signalList: document.querySelector("#signalList"),
  saveButton: document.querySelector("#saveButton"),
  testButton: document.querySelector("#testButton"),
  deleteButton: document.querySelector("#deleteButton"),
};

const keyDisplay = {
  meta: "cmd",
  control: "ctrl",
  alt: "alt",
  option: "alt",
  shift: "shift",
  escape: "esc",
  " ": "space",
  arrowup: "up",
  arrowdown: "down",
  arrowleft: "left",
  arrowright: "right",
};

window.__shortcutEvent = (payload) => {
  const controlId = payload.event?.control_id;
  if (!controlId) return;

  pulseControl(controlId);
  pendingFlashes.add(controlId);
  flashAssignment(controlId);
  if (payload.type === "captured") {
    selectedControlId = controlId;
  }
};

async function apiCall(name, ...args) {
  if (!window.pywebview?.api) {
    throw new Error("pywebview API is not ready");
  }
  state = await window.pywebview.api[name](...args);
  if (!selectedControlId) {
    selectedControlId = observedControls()[0]?.id || "";
  }
  render();
  return state;
}

function observedControls() {
  const seen = new Map();
  for (const item of state?.observed_controls || []) {
    seen.set(item.id, item);
  }
  for (const binding of Object.values(state?.bindings || {})) {
    seen.set(binding.control_id, {
      id: binding.control_id,
      label: binding.label || binding.control_id,
    });
  }
  return [...seen.values()];
}

function keysFromInput(value) {
  return value
    .split("+")
    .map((key) => key.trim().toLowerCase())
    .filter(Boolean);
}

function keysToText(keys) {
  return (keys || []).join("+");
}

function bindingFor(controlId) {
  return state?.bindings?.[controlId] || null;
}

function controlFor(controlId) {
  return state?.controls?.find((item) => item.id === controlId) || null;
}

function selectedLabel(controlId) {
  const binding = bindingFor(controlId);
  const known = controlFor(controlId);
  const observed = observedControls().find((item) => item.id === controlId);
  return binding?.label || observed?.label || known?.label || controlId;
}

function selectControl(controlId, fallbackLabel = "") {
  selectedControlId = controlId;
  const binding = bindingFor(controlId);
  const label = selectedLabel(controlId) || fallbackLabel || controlId;
  elements.controlLabel.value = label;
  elements.shortcutInput.value = keysToText(binding?.action?.keys || []);
  render();
}

function openAssignment(controlId) {
  selectControl(controlId);
  if (typeof elements.assignDialog.showModal === "function") {
    elements.assignDialog.showModal();
  } else {
    elements.assignDialog.setAttribute("open", "");
  }
  elements.shortcutInput.focus();
}

function render() {
  renderConnection();
  renderAssignments();
  renderEditor();
  renderSignals();
  renderDevices();
  renderLog();
  renderController();
}

function renderConnection() {
  const devices = state?.devices || {};
  const connected = Boolean(devices.connected);
  const capture = Boolean(state?.status?.capture_next);
  const matched = devices.matched || [];

  elements.connectionCard.classList.toggle("connected", connected && !capture);
  elements.connectionCard.classList.toggle("disconnected", !connected && !capture);
  elements.connectionCard.classList.toggle("capture", capture);
  elements.captureButton.classList.toggle("listening", capture);

  if (capture) {
    elements.connectionText.textContent = "入力待ち";
    const target = state?.status?.capture_target_id;
    elements.connectionSubtext.textContent = target
      ? `${selectedLabel(target)} に割り当てる実機ボタンを押してください`
      : "割り当てたいボタンを押してください";
  } else if (connected) {
    elements.connectionText.textContent = "接続済み";
    elements.connectionSubtext.textContent = matched[0]?.name || "入力デバイスを検出しました";
  } else {
    elements.connectionText.textContent = "未接続";
    elements.connectionSubtext.textContent = "接続確認を押すか、USB接続を確認してください";
  }
  elements.deviceCount.textContent = connected ? "ONLINE" : "OFFLINE";
}

function renderSignals() {
  const signalCount = state?.signal_count || 0;
  const last = state?.last_signal || null;
  const rows = state?.signal_log || [];
  const aliases = state?.aliases || {};

  elements.signalCount.textContent = `${signalCount}`;
  elements.signalLive.classList.toggle("active", Boolean(last));

  if (last) {
    const mapped = last.mapped_label || selectedLabel(aliases[last.control_id]);
    elements.signalLiveTitle.textContent = mapped || last.label || last.control_id;
    elements.signalLiveDetail.textContent = [
      last.time,
      last.source,
      last.control_id,
      last.raw ? `raw ${last.raw.slice(0, 32)}` : "",
    ]
      .filter(Boolean)
      .join(" / ");
    elements.signalStatusText.textContent = mapped
      ? `信号を ${mapped} にマッピング済み`
      : "信号を受信中。物理ボタンを選んで実機入力を追加すると対応づけできます。";
  } else {
    elements.signalLiveTitle.textContent = "NO SIGNAL";
    elements.signalLiveDetail.textContent = "TourBoxを操作するとここに信号が流れます";
    elements.signalStatusText.textContent = state?.status?.hid_error || "実機入力を待っています";
  }

  elements.signalList.innerHTML =
    rows
      .slice(-36)
      .reverse()
      .map((row) => {
        const mapped = row.mapped_label || "";
        const raw = row.raw ? row.raw.slice(0, 48) : "";
        return `
          <div class="signal-row${mapped ? " mapped" : ""}">
            <span>${escapeHtml(row.time || "")}</span>
            <strong>${escapeHtml(mapped || row.label || row.control_id)}</strong>
            <code>${escapeHtml(row.control_id || "")}</code>
            <small>${escapeHtml([row.source, raw && `raw ${raw}`].filter(Boolean).join(" / "))}</small>
          </div>
        `;
      })
      .join("") || `<div class="empty">まだ信号はありません。TourBoxを操作するとここに流れます。</div>`;
}

function renderAssignments() {
  const controls = observedControls();
  elements.detectedCount.textContent = `${controls.length}件`;
  elements.assignmentList.innerHTML =
    controls
      .map((control) => {
        const binding = bindingFor(control.id);
        const label = binding?.label || control.label || control.id;
        const shortcut = keysToText(binding?.action?.keys);
        const active = control.id === selectedControlId ? " active" : "";
        return `
          <button class="assignment-row${active}" data-control-id="${escapeAttr(control.id)}">
            <span class="assignment-main">
              <strong>${escapeHtml(label)}</strong>
              <span>${escapeHtml(control.id)}</span>
            </span>
            <span class="assignment-shortcut">${escapeHtml(shortcut || "未設定")}</span>
          </button>
        `;
      })
      .join("") ||
    `<div class="empty">上のデバイス図をタップして追加できます。実機から追加する場合は「実機入力を追加」を押してからボタンを操作してください。</div>`;

  elements.assignmentList.querySelectorAll(".assignment-row").forEach((row) => {
    row.addEventListener("click", () => {
      selectControl(row.dataset.controlId);
      pulseControl(row.dataset.controlId);
    });
    row.addEventListener("dblclick", () => {
      openAssignment(row.dataset.controlId);
    });
  });

  for (const controlId of [...pendingFlashes]) {
    flashAssignment(controlId);
    pendingFlashes.delete(controlId);
  }
}

function renderEditor() {
  const hasSelection = Boolean(selectedControlId);
  elements.saveButton.disabled = !hasSelection;
  elements.deleteButton.disabled = !hasSelection;
  elements.testButton.disabled = !hasSelection;

  if (!hasSelection) {
    elements.editorTitle.textContent = "未選択";
    elements.controlIdText.textContent = "入力を登録してください";
    elements.controlLabel.value = "";
    elements.shortcutInput.value = "";
    return;
  }

  const binding = bindingFor(selectedControlId);
  const label = selectedLabel(selectedControlId);
  const shortcut = keysToText(binding?.action?.keys || []);
  elements.editorTitle.textContent = label;
  elements.controlIdText.textContent = selectedControlId;
  if (document.activeElement !== elements.controlLabel) {
    elements.controlLabel.value = label;
  }
  if (document.activeElement !== elements.shortcutInput) {
    elements.shortcutInput.value = shortcut;
  }
}

function renderDevices() {
  const devices = state?.devices || {};
  const matched = devices.matched || [];
  const candidates = [...matched, ...(devices.hid || []), ...(devices.serial || []), ...(devices.usb || [])].slice(0, 24);
  elements.deviceDetailCount.textContent = `${matched.length} matched`;
  elements.deviceList.innerHTML =
    candidates
      .map((device) => {
        const bits = [device.path, device.vendor_id, device.product_id, device.serial].filter(Boolean);
        return `
          <div class="device-row">
            <strong>${device.matched ? "● " : ""}${escapeHtml(device.kind)}: ${escapeHtml(device.name || "Unknown")}</strong>
            <span>${escapeHtml(bits.join(" / ") || "no port detail")}</span>
          </div>
        `;
      })
      .join("") || `<div class="device-row"><strong>No device candidates</strong><span>scan ready</span></div>`;
}

function renderLog() {
  const rows = state?.log || [];
  elements.log.innerHTML = rows
    .map((row) => `<div class="log-row"><span>${escapeHtml(row.source)}</span><span>${escapeHtml(row.message)}</span></div>`)
    .join("");
}

function renderController() {
  document.querySelectorAll(".zone").forEach((zone) => {
    zone.classList.toggle("selected", zone.dataset.controlId === selectedControlId);
  });
  moveSelectionHalo(selectedControlId);
}

function pulseControl(controlId) {
  const zone = document.querySelector(`.zone[data-control-id="${CSS.escape(controlId)}"]`);
  if (!zone) return;
  zone.classList.add("pressed");
  pulseTapHalo(zone);
  showTapStatus(selectedLabel(controlId));
  if (pulseTimers.has(controlId)) {
    window.clearTimeout(pulseTimers.get(controlId));
  }
  pulseTimers.set(
    controlId,
    window.setTimeout(() => {
      zone.classList.remove("pressed");
      pulseTimers.delete(controlId);
    }, 280),
  );
}

function centerForZone(zone) {
  const box = zone.getBBox();
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
    r: Math.max(18, Math.min(58, Math.max(box.width, box.height) / 2 + 8)),
  };
}

function moveSelectionHalo(controlId) {
  const circle = document.querySelector(".selection-halo circle");
  if (!circle) return;
  if (!controlId) {
    circle.setAttribute("r", "0");
    circle.style.opacity = "0";
    return;
  }

  const zone = document.querySelector(`.zone[data-control-id="${CSS.escape(controlId)}"]`);
  if (!zone) return;
  const center = centerForZone(zone);
  circle.setAttribute("cx", center.x);
  circle.setAttribute("cy", center.y);
  circle.setAttribute("r", center.r);
  circle.style.opacity = "0.72";
}

function pulseTapHalo(zone) {
  const halo = document.querySelector(".tap-halo");
  const circle = document.querySelector(".tap-halo circle");
  if (!halo || !circle) return;

  const center = centerForZone(zone);
  circle.setAttribute("cx", center.x);
  circle.setAttribute("cy", center.y);
  circle.setAttribute("r", center.r);
  halo.classList.remove("pulse");
  void halo.getBoundingClientRect();
  halo.classList.add("pulse");
  window.setTimeout(() => halo.classList.remove("pulse"), 460);
}

function showTapStatus(label) {
  elements.tapStatusText.textContent = `${label} を検出`;
  elements.tapStatus.classList.add("active");
  if (tapStatusTimer) {
    window.clearTimeout(tapStatusTimer);
  }
  tapStatusTimer = window.setTimeout(() => {
    elements.tapStatus.classList.remove("active");
    elements.tapStatusText.textContent = "入力待機中";
  }, 1100);
}

function flashAssignment(controlId) {
  const row = document.querySelector(`.assignment-row[data-control-id="${CSS.escape(controlId)}"]`);
  if (!row) return;
  row.classList.add("flash");
  window.setTimeout(() => row.classList.remove("flash"), 420);
}

function normalizeKey(event) {
  const raw = event.key.toLowerCase();
  return keyDisplay[raw] || raw;
}

function shortcutFromEvent(event) {
  const keys = [];
  if (event.metaKey) keys.push("cmd");
  if (event.ctrlKey) keys.push("ctrl");
  if (event.altKey) keys.push("alt");
  if (event.shiftKey) keys.push("shift");

  const key = normalizeKey(event);
  if (!["cmd", "control", "ctrl", "alt", "option", "shift", "meta"].includes(key)) {
    keys.push(key);
  }
  return [...new Set(keys)];
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function applyTheme(theme) {
  const resolved = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = resolved;
  elements.themeIcon.textContent = resolved === "dark" ? "☀" : "☾";
  elements.themeButton.setAttribute("aria-pressed", String(resolved === "dark"));
  localStorage.setItem("shortcut-theme", resolved);
}

function initializeTheme() {
  const stored = localStorage.getItem("shortcut-theme");
  const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  applyTheme(stored || (systemDark ? "dark" : "light"));
}

function markScrolling(element) {
  element.classList.add("scrolling");
  if (scrollTimer) {
    window.clearTimeout(scrollTimer);
  }
  scrollTimer = window.setTimeout(() => element.classList.remove("scrolling"), 260);
}

document.querySelectorAll(".zone").forEach((zone) => {
  zone.setAttribute("tabindex", "0");
  zone.addEventListener("click", async () => {
    const controlId = zone.dataset.controlId;
    selectedControlId = controlId;
    pulseControl(controlId);
    await apiCall("register_control", controlId, zone.dataset.label);
    flashAssignment(controlId);
  });
  zone.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    const controlId = zone.dataset.controlId;
    selectedControlId = controlId;
    pulseControl(controlId);
    await apiCall("register_control", controlId, zone.dataset.label);
    flashAssignment(controlId);
  });
});

elements.shortcutInput.addEventListener("keydown", (event) => {
  if (event.key === "Tab") return;
  event.preventDefault();
  const shortcut = shortcutFromEvent(event);
  if (shortcut.length) {
    elements.shortcutInput.value = keysToText(shortcut);
  }
});

elements.clearShortcutButton.addEventListener("click", () => {
  elements.shortcutInput.value = "";
  elements.shortcutInput.focus();
});

elements.captureButton.addEventListener("click", () => apiCall("begin_capture", selectedControlId || ""));
elements.cancelCaptureButton.addEventListener("click", () => apiCall("cancel_capture"));
elements.refreshButton.addEventListener("click", () => apiCall("poll"));
elements.scanButton.addEventListener("click", () => apiCall("scan_devices"));
elements.themeButton.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next);
});

elements.saveButton.addEventListener("click", async () => {
  if (!selectedControlId) return;
  const label = elements.controlLabel.value.trim() || selectedControlId;
  const keys = keysFromInput(elements.shortcutInput.value);
  await apiCall("save_binding", selectedControlId, label, keys);
  elements.assignDialog.close();
});

elements.testButton.addEventListener("click", async () => {
  if (!selectedControlId) return;
  pulseControl(selectedControlId);
  await apiCall("trigger_control", selectedControlId);
});

elements.deleteButton.addEventListener("click", async () => {
  if (!selectedControlId) return;
  const deleted = selectedControlId;
  await apiCall("delete_binding", deleted);
  selectedControlId = observedControls()[0]?.id || "";
  elements.assignDialog.close();
  render();
});

document.addEventListener(
  "scroll",
  (event) => {
    if (event.target?.matches?.(".assignment-list, .device-list, .signal-list, #log")) {
      markScrolling(event.target);
    }
  },
  true,
);

initializeTheme();

window.addEventListener("pywebviewready", async () => {
  await apiCall("get_state");
  window.setInterval(() => apiCall("poll").catch(console.error), 600);
});
