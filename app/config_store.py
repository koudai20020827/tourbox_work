from __future__ import annotations

import json
from pathlib import Path

from app.models import Binding


class ConfigStore:
    def __init__(self, path: Path) -> None:
        self.path = path

    def _read(self) -> dict:
        if not self.path.exists():
            return {}

        with self.path.open("r", encoding="utf-8") as file:
            return json.load(file)

    def load(self) -> dict[str, Binding]:
        raw = self._read()

        bindings = raw.get("bindings", {})
        return {
            control_id: Binding.from_dict({"control_id": control_id, **binding})
            for control_id, binding in bindings.items()
        }

    def load_aliases(self) -> dict[str, str]:
        raw = self._read()
        aliases = raw.get("aliases", {})
        return {
            str(signal_id): str(control_id)
            for signal_id, control_id in aliases.items()
            if signal_id and control_id
        }

    def save(self, bindings: dict[str, Binding], aliases: dict[str, str] | None = None) -> None:
        payload = {
            "bindings": {
                control_id: {
                    "label": binding.label,
                    "action": {"keys": binding.action.keys},
                }
                for control_id, binding in sorted(bindings.items())
            }
        }
        if aliases:
            payload["aliases"] = dict(sorted(aliases.items()))

        with self.path.open("w", encoding="utf-8") as file:
            json.dump(payload, file, ensure_ascii=False, indent=2)
            file.write("\n")
