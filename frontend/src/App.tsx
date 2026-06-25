import React from "react";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import { AuthProvider, useAuth } from "./contexts/AuthContext";

export type Page =
  | "dashboard"
  | "profile"
  | "fee"
  | "fee-type"
  | "class-fee-structure"
  | "assign-special-fee"
  | "fee-installments"
  | "take-fee"
  | "administration"
  | "academic"
  | "academics"
  | "setup"
  | "classes-management"
  | "student-attendance"
  | "student-administration"
  | "concession-master"
  | "student-concession"
  | "update-student-fee-structure"
  | "update-rebate-date"
  | "staffsupport"
  | "create-student"
  | "import-student-data"
  | "fee-reports"
  | "attendance-report"
  | "configuration"
  | "document-administration"
  | "student-document-management"
  | "document-management"
  | "user-management"
  | "role-permissions"
  | "franchise-management"
  | "school-management"
  | "control-panel"
  | "petty-cash"
  | "petty-cash-report"
  | "deleted-receipts"
  | "fee-concession-report"
  | "adjust-fee-report"
  | 'sms-center'
  | 'fund-allocation'
  | 'month-wise-ledger'
  | 'petty-cash-approval'
  | 'hr-management'
  | 'hr-departments'
  | 'hr-designations'
  | 'hr-shifts'
  | 'hr-staff-master'
  | 'hr-biometric-devices'
  | 'hr-biometric-mapping'
  | 'hr-attendance-summary'
  | 'hr-punch-log';

// Inner component that can access AuthContext
const AppInner: React.FC = () => {
  const { isAuthenticated, setUser, clearUser } = useAuth();

  const handleLoginSuccess = (user: any) => {
    setUser(user);
  };

  const handleLogout = () => {
    clearUser();
  };

  return (
    <>
      {isAuthenticated ? (
        <Dashboard onLogout={handleLogout} />
      ) : (
        <Login onLoginSuccess={handleLoginSuccess} />
      )}
    </>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
};

export default App;
