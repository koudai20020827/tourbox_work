from __future__ import annotations

import queue
import threading
import time
from dataclasses import dataclass
from typing import Callable


@dataclass
class InputEvent:
    control_id: str
    label: str
    source: str = "keyboard"
    raw: str = ""

    def to_dict(self) -> dict[str, str]:
        return {
            "control_id": self.control_id,
            "label": self.label,
            "source": self.source,
            "raw": self.raw,
        }


class InputHub:
    def __init__(self) -> None:
        self.events: queue.Queue[InputEvent] = queue.Queue()
        self._stop = threading.Event()
        self.backends: list[InputBackend] = []

    def add_backend(self, backend: "InputBackend") -> None:
        self.backends.append(backend)

    def start(self) -> None:
        for backend in self.backends:
            backend.start(self.events.put, self._stop)

    def stop(self) -> None:
        self._stop.set()
        for backend in self.backends:
            backend.stop()

    def drain(self) -> list[InputEvent]:
        drained: list[InputEvent] = []
        while True:
            try:
                drained.append(self.events.get_nowait())
            except queue.Empty:
                return drained


class InputBackend:
    name = "base"

    def start(
        self,
        emit: Callable[[InputEvent], None],
        stop_event: threading.Event,
    ) -> None:
        raise NotImplementedError

    def stop(self) -> None:
        return


class KeyboardBackend(InputBackend):
    name = "keyboard"

    def __init__(self) -> None:
        self.listener = None
        self.available = False
        self.error = ""

    def start(
        self,
        emit: Callable[[InputEvent], None],
        stop_event: threading.Event,
    ) -> None:
        try:
            from pynput import keyboard
        except Exception as exc:  # pragma: no cover - depends on local install
            self.error = f"pynput is not available: {exc}"
            return

        self.available = True

        def on_press(key) -> None:
            label = self._key_label(key)
            emit(InputEvent(control_id=f"key.{label}", label=label, source=self.name))

        self.listener = keyboard.Listener(on_press=on_press)
        self.listener.daemon = True
        self.listener.start()

    def stop(self) -> None:
        if self.listener:
            self.listener.stop()

    def _key_label(self, key) -> str:
        if hasattr(key, "char") and key.char:
            return str(key.char).lower()
        name = getattr(key, "name", None)
        return str(name or key).replace("Key.", "").lower()


class HidBackend(InputBackend):
    name = "tourbox-hid"

    def __init__(self) -> None:
        self.available = False
        self.error = ""
        self.thread: threading.Thread | None = None
        self.device = None

    def start(
        self,
        emit: Callable[[InputEvent], None],
        stop_event: threading.Event,
    ) -> None:
        try:
            import hid
        except Exception as exc:  # pragma: no cover - optional native dependency
            self.error = f"hidapi is not available: {exc}"
            return

        devices = hid.enumerate()
        target = next((item for item in devices if self._looks_like_tourbox(item)), None)
        if not target:
            self.error = "TourBox HID device was not detected"
            return

        try:
            self.device = hid.device()
            self.device.open_path(target["path"])
            self.device.set_nonblocking(True)
        except Exception as exc:  # pragma: no cover - depends on local device
            self.error = f"Could not open TourBox HID device: {exc}"
            return

        self.available = True
        self.error = ""

        def run() -> None:
            while not stop_event.is_set():
                try:
                    report = self.device.read(64)
                except Exception as exc:
                    self.error = f"TourBox HID read failed: {exc}"
                    break

                if report:
                    raw = bytes(report).hex()
                    control_id = f"hid.{raw[:24]}"
                    emit(
                        InputEvent(
                            control_id=control_id,
                            label=f"HID {raw[:16]}",
                            source=self.name,
                            raw=raw,
                        )
                    )
                else:
                    time.sleep(0.01)

        self.thread = threading.Thread(target=run, daemon=True)
        self.thread.start()

    def stop(self) -> None:
        if self.device:
            try:
                self.device.close()
            except Exception:
                return

    def _looks_like_tourbox(self, item: dict) -> bool:
        text = " ".join(
            str(item.get(key) or "")
            for key in ["product_string", "manufacturer_string", "serial_number", "path"]
        ).lower()
        return "tourbox" in text or "tour box" in text


class DemoDialBackend(InputBackend):
    name = "demo"

    def __init__(self) -> None:
        self.thread: threading.Thread | None = None

    def start(
        self,
        emit: Callable[[InputEvent], None],
        stop_event: threading.Event,
    ) -> None:
        def run() -> None:
            while not stop_event.is_set():
                time.sleep(3600)

        self.thread = threading.Thread(target=run, daemon=True)
        self.thread.start()
