import logging
from flask import Blueprint, request, jsonify
from extensions import db
from models import BiometricDeviceMaster, StaffBiometricMapping, BiometricPunchLog
from helpers import permission_required, token_required, get_now, scope_query, get_target_school_id, get_user_allowed_schools

bp = Blueprint('biometric_bp', __name__)
logger = logging.getLogger(__name__)

# ==========================================
# BIOMETRIC DEVICE ROUTES
# ==========================================
@bp.route('/devices', methods=['GET'])
@token_required
@permission_required("attendance.biometric", "read")
def get_biometric_devices(current_user):
    query = BiometricDeviceMaster.query
    query = scope_query(query, BiometricDeviceMaster)
    
    # Optional branch filtering
    branch_id = request.args.get('branch_id')
    if branch_id and branch_id.lower() != 'all':
        try:
            query = query.filter_by(branch_id=int(branch_id))
        except ValueError:
            return jsonify({"error": "Invalid branch_id"}), 400
    elif not branch_id or branch_id.lower() == 'all':
        target_school_id = get_target_school_id(current_user)
        if target_school_id:
            from models import Branch
            query = query.join(Branch).filter(Branch.school_id == target_school_id)
            
    devices = query.all()
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
        "communication_password": d.communication_password,
        "sync_mode": d.sync_mode,
        "sync_interval_minutes": d.sync_interval_minutes,
        "timezone": d.timezone,
        "status": d.status,
        "last_seen": str(d.last_seen) if d.last_seen else None,
        "last_punch": str(d.last_punch) if d.last_punch else None,
        "firmware_version": d.firmware_version,
        "sync_status": d.sync_status,
        "last_successful_sync": str(d.last_successful_sync) if d.last_successful_sync else None,
        "pending_punches": d.pending_punches
    } for d in devices]
    return jsonify(result), 200

@bp.route('/devices', methods=['POST'])
@token_required
@permission_required("attendance.biometric", "write")
def create_biometric_device(current_user):
    data = request.json
    if not data or not data.get('device_code') or not data.get('device_name') or not data.get('branch_id'):
        return jsonify({"error": "Device code, name, and branch_id are required"}), 400
        
    branch_id = data['branch_id']
    from models import Branch
    branch = Branch.query.get(branch_id)
    if not branch:
        return jsonify({"error": "Invalid branch ID"}), 400
        
    allowed_schools = get_user_allowed_schools(current_user)
    if not allowed_schools['is_unlimited']:
        if not allowed_schools['ids'] or branch.school_id not in allowed_schools['ids']:
            return jsonify({"error": "Forbidden: Cannot create device in this branch"}), 403

    if BiometricDeviceMaster.query.filter_by(device_code=data['device_code']).first():
        return jsonify({"error": "Device code already exists"}), 400
        
    device = BiometricDeviceMaster(
        branch_id=branch_id,
        device_code=data['device_code'],
        device_name=data['device_name'],
        device_model=data.get('device_model'),
        manufacturer=data.get('manufacturer'),
        serial_number=data.get('serial_number'),
        ip_address=data.get('ip_address'),
        port=data.get('port'),
        communication_type=data.get('communication_type', 'TCP'),
        communication_password=data.get('communication_password'),
        sync_mode=data.get('sync_mode', 'AUTO'),
        sync_interval_minutes=data.get('sync_interval_minutes', 5),
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
@token_required
@permission_required("attendance.biometric", "read")
def get_staff_mappings(current_user):
    from models import StaffMaster
    query = StaffBiometricMapping.query.join(StaffMaster)
    # Apply branch filtering manually since we join StaffMaster
    branch_id = request.args.get('branch_id')
    if branch_id and branch_id.lower() != 'all':
        try:
            query = query.filter(StaffMaster.branch_id == int(branch_id))
        except ValueError:
            return jsonify({"error": "Invalid branch_id"}), 400
    elif not branch_id or branch_id.lower() == 'all':
        target_school_id = get_target_school_id(current_user)
        if target_school_id:
            query = query.filter(StaffMaster.school_id == target_school_id)
            
    mappings = query.all()
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
@token_required
@permission_required("attendance.biometric", "write")
def create_staff_mapping(current_user):
    data = request.json
    if not data or not data.get('staff_id') or not data.get('device_id'):
        return jsonify({"error": "staff_id and device_id are required"}), 400
        
    from models import StaffMaster
    staff = StaffMaster.query.get(data['staff_id'])
    if not staff:
        return jsonify({"error": "Invalid staff ID"}), 400
        
    device = BiometricDeviceMaster.query.get(data['device_id'])
    if not device:
        return jsonify({"error": "Invalid device ID"}), 400
        
    allowed_schools = get_user_allowed_schools(current_user)
    if not allowed_schools['is_unlimited']:
        if not allowed_schools['ids'] or staff.school_id not in allowed_schools['ids']:
            return jsonify({"error": "Forbidden: Cannot map staff from this branch"}), 403
        if not allowed_schools['ids'] or device.school_id not in allowed_schools['ids']:
            return jsonify({"error": "Forbidden: Cannot map staff to this device"}), 403
        
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

@bp.route('/devices/<int:device_id>', methods=['PUT'])
@token_required
@permission_required("attendance.biometric", "write")
def update_biometric_device(current_user, device_id):
    data = request.json
    device = BiometricDeviceMaster.query.get(device_id)
    if not device:
        return jsonify({"error": "Device not found"}), 404
        
    allowed_schools = get_user_allowed_schools(current_user)
    if not allowed_schools['is_unlimited']:
        if not allowed_schools['ids'] or device.branch.school_id not in allowed_schools['ids']:
            return jsonify({"error": "Forbidden: Cannot update device in this branch"}), 403

    if 'device_name' in data:
        device.device_name = data['device_name']
    if 'device_model' in data:
        device.device_model = data['device_model']
    if 'manufacturer' in data:
        device.manufacturer = data['manufacturer']
    if 'serial_number' in data:
        device.serial_number = data['serial_number']
    if 'ip_address' in data:
        device.ip_address = data['ip_address']
    if 'port' in data:
        device.port = data['port']
    if 'communication_type' in data:
        device.communication_type = data['communication_type']
    if 'communication_password' in data:
        device.communication_password = data['communication_password']
    if 'sync_mode' in data:
        device.sync_mode = data['sync_mode']
    if 'sync_interval_minutes' in data:
        device.sync_interval_minutes = data['sync_interval_minutes']
    if 'timezone' in data:
        device.timezone = data['timezone']
    if 'status' in data:
        device.status = data['status']

    db.session.commit()
    return jsonify({"message": "Biometric device updated successfully"}), 200
