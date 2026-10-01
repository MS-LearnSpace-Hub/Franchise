# pyrefly: ignore [missing-import]
from flask import Blueprint, jsonify, request, g, send_file
from extensions import db, get_now
from models import RemittanceMaster, RemittanceDenominations, RemittanceReceipts, BranchYearSequence, Branch
from helpers import token_required, get_user_allowed_branches, has_permission
import json
import os
import uuid
from werkzeug.utils import secure_filename

bp = Blueprint('remittance_routes', __name__)

UPLOAD_FOLDER = os.path.join('uploads', 'remittances')
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

@bp.route("/api/fees/remittance", methods=["GET"])
@token_required
def get_remittances(current_user):
    if not has_permission(current_user, "fees.fee.remittance-approvals", "read") and \
       not has_permission(current_user, "fees.fee.remittance-deposit", "read"):
        return jsonify({"message": "Permission denied"}), 403

    branch_id = request.args.get('branch_id')
    status = request.args.get('status')
    
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    allowed = get_user_allowed_branches(current_user)
    
    q = db.session.query(RemittanceMaster, Branch.branch_name).join(Branch, RemittanceMaster.branch_id == Branch.id)
    if not allowed['is_unlimited']:
        q = q.filter(RemittanceMaster.branch_id.in_(allowed['ids']))
        
    if branch_id and branch_id != 'All':
        q = q.filter(RemittanceMaster.branch_id == branch_id)
    if status and status != 'All':
        q = q.filter(RemittanceMaster.status == status)
    if start_date:
        q = q.filter(RemittanceMaster.business_date >= start_date)
    if end_date:
        q = q.filter(RemittanceMaster.business_date <= end_date)
        
    remittances = q.order_by(RemittanceMaster.created_at.desc()).all()
    
    return jsonify([{
        "id": r[0].id,
        "remittance_no": r[0].remittance_no,
        "business_date": r[0].business_date.isoformat(),
        "cash_in_hand": float(r[0].cash_in_hand),
        "deposit_amount": float(r[0].deposit_amount),
        "remaining_cash": float(r[0].remaining_cash),
        "status": r[0].status,
        "branch_id": r[0].branch_id,
        "branch_name": r[1],
        "school_id": r[0].school_id,
        "attachment_path": r[0].attachment_path,
        "deposit_type": getattr(r[0], 'deposit_type', None),
        "bank_name": getattr(r[0], 'bank_name', None),
        "account_number": getattr(r[0], 'account_number', None),
        "reference_no": getattr(r[0], 'reference_no', None),
        "remarks": r[0].remarks,
        "created_by": r[0].created_by,
        "approved_by": r[0].approved_by,
        "approved_at": r[0].approved_at.isoformat() if r[0].approved_at else None,
        "created_at": r[0].created_at.isoformat() if r[0].created_at else None,
        "denominations": [{
            "denomination": d.denomination,
            "quantity": d.quantity,
            "amount": float(d.amount) if getattr(d, 'amount', None) else (d.denomination * d.quantity)
        } for d in db.session.query(RemittanceDenominations).filter_by(remittance_id=r[0].id).all()]
    } for r in remittances]), 200

