import React, { useState } from 'react';
import { Page } from '../App';
import { 
    DashboardIcon, 
    UserIcon, 
    TimeIcon, 
    DocumentIcon,
    HomeIcon,
    ChartBarIcon
} from './icons';
import { useAuth } from '../contexts/AuthContext';

interface HRLayoutProps {
    children: React.ReactNode;
    currentPage: Page;
    navigateTo: (page: Page) => void;
}

const HRLayout: React.FC<HRLayoutProps> = ({ children, currentPage, navigateTo }) => {
    const [activeTab, setActiveTab] = useState<string>('Dashboard');
    const { hasPermission } = useAuth();
    
    const canAccess = (permission?: string) => {
        if (!permission) return true;
        return hasPermission(permission, 'read');
    };

    const menuItems = [
        { 
            name: 'Dashboard', 
            page: 'hr-management' as Page, 
            icon: <DashboardIcon className="w-5 h-5" />, 
            permission: 'hr.hr.hr-management' 
        },
        {
            name: 'HR Masters',
            id: 'hrMasters',
            icon: <DocumentIcon className="w-5 h-5" />,
            permission: 'hr.hr.departments', // Base permission
            subItems: [
                { name: 'Departments',      page: 'hr-departments'      as Page, icon: <HomeIcon className="w-4 h-4" />,  permission: 'hr.hr.departments' },
                { name: 'Designations',     page: 'hr-designations'     as Page, icon: <UserIcon className="w-4 h-4" />,  permission: 'hr.hr.designations' },
                { name: 'Shifts',           page: 'hr-shifts'           as Page, icon: <TimeIcon className="w-4 h-4" />,  permission: 'hr.hr.shifts' },
                { name: 'Staff Categories', page: 'hr-staff-categories' as Page, icon: <DocumentIcon className="w-4 h-4" />, permission: 'hr.hr.staff-categories' },
                { name: 'Staff Statuses',   page: 'hr-staff-statuses'   as Page, icon: <DocumentIcon className="w-4 h-4" />, permission: 'hr.hr.staff-statuses' },
            ]
        },
        {
            name: 'Staff Directory',
            id: 'staffDirectory',
            page: 'hr-staff-directory' as Page,
            icon: <UserIcon className="w-5 h-5" />,
            permission: 'hr.hr.staff-directory', // Or whatever general view permission you have
        },
        {
            name: 'Staff Master',
            id: 'staffMaster',
            page: 'hr-staff-master' as Page,
            icon: <DocumentIcon className="w-5 h-5" />,
            permission: 'hr.hr.staff-master',
        },
        {
            name: 'My Profile',
            id: 'myStaffProfile',
            page: 'staff-profile' as Page,
            icon: <UserIcon className="w-5 h-5" />,
            permission: 'hr.hr.staff-profile',
        },
        {
            name: 'Biometrics',
            id: 'biometrics',
            icon: <TimeIcon className="w-5 h-5" />,
            permission: 'hr.biometrics',
            subItems: [
                { name: 'Biometric Devices', page: 'hr-biometric-devices' as Page, icon: <DashboardIcon className="w-4 h-4" />, permission: 'hr.biometrics.devices' },
                { name: 'Staff Biometric Mapping', page: 'hr-biometric-mapping' as Page, icon: <UserIcon className="w-4 h-4" />, permission: 'hr.biometrics.mapping' },
            ]
        },
        {
            name: 'Attendance',
            id: 'attendance',
            icon: <ChartBarIcon className="w-5 h-5" />,
            subItems: [
                { name: 'Attendance Summary', page: 'hr-attendance-summary' as Page, icon: <ChartBarIcon className="w-4 h-4" /> },
                { name: 'Punch Log', page: 'hr-punch-log' as Page, icon: <TimeIcon className="w-4 h-4" />, permission: 'hr.attendance.punch-log' },
            ]
        }
    ];

    const activeMenu = menuItems.find(item => 
        item.page === currentPage || 
        (item.subItems && item.subItems.some(sub => sub.page === currentPage))
    ) || menuItems[0];

    const handleTabClick = (item: typeof menuItems[0]) => {
        if (item.page) {
            navigateTo(item.page);
        } else if (item.subItems && item.subItems.length > 0) {
            const firstAccessible = item.subItems.find(sub => canAccess(sub.permission));
            if (firstAccessible) {
                navigateTo(firstAccessible.page);
            }
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
            {/* Main Content Area */}
            <div className="flex-1 flex flex-col h-full overflow-hidden">
                {/* HR Header */}
                <div className="bg-white border-b border-slate-200 shadow-sm z-20 relative flex flex-col">
                    <div className="px-6 py-4 flex justify-between items-center">
                        <h2 className="text-2xl font-semibold text-slate-900 flex items-center">
                            <span className="text-emerald-600 mr-2"><UserIcon className="w-8 h-8" /></span> HR & Staff Management
                        </h2>
                    </div>

                    {/* Navigation Tabs */}
                    <div className="px-6 flex items-center space-x-1 mt-2">
                        {menuItems.map((item) => (
                            canAccess(item.permission) && (
                                <button
                                    key={item.name}
                                    onClick={() => handleTabClick(item)}
                                    className={`flex items-center space-x-2 px-4 py-3 border-b-2 font-medium text-sm transition-colors
                                        ${activeMenu.name === item.name 
                                            ? 'border-emerald-600 text-emerald-600' 
                                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                                        }`}
                                >
                                    {item.icon}
                                    <span>{item.name}</span>
                                </button>
                            )
                        ))}
                    </div>
                </div>

                {/* Sub-navigation Menu for Active Tab */}
                {activeMenu.subItems && activeMenu.subItems.length > 0 && (
                    <div className="bg-white border-b border-slate-200 px-6 py-2 flex space-x-4 shadow-sm z-10">
                        {activeMenu.subItems.map(sub => (
                            canAccess(sub.permission) && (
                                <button
                                    key={sub.name}
                                    onClick={() => navigateTo(sub.page)}
                                    className={`flex items-center space-x-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                                        ${currentPage === sub.page
                                            ? 'bg-emerald-50 text-emerald-700'
                                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                        }`}
                                >
                                    {sub.icon}
                                    <span>{sub.name}</span>
                                </button>
                            )
                        ))}
                    </div>
                )}
                
                <div className="flex-1 overflow-hidden relative">
                    <div className="absolute inset-0 overflow-y-auto bg-slate-50 p-6">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default HRLayout;
