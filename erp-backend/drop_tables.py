from app import create_app
app = create_app()
from extensions import db
from sqlalchemy import text

with app.app_context():
    try:
        db.session.execute(text('DROP TABLE IF EXISTS attendance_detail;'))
        db.session.execute(text('DROP TABLE IF EXISTS attendance_head;'))
        db.session.execute(text('DROP TABLE IF EXISTS biometric_punch_log;'))
        db.session.execute(text('DROP TABLE IF EXISTS staff_biometric_mapping;'))
        db.session.execute(text('DROP TABLE IF EXISTS biometric_device_master;'))
        db.session.execute(text('DROP TABLE IF EXISTS staff_master;'))
        db.session.execute(text('DROP TABLE IF EXISTS shift_master;'))
        db.session.execute(text('DROP TABLE IF EXISTS designation_master;'))
        db.session.execute(text('DROP TABLE IF EXISTS department_master;'))
        
        try:
            # First try to drop FK
            # Need to find FK name
            result = db.session.execute(text("SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'staff_id' AND TABLE_SCHEMA = DATABASE();"))
            fk_name = result.scalar()
            if fk_name:
                db.session.execute(text(f'ALTER TABLE users DROP FOREIGN KEY {fk_name};'))
        except Exception as e:
            print("FK drop failed:", e)
            
        try:
            db.session.execute(text('ALTER TABLE users DROP COLUMN staff_id;'))
        except Exception as e:
            print("Column drop failed:", e)
            
        db.session.commit()
        print("Dropped tables.")
    except Exception as e:
        print("Error:", e)
