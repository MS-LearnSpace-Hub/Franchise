from flask import Blueprint, request, jsonify, current_app
from datetime import datetime
import uuid
import os
from models import db, AttendanceStaging, SyncLog
from functools import wraps

attendance_sync_bp = Blueprint('attendance_sync_bp', __name__)

def require_agent_token(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('X-API-Key')
        if not token:
            return jsonify({'status': 'error', 'message': 'Missing X-API-Key header'}), 401
        
        expected_api_key = current_app.config.get('HEAD_OFFICE_API_KEY') or os.environ.get('HEAD_OFFICE_API_KEY')
        
        if not expected_api_key:
             return jsonify({'status': 'error', 'message': 'Server is not configured with HEAD_OFFICE_API_KEY'}), 500
             
        if token != expected_api_key:
            return jsonify({'status': 'error', 'message': 'Invalid API Key'}), 403
            
        return f(*args, **kwargs)
    return decorated

@attendance_sync_bp.route('/api/v1/attendance/sync', methods=['POST'])
@require_agent_token
def sync_attendance():
    data = request.json
    
    if not data:
        return jsonify({'status': 'error', 'message': 'Invalid JSON payload'}), 400
        
    punches = data.get('punches', [])
    agent_version = data.get('agent_version', '1.0.0')
    sync_id = str(uuid.uuid4())
    
    sync_log = SyncLog(
        sync_id=sync_id,
        records_read=len(punches),
        agent_version=agent_version,
        started_at=datetime.utcnow()
    )
    db.session.add(sync_log)
    
    inserted = 0
    failed = 0
    
    try:
        for punch in punches:
            try:
                emp_code = punch.get('employee_id')
                att_date_str = punch.get('attendance_date')
                
                if not emp_code or not att_date_str:
                    failed += 1
                    continue
                    
                attendance_date = datetime.strptime(att_date_str, '%Y-%m-%d').date()
                
                first_in_str = punch.get('first_in')
                last_out_str = punch.get('last_out')
                
                first_in = datetime.strptime(first_in_str, '%H:%M:%S').time() if first_in_str else None
                last_out = datetime.strptime(last_out_str, '%H:%M:%S').time() if last_out_str else None
                
                # Upsert logic to prevent duplicate staging rows
                staging_record = AttendanceStaging.query.filter_by(
                    employee_id=emp_code,
                    attendance_date=attendance_date
                ).first()
                
                if staging_record:
                    # Update existing record and set to PENDING so engine re-processes
                    staging_record.first_in = first_in
                    staging_record.last_out = last_out
                    staging_record.status = 'PENDING'
                else:
                    staging_record = AttendanceStaging(
                        employee_id=emp_code,
                        attendance_date=attendance_date,
                        first_in=first_in,
                        last_out=last_out,
                        source='PAYTIME',
                        status='PENDING'
                    )
                    db.session.add(staging_record)
                inserted += 1
            except Exception as e:
                failed += 1
                current_app.logger.error(f"Error processing punch: {str(e)}")
                
        sync_log.records_uploaded = inserted
        sync_log.records_failed = failed
        sync_log.completed_at = datetime.utcnow()
        sync_log.duration = int((sync_log.completed_at - sync_log.started_at).total_seconds())
        
        if failed > 0 and inserted == 0:
            sync_log.status = 'FAILED'
        elif failed > 0:
            sync_log.status = 'PARTIAL'
        else:
            sync_log.status = 'SUCCESS'
            
        db.session.commit()
        
        return jsonify({
            'status': 'success',
            'sync_id': sync_id,
            'records_processed': inserted,
            'records_failed': failed
        }), 200
        
    except Exception as e:
        db.session.rollback()
        failure_log = SyncLog(
            sync_id=sync_id,
            records_read=len(punches),
            agent_version=agent_version,
            started_at=datetime.utcnow(),
            completed_at=datetime.utcnow(),
            status='FAILED',
            errors=str(e)
        )
        db.session.add(failure_log)
        db.session.commit()
        return jsonify({'status': 'error', 'message': str(e)}), 500
