import React, { useState } from 'react';
import { ChevronDownIcon } from './icons';
import { Page } from '../App';
import { useAuth } from '../contexts/AuthContext';

interface FeeProps {
    navigateTo: (page: Page) => void;
}

const Fee: React.FC<FeeProps> = ({ navigateTo }) => {
    const [openDropdown, setOpenDropdown] = useState<string | null>(null);

    const handleDropdown = (name: string) => {
        setOpenDropdown(openDropdown === name ? null : name);
    };

    const handleBlur = () => {
        setTimeout(() => setOpenDropdown(null), 150);
    };

    const handleMenuItemClick = (item: string) => {
        if (item === 'Fee Type') {
            navigateTo('fee-type');
        } else if (item === 'Create Class Fee Structure') {
            navigateTo('class-fee-structure');
        } else if (item === 'Fee Installments') {
            navigateTo('fee-installments');
        } else if (item === 'Assign Special Fee Type') {
            navigateTo('assign-special-fee');
        } else if (item === 'Concession Template') {
            navigateTo('concession-master');
        } else if (item === 'Update Student Fee Structure') {
            navigateTo('update-student-fee-structure');
        } else if (item === 'Update Rebate Date') {
            navigateTo('update-rebate-date');
        } else if (item === 'Petty-Cash Report') {
            navigateTo('petty-cash-report');
        }

        setOpenDropdown(null);
    };

    const buttonStyle = "px-4 py-2 text-sm border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors";

    interface DropdownItem {
        name: string;
        action: () => void;
    }

    const dropdownItems: { [key: string]: (string | DropdownItem)[] } = {
        feeMasters: ['Fee Type', 'Fee Installments', 'Assign Special Fee Type', 'Create Class Fee Structure', 'Update Student Fee Structure'/*'Fee Category', 'Fee Type group',  'Special Fee Type',  'Remove Special Fee Type', 'Manage Bank Account', 'Assign Fee Group To Students', 'Transfer Fee Due', 'Fee Setting', 'Update Student Fee Group', 'Import Fee Group'*/],
        /*cheque: ['Manage Cheques', 'Fee PDC', 'Fee All PDC', 'Bounced Cheque Report', 'Cheque Date Report', 'Cheque Clearance Report'],*/
        concession: [
            { name: 'Concession Template', action: () => navigateTo('concession-master') },
            { name: 'Set Student Concession', action: () => navigateTo('student-concession') },
            /*{ name: 'Set Bulk Concession', action: () => console.log('Set Bulk Concession') },
            { name: 'Student Availing Concessions', action: () => console.log('Student Availing Concessions') },*/
            { name: 'Paid Concession Report', action: () => console.log('Paid Concession Report') },
            { name: 'Expected Concession Report', action: () => console.log('Expected Concession Report') },
        ],
        reports: ['Fee Report', 'Fee Summary Report', 'Fee Due Report', 'Fee Concession Report', 'Deleted Receipts', 'Petty-Cash Report', 'Adjust Fee Report', 'Nullify Fee', 'Nullify Fee Report'],
        voucher: ['Create Voucher', 'Voucher List', 'Transport Voucher'],
    };

    const renderDropdown = (name: string, items: (string | DropdownItem)[]) => (
        <div className="relative">
            <button onClick={() => handleDropdown(name)} onBlur={handleBlur} className={`${buttonStyle} flex items-center capitalize`}>
                {name.replace(/([A-Z])/g, ' $1').trim()} <ChevronDownIcon className="w-4 h-4 ml-1" />
            </button>
            {openDropdown === name && (
                <ul className="absolute right-0 mt-2 w-56 bg-white rounded-md shadow-lg py-1 z-30 text-gray-700 border max-h-60 overflow-y-auto">
                    {items.map((item, idx) => {
                        const label = typeof item === 'string' ? item : item.name;
                        const action = typeof item === 'string' ? () => handleMenuItemClick(item) : item.action;

                        return (
                            <li key={idx}>
                                <a
                                    href="#"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        action();
                                    }}
                                    className="block px-4 py-2 text-sm hover:bg-gray-100"
                                >
                                    {label}
                                </a>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );

    const { hasPermission } = useAuth();

    const canTakeFee = hasPermission('fees.fee.take-fee', 'read');
    const canFeeReports = hasPermission('fees.fee.fee-reports', 'read');
    const canFeeType = hasPermission('fees.fee.fee-type', 'read');
    const canFeeInstallments = hasPermission('fees.fee.fee-installments', 'read');
    const canAssignSpecialFee = hasPermission('fees.fee.assign-special-fee', 'read');
    const canClassFeeStructure = hasPermission('fees.fee.class-fee-structure', 'read');
    const canUpdateStudentFee = hasPermission('fees.fee.update-student-fee-structure', 'read');
    const canUpdateRebateDate = hasPermission('fees.fee.update-rebate-date', 'read');
    const canConcession = hasPermission('fees.fee.concession-master', 'read');
    const canPettyCash = hasPermission('fees.fee.petty-cash', 'read');
    const canPettyCashReport = hasPermission('fees.fee.petty-cash-report', 'read');
    const canReports = hasPermission('fees.fee.reports', 'read');

    const feeMasterItems: (string | DropdownItem)[] = [
        ...(canFeeType ? ['Fee Type' as string] : []),
        ...(canFeeInstallments ? ['Fee Installments' as string] : []),
        ...(canAssignSpecialFee ? ['Assign Special Fee Type' as string] : []),
        ...(canClassFeeStructure ? ['Create Class Fee Structure' as string] : []),
        ...(canUpdateStudentFee ? ['Update Student Fee Structure' as string] : []),
        ...(canUpdateRebateDate ? ['Update Rebate Date' as string] : []),
    ];

    const concessionItems: (string | DropdownItem)[] = canConcession ? [
        { name: 'Concession Template', action: () => navigateTo('concession-master') },
        { name: 'Set Student Concession', action: () => navigateTo('student-concession') },
        { name: 'Paid Concession Report', action: () => console.log('Paid Concession Report') },
        { name: 'Expected Concession Report', action: () => console.log('Expected Concession Report') },
    ] : [];

    const reportItems: (string | DropdownItem)[] = [
        ...(canReports ? [
            'Fee Report', 'Fee Summary Report', 'Fee Due Report', 'Fee Concession Report', 'Deleted Receipts',
            'Adjust Fee Report', 'Nullify Fee', 'Nullify Fee Report'
        ] : []),
        ...((canReports || canPettyCashReport) ? ['Petty-Cash Report'] : [])
    ];

    return (
        <div>
            {/* Fee Management Header */}
            <div className="bg-white border-b border-slate-200 shadow-sm">
                <div className="container-fluid mx-auto flex justify-between items-center p-4">
                    <h2 className="text-2xl font-semibold text-slate-900 flex items-center">
                        <span className="text-blue-600 mr-2">₹</span> Fee Management
                    </h2>
                    <div className="flex gap-2 flex-wrap">
                        {feeMasterItems.length > 0 && renderDropdown('feeMasters', feeMasterItems)}
                        {canFeeReports && (
                            <button
                                className="px-4 py-2 text-sm border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                                onClick={() => navigateTo('fee-reports')}
                            >
                                Fee Reports
                            </button>

                        )}
                        {canTakeFee && (
                            <button
                                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors shadow-sm"
                                onClick={() => navigateTo('take-fee')}
                            >
                                Collect Fee
                            </button>
                        )}
                        {canPettyCash && (
                            <button
                                className="px-4 py-2 text-sm border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors"
                                onClick={() => navigateTo('petty-cash')}
                            >
                                Petty Cash
                            </button>
                        )}
                        {concessionItems.length > 0 && renderDropdown('concession', concessionItems)}
                        {(canReports || canPettyCashReport) && reportItems.length > 0 && renderDropdown('reports', reportItems)}
                    </div>
                </div>
            </div>

            {/* Dashboard Content Area */}
            <div className="container mx-auto p-6">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
                    <div className="text-slate-400 mb-4">
                        <svg className="w-24 h-24 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                    </div>
                    <h3 className="text-2xl font-semibold text-slate-900 mb-2">Fee Management Dashboard</h3>
                    <p className="text-slate-600 mb-6">
                        Click "" button above to collect fees from students.
                    </p>
                    <button
                        onClick={() => navigateTo('take-fee')}
                        className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors shadow-sm font-medium"
                    >Collect Due Fees
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Fee;