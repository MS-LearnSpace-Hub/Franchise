/**
 * Permission checking utility for the frontend
 */

export interface User {
  user_id?: number;
  username?: string;
  role?: string;
  permissions?: string[] | Record<string, any>;
  [key: string]: any;
}

/**
 * Check if user has a specific permission
 * @param user - User object from localStorage
 * @param permission - Permission code (e.g., "fees.fee.petty-cash")
 * @param action - Action type (e.g., "read", "write") - optional, defaults to "read"
 * @returns boolean - true if user has permission
 */
export const hasPermission = (user: User | null, permission: string, action: string = "read"): boolean => {
  if (!user) return false;

  // SuperAdmin and Admin always have access
  if (user.role === "SuperAdmin" || user.role === "Admin") {
    return true;
  }

  // Check if permissions array/object exists
  if (!user.permissions) {
    return false;
  }

  // If permissions is an array of strings
  if (Array.isArray(user.permissions)) {
    return user.permissions.includes(permission);
  }

  // If permissions is an object with action keys
  if (typeof user.permissions === "object") {
    const permObj = user.permissions[permission];
    if (!permObj) return false;
    
    // If it's just a boolean
    if (typeof permObj === "boolean") return permObj;
    
    // If it's an object with actions
    if (typeof permObj === "object" && action in permObj) {
      return permObj[action] === true;
    }
  }

  return false;
};

/**
 * Check if user can perform write operations on a module
 */
export const canWrite = (user: User | null, permission: string): boolean => {
  return hasPermission(user, permission, "write");
};

/**
 * Check if user can read a module
 */
export const canRead = (user: User | null, permission: string): boolean => {
  return hasPermission(user, permission, "read");
};

/**
 * Get user from localStorage
 */
export const getCurrentUser = (): User | null => {
  try {
    const userStr = localStorage.getItem("user");
    return userStr ? JSON.parse(userStr) : null;
  } catch (e) {
    console.error("Failed to parse user from localStorage", e);
    return null;
  }
};