@bp.route("/api/fees/remittance/cash-position", methods=["GET"])
@token_required
def get_cash_position(current_user):
    if not has_permission(current_user, "fees.fee.remittance-deposit", "read") and \
       not has_permission(current_user, "fees.fee.remittance-approvals", "read") and \
       not has_permission(current_user, "fees.fee.reconciliation-dashboard", "read"):
        return jsonify({"message": "Permission denied"}), 403

    branch_id = request.args.get('branch_id')
    if not branch_id:
        return jsonify({"error": "branch_id is required"}), 400

    allowed = get_user_allowed_branches(current_user)
    if not allowed['is_unlimited'] and int(branch_id) not in allowed['ids']:
        return jsonify({"message": "Permission denied for this branch"}), 403

    from sqlalchemy import func
    from models import FeePayment
    
    today = get_now().date()
    branch = db.session.query(Branch).get(branch_id)
    branch_name = branch.branch_name if branch else "Unknown"

    total_cash_collected = db.session.query(func.sum(FeePayment.amount_paid)).filter(
        FeePayment.branch_id == branch_id,
        FeePayment.payment_mode == 'Cash'
    ).scalar() or 0

    today_collection = db.session.query(func.sum(FeePayment.amount_paid)).filter(
        FeePayment.branch_id == branch_id,
        FeePayment.payment_mode == 'Cash',
        FeePayment.payment_date == today
    ).scalar() or 0

    total_remitted = db.session.query(func.sum(RemittanceMaster.deposit_amount)).filter(
        RemittanceMaster.branch_id == branch_id,
        RemittanceMaster.status != 'Rejected'
    ).scalar() or 0

    today_remitted = db.session.query(func.sum(RemittanceMaster.deposit_amount)).filter(
        RemittanceMaster.branch_id == branch_id,
        RemittanceMaster.business_date == today,
        RemittanceMaster.status != 'Rejected'
    ).scalar() or 0

    total_cash_collected = float(total_cash_collected)
    today_collection = float(today_collection)
    total_remitted = float(total_remitted)
    today_remitted = float(today_remitted)

    cash_in_hand = total_cash_collected - total_remitted
    opening_balance = cash_in_hand - today_collection + today_remitted

    return jsonify({
        "cash_in_hand": cash_in_hand,
        "opening_balance": opening_balance,
        "today_collection": today_collection,
        "today_remitted": today_remitted,
        "total_cash_collected": total_cash_collected,
        "total_remitted": total_remitted,
        "unremitted_receipts": [],
        "branch_name": branch_name
    }), 200

@bp.route("/api/fees/remittance", methods=["POST"])
@token_required
def create_remittance(current_user):
    if not has_permission(current_user, "fees.fee.remittance-deposit", "write"):
        return jsonify({"message": "Permission denied"}), 403

    branch_id = request.form.get('branch_id')
    if not branch_id:
        return jsonify({"error": "branch_id is required"}), 400
    
    allowed = get_user_allowed_branches(current_user)
    if not allowed['is_unlimited'] and int(branch_id) not in allowed['ids']:
        return jsonify({"message": "Permission denied for this branch"}), 403

    business_date = request.form.get('business_date')
    if not business_date:
        return jsonify({"error": "business_date is required"}), 400

    try:
        deposit_amount = float(request.form.get('deposit_amount', 0))
    except ValueError:
        return jsonify({"error": "Invalid deposit_amount"}), 400

    if deposit_amount <= 0:
        return jsonify({"error": "deposit_amount must be greater than zero"}), 400

    deposit_type = request.form.get('deposit_type')
    bank_name = request.form.get('bank_name')
    account_number = request.form.get('account_number')
    reference_no = request.form.get('reference_no')
    remarks = request.form.get('remarks')
    denominations_str = request.form.get('denominations')
    
    # Process attachment
    attachment_path = None
    if 'attachment' in request.files:
        file = request.files['attachment']
        if file.filename:
            filename = secure_filename(f"{uuid.uuid4().hex}_{file.filename}")
            file_path = os.path.join(UPLOAD_FOLDER, filename)
            file.save(file_path)
            attachment_path = file_path

    # Cash position check
    from sqlalchemy import func
    from models import FeePayment
    today = get_now().date()

    total_cash_collected = db.session.query(func.sum(FeePayment.amount_paid)).filter(
        FeePayment.branch_id == branch_id,
        FeePayment.payment_mode == 'Cash'
    ).scalar() or 0

    total_remitted = db.session.query(func.sum(RemittanceMaster.deposit_amount)).filter(
        RemittanceMaster.branch_id == branch_id,
        RemittanceMaster.status != 'Rejected'
    ).scalar() or 0

    cash_in_hand = float(total_cash_collected) - float(total_remitted)
    if deposit_amount > cash_in_hand:
        return jsonify({"error": "Deposit amount exceeds available cash in hand"}), 400
            
    # Generate remittance_no using BranchYearSequence
    # Get current year for sequence
    year_str = get_now().strftime('%y')
    seq = db.session.query(BranchYearSequence).filter_by(
        branch_id=branch_id,
        sequence_type='REMITTANCE',
        year=year_str
    ).with_for_update().first()

    if not seq:
        seq = BranchYearSequence(
            branch_id=branch_id,
            sequence_type='REMITTANCE',
            year=year_str,
            last_sequence_no=0,
            created_by=current_user.user_id
        )
        db.session.add(seq)
        
    seq.last_sequence_no += 1
    remittance_no = f"REM/{branch_id}/{year_str}/{seq.last_sequence_no:04d}"

    rem = RemittanceMaster(
        remittance_no=remittance_no,
        branch_id=branch_id,
        business_date=business_date,
        cash_in_hand=cash_in_hand,
        deposit_amount=deposit_amount,
        remaining_cash=cash_in_hand - deposit_amount,
        deposit_type=deposit_type,
        bank_name=bank_name,
        account_number=account_number,
        reference_no=reference_no,
        status='Pending',
        remarks=remarks,
        attachment_path=attachment_path,
        created_by=current_user.user_id
    )
    db.session.add(rem)
    db.session.flush()

    if denominations_str:
        denoms = json.loads(denominations_str)
        for d in denoms:
            denom_record = RemittanceDenominations(
                remittance_id=rem.id,
                denomination=d['denomination'],
                quantity=d['quantity'],
                amount=d['denomination'] * d['quantity'],
                created_by=current_user.user_id
            )
            db.session.add(denom_record)

    db.session.commit()
    
    return jsonify({
        "status": "success",
        "remittance_no": rem.remittance_no,
        "message": "Remittance created successfully"
    }), 201

