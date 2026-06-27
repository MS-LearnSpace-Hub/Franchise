import React, { useState } from 'react';
import Header from './Header';
import Sidebar from './Sidebar';
import MainContent from './MainContent';
import Profile from './Profile';
import Fee from './Fee';
import FeeType from './FeeType';
import ClassFeeStructure from './ClassFeeStructure';
import AssignSpecialFee from './AssignSpecialFee';
import FeeInstallments from './FeeInstallments';
import TakeFee from './TakeFee';
import Administration from './Administration';
import SetupSchool from './SetupSchool';
import ClassesManagement from './ClassesManagement';
import AcademicManagement from './AcademicManagement';
import Academics from './Academics';
import StudentAttendance from './StudentAttendance';
import StudentAdministration from './StudentAdministration';
import ConcessionMaster from './ConcessionMaster';
import StudentConcession from './StudentConcession';
import UpdateStudentFeeStructure from './UpdateStudentFeeStructure';
import UpdateRebateDate from './UpdateRebateDate';
import FeeReports from './FeeReports';
import DeletedReceiptsReport from './DeletedReceiptsReport';
import FeeConcessionReport from './FeeConcessionReport';
import AdjustFeeReport from './AdjustFeeReport';
import Configuration from './Configuration';
import DocumentManagement from './DocumentManagement';
import UserManagement from './UserManagement';
import FranchiseManagement from './FranchiseManagement';
import RolePermissions from './RolePermissions';
import ControlPanel from './ControlPanel';
import SchoolManagement from './SchoolManagement';
import { useNavigationHistory } from '../hooks/useNavigationHistory';
import StaffSupport from './StaffSupport';
import PettyCash from './PettyCash';
import PettyCashReport from './PettyCashReport';
import FundAllocation from './FundAllocation';
import MonthWiseLedger from './MonthWiseLedger';
import PettyCashApproval from './PettyCashApproval';
import FinancialLayout from './FinancialLayout';
import SmsCenter from './SmsCenter';
import HRManagement from './HRManagement';
import HRLayout from './HRLayout';
import { DepartmentMaster } from './DepartmentMaster';
import { DesignationMaster } from './DesignationMaster';
import { ShiftMaster } from './ShiftMaster';
import { StaffMaster } from './StaffMaster';
import { StaffCategoryMaster } from './StaffCategoryMaster';
import { StaffStatusMaster } from './StaffStatusMaster';

const hrPages = [
  'hr-management', 'hr-departments', 'hr-designations', 'hr-shifts', 'hr-staff-master',
  'hr-staff-categories', 'hr-staff-statuses',
  'hr-biometric-devices', 'hr-biometric-mapping', 'hr-attendance-summary', 'hr-punch-log'
];

const financialPages = [
  'fee', 'fee-type', 'class-fee-structure', 'assign-special-fee',
  'fee-installments', 'take-fee', 'concession-master', 'student-concession',
  'update-student-fee-structure', 'update-rebate-date', 'fee-reports',
  'deleted-receipts', 'fee-concession-report', 'adjust-fee-report',
  'petty-cash', 'petty-cash-report', 'fund-allocation', 'month-wise-ledger', 'petty-cash-approval'
];

