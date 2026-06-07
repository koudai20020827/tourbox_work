from __future__ import annotations

import glob
import json
import subprocess
from dataclasses import dataclass
from typing import Any


@dataclass
class DeviceInfo:
    kind: str
    name: str
    path: str = ""
    vendor_id: str = ""
    product_id: str = ""
    serial: str = ""
    matched: bool = False

    def to_dict(self) -> dict[str, str | bool]:
        return {
            "kind": self.kind,
            "name": self.name,
            "path": self.path,
            "vendor_id": self.vendor_id,
            "product_id": self.product_id,
            "serial": self.serial,
            "matched": self.matched,
        }


class DeviceScanner:
    def scan(self) -> dict[str, Any]:
        serial_devices = self._scan_serial()
        usb_devices = self._scan_usb()
        matched = [device for device in serial_devices + usb_devices if device.matched]
        return {
            "connected": bool(matched),
            "matched": [device.to_dict() for device in matched],
            "serial": [device.to_dict() for device in serial_devices],
            "usb": [device.to_dict() for device in usb_devices],
        }

    def _scan_serial(self) -> list[DeviceInfo]:
        try:
            from serial.tools import list_ports
        except Exception:
            return [
                DeviceInfo(kind="serial", name=path.rsplit("/", 1)[-1], path=path)
                for path in sorted(glob.glob("/dev/cu.*") + glob.glob("/dev/tty.*"))
            ]

        devices: list[DeviceInfo] = []
        for port in list_ports.comports():
            text = " ".join(
                str(value or "")
                for value in [
                    port.device,
                    port.name,
                    port.description,
                    port.manufacturer,
                    port.product,
                ]
            )
            devices.append(
                DeviceInfo(
                    kind="serial",
                    name=port.description or port.name or port.device,
                    path=port.device or "",
                    vendor_id=self._hex_id(port.vid),
                    product_id=self._hex_id(port.pid),
                    serial=port.serial_number or "",
                    matched=self._looks_like_tourbox(text),
                )
            )
        return devices

    def _scan_usb(self) -> list[DeviceInfo]:
        try:
            result = subprocess.run(
                ["system_profiler", "SPUSBDataType", "-json"],
                capture_output=True,
                check=True,
                text=True,
                timeout=6,
            )
            payload = json.loads(result.stdout)
        except Exception:
            return []

        devices: list[DeviceInfo] = []
        for item in payload.get("SPUSBDataType", []):
            self._walk_usb(item, devices)
        return devices

    def _walk_usb(self, item: dict[str, Any], devices: list[DeviceInfo]) -> None:
        name = str(item.get("_name") or item.get("name") or "")
        vendor_id = str(item.get("vendor_id") or "")
        product_id = str(item.get("product_id") or "")
        serial = str(item.get("serial_num") or "")
        manufacturer = str(item.get("manufacturer") or "")
        text = " ".join([name, vendor_id, product_id, serial, manufacturer])

        if name or vendor_id or product_id:
            devices.append(
                DeviceInfo(
                    kind="usb",
                    name=name or "USB Device",
                    vendor_id=vendor_id,
                    product_id=product_id,
                    serial=serial,
                    matched=self._looks_like_tourbox(text),
                )
            )

        for child in item.get("_items", []) or []:
            if isinstance(child, dict):
                self._walk_usb(child, devices)

    def _looks_like_tourbox(self, text: str) -> bool:
        lowered = text.lower()
        return "tourbox" in lowered or "tour box" in lowered

    def _hex_id(self, value: int | None) -> str:
        return f"0x{value:04x}" if value is not None else ""
