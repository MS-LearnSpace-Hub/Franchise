import React from 'react';
import { Page } from '../App';
import {
    UserIcon,
    ControlPanelIcon,
    BuildingOfficeIcon,
    ShieldCheckIcon,
} from './icons';
import { useAuth } from '../contexts/AuthContext';

interface ControlPanelProps {
    navigateTo: (page: Page) => void;
}

interface ControlPanelModule {
    id: string;
    name: string;
    icon: React.ReactNode;
    iconBg: string;
    iconColor: string;
    page: Page;
    permission?: string;
}

const ControlPanel: React.FC<ControlPanelProps> = ({ navigateTo }) => {
    const { hasPermission } = useAuth();

    const modules: ControlPanelModule[] = [
        {
            id: 'user-management',
            name: 'User Management',
            icon: <UserIcon className="w-8 h-8" />,
            iconBg: 'bg-blue-50',
            iconColor: 'text-blue-600',
            page: 'user-management',
            permission: 'system.users.management',
        },
        {
            id: 'role-permissions',
            name: 'Role Permissions',
            icon: <ShieldCheckIcon className="w-8 h-8" />,
            iconBg: 'bg-slate-50',
            iconColor: 'text-slate-600',
            page: 'role-permissions',
            permission: 'system.roles.permissions',
        },
        {
            id: 'franchise-management',
            name: 'Franchise Mgmt',
            icon: <BuildingOfficeIcon className="w-8 h-8" />,
            iconBg: 'bg-purple-50',
            iconColor: 'text-purple-600',
            page: 'franchise-management',
            permission: 'system.franchise.management',
        },
        {
            id: 'school-management',
            name: 'School Mgmt',
            icon: <BuildingOfficeIcon className="w-8 h-8" />,
            iconBg: 'bg-emerald-50',
            iconColor: 'text-emerald-600',
            page: 'school-management',
            permission: 'system.school.school-management',
        }
    ];

    const handleModuleClick = (module: ControlPanelModule) => {
        if (module.page) {
            navigateTo(module.page);
        }
    };

    const visibleModules = modules.filter(module => {
        return hasPermission(module.permission || '', 'read');
    });

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Professional Header */}
            <div className="bg-white shadow-sm border-b border-slate-200">
                <div className="max-w-7xl mx-auto px-6 py-5">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 bg-indigo-50 rounded-lg">
                            <ControlPanelIcon className="w-6 h-6 text-indigo-600" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-semibold text-slate-900">Control Panel</h1>
                            <p className="text-sm text-slate-600 mt-0.5">Manage system users, roles, and franchises</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-7xl mx-auto px-6 py-8">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                    {visibleModules.map((module) => (
                        <button
                            key={module.id}
                            onClick={() => handleModuleClick(module)}
                            className="group relative bg-white rounded-xl p-6 border border-slate-200 text-left focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-all duration-200 hover:border-indigo-300 hover:shadow-lg cursor-pointer"
                        >
                            {/* Icon */}
                            <div className={`${module.iconBg} ${module.iconColor} w-14 h-14 rounded-xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform duration-200`}>
                                {module.icon}
                            </div>

                            {/* Module Name */}
                            <h3 className="font-semibold text-slate-900 text-base mb-1 group-hover:text-indigo-600 transition-colors">
                                {module.name}
                            </h3>

                            {/* Active Badge */}
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                Active
                            </span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ControlPanel;
