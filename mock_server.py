import http.server
import socketserver
import json
import time
import sys

PORT = 18789

class MicroClawHandler(http.server.BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def do_GET(self):
        if self.path == '/api/status':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(b'{"status":"ok","version":"0.1.0"}')
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == '/api/message':
            content_length = int(self.headers['Content-Length'])
            body = self.rfile.read(content_length)
            data = json.loads(body)
            
            print(f"Received message: {data.get('message')}")
            
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Connection', 'keep-alive')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            # Simulate streaming response
            responses = [
                "Hello! ",
                "I received your message: ",
                f"\"{data.get('message')}\". ",
                "I am a simulated MicroClaw agent. ",
                "How can I help you further?"
            ]
            
            for part in responses:
                msg = json.dumps({"type": "content", "content": part})
                self.wfile.write(f"data: {msg}\n\n".encode('utf-8'))
                self.wfile.flush()
                time.sleep(0.5)
            
            self.wfile.write(b"data: {\"type\": \"done\"}\n\n")
            self.wfile.flush()
        else:
            self.send_response(404)
            self.end_headers()

if __name__ == "__main__":
    with socketserver.TCPServer(("", PORT), MicroClawHandler) as httpd:
        print(f"Serving MicroClaw Mock Agent at http://localhost:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
