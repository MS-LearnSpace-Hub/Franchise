import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  designation?: string;
  attendance_date: string;
  first_in: string | null;
  last_out: string | null;
  working_minutes: number;
  late_minutes: number;
  attendance_status: string;
  source: string;
}

interface StaffMonthlyData {
  employee_id: string;
  staff_name: string;
  branch_name: string;
  department: string;
  designation: string;
  total_days: number;
  weekoffs: number;
  holidays: number;
  present: number;
  absent: number;
  daily_records: Record<string, AttendanceRecord>;
}

const HRAttendanceSummary: React.FC = () => {
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

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFilters(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
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

  // Derive dates array
  const datesInMonth = useMemo(() => {
    const dates: string[] = [];
    const [sy, sm, sd] = filters.date_from.split('-').map(Number);
    const [ey, em, ed] = filters.date_to.split('-').map(Number);
    for (let d = new Date(sy, sm - 1, sd); d <= new Date(ey, em - 1, ed); d.setDate(d.getDate() + 1)) {
      dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
    return dates;
  }, [filters.date_from, filters.date_to]);

  const monthDisplayFormat = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getDate()}-${d.toLocaleDateString('en-US', { month: 'short' })}-${String(d.getFullYear()).slice(-2)}`;
  };

  // Group records by employee
  const groupedData = useMemo(() => {
    const map = new Map<string, StaffMonthlyData>();

    records.forEach(r => {
      if (!map.has(r.employee_id)) {
        map.set(r.employee_id, {
          employee_id: r.employee_id,
          staff_name: r.staff_name || '-',
          branch_name: r.branch_name || '-',
          department: r.department || '-',
          designation: r.designation || '-',
          total_days: datesInMonth.length,
          weekoffs: 0,
          holidays: 0,
          present: 0,
          absent: 0,
          daily_records: {}
        });
      }

      const staff = map.get(r.employee_id)!;
      staff.daily_records[r.attendance_date] = r;

      // Tally stats based on attendance_status
      const status = (r.attendance_status || '').toUpperCase();
      if (status === 'PRESENT' || status === 'HALF_DAY') staff.present++;
      else if (status === 'ABSENT' || status === 'LEAVE' || status.includes('LEAVE')) staff.absent++;
      else if (status === 'WEEKOFF' || status === 'WEEK_OFF') staff.weekoffs++;
      else if (status === 'HOLIDAY') staff.holidays++;
    });

    return Array.from(map.values());
  }, [records, datesInMonth.length]);

  const formatTime12h = (timeStr: string | null) => {
    if (!timeStr) return '-';
    const [h, m] = timeStr.split(':');
    let hour = parseInt(h, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 || 12;
    return `${hour}:${m}${ampm}`;
  };

  const getCellColorClass = (status: string) => {
    status = (status || '').toUpperCase();
    if (status === 'ABSENT' || status.includes('LEAVE')) return 'bg-[#d8a87b] text-white'; // Tan color like screenshot
    return '';
  };

  return (
    <div className="p-4 md:p-6 h-full flex flex-col bg-gray-50">
      <div className="mb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Attendance Summary</h1>
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
          <input type="text" name="employee" placeholder="Name or ID..." value={filters.employee} onChange={handleFilterChange} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm py-2 px-3" />
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
        ) : groupedData.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No attendance records found for the selected period.</div>
        ) : (
          <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: 'calc(100vh - 250px)' }}>
            <table className="w-full text-xs text-center whitespace-nowrap table-fixed border-collapse" style={{ minWidth: 'max-content' }}>
              <thead className="bg-[#f8f9fa] text-gray-800 font-bold border-b border-gray-300 sticky top-0 z-10">
                <tr>
                  <th rowSpan={2} className="px-2 py-2 border border-gray-300 sticky left-0 bg-[#f8f9fa] z-20 w-10 border-r-2">Sno</th>
                  <th rowSpan={2} className="px-3 py-2 border border-gray-300 sticky left-[40px] bg-[#f8f9fa] z-20 w-32 border-r-2">Staff Employee Id</th>
                  <th rowSpan={2} className="px-3 py-2 border border-gray-300 sticky left-[168px] bg-[#f8f9fa] z-20 w-48 text-left border-r-2">Staff name</th>
                  <th rowSpan={2} className="px-3 py-2 border border-gray-300 sticky left-[360px] bg-[#f8f9fa] z-20 w-40 text-left border-r-4 shadow-[4px_0_10px_-5px_rgba(0,0,0,0.1)]">Designation</th>

                  <th rowSpan={2} className="px-2 py-2 border border-gray-300 w-16">Total days</th>
                  <th rowSpan={2} className="px-2 py-2 border border-gray-300 w-16">WeekOff</th>
                  <th rowSpan={2} className="px-2 py-2 border border-gray-300 w-16">Holidays</th>
                  <th rowSpan={2} className="px-2 py-2 border border-gray-300 w-16">Present</th>
                  <th rowSpan={2} className="px-2 py-2 border border-gray-300 w-16 border-r-4">Absent</th>

                  {datesInMonth.map(date => (
                    <th key={date} colSpan={2} className="px-2 py-1 border border-gray-300 bg-gray-100 font-extrabold text-[11px] w-[240px] min-w-[240px]">
                      {monthDisplayFormat(date)}
                    </th>
                  ))}
                </tr>
                <tr>
                  {datesInMonth.map(date => (
                    <React.Fragment key={`${date}-sub`}>
                      <th className="px-2 py-2 border border-gray-300 bg-white font-semibold text-xs w-[120px] min-w-[120px]">In Time</th>
                      <th className="px-2 py-2 border border-gray-300 bg-white font-semibold text-xs w-[120px] min-w-[120px]">Out Time</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {groupedData.map((staff, index) => (
                  <tr key={staff.employee_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-2 py-2 border border-gray-300 sticky left-0 bg-white z-10 border-r-2">{index + 1}</td>
                    <td className="px-3 py-2 border border-gray-300 sticky left-[40px] bg-white z-10 border-r-2">{staff.employee_id}</td>
                    <td className="px-3 py-2 border border-gray-300 sticky left-[168px] bg-white z-10 text-left font-semibold truncate max-w-[192px] border-r-2" title={staff.staff_name}>{staff.staff_name}</td>
                    <td className="px-3 py-2 border border-gray-300 sticky left-[360px] bg-white z-10 text-left truncate max-w-[160px] border-r-4 shadow-[4px_0_10px_-5px_rgba(0,0,0,0.1)]" title={staff.designation}>{staff.designation}</td>

                    <td className="px-2 py-2 border border-gray-300 font-medium">{staff.total_days}</td>
                    <td className="px-2 py-2 border border-gray-300">{staff.weekoffs}</td>
                    <td className="px-2 py-2 border border-gray-300">{staff.holidays}</td>
                    <td className="px-2 py-2 border border-gray-300 font-medium">{staff.present}</td>
                    <td className="px-2 py-2 border border-gray-300 font-medium text-red-500 border-r-4">{staff.absent}</td>

                    {datesInMonth.map(date => {
                      const record = staff.daily_records[date];
                      if (!record) {
                        return (
                          <React.Fragment key={`${date}-empty`}>
                            <td className="px-2 py-2 border border-gray-300 text-gray-400">-</td>
                            <td className="px-2 py-2 border border-gray-300 text-gray-400">-</td>
                          </React.Fragment>
                        );
                      }

                      const status = (record.attendance_status || '').toUpperCase();
                      const colorClass = getCellColorClass(status);

                      // If absent/leave, show a spanned block or single block with '1'
                      if (['ABSENT', 'LEAVE'].some(s => status.includes(s))) {
                        return (
                          <td key={`${date}-absent`} colSpan={2} className={`px-2 py-2 border border-gray-300 font-bold ${colorClass}`}>
                            1
                          </td>
                        );
                      }

                      if (status === 'HALF_DAY') {
                        return (
                          <React.Fragment key={`${date}-half`}>
                            <td className="px-2 py-2 border border-gray-300">{formatTime12h(record.first_in)}</td>
                            <td className={`px-2 py-2 border border-gray-300 font-bold ${getCellColorClass('ABSENT')}`}>0.5</td>
                          </React.Fragment>
                        );
                      }

                      // Regular punch data
                      return (
                        <React.Fragment key={`${date}-punch`}>
                          <td className={`px-2 py-2 border border-gray-300 ${colorClass}`}>
                            {formatTime12h(record.first_in)}
                          </td>
                          <td className={`px-2 py-2 border border-gray-300 ${colorClass}`}>
                            {formatTime12h(record.last_out)}
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default HRAttendanceSummary;
