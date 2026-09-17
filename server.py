#!/usr/bin/env python3
"""
Simple SPA HTTP Server for DSVV Digital Research Shelf
Serves static assets directly and routes client-side routes like /volume/28 to /index.html.
"""

import http.server
import socketserver
import os
import sys

PORT = 4322
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))

class SPALocalHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT_DIR, **kwargs)

    def _rewrite_path_if_needed(self):
        clean_path = self.path.split('?')[0].split('#')[0]
        full_path = os.path.join(ROOT_DIR, clean_path.lstrip('/'))

        if os.path.exists(full_path) and not os.path.isdir(full_path):
            return
        if os.path.isdir(full_path) and os.path.exists(os.path.join(full_path, 'index.html')):
            return

        # Rewrite to /index.html for SPA routes
        self.path = '/index.html'

    def do_GET(self):
        self._rewrite_path_if_needed()
        return super().do_GET()

    def do_HEAD(self):
        self._rewrite_path_if_needed()
        return super().do_HEAD()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

if __name__ == '__main__':
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), SPALocalHandler) as httpd:
        print(f"DSVV Research Shelf SPA Server running at http://localhost:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
            sys.exit(0)