interface DashboardProps {
  onLogout: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onLogout }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const {
    currentPage,
    navigateTo,
    goBack,
    goForward,
    canGoBack,
    canGoForward
  } = useNavigationHistory('dashboard');

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      <Sidebar isOpen={isSidebarOpen} toggleSidebar={toggleSidebar} navigateTo={navigateTo} currentPage={currentPage} />
      <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
        <Header
          toggleSidebar={toggleSidebar}
          navigateTo={navigateTo}
          onLogout={onLogout}
          goBack={goBack}
          goForward={goForward}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
        />
        <main className="flex-1">
          {currentPage === 'dashboard' && <MainContent navigateTo={navigateTo} />}
          {currentPage === 'profile' && <Profile />}
          {financialPages.includes(currentPage) ? (
            <FinancialLayout currentPage={currentPage} navigateTo={navigateTo}>
              {currentPage === 'fee' && <Fee navigateTo={navigateTo} />}
              {currentPage === 'fee-type' && <FeeType />}
              {currentPage === 'class-fee-structure' && <ClassFeeStructure />}
              {currentPage === 'assign-special-fee' && <AssignSpecialFee />}
              {currentPage === 'fee-installments' && <FeeInstallments />}
              {currentPage === 'take-fee' && <TakeFee navigateTo={navigateTo} />}
              {currentPage === 'concession-master' && <ConcessionMaster />}
              {currentPage === 'student-concession' && <StudentConcession />}
              {currentPage === 'update-student-fee-structure' && <UpdateStudentFeeStructure />}
              {currentPage === 'update-rebate-date' && <UpdateRebateDate />}
              {currentPage === 'fee-reports' && <FeeReports />}
              {currentPage === 'deleted-receipts' && <DeletedReceiptsReport />}
              {currentPage === 'fee-concession-report' && <FeeConcessionReport />}
              {currentPage === 'adjust-fee-report' && <AdjustFeeReport />}
              {currentPage === 'petty-cash' && <PettyCash />}
              {currentPage === 'petty-cash-report' && <PettyCashReport />}
              {currentPage === 'fund-allocation' && <FundAllocation />}
              {currentPage === 'month-wise-ledger' && <MonthWiseLedger />}
              {currentPage === 'petty-cash-approval' && <PettyCashApproval />}
            </FinancialLayout>
          ) : hrPages.includes(currentPage) ? (
            <HRLayout currentPage={currentPage} navigateTo={navigateTo}>
              {currentPage === 'hr-management' && <HRManagement navigateTo={navigateTo} />}
              {currentPage === 'hr-departments' && <DepartmentMaster />}
              {currentPage === 'hr-designations' && <DesignationMaster />}
              {currentPage === 'hr-shifts' && <ShiftMaster />}
              {currentPage === 'hr-staff-master' && <StaffMaster />}
              {currentPage === 'hr-staff-categories' && <StaffCategoryMaster />}
              {currentPage === 'hr-staff-statuses' && <StaffStatusMaster />}
              {currentPage === 'hr-biometric-devices' && <div className="p-6">Biometric Devices (Coming Soon)</div>}
              {currentPage === 'hr-biometric-mapping' && <div className="p-6">Staff Biometric Mapping (Coming Soon)</div>}
              {currentPage === 'hr-attendance-summary' && <div className="p-6">Attendance Summary (Coming Soon)</div>}
              {currentPage === 'hr-punch-log' && <div className="p-6">Punch Log (Coming Soon)</div>}
            </HRLayout>
          ) : (
            <>
              {currentPage === 'administration' && <Administration navigateTo={navigateTo} />}
              {currentPage === 'academic' && <AcademicManagement navigateTo={navigateTo} />}
              {currentPage === 'academics' && <Academics />}
              {currentPage === 'setup' && <SetupSchool navigateTo={navigateTo} />}
              {currentPage === 'classes-management' && <ClassesManagement />}
              {currentPage === 'student-attendance' && <StudentAttendance />}
              {currentPage === 'student-administration' && <StudentAdministration />}
              {currentPage === 'configuration' && <Configuration navigateTo={navigateTo} />}
              {currentPage === 'document-management' && <DocumentManagement />}
              {currentPage === 'user-management' && <UserManagement />}
              {currentPage === 'role-permissions' && <RolePermissions />}
              {currentPage === 'franchise-management' && <FranchiseManagement />}
              {currentPage === 'school-management' && <SchoolManagement />}
              {currentPage === 'control-panel' && <ControlPanel navigateTo={navigateTo} />}
              {currentPage === 'staffsupport' && <StaffSupport />}
              {currentPage === 'sms-center' && <SmsCenter navigateTo={navigateTo} />}
            </>
          )}


        </main>
      </div>
    </div>
  );
};

export default Dashboard;
