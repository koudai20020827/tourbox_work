from __future__ import annotations

import json
from pathlib import Path

from app.models import Binding


class ConfigStore:
    def __init__(self, path: Path) -> None:
        self.path = path

    def load(self) -> dict[str, Binding]:
        if not self.path.exists():
            return {}

        with self.path.open("r", encoding="utf-8") as file:
            raw = json.load(file)

        bindings = raw.get("bindings", {})
        return {
            control_id: Binding.from_dict({"control_id": control_id, **binding})
            for control_id, binding in bindings.items()
        }

    def save(self, bindings: dict[str, Binding]) -> None:
        payload = {
            "bindings": {
                control_id: {
                    "label": binding.label,
                    "action": {"keys": binding.action.keys},
                }
                for control_id, binding in sorted(bindings.items())
            }
        }
        with self.path.open("w", encoding="utf-8") as file:
            json.dump(payload, file, ensure_ascii=False, indent=2)
            file.write("\n")

