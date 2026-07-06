import os
import sys
from zk import ZK, const

def test_zk_connection():
    # Try connecting to standard port 4370
    zk = ZK('192.168.1.224', port=4370, timeout=10, password=0, force_udp=False)
    
    try:
        print("Connecting to 192.168.1.224:5005...")
        conn = zk.connect()
        print("Connected successfully!")
        
        print("\n--- Device Info ---")
        print(f"Firmware Version: {conn.get_firmware_version()}")
        print(f"Serial Number: {conn.get_serialnumber()}")
        print(f"Device Name: {conn.get_device_name()}")
        print(f"MAC Address: {conn.get_mac()}")
        
        print("\n--- Getting Attendance Logs ---")
        attendances = conn.get_attendance()
        if not attendances:
            print("No attendance logs found.")
        else:
            print(f"Found {len(attendances)} logs.")
            for att in attendances[:5]:
                print(f"- User: {att.user_id}, Time: {att.timestamp}, Punch: {att.punch}")
            if len(attendances) > 5:
                print(f"... and {len(attendances)-5} more.")
            
        print("\nDisconnecting...")
        
    except Exception as e:
        print("Process terminate : {}".format(e))
        print("Ensure the device's IP and Port (5005) are correct and accessible.")
    finally:
        if 'conn' in locals() and conn:
            conn.disconnect()

if __name__ == "__main__":
    test_zk_connection()
