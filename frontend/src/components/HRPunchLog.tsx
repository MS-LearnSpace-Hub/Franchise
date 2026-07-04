import React, { useState, useEffect, useCallback } from 'react';
import { hr } from '../api';

const generateMonthOptions = () => {
  const options = [];
  const currentDate = new Date();

  for (let i = 0; i < 12; i++) {
    const d = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const monthNameFull = d.toLocaleDateString('en-US', { month: 'long' });
    const monthNameShort = d.toLocaleDateString('en-US', { month: 'short' });

    const value = `${year}-${String(month + 1).padStart(2, '0')}`;
    const firstDayStr = `01 ${monthNameShort} ${year}`;
    const lastDayStr = `${String(lastDay.getDate()).padStart(2, '0')} ${monthNameShort} ${year}`;

    const label = `${monthNameFull}-${year}(${firstDayStr} To ${lastDayStr})`;

    const localFirstDayStr = new Date(firstDay.getTime() - (firstDay.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    const localLastDayStr = new Date(lastDay.getTime() - (lastDay.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

    options.push({ value, label, firstDay: localFirstDayStr, lastDay: localLastDayStr });
  }

  return options;
};

interface AttendanceRecord {
  id: number;
  employee_id: string;
  staff_name: string;
  branch_name: string;
  department: string;
  attendance_date: string;
  first_in: string | null;
  last_out: string | null;
  working_minutes: number;
  late_minutes: number;
  attendance_status: string;
  source: string;
  designation?: string;
}

const HRPunchLog: React.FC = () => {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const monthOptions = React.useMemo(() => generateMonthOptions(), []);
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0].value);

  // Filters state
  const [filters, setFilters] = useState({
    date_from: monthOptions[0].firstDay,
    date_to: monthOptions[0].lastDay,
    employee: '',
    status: 'ALL'
  });

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedMonth(val);
    const selectedOpt = monthOptions.find(o => o.value === val);
    if (selectedOpt) {
      setFilters(prev => ({
        ...prev,
        date_from: selectedOpt.firstDay,
        date_to: selectedOpt.lastDay
      }));
    }
  };

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

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFilters(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  // Helper functions for deriving table states
  const getDayOfWeek = (dateString: string) => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[new Date(dateString).getDay()];
  };

  const isLateWithin15 = (lateMinutes: number) => lateMinutes > 0 && lateMinutes <= 15 ? 'Yes' : 'No';
  const isLateAfter15 = (lateMinutes: number) => lateMinutes > 15 ? 'Yes' : 'No';
  const isEarlyLeaveWithin5 = (status: string) => 'No'; // We don't have early leave minutes yet
  const isEarlyLeaveBefore5 = (status: string) => 'No'; // Mocked

  const isLeave = (status: string) => status === 'LEAVE' ? 'Yes' : 'No';
  const isWeekoff = (status: string) => status === 'WEEK_OFF' ? 'Yes' : 'No';
  const isHoliday = (status: string) => status === 'HOLIDAY' ? 'Yes' : 'No';

  const getAttendancePoints = (status: string) => {
    if (status === 'PRESENT') return '1.00';
    if (status === 'HALF_DAY') return '0.50';
    return '0.00';
  };

  const getSessionState = (inTime: string | null, outTime: string | null, status: string, isMorning: boolean) => {
    if (status === 'WEEK_OFF') return 'W';
    if (status === 'HOLIDAY') return 'H';
    if (status === 'LEAVE') return 'L';
    if (status === 'ABSENT') return 'A';

    // Simplistic mockup for Session state
    if (status === 'PRESENT') return 'P';
    if (status === 'HALF_DAY') {
      if (isMorning && inTime && inTime < '13:00') return 'P';
      if (!isMorning && outTime && outTime > '13:00') return 'P';
      return 'A';
    }
    return 'A';
  };

  const renderSessionCell = (val: string) => {
    if (val === 'P') return <span className="block w-full h-full text-center text-gray-700 bg-white pt-2 pb-2">P</span>;
    if (val === 'A') return <span className="block w-full h-full text-center text-red-600 bg-red-200 font-medium pt-2 pb-2">A</span>;
    if (val === 'W') return <span className="block w-full h-full text-center text-white bg-[#ef6e4d] font-medium pt-2 pb-2">W</span>;
    if (val === 'H') return <span className="block w-full h-full text-center text-white bg-blue-500 font-medium pt-2 pb-2">H</span>;
    if (val === 'L') return <span className="block w-full h-full text-center text-white bg-yellow-500 font-medium pt-2 pb-2">L</span>;
    return <span>{val}</span>;
  };

  const renderYesNo = (val: string) => {
    if (val === 'Yes') return <span className="block text-center text-red-600 bg-red-100 text-xs px-1 rounded-sm mx-auto">{val}</span>;
    return <span className="block text-center text-gray-700 text-xs">{val}</span>;
  };

  const renderWeekoffHoliday = (val: string) => {
    if (val === 'Yes') return <span className="block text-center text-white bg-[#d19c4c] text-xs px-2 py-0.5 rounded-sm mx-auto">{val}</span>;
    return <span className="block text-center text-gray-700 text-xs">No</span>;
  }

  return (
    <div className="p-4 md:p-6 h-full flex flex-col bg-gray-50">
      <div className="mb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Punch Log</h1>
        </div>
        <div className="flex gap-2 mt-4 sm:mt-0">
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
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">-Select- Month</label>
          <select value={selectedMonth} onChange={handleMonthChange} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm py-2 px-3">
            <option value="">-Select-</option>
            {monthOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Employee Search</label>
          <input type="text" name="employee" placeholder="Name or ID..." value={filters.employee} onChange={handleFilterChange} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Status</label>
          <select name="status" value={filters.status} onChange={handleFilterChange} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md">
            <option value="ALL">All Statuses</option>
            <option value="PRESENT">Present</option>
            <option value="ABSENT">Absent</option>
            <option value="HALF_DAY">Half Day</option>
          </select>
        </div>
      </div>

      {/* Main Grid Table */}
      <div className="flex-1 bg-white border border-gray-200 overflow-hidden flex flex-col">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading attendance data...</div>
        ) : error ? (
          <div className="p-8 text-center text-red-500">{error}</div>
        ) : records.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No attendance records found for the selected period.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap table-fixed border-collapse" style={{ minWidth: '1800px' }}>
              <thead className="bg-[#f8f9fa] text-gray-800 font-bold border-b border-gray-300 text-xs">
                <tr>
                  <th className="px-1 py-1 border border-gray-300 w-12 text-center">
                    <div className="rotate-180" style={{ writingMode: 'vertical-rl' }}>S.No</div>
                  </th>
                  <th className="px-3 py-1 border border-gray-300 w-28 align-bottom">Employee ID</th>
                  <th className="px-3 py-1 border border-gray-300 w-40 align-bottom">Staff Name</th>
                  <th className="px-3 py-1 border border-gray-300 w-32 align-bottom">Department</th>
                  <th className="px-3 py-1 border border-gray-300 w-32 align-bottom">Designation</th>
                  <th className="px-3 py-1 border border-gray-300 w-28 align-bottom">Date</th>
                  <th className="px-3 py-1 border border-gray-300 w-24 align-bottom">Day</th>

                  <th className="px-1 py-1 border border-gray-300 w-24 text-center">
                    <div className="rotate-180" style={{ writingMode: 'vertical-rl' }}>Punching Timings</div>
                  </th>
                  <th className="px-1 py-1 border border-gray-300 w-20 text-center">
                    <div className="rotate-180" style={{ writingMode: 'vertical-rl' }}>In Time</div>
                  </th>
                  <th className="px-1 py-1 border border-gray-300 w-20 text-center">
                    <div className="rotate-180" style={{ writingMode: 'vertical-rl' }}>Out Time</div>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {records.map((r, idx) => {
                  const dayOfWeek = getDayOfWeek(r.attendance_date);
                  const attPoints = getAttendancePoints(r.attendance_status);

                  const formatTime12h = (t: string | null) => {
                    if (!t) return '';
                    const [h, m] = t.split(':');
                    const hour = parseInt(h);
                    const ampm = hour >= 12 ? 'PM' : 'AM';
                    const hour12 = hour % 12 || 12;
                    return `${hour12}:${m}${ampm}`;
                  };

                  const punches = [formatTime12h(r.first_in), formatTime12h(r.last_out)].filter(Boolean).join(' ,');

                  const morningState = getSessionState(r.first_in, r.last_out, r.attendance_status, true);
                  const afternoonState = getSessionState(r.first_in, r.last_out, r.attendance_status, false);

                  const dateObj = new Date(r.attendance_date);
                  const formattedDate = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

                  const isRowWoff = isWeekoff(r.attendance_status) === 'Yes';
                  const isRowHoliday = isHoliday(r.attendance_status) === 'Yes';
                  const rowClass = isRowWoff || isRowHoliday ? 'bg-orange-50' : (idx % 2 === 0 ? 'bg-white' : 'bg-[#f4f5f7]');

                  return (
                    <tr key={r.id} className={`hover:bg-indigo-50 transition-colors ${rowClass}`}>
                      <td className="px-2 py-1 border border-gray-200 text-center">{idx + 1}</td>
                      <td className="px-3 py-1 border border-gray-200 text-sm">{r.employee_id || '-'}</td>
                      <td className="px-3 py-1 border border-gray-200 text-sm font-semibold truncate max-w-[150px]" title={r.staff_name || ''}>{r.staff_name || '-'}</td>
                      <td className="px-3 py-1 border border-gray-200 text-sm truncate max-w-[120px]" title={r.department || ''}>{r.department || '-'}</td>
                      <td className="px-3 py-1 border border-gray-200 text-sm truncate max-w-[120px]" title={r.designation || ''}>{r.designation || '-'}</td>
                      <td className="px-3 py-1 border border-gray-200 text-blue-500 text-sm font-medium">{formattedDate}</td>
                      <td className="px-3 py-1 border border-gray-200 text-gray-700 text-sm">{dayOfWeek}</td>


                      <td className="px-2 py-1 border border-gray-200 text-center text-gray-700 text-[11px]">{punches}</td>
                      <td className="px-2 py-1 border border-gray-200 text-center text-gray-700 text-[11px]">{formatTime12h(r.first_in)}</td>
                      <td className="px-2 py-1 border border-gray-200 text-center text-gray-700 text-[11px]">{formatTime12h(r.last_out)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default HRPunchLog;
