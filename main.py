from pathlib import Path

import webview

from app.api import ShortcutApi


BASE_DIR = Path(__file__).resolve().parent


def main() -> None:
    api = ShortcutApi(BASE_DIR)
    window = webview.create_window(
        "ショートカット割り当て",
        str(BASE_DIR / "web" / "index.html"),
        js_api=api,
        width=430,
        height=820,
        min_size=(390, 700),
    )
    api.set_window(window)
    webview.start(api.start, debug=True)


if __name__ == "__main__":
    main()
