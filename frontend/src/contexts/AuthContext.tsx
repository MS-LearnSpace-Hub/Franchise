import React, { createContext, useState, useContext, ReactNode, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AuthUser {
  user_id: number;
  username: string;
  role: "SuperAdmin" | "Admin" | "User" | string;
  legacy_role?: string;
  role_id?: number | null;
  role_name?: string;
  permissions?: Record<string, UserPermission>;
  // Legacy
  branch?: string;
  location?: string;
  // New tenant fields
  school_id: number | null;
  school_name: string | null;
  school_logo: string | null;
  school_theme: string | null;
  branch_id: number | null;
  branch_name: string | null;
  allowed_branches?: Array<{
    branch_id: number;
    branch_code: string;
    branch_name: string;
    location_code?: string;
  }>;
}

export interface UserPermission {
  dashboard: string;
  module: string;
  component: string;
  can_read: boolean;
  can_write: boolean;
  can_append: boolean;
  can_delete: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  setUser: (user: AuthUser) => void;
  clearUser: () => void;
  hasPermission: (code: string, action?: "read" | "write" | "append" | "delete") => boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─────────────────────────────────────────────────────────────────────────────
// Helper: load from localStorage
// ─────────────────────────────────────────────────────────────────────────────

function loadUserFromStorage(): AuthUser | null {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUserState] = useState<AuthUser | null>(loadUserFromStorage);

  const setUser = useCallback((newUser: AuthUser) => {
    localStorage.setItem("user", JSON.stringify(newUser));
    setUserState(newUser);
  }, []);

  const clearUser = useCallback(() => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    localStorage.removeItem("currentBranch");
    localStorage.removeItem("currentLocation");
    localStorage.removeItem("academicYear");
    setUserState(null);
  }, []);

  const hasPermission = useCallback(
    (code: string, action: "read" | "write" | "append" | "delete" = "read") => {
      if (!user) return false;
      if (user.role === "SuperAdmin") return true;
      const permission = user.permissions?.[code];
      if (!permission) return false;
      return Boolean(permission[`can_${action}` as keyof UserPermission]);
    },
    [user]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        setUser,
        clearUser,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};

export default AuthContext;
