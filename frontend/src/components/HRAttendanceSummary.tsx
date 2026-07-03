import React, { useState, useEffect, useCallback } from 'react';
import { hr } from '../api';

interface AttendanceRecord {
  id: number;
  employee_id: string;
  staff_name: string;
  branch_name: string;
  department: string;
  attendance_date: string;
  first_in: string;
  last_out: string;
  working_minutes: number;
  attendance_status: string;
  source: string;
}

const HRAttendanceSummary: React.FC = () => {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Filters state
  const [filters, setFilters] = useState({
    date_from: new Date().toISOString().split('T')[0],
    date_to: new Date().toISOString().split('T')[0],
    employee: '',
    status: 'ALL'
  });

  const fetchAttendance = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const queryParams: any = {};
      if (filters.date_from) queryParams.date_from = filters.date_from;
      if (filters.date_to) queryParams.date_to = filters.date_to;
      if (filters.employee) queryParams.employee = filters.employee;
      if (filters.status && filters.status !== 'ALL') queryParams.status = filters.status;

      const response = await hr.getStaffAttendanceSummary(queryParams);
      if (response.data) {
        setRecords(response.data as AttendanceRecord[]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch attendance data');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Initial fetch and polling setup
  useEffect(() => {
    fetchAttendance();
    const intervalId = setInterval(fetchAttendance, 60000); // 60s polling
    return () => clearInterval(intervalId);
  }, [fetchAttendance]);

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFilters(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const formatHours = (minutes: number) => {
    if (!minutes) return '-';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  };

  const getStatusBadge = (status: string, lastOut: string | null) => {
    if (status === 'PRESENT') {
      if (!lastOut) {
        return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">Missing OUT</span>;
      }
      return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Present</span>;
    }
    if (status === 'ABSENT') {
      return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">Absent</span>;
    }
    if (status === 'HALF_DAY') {
      return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-orange-100 text-orange-800">Half Day</span>;
    }
    if (status === 'LATE') {
      return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-orange-100 text-orange-800">Late</span>;
    }
    return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">{status}</span>;
  };

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Attendance Summary</h1>
          <p className="mt-1 text-sm text-gray-500">
            Live view of staff attendance punches and calculated working hours. Auto-refreshes every minute.
          </p>
        </div>
        <div className="flex gap-2">
          {/* Refresh Action */}
          <button 
            onClick={async () => {
              try {
                setIsSyncing(true);
                await hr.processAttendanceSync();
                await fetchAttendance();
              } catch (err: any) {
                setError(err.message || 'Failed to process sync');
              } finally {
                setIsSyncing(false);
              }
            }}
            disabled={isSyncing || loading}
            className="px-4 py-2 bg-indigo-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {isSyncing ? 'Processing...' : 'Process & Refresh'}
          </button>
          
          {/* Future action buttons */}
          <button className="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 opacity-50 cursor-not-allowed">Export Excel</button>
          <button className="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 opacity-50 cursor-not-allowed">Print</button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
          <input type="date" name="date_from" value={filters.date_from} onChange={handleFilterChange} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
          <input type="date" name="date_to" value={filters.date_to} onChange={handleFilterChange} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Employee Search</label>
          <input type="text" name="employee" placeholder="Name or ID..." value={filters.employee} onChange={handleFilterChange} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <select name="status" value={filters.status} onChange={handleFilterChange} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md">
            <option value="ALL">All Statuses</option>
            <option value="PRESENT">Present</option>
            <option value="ABSENT">Absent</option>
            <option value="HALF_DAY">Half Day</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white shadow overflow-hidden sm:rounded-lg flex-1 overflow-y-auto">
        {error && <div className="p-4 bg-red-50 text-red-700 text-sm">{error}</div>}
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Branch/Dept</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">In/Out Time</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {records.length === 0 && !loading && (
              <tr>
                <td colSpan={8} className="px-6 py-10 text-center text-gray-500">No attendance records found for the selected criteria.</td>
              </tr>
            )}
            {records.map((record) => (
              <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{record.staff_name || '-'}</div>
                  <div className="text-sm text-gray-500">{record.employee_id}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{record.branch_name || '-'}</div>
                  <div className="text-sm text-gray-500">{record.department || '-'}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(record.attendance_date).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{record.first_in || '-'}</div>
                  <div className="text-sm text-gray-500">{record.last_out || '-'}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatHours(record.working_minutes)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {getStatusBadge(record.attendance_status, record.last_out)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {record.source}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button className="text-indigo-600 hover:text-indigo-900 mr-4 opacity-50 cursor-not-allowed">View</button>
                  <button className="text-orange-600 hover:text-orange-900 opacity-50 cursor-not-allowed">Regularize</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default HRAttendanceSummary;
