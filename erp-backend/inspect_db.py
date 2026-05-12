from app import create_app
from extensions import db
from models import ClassMaster, ClassSection
import traceback
from sqlalchemy import func

app = create_app()
with app.app_context():
    try:
        classes = ClassMaster.query.all()
        print("Classes:")
        for c in classes:
            print(f"ID: {c.id}, Name: '{c.class_name}'")
        
        sections = ClassSection.query.all()
        print("\nSections:")
        for s in sections:
            print(f"ID: {s.id}, ClassID: {s.class_id}, Branch: {s.branch_id}, Year: '{s.academic_year}', Name: '{s.section_name}', Strength: {s.student_strength}")

        branch_id = 1
        academic_year = "2025-26"
        class_name = "6"
        sec_name = "HA2"
        strength = 40
        
        class_obj = ClassMaster.query.filter(
            func.lower(ClassMaster.class_name) == func.lower(class_name)
        ).first()

        print(f"\nClass found: {class_obj.id if class_obj else None}")
        if not class_obj:
            class_obj = ClassMaster(class_name=class_name)
            db.session.add(class_obj)
            db.session.flush()
            print("Flushed new class")
        
        existing_sec = ClassSection.query.filter_by(
            class_id=class_obj.id,
            branch_id=branch_id,
            academic_year=academic_year,
            section_name=sec_name
        ).first()
        
        print(f"Section found: {existing_sec.id if existing_sec else None}")
        
        if existing_sec:
             existing_sec.student_strength = strength
        else:
             new_sec = ClassSection(
                 class_id=class_obj.id,
                 branch_id=branch_id,
                 academic_year=academic_year,
                 section_name=sec_name,
                 student_strength=strength
             )
             db.session.add(new_sec)
             print("Added new section to session")
        
        db.session.commit()
        print("Commit successful!")
    except Exception as e:
        print("Exception during commit/flush:")
        traceback.print_exc()
        db.session.rollback()
