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
    
    allowed = get_user_allowed_branches(current_user)
    
    q = db.session.query(RemittanceMaster, Branch.branch_name).join(Branch, RemittanceMaster.branch_id == Branch.id)
    if not allowed['is_unlimited']:
        q = q.filter(RemittanceMaster.branch_id.in_(allowed['ids']))
        
    if branch_id and branch_id != 'All':
        q = q.filter(RemittanceMaster.branch_id == branch_id)
    if status and status != 'All':
        q = q.filter(RemittanceMaster.status == status)
        
    remittances = q.order_by(RemittanceMaster.created_at.desc()).all()
    
    return jsonify({
        "status": "success",
        "data": [{
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
            "attachment_path": r[0].attachment_path
        } for r in remittances]
    }), 200

@bp.route("/api/fees/remittance/cash-position", methods=["GET"])
@token_required
def get_cash_position(current_user):
    branch_id = request.args.get('branch_id')
    if not branch_id:
        return jsonify({"error": "branch_id is required"}), 400

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
    business_date = request.form.get('business_date')
    deposit_amount = float(request.form.get('deposit_amount', 0))
    deposit_type = request.form.get('deposit_type')
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
            
    # Need to generate remittance_no using BranchYearSequence
    # For now, mock it
    remittance_no = f"REM-{uuid.uuid4().hex[:6].upper()}"

    rem = RemittanceMaster(
        remittance_no=remittance_no,
        branch_id=branch_id,
        business_date=business_date,
        cash_in_hand=15000, # Should be calculated
        deposit_amount=deposit_amount,
        remaining_cash=15000 - deposit_amount,
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
    remarks = data.get('remarks')

    rem = db.session.query(RemittanceMaster).get(id)
    if not rem:
        return jsonify({"error": "Not found"}), 404

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
    rem = db.session.query(RemittanceMaster).get(id)
    if not rem or not rem.attachment_path:
        return jsonify({"error": "Attachment not found"}), 404
        
    # Security check: ensure path is within UPLOAD_FOLDER
    abs_path = os.path.abspath(rem.attachment_path)
    if not abs_path.startswith(os.path.abspath(UPLOAD_FOLDER)):
        return jsonify({"error": "Invalid path"}), 403
        
    return send_file(abs_path)
