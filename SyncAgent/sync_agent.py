import json
import time
import datetime
import requests
import sqlite3
import pyodbc
import logging
import os

# Setup logging to both file and console
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("sync.log"),
        logging.StreamHandler()
    ]
)

CONFIG_FILE = 'config.json'
DB_FILE = 'sync_queue.db'
AGENT_VERSION = "1.0.0"

def load_config():
    with open(CONFIG_FILE, 'r') as f:
        return json.load(f)

def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS sync_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            payload TEXT NOT NULL,
            status TEXT DEFAULT 'PENDING',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS sync_state (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    ''')
    conn.commit()
    conn.close()

def get_last_sync_time():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("SELECT value FROM sync_state WHERE key = 'last_sync_time'")
    row = c.fetchone()
    conn.close()
    if row:
        return datetime.datetime.fromisoformat(row[0])
def get_sql_server_punches(config):
    try:

        if config.get("username") and config.get("password"):
            conn_str = (
                f"DRIVER={{ODBC Driver 17 for SQL Server}};"
                f"SERVER={config['sql_server']};"
                f"DATABASE={config['database']};"
                f"UID={config['username']};"
                f"PWD={config['password']};"
                f"TrustServerCertificate=yes;"
            )
        else:
            conn_str = (
                f"DRIVER={{ODBC Driver 17 for SQL Server}};"
                f"SERVER={config['sql_server']};"
                f"DATABASE={config['database']};"
                f"Trusted_Connection=yes;"
                f"TrustServerCertificate=yes;"
            )

        conn = pyodbc.connect(conn_str)
        cursor = conn.cursor()

        last_sync_time = get_last_sync_time()

        if last_sync_time is None:
            last_sync_time = datetime.datetime.now() - datetime.timedelta(days=7)

        query = """
        SELECT
            b.EmpID,
            CAST(a.In_Out_Time AS DATE) AS AttendanceDate,

            MIN(CASE
                    WHEN a.Mode='IN'
                    THEN a.In_Out_Time
                END) AS FirstIn,

            MAX(CASE
                    WHEN a.Mode='OUT'
                    THEN a.In_Out_Time
                END) AS LastOut

        FROM dbo.AllDataSub a

        JOIN dbo.EmpMaster b
            ON a.EmpCode = b.EmpCode

        WHERE a.In_Out_Time > ?

        GROUP BY
            b.EmpID,
            CAST(a.In_Out_Time AS DATE)

        ORDER BY
            AttendanceDate,
            b.EmpID
        """

        cursor.execute(query, (last_sync_time,))

        rows = cursor.fetchall()

        attendance = []

        for row in rows:

            attendance.append({
                "employee_id": str(row.EmpID),
                "attendance_date": row.AttendanceDate.strftime("%Y-%m-%d"),
                "first_in": row.FirstIn.strftime("%H:%M:%S") if row.FirstIn else None,
                "last_out": row.LastOut.strftime("%H:%M:%S") if row.LastOut else None
            })

        conn.close()

        return attendance

    except Exception as e:

        logging.error(str(e))

        return None

def queue_payload(payload):
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('INSERT INTO sync_queue (payload) VALUES (?)', (json.dumps(payload),))
    conn.commit()
    conn.close()

def process_queue(config):
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('SELECT id, payload FROM sync_queue WHERE status = "PENDING" ORDER BY created_at ASC')
    rows = c.fetchall()
    
    url = f"{config['erp_url']}/api/v1/attendance/sync"
    headers = {
    "X-API-Key": config["api_key"],
    "Content-Type": "application/json"
}
    
    for row_id, payload_str in rows:
        payload = json.loads(payload_str)
        try:
            logging.info(f"Pushing payload for sync_time: {payload.get('sync_time')}")
            response = requests.post(url, json=payload, headers=headers, timeout=10)
            
            if response.status_code == 200:
                logging.info(f"Success: {response.json()}")
                c.execute('UPDATE sync_queue SET status = "SYNCED" WHERE id = ?', (row_id,))
                conn.commit()
            else:
                logging.error(f"ERP API Error {response.status_code}: {response.text}")
                # We stop processing the queue if ERP is rejecting
                break
        except requests.exceptions.RequestException as e:
            logging.error(f"Network Error pushing to ERP: {str(e)}")
            break
            
    conn.close()

def main():
    logging.info("Starting Biometric Sync Agent V8")
    init_db()
    interval= 60
    while True:
        try:
            config = load_config()
            interval = max(5, int(config.get('sync_interval', 60)))
            
            logging.info("Reading from SQL Server...")
            punches = get_sql_server_punches(config)
            
            if punches is not None and len(punches) > 0:
                payload = {
                    "agent_version": AGENT_VERSION,
                    "sync_time": datetime.datetime.utcnow().isoformat() + "Z",
                    "punches": punches
                }
                queue_payload(payload)
                
            logging.info("Processing Queue...")
            process_queue(config)
            
        except Exception as e:
            logging.error(f"Unexpected Agent Error: {str(e)}")
            
        finally:
            time.sleep(interval)

if __name__ == '__main__':
    main()
