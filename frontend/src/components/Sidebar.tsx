import React from 'react';
import {
  DashboardIcon, AcademicIcon, FinancialIcon, AdministrationIcon, SetupIcon, HeadphoneIcon, UserIcon, MenuIcon, ControlPanelIcon
} from './icons';
import { Page } from "../App";
import { useAuth } from '../contexts/AuthContext';


interface SidebarProps {
  isOpen: boolean;
  toggleSidebar: () => void;
  navigateTo: (page: Page) => void;
  currentPage: Page;
}

const navCategories: { title: string; icon: React.ReactNode; page: Page; permission: string }[] = [
  { title: 'Dashboard', icon: <DashboardIcon className="w-5 h-5" />, page: 'dashboard', permission: 'home.dashboard.main' },
  { title: 'Academic', icon: <AcademicIcon className="w-5 h-5" />, page: 'academic', permission: 'academics.academic.management' },
  { title: 'Financial', icon: <FinancialIcon className="w-5 h-5" />, page: 'fee', permission: 'fees.collections.receipt-entry' },
  { title: 'Administration', icon: <AdministrationIcon className="w-5 h-5" />, page: 'administration', permission: 'administration.students.management' },
  { title: 'Setup Your School', icon: <SetupIcon className="w-5 h-5" />, page: 'setup', permission: 'setup.school.setup' },
];

const Sidebar: React.FC<SidebarProps> = ({ isOpen, toggleSidebar, navigateTo, currentPage }) => {
  const { user, hasPermission } = useAuth();
  const canAccess = (permission: string) => hasPermission(permission, 'read');

  return (
    <aside className={`flex-shrink-0 bg-white border-r border-gray-200 flex flex-col transition-all duration-300 ${isOpen ? 'w-64' : 'w-0 overflow-hidden md:w-20'} md:relative absolute h-full z-10 md:z-auto`}>
      <div className="flex items-center justify-between h-16 px-4 border-b">
        <span className={`font-semibold text-violet-700 ${!isOpen && 'md:hidden'}`}>Menu</span>
        <button onClick={toggleSidebar} className="p-2 rounded-md hover:bg-gray-100 focus:outline-none">
          <MenuIcon className="w-6 h-6 text-gray-600" />
        </button>
      </div>

      <div className="p-4">
        <p className={`font-bold text-lg text-center text-white bg-green-500 px-2 py-1 rounded ${!isOpen && 'md:hidden'}`}>
          {user?.school_name || 'MS Hifz-Academy'}
        </p>
      </div>
      <nav className="flex-1 px-2 space-y-1 overflow-y-auto">
        {navCategories.filter(cat => canAccess(cat.permission)).map((cat) => (
          <a
            key={cat.title}
            href="#"
            onClick={(e) => { e.preventDefault(); navigateTo(cat.page); }}
            className={`flex items-center p-2 text-sm font-medium rounded-md group ${cat.page === currentPage ? 'bg-green-100 text-green-800' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
          >
            {cat.icon}
            <span className={`ml-3 whitespace-nowrap ${!isOpen && 'md:hidden'}`}>{cat.title}</span>
          </a>
        ))}

        <div className={`pt-4 mt-4 border-t border-gray-200 ${!isOpen && 'md:hidden'}`}>
          {/* Control Panel – Admin & SuperAdmin */}
          {(hasPermission('system.users.management', 'read') || hasPermission('system.roles.permissions', 'read') || hasPermission('system.franchise.management', 'read')) && (
            <a href="#"
              onClick={(e) => { e.preventDefault(); navigateTo('control-panel'); }}
              className={`flex items-center p-2 text-sm font-medium rounded-md hover:bg-gray-100 hover:text-gray-900 ${currentPage === 'control-panel' ? 'bg-indigo-100 text-indigo-800' : 'text-gray-600'
                }`}
            >
              <ControlPanelIcon className="w-5 h-5" />
              <span className="ml-3">Control Panel</span>
            </a>
          )}

          <a href="#" className="flex items-center p-2 text-sm font-medium text-gray-600 rounded-md hover:bg-gray-100 hover:text-gray-900">
            <HeadphoneIcon className="w-5 h-5" />
            <span className="ml-3">Staff Support</span>
          </a>
          <a href="#" onClick={(e) => { e.preventDefault(); navigateTo('profile'); }} className="flex items-center p-2 text-sm font-medium text-gray-600 rounded-md hover:bg-gray-100 hover:text-gray-900">
            <UserIcon className="w-5 h-5" />
            <span className="ml-3">My Details</span>
          </a>
        </div>
      </nav>
    </aside>
  );
};

export default Sidebar;
