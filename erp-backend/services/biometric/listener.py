import socketserver
from datetime import datetime
import xml.etree.ElementTree as ET

def device_msg(inner_tags):
    """Flat format with double null byte terminator"""
    body = "".join(inner_tags)
    return f'<?xml version="1.0"?><Message>{body}</Message>\x00\x00'


class BiometricTCPHandler(socketserver.BaseRequestHandler):
    def handle(self):
        peer = f"{self.client_address[0]}:{self.client_address[1]}"
        self.request.settimeout(10)
        buffer = b""
        
        while True:
            try:
                chunk = self.request.recv(4096)
                if not chunk:
                    print(f"[{datetime.now()}] <<< Closed by device.")
                    break
                    
                buffer += chunk
                
                # Check if we got a complete Message
                if b"</Message>" in buffer or buffer.endswith(b"\x00") or buffer.endswith(b"\x00\x00"):
                    try:
                        # Find the XML part
                        xml_start = buffer.find(b"<?xml")
                        if xml_start != -1:
                            xml_end = buffer.find(b"</Message>") + 10
                            xml_data = buffer[xml_start:xml_end].decode("utf-8", errors="ignore")
                            
                            if "TimeLog" in xml_data:
                                # Parse basic fields manually just to log it
                                user_id = ""
                                if "<UserID>" in xml_data:
                                    user_id = xml_data.split("<UserID>")[1].split("</UserID>")[0]
                                
                                h = xml_data.split("<Hour>")[1].split("</Hour>")[0] if "<Hour>" in xml_data else ""
                                m = xml_data.split("<Minute>")[1].split("</Minute>")[0] if "<Minute>" in xml_data else ""
                                s = xml_data.split("<Second>")[1].split("</Second>")[0] if "<Second>" in xml_data else ""
                                
                                print(f"[{datetime.now()}] [TimeLog] user={user_id} time={h}:{m}:{s}")
                                
                                # Send standard XML ACK
                                ack = f'<?xml version="1.0"?><Message><Response>TimeLog</Response><Result>OK</Result></Message>'
                                print(f"[{datetime.now()}] [TX ACK]: {repr(ack)}")
                                self.request.sendall(ack.encode("utf-8"))
                                
                                # Close gracefully
                                return
                            
                    except Exception as e:
                        print(f"Error parsing: {e}")
                    
                    buffer = b""
                    
            except socket.timeout:
                print(f"[{datetime.now()}] Timeout waiting for data")
                break
            except Exception as e:
                print(f"[{datetime.now()}] Error: {e}")
                break

    def send(self, text, label):
        out = text.encode("utf-8")
        self.request.sendall(out)
        print(f"[{datetime.now()}] [TX {label}]: {out!r}")

class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True

def start_biometric_listener(host="0.0.0.0", port=5005):
    server = ThreadedTCPServer((host, port), BiometricTCPHandler)
    print("*" * 50)
    print(f"M50 Advanced Listener started on {host}:{port}")
    print("*" * 50)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
        server.shutdown()
        server.server_close()

if __name__ == "__main__":
    start_biometric_listener()
