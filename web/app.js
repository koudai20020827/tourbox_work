let state = null;
let selectedControlId = "";
const pulseTimers = new Map();
const pendingFlashes = new Set();

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
    elements.connectionSubtext.textContent = "割り当てたいボタンを押してください";
  } else if (connected) {
    elements.connectionText.textContent = "接続済み";
    elements.connectionSubtext.textContent = matched[0]?.name || "入力デバイスを検出しました";
  } else {
    elements.connectionText.textContent = "未接続";
    elements.connectionSubtext.textContent = "接続確認を押すか、USB接続を確認してください";
  }
  elements.deviceCount.textContent = connected ? "ONLINE" : "OFFLINE";
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
  const candidates = [...matched, ...(devices.serial || []), ...(devices.usb || [])].slice(0, 16);
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
}

function pulseControl(controlId) {
  const zone = document.querySelector(`.zone[data-control-id="${CSS.escape(controlId)}"]`);
  if (!zone) return;
  zone.classList.add("pressed");
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

elements.captureButton.addEventListener("click", () => apiCall("begin_capture"));
elements.cancelCaptureButton.addEventListener("click", () => apiCall("cancel_capture"));
elements.refreshButton.addEventListener("click", () => apiCall("poll"));
elements.scanButton.addEventListener("click", () => apiCall("scan_devices"));

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

window.addEventListener("pywebviewready", async () => {
  await apiCall("get_state");
  window.setInterval(() => apiCall("poll").catch(console.error), 600);
});
