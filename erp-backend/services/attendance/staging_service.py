from services.attendance.attendance_engine import process_staging_records

def run_staging_processor():
    """
    Called by a scheduled job (e.g. Celery or APScheduler) to run the processor periodically.
    """
    processed, failed = process_staging_records()
    return processed, failed
