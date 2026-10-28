#!/usr/bin/env python3
"""Collector for the composer-alias IME diagnostics.

Run this from anywhere, then turn the plugin's logging on in the browser:

    localStorage['dsh-composer-alias.debug'] = '1'; location.reload()

Every event the plugin records is POSTed here as one JSON line and appended to
the log file, so the trace survives a reload and can be read with tail(1):

    python3 tools/log-collector.py --file /tmp/composer-alias.log
    tail -f /tmp/composer-alias.log

Turn the logging off again with `localStorage.removeItem('dsh-composer-alias.debug')`.
The plugin never requires this collector: with it stopped, records only go to the
browser's localStorage ring (window.__composerAliasDebug.dump()).
"""

import argparse
import datetime
import http.server
import pathlib
import threading


class Collector(http.server.BaseHTTPRequestHandler):
    """Append one POST body per request to a log file; answer GET /health."""

    log_path: pathlib.Path
    lock: threading.Lock

    def log_message(self, fmt, *args):  # noqa: A003 - stdlib signature
        """Keep the server quiet: the requests themselves are the output."""

    def _reply(self, code: int, body: bytes = b"") -> None:
        self.send_response(code)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "content-type")
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if body:
            self.wfile.write(body)

    def do_OPTIONS(self):  # noqa: N802 - stdlib signature
        self._reply(204)

    def do_GET(self):  # noqa: N802 - stdlib signature
        if self.path.startswith("/health"):
            self._reply(200, b"ok\n")
            return
        if self.path.startswith("/tail"):
            try:
                lines = self.log_path.read_text(encoding="utf-8").splitlines()[-200:]
            except FileNotFoundError:
                lines = []
            self._reply(200, ("\n".join(lines) + "\n").encode("utf-8"))
            return
        self._reply(404, b"not found\n")

    def do_POST(self):  # noqa: N802 - stdlib signature
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else b""
        text = body.decode("utf-8", "replace")
        with self.lock:
            with self.log_path.open("a", encoding="utf-8") as handle:
                handle.write(text if text.endswith("\n") else text + "\n")
        self._reply(204)


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect composer-alias IME diagnostics.")
    parser.add_argument("--port", type=int, default=17873)
    parser.add_argument("--file", default="composer-alias.log")
    args = parser.parse_args()

    log_path = pathlib.Path(args.file).expanduser().resolve()
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.touch()

    Collector.log_path = log_path
    Collector.lock = threading.Lock()
    server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), Collector)
    stamp = datetime.datetime.now().strftime("%H:%M:%S")
    print(f"[{stamp}] collecting on http://127.0.0.1:{args.port}/log -> {log_path}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
