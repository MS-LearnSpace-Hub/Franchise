import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../api';
interface Permission {
  id: number;
  dashboard: string;
  module: string;
  component: string;
  code: string;
  description?: string;
}
interface Role {
  id: number;
  name: string;
  description?: string;
  is_active: boolean;
  is_system: boolean;
}
interface RolePermission {
  permission_id: number;
  can_read: boolean;
  can_write: boolean;
  can_append: boolean;
  can_delete: boolean;
}
const NEW_ROLE_VALUE = 'new';
const ACTIONS: Array<{ key: keyof Omit<RolePermission, 'permission_id'>; label: string }> = [
  { key: 'can_read', label: 'Read' },
  { key: 'can_write', label: 'Write' },
  { key: 'can_append', label: 'Append' },
  { key: 'can_delete', label: 'Delete' },
];
const emptyPermission = (permissionId: number): RolePermission => ({
  permission_id: permissionId,
  can_read: false,
  can_write: false,
  can_append: false,
  can_delete: false,
});
const RolePermissions: React.FC = () => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedRoleValue, setSelectedRoleValue] = useState<string>('');
  const [matrix, setMatrix] = useState<Record<number, RolePermission>>({});
  const [roleForm, setRoleForm] = useState({ name: '', description: '', is_active: true });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const selectedRoleId = selectedRoleValue && selectedRoleValue !== NEW_ROLE_VALUE ? Number(selectedRoleValue) : null;
  const selectedRole = roles.find(role => role.id === selectedRoleId);
  const isNewRole = selectedRoleValue === NEW_ROLE_VALUE;
  const groupedPermissions = useMemo(() => {
    return permissions.reduce<Record<string, { dashboard: string; rows: Permission[] }>>((acc, permission) => {
      const key = permission.dashboard || 'Other';
      if (!acc[key]) {
        acc[key] = { dashboard: permission.dashboard || 'Other', rows: [] };
      }
      acc[key].rows.push(permission);
      return acc;
    }, {});
  }, [permissions]);
  const resetMatrix = useCallback((mode: 'empty' | 'full' = 'empty') => {
    const next: Record<number, RolePermission> = {};
    permissions.forEach(permission => {
      next[permission.id] = {
        permission_id: permission.id,
        can_read: mode === 'full',
        can_write: mode === 'full',
        can_append: mode === 'full',
        can_delete: mode === 'full',
      };
    });
    setMatrix(next);
  }, [permissions]);
  const fetchBaseData = useCallback(async () => {
    setLoading(true);
    try {
      const [roleRes, permissionRes] = await Promise.all([
        api.get('/rbac/roles'),
        api.get('/rbac/permissions'),
      ]);
      const loadedRoles: Role[] = roleRes.data.roles || [];
      setRoles(loadedRoles);
      setPermissions(permissionRes.data.permissions || []);
      if (!selectedRoleValue && loadedRoles.length > 0) {
        setSelectedRoleValue(String(loadedRoles[0].id));
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to load role permissions' });
    } finally {
      setLoading(false);
    }
  }, [selectedRoleValue]);
  const fetchRolePermissions = useCallback(async (roleId: number) => {
    try {
      const res = await api.get(`/rbac/roles/${roleId}`);
      const rows: RolePermission[] = res.data.role?.permissions || [];
      const next: Record<number, RolePermission> = {};
      permissions.forEach(permission => {
        next[permission.id] = emptyPermission(permission.id);
      });
      rows.forEach(row => {
        next[row.permission_id] = row;
      });
      setMatrix(next);
      setRoleForm({
        name: res.data.role.name || '',
        description: res.data.role.description || '',
        is_active: Boolean(res.data.role.is_active),
      });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to load selected role' });
    }
  }, [permissions]);
  useEffect(() => {
    fetchBaseData();
  }, [fetchBaseData]);
  useEffect(() => {
    if (selectedRoleId && permissions.length > 0) {
      fetchRolePermissions(selectedRoleId);
    }
    if (isNewRole && permissions.length > 0) {
      setRoleForm({ name: '', description: '', is_active: true });
      resetMatrix('empty');
    }
  }, [selectedRoleId, isNewRole, permissions.length, fetchRolePermissions, resetMatrix]);
  const handleRoleChange = (value: string) => {
    setSelectedRoleValue(value);
    setMessage(null);
    if (value === NEW_ROLE_VALUE) {
      setRoleForm({ name: '', description: '', is_active: true });
      resetMatrix('empty');
    }
  };
  const togglePermission = (permissionId: number, checked: boolean) => {
    setMatrix(prev => ({
      ...prev,
      [permissionId]: {
        permission_id: permissionId,
        can_read: checked,
        can_write: checked,
        can_append: checked,
        can_delete: checked,
      }
    }));
  };
  const togglePermissionAction = (permissionId: number, action: keyof Omit<RolePermission, 'permission_id'>, checked: boolean) => {
    setMatrix(prev => ({
      ...prev,
      [permissionId]: {
        ...(prev[permissionId] || emptyPermission(permissionId)),
        permission_id: permissionId,
        [action]: checked,
      },
    }));
  };
  const toggleGroup = (rows: Permission[], checked: boolean) => {
    setMatrix(prev => {
      const next = { ...prev };
      rows.forEach(permission => {
        next[permission.id] = {
          permission_id: permission.id,
          can_read: checked,
          can_write: checked,
          can_append: checked,
          can_delete: checked,
        };
      });
      return next;
    });
  };
  const isPermissionChecked = (permissionId: number) => {
    const row = matrix[permissionId];
    return row ? (row.can_read || row.can_write || row.can_append || row.can_delete) : false;
  };
  const isGroupChecked = (rows: Permission[]) => {
    return rows.length > 0 && rows.every(p => isPermissionChecked(p.id));
  };
  const saveRole = async () => {
    if (!roleForm.name.trim()) {
      setMessage({ type: 'error', text: 'Role name is required' });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        ...roleForm,
        permissions: permissions.map(permission => {
          const row = matrix[permission.id] || emptyPermission(permission.id);
          return {
            permission_id: permission.id,
            can_read: Boolean(row.can_read),
            can_write: Boolean(row.can_write),
            can_append: Boolean(row.can_append),
            can_delete: Boolean(row.can_delete),
          };
        }),
      };

      if (selectedRoleId) {
        await api.put(`/rbac/roles/${selectedRoleId}`, payload);
        setMessage({ type: 'success', text: 'Role permissions updated' });
        await fetchRolePermissions(selectedRoleId);
      } else {
        const res = await api.post('/rbac/roles', payload);
        const newRoleId = res.data?.role?.id;
        if (newRoleId) {
          setSelectedRoleValue(String(newRoleId));
        }
        setMessage({ type: 'success', text: 'Role created' });
      }
      await fetchBaseData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to save role' });
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Role Permissions</h1>
        <p className="text-sm text-gray-500 mt-0.5">Select a role and allow access by modules.</p>
      </div>
      {message && (
        <div className={`mb-4 p-3 rounded-md text-sm ${message.type === 'success'
          ? 'bg-green-50 text-green-700 border border-green-200'
          : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.text}
        </div>
      )}
      <div className="bg-white border border-gray-200 rounded-md shadow-sm">
        <div className="p-6 border-b bg-white">
          <div className="flex flex-wrap items-center gap-4 md:gap-6">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap">User Type :</label>
              <select
                value={selectedRoleValue}
                onChange={event => handleRoleChange(event.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-w-[200px]"
              >
                {roles.map(role => (
                  <option key={role.id} value={role.id}>{role.name}</option>
                ))}
                <option value={NEW_ROLE_VALUE}>+ Add New UserType</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap">User Type Name :</label>
              <input
                value={roleForm.name}
                onChange={event => setRoleForm(form => ({ ...form, name: event.target.value }))}
                disabled={Boolean(selectedRole?.is_system)}
                placeholder="Role name"
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 min-w-[200px]"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap">User Type Display Text :</label>
              <input
                value={roleForm.description}
                onChange={event => setRoleForm(form => ({ ...form, description: event.target.value }))}
                placeholder="Display text"
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-w-[200px]"
              />
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 font-medium whitespace-nowrap">
              <input
                type="checkbox"
                checked={roleForm.is_active}
                onChange={event => setRoleForm(form => ({ ...form, is_active: event.target.checked }))}
                disabled={selectedRole?.name === 'SuperAdmin'}
                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
              Active
            </label>
          </div>
        </div>
        <div className="p-6">
          <div className="mb-6">
            <h2 className="text-base font-semibold text-gray-800">Modules :</h2>
          </div>
          {loading ? (
            <div className="py-8 text-sm text-gray-500 text-center">Loading permission matrix...</div>
          ) : (
            <div className="space-y-8">
              {Object.values(groupedPermissions).map(group => (
                <div key={group.dashboard}>
                  <div className="flex items-center gap-2 mb-4">
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-orange-500 rounded border-gray-300 focus:ring-orange-500 focus:ring-2"
                      checked={isGroupChecked(group.rows)}
                      onChange={(e) => toggleGroup(group.rows, e.target.checked)}
                    />
                    <span className="font-bold text-orange-500 uppercase tracking-wide">
                      {group.dashboard}
                    </span>
                  </div>
                  <div className="overflow-x-auto ml-6">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-500 uppercase">
                          <th className="text-left font-semibold py-2 pr-4">Component</th>
                          {ACTIONS.map(action => (
                            <th key={action.key} className="text-center font-semibold py-2 px-3">{action.label}</th>
                          ))}
                          <th className="text-center font-semibold py-2 pl-3">All</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                    {group.rows.map(permission => (
                      <tr key={permission.id}>
                        <td className="py-2 pr-4 text-gray-700">{permission.component}</td>
                        {ACTIONS.map(action => (
                          <td key={action.key} className="py-2 px-3 text-center">
                            <input
                              type="checkbox"
                              className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 focus:ring-2"
                              checked={Boolean(matrix[permission.id]?.[action.key])}
                              onChange={(e) => togglePermissionAction(permission.id, action.key, e.target.checked)}
                              aria-label={`${permission.component} ${action.label}`}
                            />
                          </td>
                        ))}
                        <td className="py-2 pl-3 text-center">
                          <input
                            type="checkbox"
                            className="w-4 h-4 text-orange-500 rounded border-gray-300 focus:ring-orange-500 focus:ring-2"
                            checked={isPermissionChecked(permission.id)}
                            onChange={(e) => togglePermission(permission.id, e.target.checked)}
                            aria-label={`${permission.component} all actions`}
                          />
                        </td>
                      </tr>
                    ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="p-4 border-t bg-gray-50 flex justify-end gap-3 rounded-b-md">
          <button
            onClick={() => resetMatrix('empty')}
            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50"
          >
            Clear All
          </button>
          <button
            onClick={() => resetMatrix('full')}
            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50"
          >
            Select All
          </button>
          <button
            onClick={saveRole}
            disabled={saving}
            className="px-5 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? 'Saving...' : selectedRoleId ? 'Save Role' : 'Create Role'}
          </button>
        </div>
      </div>
    </div>
  );
};
export default RolePermissions;
