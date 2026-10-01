from flask import Blueprint, jsonify, request
from extensions import db
from helpers import token_required, has_permission

bp = Blueprint('reconciliation_routes', __name__)

@bp.route("/api/reports/reconciliation/month-wise", methods=["GET"])
@token_required
def month_wise(current_user):
    if not has_permission(current_user, "fees.fee.reconciliation-dashboard", "read"):
        return jsonify({"message": "Permission denied"}), 403

    # Mock data for frontend
    return jsonify([
        {
            "particulars": "Opening Balance",
            "debit": 0,
            "credit": 0,
            "cash_in_hand": 5000,
            "is_opening": True
        },
        {
            "particulars": "Sep-2026",
            "debit": 15000,
            "credit": 10000,
            "cash_in_hand": 10000,
            "is_opening": False
        }
    ]), 200

@bp.route("/api/reports/reconciliation/details", methods=["GET"])
@token_required
def details(current_user):
    if not has_permission(current_user, "fees.fee.reconciliation-dashboard", "read"):
        return jsonify({"message": "Permission denied"}), 403

    # Mock data for frontend
    return jsonify([
        {
            "date": "2026-09-01",
            "date_formatted": "01 Sep 2026",
            "voucher_no": "REC-001",
            "voucher_type": "Fee Receipt",
            "ledger_type": "Income",
            "ledger_head": "Tuition Fee",
            "narration": "Fee from John Doe",
            "debit": 15000,
            "credit": 0,
            "cash_in_hand": 20000,
            "is_opening": False
        },
        {
            "date": "2026-09-02",
            "date_formatted": "02 Sep 2026",
            "voucher_no": "REM-001",
            "voucher_type": "Remittance Deposit",
            "ledger_type": "Expense",
            "ledger_head": "Bank Deposit",
            "narration": "Deposit to bank",
            "debit": 0,
            "credit": 10000,
            "cash_in_hand": 10000,
            "is_opening": False
        }
    ]), 200
