import React, { useState } from 'react';
import { Page } from '../App';
import { useAuth } from '../contexts/AuthContext';
import { UserIcon, HomeIcon, TimeIcon, DocumentIcon, DashboardIcon, ChartBarIcon } from './icons';

interface HRManagementProps {
    navigateTo?: (page: Page) => void;
}

type MainCategory = 'hr_master' | 'employee_details' | 'attendance' | null;

const HRManagement: React.FC<HRManagementProps> = ({ navigateTo }) => {
    const { hasPermission } = useAuth();
    const [activeCategory, setActiveCategory] = useState<MainCategory>(null);

    const canAccess = (permission?: string) => {
        if (!permission) return true;
        return hasPermission(permission, 'read');
    };

    const categories = [
        {
            id: 'hr_master' as MainCategory,
            name: 'HR Master',
            icon: <DocumentIcon className="w-8 h-8" />,
            iconBg: 'bg-blue-50',
            iconColor: 'text-blue-600',
        },
        {
            id: 'employee_details' as MainCategory,
            name: 'Employee Details',
            icon: <UserIcon className="w-8 h-8" />,
            iconBg: 'bg-emerald-50',
            iconColor: 'text-emerald-600',
        },
        {
            id: 'attendance' as MainCategory,
            name: 'Attendance',
            icon: <ChartBarIcon className="w-8 h-8" />,
            iconBg: 'bg-orange-50',
            iconColor: 'text-orange-600',
        }
    ];

    const hrModules = [
        {
            id: 'departments',
            name: 'Departments',
            icon: <HomeIcon className="w-8 h-8" />,
            iconBg: 'bg-blue-50',
            iconColor: 'text-blue-600',
            page: 'hr-departments' as Page,
            permission: 'hr.hr.departments',
            category: 'hr_master'
        },
        {
            id: 'staff-categories',
            name: 'Staff Categories',
            icon: <DocumentIcon className="w-8 h-8" />,
            iconBg: 'bg-pink-50',
            iconColor: 'text-pink-600',
            page: 'hr-staff-categories' as Page,
            permission: 'hr.hr.staff-categories',
            category: 'hr_master'
        },
        {
            id: 'staff-statuses',
            name: 'Staff Statuses',
            icon: <DocumentIcon className="w-8 h-8" />,
            iconBg: 'bg-purple-50',
            iconColor: 'text-purple-600',
            page: 'hr-staff-statuses' as Page,
            permission: 'hr.hr.staff-statuses',
            category: 'hr_master'
        },
        {
            id: 'designations',
            name: 'Designations',
            icon: <UserIcon className="w-8 h-8" />,
            iconBg: 'bg-indigo-50',
            iconColor: 'text-indigo-600',
            page: 'hr-designations' as Page,
            permission: 'hr.hr.designations',
            category: 'hr_master'
        },
        {
            id: 'shifts',
            name: 'Shifts',
            icon: <TimeIcon className="w-8 h-8" />,
            iconBg: 'bg-orange-50',
            iconColor: 'text-orange-600',
            page: 'hr-shifts' as Page,
            permission: 'hr.hr.shifts',
            category: 'hr_master'
        },
        {
            id: 'staff-master',
            name: 'Staff Master',
            icon: <UserIcon className="w-8 h-8" />,
            iconBg: 'bg-emerald-50',
            iconColor: 'text-emerald-600',
            page: 'hr-staff-master' as Page,
            permission: 'hr.hr.staff-master',
            category: 'employee_details'
        },
        {
            id: 'staff-profile',
            name: 'Staff Profile',
            icon: <UserIcon className="w-8 h-8" />,
            iconBg: 'bg-teal-50',
            iconColor: 'text-teal-600',
            page: 'staff-profile' as Page,
            permission: 'hr.hr.staff-profile',
            category: 'employee_details'
        },
        {
            id: 'attendance-summary',
            name: 'Attendance Summary',
            icon: <ChartBarIcon className="w-8 h-8" />,
            iconBg: 'bg-slate-50',
            iconColor: 'text-slate-600',
            page: 'hr-attendance-summary' as Page,
            permission: 'hr.attendance.summary',
            category: 'attendance'
        },
        {
            id: 'punch-log',
            name: 'Punch Log',
            icon: <TimeIcon className="w-8 h-8" />,
            iconBg: 'bg-slate-50',
            iconColor: 'text-slate-600',
            page: 'hr-punch-log' as Page,
            permission: 'hr.attendance.punch-log',
            category: 'attendance',
            comingSoon: true
        }
    ];

    const visibleModules = hrModules.filter(module => 
        module.category === activeCategory && canAccess(module.permission)
    );

    return (
        <div className="max-w-7xl mx-auto px-6 py-8">
            {activeCategory && (
                <div className="mb-6">
                    <button 
                        onClick={() => setActiveCategory(null)}
                        className="text-sm text-slate-500 hover:text-slate-700 flex items-center transition-colors"
                    >
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        Back to Categories
                    </button>
                </div>
            )}
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {!activeCategory ? (
                    categories.map((category) => (
                        <button
                            key={category.id}
                            onClick={() => setActiveCategory(category.id)}
                            className="group relative bg-white rounded-xl p-6 border border-slate-200 text-left focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 transition-all duration-200 hover:border-emerald-300 hover:shadow-lg cursor-pointer"
                        >
                            {/* Icon */}
                            <div className={`${category.iconBg} ${category.iconColor} w-14 h-14 rounded-xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform duration-200`}>
                                {category.icon}
                            </div>
    
                            {/* Category Name */}
                            <h3 className="font-semibold text-slate-900 text-base mb-1 group-hover:text-emerald-600 transition-colors">
                                {category.name}
                            </h3>
                        </button>
                    ))
                ) : (
                    visibleModules.map((module) => (
                        <button
                            key={module.id}
                            onClick={() => {
                                if (!module.comingSoon && navigateTo && module.page) {
                                    navigateTo(module.page);
                                }
                            }}
                            disabled={module.comingSoon}
                            className={`group relative bg-white rounded-xl p-6 border border-slate-200 text-left focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 transition-all duration-200 ${module.comingSoon
                                ? 'opacity-60 cursor-not-allowed'
                                : 'hover:border-emerald-300 hover:shadow-lg cursor-pointer'
                                }`}
                        >
                            {/* Icon */}
                            <div className={`${module.iconBg} ${module.iconColor} w-14 h-14 rounded-xl flex items-center justify-center mb-4 ${!module.comingSoon && 'group-hover:scale-105'} transition-transform duration-200`}>
                                {module.icon}
                            </div>
    
                            {/* Module Name */}
                            <h3 className={`font-semibold text-slate-900 text-base mb-1 ${!module.comingSoon && 'group-hover:text-emerald-600'} transition-colors`}>
                                {module.name}
                            </h3>
    
                            {/* Coming Soon Badge */}
                            {module.comingSoon && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                                    Coming Soon
                                </span>
                            )}
                        </button>
                    ))
                )}
            </div>
        </div>
    );
};

export default HRManagement;
