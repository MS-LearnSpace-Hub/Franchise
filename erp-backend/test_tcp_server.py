import socket
import sys
import threading
from datetime import datetime

def handle_client(client_socket, address):
    print(f"[{datetime.now()}] Connection accepted from {address[0]}:{address[1]}")
    try:
        data = b""
        while True:
            chunk = client_socket.recv(4096)
            if not chunk:
                break
            data += chunk
            
            # The packet ends with a null byte \x00
            if b'\x00' in data:
                break
                
        if data:
            print("-" * 50)
            print(f"[{datetime.now()}] Received {len(data)} bytes")
            
            hex_data = " ".join(f"{b:02X}" for b in data)
            print(f"HEX  : {hex_data}")
            
            ascii_data = "".join(chr(b) if 32 <= b <= 126 else "." for b in data)
            print(f"ASCII: {ascii_data}")
            print("-" * 50)
            
            # Try to extract TransID to send back in the ACK
            xml_str = data.decode('utf-8', errors='ignore').strip('\x00')
            trans_id = "0"
            try:
                import xml.etree.ElementTree as ET
                root = ET.fromstring(xml_str)
                t_id = root.findtext('TransID')
                if t_id:
                    trans_id = t_id
            except:
                pass

            # Send XML ACK to tell the machine we received the punch
            ack_packet = f'<?xml version="1.0"?><Message><TransID>{trans_id}</TransID><Result>OK</Result></Message>\x00'
            client_socket.sendall(ack_packet.encode('utf-8'))
            print(f"[{datetime.now()}] Sent ACK: {ack_packet}")
            
    except Exception as e:
        print(f"Error handling client {address[0]}: {e}")
    finally:
        client_socket.close()
        print(f"[{datetime.now()}] Connection closed by client {address[0]}")

def start_server(host='0.0.0.0', port=5005):
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    # Allow port reuse
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    
    try:
        server.bind((host, port))
        server.listen(5)
        print("*" * 50)
        print(f"TCP Test Server listening on {host}:{port}")
        print("Waiting for MORX machine to connect...")
        print("*" * 50)
        
        while True:
            client, address = server.accept()
            # Handle each connection in a new thread
            client_handler = threading.Thread(
                target=handle_client,
                args=(client, address)
            )
            client_handler.start()
            
    except KeyboardInterrupt:
        print("\nShutting down server...")
    except Exception as e:
        print(f"Server error: {e}")
    finally:
        server.close()
        sys.exit(0)

if __name__ == "__main__":
    start_server()