@bp.route("/api/fees/remittance/<int:id>/status", methods=["PUT"])
@token_required
def update_status(current_user, id):
    if not has_permission(current_user, "fees.fee.remittance-approvals", "write"):
        return jsonify({"message": "Permission denied"}), 403

    data = request.json
    status = data.get('status')
    if status not in ('Approved', 'Rejected'):
        return jsonify({"error": "Invalid status. Must be 'Approved' or 'Rejected'"}), 400
        
    remarks = data.get('remarks')

    allowed = get_user_allowed_branches(current_user)
    
    q = db.session.query(RemittanceMaster).filter_by(id=id)
    if not allowed['is_unlimited']:
        q = q.filter(RemittanceMaster.branch_id.in_(allowed['ids']))
        
    rem = q.first()
    if not rem:
        return jsonify({"error": "Not found or permission denied for this branch"}), 404

    if rem.status != 'Pending':
        return jsonify({"error": f"Cannot update status. Remittance is already {rem.status}"}), 400

    rem.status = status
    if remarks:
        rem.remarks = f"{rem.remarks}\nAudit Note: {remarks}" if rem.remarks else remarks
        
    rem.approved_by = current_user.user_id
    rem.approved_at = get_now()
    
    db.session.commit()
    
    return jsonify({"status": "success", "message": f"Status updated to {status}"})

@bp.route("/api/fees/remittance/<int:id>/attachment", methods=["GET"])
@token_required
def get_attachment(current_user, id):
    if not has_permission(current_user, "fees.fee.remittance-approvals", "read") and \
       not has_permission(current_user, "fees.fee.remittance-deposit", "read"):
        return jsonify({"message": "Permission denied"}), 403

    allowed = get_user_allowed_branches(current_user)
    q = db.session.query(RemittanceMaster).filter_by(id=id)
    if not allowed['is_unlimited']:
        q = q.filter(RemittanceMaster.branch_id.in_(allowed['ids']))
        
    rem = q.first()
    if not rem or not rem.attachment_path:
        return jsonify({"error": "Attachment not found or permission denied"}), 404
        
    # Security check: ensure path is within UPLOAD_FOLDER using commonpath
    abs_path = os.path.abspath(rem.attachment_path)
    abs_upload = os.path.abspath(UPLOAD_FOLDER)
    if os.path.commonpath([abs_path, abs_upload]) != abs_upload:
        return jsonify({"error": "Invalid path"}), 403
        
    return send_file(abs_path)
