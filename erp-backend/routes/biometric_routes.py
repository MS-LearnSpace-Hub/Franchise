import logging
from flask import Blueprint, request, jsonify
from extensions import db
from models import BiometricDeviceMaster, StaffBiometricMapping, BiometricPunchLog
from helpers import permission_required, get_now

bp = Blueprint('biometric_bp', __name__)
logger = logging.getLogger(__name__)

# ==========================================
# BIOMETRIC DEVICE ROUTES
# ==========================================
@bp.route('/devices', methods=['GET'])
@permission_required("attendance.biometric", "read")
def get_biometric_devices():
    devices = BiometricDeviceMaster.query.all()
    result = [{
        "id": d.id,
        "device_code": d.device_code,
        "device_name": d.device_name,
        "device_model": d.device_model,
        "manufacturer": d.manufacturer,
        "serial_number": d.serial_number,
        "ip_address": d.ip_address,
        "port": d.port,
        "communication_type": d.communication_type,
        "timezone": d.timezone,
        "last_sync_at": str(d.last_sync_at) if d.last_sync_at else None,
        "status": d.status
    } for d in devices]
    return jsonify(result), 200

@bp.route('/devices', methods=['POST'])
@permission_required("attendance.biometric", "write")
def create_biometric_device():
    data = request.json
    if not data or not data.get('device_code') or not data.get('device_name'):
        return jsonify({"error": "Device code and name are required"}), 400
        
    if BiometricDeviceMaster.query.filter_by(device_code=data['device_code']).first():
        return jsonify({"error": "Device code already exists"}), 400
        
    device = BiometricDeviceMaster(
        branch_id=data.get('branch_id'),
        device_code=data['device_code'],
        device_name=data['device_name'],
        device_model=data.get('device_model'),
        manufacturer=data.get('manufacturer'),
        serial_number=data.get('serial_number'),
        ip_address=data.get('ip_address'),
        port=data.get('port'),
        communication_type=data.get('communication_type', 'TCP_IP'),
        timezone=data.get('timezone', 'Asia/Kolkata'),
        status=data.get('status', 'ACTIVE')
    )
    db.session.add(device)
    db.session.commit()
    return jsonify({"message": "Biometric device created successfully", "id": device.id}), 201

# ==========================================
# STAFF BIOMETRIC MAPPING ROUTES
# ==========================================
@bp.route('/mapping', methods=['GET'])
@permission_required("attendance.biometric", "read")
def get_staff_mappings():
    mappings = StaffBiometricMapping.query.all()
    result = [{
        "id": m.id,
        "staff_id": m.staff_id,
        "staff_name": m.staff.display_name if m.staff else None,
        "device_id": m.device_id,
        "device_name": m.device.device_name if m.device else None,
        "biometric_id": m.biometric_id,
        "card_number": m.card_number,
        "face_registered": m.face_registered,
        "finger_registered": m.finger_registered,
        "pin_registered": m.pin_registered,
        "is_primary": m.is_primary,
        "status": m.status
    } for m in mappings]
    return jsonify(result), 200

@bp.route('/mapping', methods=['POST'])
@permission_required("attendance.biometric", "write")
def create_staff_mapping():
    data = request.json
    if not data or not data.get('staff_id') or not data.get('device_id'):
        return jsonify({"error": "staff_id and device_id are required"}), 400
        
    mapping = StaffBiometricMapping(
        staff_id=data['staff_id'],
        device_id=data['device_id'],
        biometric_id=data.get('biometric_id'),
        card_number=data.get('card_number'),
        face_registered=data.get('face_registered', False),
        finger_registered=data.get('finger_registered', False),
        pin_registered=data.get('pin_registered', False),
        is_primary=data.get('is_primary', True),
        status=data.get('status', 'ACTIVE')
    )
    db.session.add(mapping)
    db.session.commit()
    return jsonify({"message": "Staff biometric mapping created successfully", "id": mapping.id}), 201
