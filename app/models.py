from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class ShortcutAction:
    keys: list[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ShortcutAction":
        return cls(keys=[str(key) for key in data.get("keys", [])])


@dataclass
class Binding:
    control_id: str
    label: str
    action: ShortcutAction

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Binding":
        return cls(
            control_id=str(data["control_id"]),
            label=str(data.get("label") or data["control_id"]),
            action=ShortcutAction.from_dict(data.get("action", {})),
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


DEFAULT_CONTROLS = [
    {"id": "side", "label": "サイド"},
    {"id": "top", "label": "トップ"},
    {"id": "tall", "label": "トール"},
    {"id": "short", "label": "ショート"},
    {"id": "c1", "label": "C1"},
    {"id": "c2", "label": "C2"},
    {"id": "tour", "label": "Tour"},
    {"id": "dial.left", "label": "ダイヤル左"},
    {"id": "dial.right", "label": "ダイヤル右"},
    {"id": "dial.click", "label": "ダイヤル押下"},
    {"id": "scroll.up", "label": "スクロール上"},
    {"id": "scroll.down", "label": "スクロール下"},
    {"id": "scroll.click", "label": "スクロール押下"},
    {"id": "knob.left", "label": "ノブ左"},
    {"id": "knob.right", "label": "ノブ右"},
    {"id": "knob.click", "label": "ノブ押下"},
    {"id": "dpad.left", "label": "左"},
    {"id": "dpad.down", "label": "下"},
    {"id": "dpad.up", "label": "上"},
    {"id": "dpad.right", "label": "右"},
]
