from app import create_app
from services.attendance.staging_service import run_staging_processor

if __name__ == "__main__":
    app = create_app()
    with app.app_context():
        print("Starting Attendance Engine...")
        processed, failed = run_staging_processor()
        print(f"Done! Processed: {processed}, Failed: {failed}")
