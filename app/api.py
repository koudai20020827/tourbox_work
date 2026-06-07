from __future__ import annotations

import json
from pathlib import Path
from threading import Lock

from app.config_store import ConfigStore
from app.device_scanner import DeviceScanner
from app.input_backends import DemoDialBackend, HidBackend, InputEvent, InputHub, KeyboardBackend
from app.models import DEFAULT_CONTROLS, Binding, ShortcutAction
from app.shortcut_runner import ShortcutRunner


class ShortcutApi:
    def __init__(self, base_dir: Path) -> None:
        self.base_dir = base_dir
        self.window = None
        self.store = ConfigStore(base_dir / "config.json")
        self.bindings = self.store.load()
        self.observed_controls: dict[str, dict[str, str]] = {
            control_id: {"id": control_id, "label": binding.label}
            for control_id, binding in self.bindings.items()
        }
        self.runner = ShortcutRunner()
        self.scanner = DeviceScanner()
        self.devices = self.scanner.scan()
        self.input_hub = InputHub()
        self.keyboard_backend = KeyboardBackend()
        self.hid_backend = HidBackend()
        self.input_hub.add_backend(self.keyboard_backend)
        self.input_hub.add_backend(self.hid_backend)
        self.input_hub.add_backend(DemoDialBackend())
        self.capture_next = False
        self.log: list[dict[str, str]] = []
        self.lock = Lock()

    def set_window(self, window) -> None:
        self.window = window

    def start(self) -> None:
        self.input_hub.start()
        self._log("system", "Application started")

    def get_state(self) -> dict:
        return {
            "controls": DEFAULT_CONTROLS,
            "bindings": {
                control_id: binding.to_dict()
                for control_id, binding in self.bindings.items()
            },
            "observed_controls": list(self.observed_controls.values()),
            "status": self._status(),
            "devices": self.devices,
            "log": self.log[-80:],
        }

    def save_binding(self, control_id: str, label: str, keys: list[str]) -> dict:
        cleaned = [key.strip().lower() for key in keys if key and key.strip()]
        if not control_id:
            raise ValueError("control_id is required")
        binding = Binding(
            control_id=control_id,
            label=label or control_id,
            action=ShortcutAction(keys=cleaned),
        )
        with self.lock:
            self.bindings[control_id] = binding
            self._remember_control(control_id, binding.label)
            self.store.save(self.bindings)
        self._log("config", f"Saved {binding.label}: {' + '.join(cleaned) or '(empty)'}")
        return self.get_state()

    def delete_binding(self, control_id: str) -> dict:
        with self.lock:
            self.bindings.pop(control_id, None)
            self.observed_controls.pop(control_id, None)
            self.store.save(self.bindings)
        self._log("config", f"Deleted binding: {control_id}")
        return self.get_state()

    def trigger_control(self, control_id: str) -> dict:
        event = InputEvent(control_id=control_id, label=self._label_for(control_id), source="manual")
        self._remember_control(event.control_id, event.label)
        self._handle_event(event)
        return self.get_state()

    def register_control(self, control_id: str, label: str) -> dict:
        self._remember_control(control_id, label or self._label_for(control_id))
        self._log("input", f"Registered {label or control_id}")
        self._notify(
            {
                "type": "captured",
                "event": InputEvent(
                    control_id=control_id,
                    label=label or self._label_for(control_id),
                    source="ui",
                ).to_dict(),
            }
        )
        return self.get_state()

    def scan_devices(self) -> dict:
        self.devices = self.scanner.scan()
        count = len(self.devices.get("matched", []))
        self._log("device", f"Scan complete: {count} matching device(s)")
        return self.get_state()

    def begin_capture(self) -> dict:
        self.capture_next = True
        self._log("capture", "Waiting for next keyboard-like input")
        return self.get_state()

    def cancel_capture(self) -> dict:
        self.capture_next = False
        self._log("capture", "Capture cancelled")
        return self.get_state()

    def poll(self) -> dict:
        for event in self.input_hub.drain():
            self._handle_event(event)
        return self.get_state()

    def _handle_event(self, event: InputEvent) -> None:
        self._remember_control(event.control_id, event.label)
        self._notify({"type": "control", "event": event.to_dict()})

        if self.capture_next:
            self.capture_next = False
            self._log("capture", f"Captured {event.label} as {event.control_id}")
            self._notify({"type": "captured", "event": event.to_dict()})
            return

        binding = self.bindings.get(event.control_id)
        if not binding:
            self._log(event.source, f"No binding for {event.label}")
            return

        try:
            self.runner.run(binding.action.keys)
            self._log("run", f"{binding.label}: {' + '.join(binding.action.keys)}")
        except Exception as exc:
            self._log("error", str(exc))

    def _label_for(self, control_id: str) -> str:
        control = next((item for item in DEFAULT_CONTROLS if item["id"] == control_id), None)
        return control["label"] if control else control_id

    def _remember_control(self, control_id: str, label: str) -> None:
        if not control_id:
            return
        existing = self.observed_controls.get(control_id)
        if existing and existing.get("label") != control_id:
            return
        self.observed_controls[control_id] = {
            "id": control_id,
            "label": label or control_id,
        }

    def _status(self) -> dict[str, str | bool]:
        return {
            "shortcut_runner": self.runner.available,
            "keyboard_backend": self.keyboard_backend.available,
            "keyboard_error": self.keyboard_backend.error,
            "hid_backend": self.hid_backend.available,
            "hid_error": self.hid_backend.error,
            "capture_next": self.capture_next,
        }

    def _log(self, source: str, message: str) -> None:
        self.log.append({"source": source, "message": message})
        self.log = self.log[-120:]

    def _notify(self, payload: dict) -> None:
        if not self.window:
            return
        script = f"window.__shortcutEvent && window.__shortcutEvent({json.dumps(payload)})"
        self.window.evaluate_js(script)
