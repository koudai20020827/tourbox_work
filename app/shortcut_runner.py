from __future__ import annotations

import time


KEY_ALIASES = {
    "cmd": "cmd",
    "command": "cmd",
    "ctrl": "ctrl",
    "control": "ctrl",
    "alt": "alt",
    "option": "alt",
    "shift": "shift",
    "enter": "enter",
    "return": "enter",
    "esc": "esc",
    "escape": "esc",
    "space": "space",
    "tab": "tab",
    "backspace": "backspace",
    "delete": "delete",
    "up": "up",
    "down": "down",
    "left": "left",
    "right": "right",
}


class ShortcutRunner:
    def __init__(self) -> None:
        self._controller = None
        self._key = None
        self.available = False
        self.error = ""
        self._load()

    def _load(self) -> None:
        try:
            from pynput.keyboard import Controller, Key
        except Exception as exc:  # pragma: no cover - depends on local install
            self.error = f"pynput is not available: {exc}"
            return

        self._controller = Controller()
        self._key = Key
        self.available = True

    def run(self, keys: list[str]) -> None:
        if not self.available or self._controller is None:
            raise RuntimeError(self.error or "shortcut runner is not available")
        if not keys:
            raise ValueError("shortcut keys are empty")

        resolved = [self._resolve_key(key) for key in keys]
        for key in resolved:
            self._controller.press(key)
            time.sleep(0.015)
        for key in reversed(resolved):
            self._controller.release(key)
            time.sleep(0.015)

    def _resolve_key(self, raw: str):
        token = raw.strip().lower()
        token = KEY_ALIASES.get(token, token)
        special = getattr(self._key, token, None) if self._key else None
        return special if special is not None else token

