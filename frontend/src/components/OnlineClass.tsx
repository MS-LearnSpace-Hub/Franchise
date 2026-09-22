import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';
import { OnlineClassItem } from '../types';

// start_datetime is stored as a plain wall-clock string (e.g. "2026-09-01T12:55:00")
// representing the time in the class's own `timezone` field — not the viewer's.
// We show those exact numbers as-is and always label the timezone, so it's
// never mistaken for the viewer's own local time.
const formatClassDateTime = (isoString: string, timezone?: string | null) => {
  if (!isoString) return '-';
  const [datePart, timePart] = isoString.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = (timePart || '00:00:00').split(':').map(Number);
  const d = new Date(year, (month || 1) - 1, day || 1, hour || 0, minute || 0);
  const formatted = d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${formatted} (${timezone || 'Asia/Kolkata'})`;
};

const shiftDay = (isoDate: string, delta: number) => {
  const d = new Date(isoDate + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
};

const OnlineClass: React.FC = () => {
    const { hasPermission } = useAuth();
  const canWrite = hasPermission('academics.online-class.online-class', 'write');
    const canManageZoomSettings = hasPermission('academics.online-class.zoom-settings', 'write');
  const [showZoomSettings, setShowZoomSettings] = useState(false);
  const [googleStatus, setGoogleStatus] = useState<{ connected: boolean; google_email?: string | null; reason?: string } | null>(null);
  const [googleConnecting, setGoogleConnecting] = useState(false);

  useEffect(() => {
    api.get('/online-classes/google/status')
      .then((res) => setGoogleStatus(res.data))
      .catch(() => setGoogleStatus(null));
  }, []);

  const handleGoogleConnect = async () => {
    setGoogleConnecting(true);
    try {
      const res = await api.get('/online-classes/google/connect');
      if (res.data?.authorization_url) {
        window.location.href = res.data.authorization_url;
      }
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to start Google connection');
      setGoogleConnecting(false);
    }
  };

  const handleGoogleDisconnect = async () => {
    if (!window.confirm("Disconnect your Google account? You won't be able to schedule new Google Meet classes until you reconnect.")) return;
    try {
      await api.delete('/online-classes/google/disconnect');
      setGoogleStatus({ connected: false });
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to disconnect Google account');
    }
  };

    const [classes, setClasses] = useState<OnlineClassItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<OnlineClassItem | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<OnlineClassItem | null>(null);
  const [joiningId, setJoiningId] = useState<number | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

    const [statusFilter, setStatusFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [calendarDate, setCalendarDate] = useState(() => new Date().toISOString().slice(0, 10));

    const fetchClasses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = {};
      if (statusFilter) params.status = statusFilter;
      if (viewMode === 'calendar') {
        params.from_date = calendarDate;
        params.to_date = calendarDate;
        params.page_size = 200;
      } else {
        if (fromDate) params.from_date = fromDate;
        if (toDate) params.to_date = toDate;
        params.page = page;
        params.page_size = 50;
      }
      const res = await api.get('/online-classes', { params });
      setClasses(res.data?.items || []);
      setTotalPages(res.data?.total_pages || 1);
      setTotalCount(res.data?.total || 0);
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to load online classes');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, fromDate, toDate, page, viewMode, calendarDate]);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, fromDate, toDate]);

  // Teacher/title search is done here in the browser, on top of whatever the
  // backend already filtered by status/date — the backend has no text-search
  // endpoint yet, so this keeps things simple without adding a new API.
  const displayedClasses = classes.filter((c) => {
    if (!searchText.trim()) return true;
    const q = searchText.trim().toLowerCase();
    return c.title.toLowerCase().includes(q) || (c.teacher_name || '').toLowerCase().includes(q);
  });

  const handleJoin = async (c: OnlineClassItem) => {
    setRowError(null);
    setJoiningId(c.id);
    try {
      const res = await api.get(`/online-classes/${c.id}/join`);
      const url = res.data?.join_url;
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        setRowError('No join link is available for this class yet.');
      }
    } catch (e: any) {
      setRowError(e.response?.data?.error || 'Unable to join this class.');
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Online Classes</h1>
          <p className="text-sm text-slate-600 mt-0.5">Schedule and manage Zoom / Google Meet classes</p>
        </div>
                                <div className="flex items-center gap-3">
          {googleStatus && !googleStatus.reason && (
            googleStatus.connected ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-600">Google: <span className="font-medium text-slate-800">{googleStatus.google_email || 'Connected'}</span></span>
                <button onClick={handleGoogleDisconnect} className="text-red-600 hover:underline">Disconnect</button>
              </div>
            ) : (
              <button
                onClick={handleGoogleConnect}
                disabled={googleConnecting}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 font-medium disabled:opacity-60"
              >
                {googleConnecting ? 'Redirecting...' : 'Connect Google Account'}
              </button>
            )
          )}
          {canManageZoomSettings && (
            <button
              onClick={() => setShowZoomSettings(true)}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 font-medium"
            >
              Zoom Settings
            </button>
          )}
          {canWrite && (
            <button
              onClick={() => setShowScheduleModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              + Schedule Class
            </button>
          )}
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}
            {rowError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex justify-between items-center">
          <span>{rowError}</span>
          <button onClick={() => setRowError(null)} className="text-red-500 hover:text-red-700 font-bold px-2">✕</button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-3 bg-white p-3 rounded-lg border border-slate-200">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-medium text-slate-500 mb-1">Search (title or teacher)</label>
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-full px-3 py-1.5 border rounded-lg text-sm"
            placeholder="e.g. Ravi Kumar, Algebra"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 border rounded-lg text-sm"
          >
                        <option value="">All</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">From</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="px-3 py-1.5 border rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">To</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="px-3 py-1.5 border rounded-lg text-sm" />
        </div>
                {(statusFilter || fromDate || toDate || searchText) && (
          <button
            onClick={() => { setStatusFilter(''); setFromDate(''); setToDate(''); setSearchText(''); }}
            className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 underline"
          >
            Clear filters
          </button>
        )}
        <div className="ml-auto flex border border-slate-300 rounded-lg overflow-hidden">
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 text-sm font-medium ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
          >List</button>
          <button
            onClick={() => setViewMode('calendar')}
            className={`px-3 py-1.5 text-sm font-medium ${viewMode === 'calendar' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
          >Calendar</button>
        </div>
      </div>

      {viewMode === 'calendar' && (
        <div className="mb-4 flex items-center gap-3 bg-white p-3 rounded-lg border border-slate-200">
          <button onClick={() => setCalendarDate((d) => shiftDay(d, -1))} className="px-2 py-1 border rounded-md text-sm hover:bg-slate-50">‹ Prev</button>
          <input type="date" value={calendarDate} onChange={(e) => setCalendarDate(e.target.value)} className="px-3 py-1.5 border rounded-lg text-sm" />
          <button onClick={() => setCalendarDate((d) => shiftDay(d, 1))} className="px-2 py-1 border rounded-md text-sm hover:bg-slate-50">Next ›</button>
          <button onClick={() => setCalendarDate(new Date().toISOString().slice(0, 10))} className="px-2 py-1 text-sm text-blue-600 hover:underline">Today</button>
        </div>
      )}

            {viewMode === 'list' && (
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-100 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Title</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Teacher</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Platform</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Start</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
                        {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Loading...</td></tr>
            ) : displayedClasses.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No online classes found.</td></tr>
            ) : (
              displayedClasses.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">{c.title}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{c.teacher_name || '-'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 capitalize">{c.platform.replace('_', ' ')}</td>
                                    <td className="px-4 py-3 text-sm text-slate-600">{formatClassDateTime(c.start_datetime, c.timezone)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      c.status === 'SCHEDULED' ? 'bg-green-100 text-green-700' :
                      c.status === 'CANCELLED' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
                    }`}>{c.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    {c.status === 'SCHEDULED' ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleJoin(c)}
                          disabled={joiningId === c.id}
                          className="px-3 py-1 text-xs font-medium bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-60"
                        >
                          {joiningId === c.id ? 'Joining...' : 'Join'}
                        </button>
                        {canWrite && (
                          <>
                            <button
                              onClick={() => setRescheduleTarget(c)}
                              className="px-3 py-1 text-xs font-medium border border-slate-300 text-slate-700 rounded-md hover:bg-slate-100"
                            >
                              Reschedule
                            </button>
                            <button
                              onClick={() => setCancelTarget(c)}
                              className="px-3 py-1 text-xs font-medium border border-red-300 text-red-600 rounded-md hover:bg-red-50"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">
                        {c.status === 'CANCELLED' && c.cancel_reason ? `Cancelled: ${c.cancel_reason}` : '—'}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
                    </tbody>
        </table>
      </div>
      )}

      {viewMode === 'list' && totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
          <span>Page {page} of {totalPages} ({totalCount} classes)</span>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1.5 border rounded-md disabled:opacity-40 hover:bg-slate-50">Previous</button>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1.5 border rounded-md disabled:opacity-40 hover:bg-slate-50">Next</button>
          </div>
        </div>
      )}

      {viewMode === 'calendar' && (
        <DayCalendarView
          day={calendarDate}
          classes={displayedClasses}
          canWrite={canWrite}
          joiningId={joiningId}
          onJoin={handleJoin}
          onReschedule={setRescheduleTarget}
          onCancel={setCancelTarget}
        />
      )}

      {showScheduleModal && (
        <ScheduleClassModal
          onClose={() => setShowScheduleModal(false)}
          onScheduled={() => { setShowScheduleModal(false); fetchClasses(); }}
        />
      )}

      {cancelTarget && (
        <CancelClassModal
          classItem={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onCancelled={() => { setCancelTarget(null); fetchClasses(); }}
        />
      )}

            {rescheduleTarget && (
        <RescheduleClassModal
          classItem={rescheduleTarget}
          onClose={() => setRescheduleTarget(null)}
          onRescheduled={() => { setRescheduleTarget(null); fetchClasses(); }}
        />
      )}

      {showZoomSettings && (
        <ZoomSettingsModal onClose={() => setShowZoomSettings(false)} />
      )}
    </div>
  );
};

const DAY_START_HOUR = 7;
const DAY_END_HOUR = 20;

const DayCalendarView: React.FC<{
  day: string;
  classes: OnlineClassItem[];
  canWrite: boolean;
  joiningId: number | null;
  onJoin: (c: OnlineClassItem) => void;
  onReschedule: (c: OnlineClassItem) => void;
  onCancel: (c: OnlineClassItem) => void;
}> = ({ day, classes, canWrite, joiningId, onJoin, onReschedule, onCancel }) => {
  const dayClasses = classes.filter((c) => c.start_datetime.startsWith(day));
  const totalMinutes = (DAY_END_HOUR - DAY_START_HOUR) * 60;
  const hours = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }, (_, i) => DAY_START_HOUR + i);

  const topPct = (c: OnlineClassItem) => {
    const [, timePart] = c.start_datetime.split('T');
    const [h, m] = (timePart || '00:00').split(':').map(Number);
    const minutesFromStart = (h - DAY_START_HOUR) * 60 + m;
    return Math.max(0, Math.min(100, (minutesFromStart / totalMinutes) * 100));
  };
  const heightPct = (c: OnlineClassItem) => Math.max(3, (c.duration_minutes / totalMinutes) * 100);

  const statusColor = (s: string) =>
    s === 'SCHEDULED' ? 'bg-blue-100 border-blue-400 text-blue-800' :
    s === 'CANCELLED' ? 'bg-red-50 border-red-300 text-red-700 line-through' :
    'bg-slate-100 border-slate-300 text-slate-600';

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
      {dayClasses.length === 0 ? (
        <div className="py-12 text-center text-slate-500 text-sm">No online classes scheduled on this day.</div>
      ) : (
        <div className="relative flex" style={{ height: `${(DAY_END_HOUR - DAY_START_HOUR) * 56}px` }}>
          <div className="w-16 flex-shrink-0 relative text-xs text-slate-400">
            {hours.map((h) => (
              <div key={h} className="absolute -translate-y-2" style={{ top: `${((h - DAY_START_HOUR) / (DAY_END_HOUR - DAY_START_HOUR)) * 100}%` }}>
                {h % 12 === 0 ? 12 : h % 12}:00 {h < 12 ? 'AM' : 'PM'}
              </div>
            ))}
          </div>
          <div className="flex-1 relative border-l border-slate-200">
            {hours.map((h) => (
              <div key={h} className="absolute w-full border-t border-slate-100" style={{ top: `${((h - DAY_START_HOUR) / (DAY_END_HOUR - DAY_START_HOUR)) * 100}%` }} />
            ))}
            {dayClasses.map((c) => (
              <div key={c.id} className={`absolute left-1 right-1 rounded-md border px-2 py-1 text-xs overflow-hidden ${statusColor(c.status)}`}
                   style={{ top: `${topPct(c)}%`, height: `${heightPct(c)}%`, minHeight: '28px' }}>
                <div className="font-semibold truncate">{c.title}</div>
                <div className="truncate">{c.teacher_name} · {c.platform.replace('_', ' ')}</div>
                {c.status === 'SCHEDULED' && (
                  <div className="mt-0.5 flex gap-2">
                    <button onClick={() => onJoin(c)} disabled={joiningId === c.id} className="underline hover:no-underline">Join</button>
                    {canWrite && (<>
                      <button onClick={() => onReschedule(c)} className="underline hover:no-underline">Reschedule</button>
                      <button onClick={() => onCancel(c)} className="underline hover:no-underline">Cancel</button>
                    </>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

interface ScheduleClassModalProps {
  onClose: () => void;
  onScheduled: () => void;
}

const ScheduleClassModal: React.FC<ScheduleClassModalProps> = ({ onClose, onScheduled }) => {
  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState<'zoom' | 'google_meet'>('zoom');
  const [teacherId, setTeacherId] = useState('');
  const [startDatetime, setStartDatetime] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceDays, setRecurrenceDays] = useState<string[]>([]);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('');
    const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<string[] | null>(null);
  const [teachers, setTeachers] = useState<{ id: number; name: string }[]>([]);
  const [teachersLoading, setTeachersLoading] = useState(false);
  const [teacherSearch, setTeacherSearch] = useState('');
  const [showTeacherDropdown, setShowTeacherDropdown] = useState(false);
    const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [classes, setClassOptions] = useState<{ id: number; class_name: string; sections: { id: number; name: string }[] }[]>([]);
  const [subjects, setSubjects] = useState<{ id: number; subject_name: string }[]>([]);
  const [myAssignments, setMyAssignments] = useState<{ class_id: number; class_name: string; section_id: number; section_name: string; subject_id: number; subject_name: string }[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const { hasPermission } = useAuth();
  const canBrowseTeachers = hasPermission('hr.hr.staff-master', 'read');

  useEffect(() => {
    const loadOptions = async () => {
      setOptionsLoading(true);
      try {
        if (canBrowseTeachers) {
          // Admin / anyone with HR-level access: browse every class/section/subject in the school.
          const [classRes, subjectRes] = await Promise.all([
            api.get('/classes/summary'),
            api.get('/academic/subjects'),
          ]);
          setClassOptions(classRes.data || []);
          setSubjects(subjectRes.data || []);
        } else {
          // Teacher-locked users: only what they're actually assigned to teach,
          // from Subject-Teacher Assignment — not the full school-wide list.
          const res = await api.get('/online-classes/my-assignments');
          setMyAssignments(res.data || []);
        }
      } catch (e: any) {
        console.error('Failed to load class/subject options:', e.response?.data || e.message);
      } finally {
        setOptionsLoading(false);
      }
    };
    loadOptions();
  }, [canBrowseTeachers]);

  // Derived, teacher-locked versions of the class/section/subject lists,
  // built from myAssignments instead of the full school-wide master data.
  const myClasses = useMemo(() => {
    const map = new Map<number, { id: number; class_name: string; sections: Map<number, { id: number; name: string }> }>();
    myAssignments.forEach((a) => {
      if (!map.has(a.class_id)) {
        map.set(a.class_id, { id: a.class_id, class_name: a.class_name, sections: new Map() });
      }
      map.get(a.class_id)!.sections.set(a.section_id, { id: a.section_id, name: a.section_name });
    });
    return Array.from(map.values()).map((c) => ({ id: c.id, class_name: c.class_name, sections: Array.from(c.sections.values()) }));
  }, [myAssignments]);

  const mySubjectsForSelection = useMemo(() => {
    if (!classId || !sectionId) return [];
    const seen = new Set<number>();
    return myAssignments
      .filter((a) => String(a.class_id) === classId && String(a.section_id) === sectionId)
      .filter((a) => (seen.has(a.subject_id) ? false : (seen.add(a.subject_id), true)))
      .map((a) => ({ id: a.subject_id, subject_name: a.subject_name }));
  }, [myAssignments, classId, sectionId]);

  const effectiveClasses = canBrowseTeachers ? classes : myClasses;
  const effectiveSubjects = canBrowseTeachers ? subjects : mySubjectsForSelection;

      const [selfTeacher, setSelfTeacher] = useState<{ is_teacher: boolean; staff_id: number | null; name: string | null } | null>(null);

  useEffect(() => {
    const init = async () => {
      setTeachersLoading(true);
      try {
        if (canBrowseTeachers) {
          const res = await api.get('/hr/staff', { params: { status: 'ACTIVE' } });
          const list = (res.data || []).map((s: any) => ({
            id: s.id,
            name: s.display_name || `${s.first_name} ${s.last_name || ''}`.trim(),
          }));
          setTeachers(list);
        } else {
          const res = await api.get('/online-classes/me-as-teacher');
          setSelfTeacher(res.data);
          if (res.data?.is_teacher) {
            setTeacherId(String(res.data.staff_id));
            setTeacherSearch(res.data.name || '');
          }
        }
      } catch (e: any) {
        console.error('Failed to load teacher info:', e.response?.data || e.message);
      } finally {
        setTeachersLoading(false);
      }
    };
    init();
  }, [canBrowseTeachers]);

    const handleSubmit = async (force = false) => {
    if (!title.trim() || !teacherId || !startDatetime) {
      setError('Title, Teacher ID and Start date/time are required.');
      return;
    }
    if (isRecurring && recurrenceDays.length === 0) {
      setError('Select at least one day of the week for the recurring class.');
      return;
    }
    if (isRecurring && !recurrenceEndDate) {
      setError('Pick an end date for the recurring class.');
      return;
    }
    setSaving(true);
    setError(null);
    setConflicts(null);
    try {
            await api.post('/online-classes', {
        title,
        platform,
        teacher_id: Number(teacherId),
        start_datetime: startDatetime.length === 16 ? `${startDatetime}:00` : startDatetime,
        duration_minutes: durationMinutes,
        class_id: classId ? Number(classId) : undefined,
        section_id: sectionId ? Number(sectionId) : undefined,
        subject_id: subjectId ? Number(subjectId) : undefined,
        is_recurring: isRecurring,
        recurrence_days: isRecurring ? recurrenceDays : undefined,
        recurrence_end_date: isRecurring ? recurrenceEndDate : undefined,
        force,
      });
      onScheduled();
    } catch (e: any) {
      const data = e.response?.data;
      if (data?.conflicts) {
        setConflicts(data.conflicts);
        setError(data.error);
      } else {
        setError(data?.error || 'Failed to schedule class');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-lg font-bold text-slate-800">Schedule Online Class</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700">✕</button>
        </div>
        <div className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
              {conflicts && (
                <ul className="list-disc pl-5 mt-1">
                  {conflicts.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Title *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="e.g. Algebra Basics" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Platform *</label>
              <select value={platform} onChange={(e) => setPlatform(e.target.value as any)} className="w-full px-3 py-2 border rounded-lg">
                <option value="zoom">Zoom</option>
                <option value="google_meet">Google Meet</option>
              </select>
            </div>
                                                <div className="relative">
              <label className="block text-sm font-medium text-slate-700 mb-1">Teacher *</label>
              {canBrowseTeachers ? (
                <>
                  <input
                    value={teacherSearch}
                    onChange={(e) => {
                      setTeacherSearch(e.target.value);
                      setTeacherId('');
                      setShowTeacherDropdown(true);
                    }}
                    onFocus={() => setShowTeacherDropdown(true)}
                    onBlur={() => setTimeout(() => setShowTeacherDropdown(false), 150)}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder={teachersLoading ? 'Loading...' : 'Type a name...'}
                    disabled={teachersLoading}
                    autoComplete="off"
                  />
                  {showTeacherDropdown && teacherSearch.trim() && (
                    <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {teachers
                        .filter((t) => t.name.toLowerCase().includes(teacherSearch.trim().toLowerCase()))
                        .slice(0, 20)
                        .map((t) => (
                          <button
                            type="button"
                            key={t.id}
                            onClick={() => {
                              setTeacherId(String(t.id));
                              setTeacherSearch(t.name);
                              setShowTeacherDropdown(false);
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                          >
                            {t.name}
                          </button>
                        ))}
                      {teachers.filter((t) => t.name.toLowerCase().includes(teacherSearch.trim().toLowerCase())).length === 0 && (
                        <div className="px-3 py-2 text-sm text-slate-400">No match found</div>
                      )}
                    </div>
                  )}
                </>
              ) : teachersLoading ? (
                <div className="w-full px-3 py-2 border rounded-lg bg-slate-50 text-slate-400 text-sm">Loading...</div>
              ) : selfTeacher?.is_teacher ? (
                <div className="w-full px-3 py-2 border rounded-lg bg-slate-50 text-slate-700 text-sm">
                  {selfTeacher.name} <span className="text-xs text-slate-400">(you)</span>
                </div>
              ) : (
                <div className="w-full px-3 py-2 border border-red-200 rounded-lg bg-red-50 text-red-600 text-sm">
                  You don't have permission to assign a teacher. Contact your admin.
                </div>
              )}
            </div>
          </div>

                                        <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Class</label>
              <select
                value={classId}
                onChange={(e) => { setClassId(e.target.value); setSectionId(''); }}
                className="w-full px-3 py-2 border rounded-lg"
                disabled={optionsLoading}
              >
                <option value="">{optionsLoading ? 'Loading...' : canBrowseTeachers ? 'Any class' : 'Select class'}</option>
                {effectiveClasses.map((c) => (
                  <option key={c.id} value={c.id}>{c.class_name}</option>
                ))}
              </select>
              {!canBrowseTeachers && !optionsLoading && effectiveClasses.length === 0 && (
                <p className="text-xs text-red-500 mt-1">No subject/class assignments found — contact your admin.</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Section</label>
              <select
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
                disabled={!classId}
              >
                <option value="">{classId ? (canBrowseTeachers ? 'Any section' : 'Select section') : 'Select class first'}</option>
                {(effectiveClasses.find((c) => String(c.id) === classId)?.sections || []).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Subject</label>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
                disabled={optionsLoading || (!canBrowseTeachers && (!classId || !sectionId))}
              >
                <option value="">{canBrowseTeachers ? 'Any subject' : (!classId || !sectionId) ? 'Select class & section first' : 'Select subject'}</option>
                {effectiveSubjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.subject_name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Start Date & Time *</label>
              <input
                type="datetime-local"
                value={startDatetime}
                onChange={(e) => setStartDatetime(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
                        <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Duration (minutes)</label>
              <input type="number" value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} className="w-full px-3 py-2 border rounded-lg" min={5} />
            </div>
          </div>

          <div className="border-t pt-3">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
              />
              Repeat this class weekly
            </label>

            {isRecurring && (
              <div className="mt-3 space-y-3 pl-1">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Repeat on *</label>
                  <div className="flex flex-wrap gap-2">
                    {['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'].map((day) => (
                      <button
                        type="button"
                        key={day}
                        onClick={() =>
                          setRecurrenceDays((prev) =>
                            prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
                          )
                        }
                        className={`px-3 py-1 text-xs font-medium rounded-full border ${
                          recurrenceDays.includes(day)
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Repeat until *</label>
                  <input
                    type="date"
                    value={recurrenceEndDate}
                    onChange={(e) => setRecurrenceEndDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="p-4 border-t flex justify-end gap-3 bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 border text-slate-700 rounded-lg hover:bg-slate-100">Cancel</button>
          {conflicts && (
            <button onClick={() => handleSubmit(true)} disabled={saving} className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700">
              Schedule Anyway
            </button>
          )}
          <button
            onClick={() => handleSubmit(false)}
            disabled={saving}
            className={`px-4 py-2 text-white rounded-lg ${saving ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {saving ? 'Scheduling...' : 'Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Cancel Class Modal
// ---------------------------------------------------------------------------

interface CancelClassModalProps {
  classItem: OnlineClassItem;
  onClose: () => void;
  onCancelled: () => void;
}

const CancelClassModal: React.FC<CancelClassModalProps> = ({ classItem, onClose, onCancelled }) => {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

    const handleCancel = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await api.post(`/online-classes/${classItem.id}/cancel`, { reason: reason.trim() || undefined });
      if (res.data?.warning) {
        window.alert(res.data.warning);
      }
      onCancelled();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to cancel class');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-lg font-bold text-slate-800">Cancel Online Class</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700">✕</button>
        </div>
        <div className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
          )}
          <p className="text-sm text-slate-600">
                        You're about to cancel <span className="font-medium text-slate-900">"{classItem.title}"</span> scheduled for{' '}
            {formatClassDateTime(classItem.start_datetime, classItem.timezone)}. Students and the teacher will no longer be able to join.
          </p>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Reason (optional)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              rows={3}
              placeholder="e.g. Teacher unavailable, rescheduling later"
            />
          </div>
        </div>
        <div className="p-4 border-t flex justify-end gap-3 bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 border text-slate-700 rounded-lg hover:bg-slate-100">
            Keep Class
          </button>
          <button
            onClick={handleCancel}
            disabled={saving}
            className={`px-4 py-2 text-white rounded-lg ${saving ? 'bg-red-400' : 'bg-red-600 hover:bg-red-700'}`}
          >
            {saving ? 'Cancelling...' : 'Cancel Class'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Reschedule Class Modal
// ---------------------------------------------------------------------------

interface RescheduleClassModalProps {
  classItem: OnlineClassItem;
  onClose: () => void;
  onRescheduled: () => void;
}

const toDatetimeLocalValue = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const RescheduleClassModal: React.FC<RescheduleClassModalProps> = ({ classItem, onClose, onRescheduled }) => {
  const [startDatetime, setStartDatetime] = useState(toDatetimeLocalValue(classItem.start_datetime));
  const [durationMinutes, setDurationMinutes] = useState(classItem.duration_minutes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<string[] | null>(null);

  const handleSubmit = async (force = false) => {
    setSaving(true);
    setError(null);
    setConflicts(null);
    try {
      await api.put(`/online-classes/${classItem.id}`, {
        start_datetime: startDatetime.length === 16 ? `${startDatetime}:00` : startDatetime,
        duration_minutes: durationMinutes,
        force,
      });
      onRescheduled();
    } catch (e: any) {
      const data = e.response?.data;
      if (data?.conflicts) {
        setConflicts(data.conflicts);
        setError(data.error);
      } else {
        setError(data?.error || 'Failed to reschedule class');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-lg font-bold text-slate-800">Reschedule Class</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700">✕</button>
        </div>
        <div className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
              {conflicts && (
                <ul className="list-disc pl-5 mt-1">
                  {conflicts.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              )}
            </div>
          )}
          <p className="text-sm text-slate-600">
            Rescheduling <span className="font-medium text-slate-900">"{classItem.title}"</span>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">New Date & Time *</label>
              <input
                type="datetime-local"
                value={startDatetime}
                onChange={(e) => setStartDatetime(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Duration (minutes)</label>
              <input
                type="number"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full px-3 py-2 border rounded-lg"
                min={5}
              />
            </div>
          </div>
        </div>
        <div className="p-4 border-t flex justify-end gap-3 bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 border text-slate-700 rounded-lg hover:bg-slate-100">
            Cancel
          </button>
          {conflicts && (
            <button
              onClick={() => handleSubmit(true)}
              disabled={saving}
              className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
            >
              Reschedule Anyway
            </button>
          )}
          <button
            onClick={() => handleSubmit(false)}
            disabled={saving}
            className={`px-4 py-2 text-white rounded-lg ${saving ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Zoom Settings Modal
// ---------------------------------------------------------------------------

interface ZoomSettingsModalProps {
  onClose: () => void;
}

interface ZoomCredentialRow {
  id: number;
  school_id: number;
  branch_id: number | null;
  scope: string;
  default_host_email: string;
}

const ZoomSettingsModal: React.FC<ZoomSettingsModalProps> = ({ onClose }) => {
  const { user } = useAuth();
  const currentBranchId = localStorage.getItem('currentBranchId');
  const currentBranchName = localStorage.getItem('currentBranch');
  const hasSpecificBranch = !!currentBranchId && currentBranchName !== 'All';
  // "Shared" only makes sense if this user's own access spans more than one branch —
  // an unset/empty allowed_branches list means unrestricted (e.g. SuperAdmin).
  const branchCount = user?.allowed_branches?.length ?? 0;
  const canSetShared = branchCount === 0 || branchCount > 1;

  const [existing, setExisting] = useState<ZoomCredentialRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [scopeType, setScopeType] = useState<'branch' | 'shared'>(hasSpecificBranch ? 'branch' : 'shared');
  const [accountId, setAccountId] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [defaultHostEmail, setDefaultHostEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const resetForm = () => {
    setEditingId(null);
    setAccountId('');
    setClientId('');
    setClientSecret('');
    setDefaultHostEmail('');
  };

  const handleEditClick = async (row: ZoomCredentialRow) => {
    setError(null);
    setSuccess(null);
    try {
      const res = await api.get(`/online-classes/settings/zoom/${row.id}`);
      const cred = res.data;
      setEditingId(cred.id);
      setAccountId(cred.account_id || '');
      setClientId(cred.client_id || '');
      setClientSecret(''); // never prefilled — blank means "keep existing" on save
      setDefaultHostEmail(cred.default_host_email || '');
      setScopeType(cred.branch_id ? 'branch' : 'shared');
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to load Zoom configuration for editing');
    }
  };

  const handleDeactivate = async (row: ZoomCredentialRow) => {
    if (!window.confirm(`Deactivate the Zoom configuration for ${row.default_host_email}? Classes relying on it will stop being schedulable until a new one is set up.`)) {
      return;
    }
    setDeletingId(row.id);
    setError(null);
    setSuccess(null);
    try {
      await api.delete(`/online-classes/settings/zoom/${row.id}`);
      setSuccess('Zoom configuration deactivated.');
      if (editingId === row.id) resetForm();
      loadExisting();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to deactivate Zoom configuration');
    } finally {
      setDeletingId(null);
    }
  };

    const loadExisting = async () => {
    setLoadingList(true);
    try {
      const res = await api.get('/online-classes/settings/zoom', {
        params: currentBranchId ? { branch_id: Number(currentBranchId) } : {},
      });
      setExisting(res.data || []);
    } catch (e: any) {
      console.error('Failed to load Zoom settings:', e.response?.data || e.message);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    loadExisting();
  }, []);

  const handleSave = async () => {
    const isEditing = editingId !== null;
    // On create, the secret is mandatory. On edit, a blank secret means "keep the existing one".
    if (!accountId.trim() || !clientId.trim() || !defaultHostEmail.trim() || (!isEditing && !clientSecret.trim())) {
      setError('All fields are required.');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (isEditing) {
        const payload: Record<string, any> = {
          account_id: accountId.trim(),
          client_id: clientId.trim(),
          default_host_email: defaultHostEmail.trim(),
        };
        if (clientSecret.trim()) {
          payload.client_secret = clientSecret.trim();
        }
        await api.put(`/online-classes/settings/zoom/${editingId}`, payload);
        setSuccess('Zoom configuration updated successfully.');
      } else {
        const payload: Record<string, any> = {
          account_id: accountId.trim(),
          client_id: clientId.trim(),
          client_secret: clientSecret.trim(),
          default_host_email: defaultHostEmail.trim(),
        };
        if (scopeType === 'branch' && currentBranchId) {
          payload.branch_id = Number(currentBranchId);
        }
        // scopeType === 'shared' -> branch_id omitted entirely -> backend treats as school-wide
        await api.post('/online-classes/settings/zoom', payload);
        setSuccess('Zoom credentials saved successfully.');
      }
      resetForm();
      loadExisting();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to save Zoom credentials');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-lg font-bold text-slate-800">Zoom Settings</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700">✕</button>
        </div>
        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
          )}
          {success && (
            <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">{success}</div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Configured Accounts</h3>
            {loadingList ? (
              <p className="text-sm text-slate-500">Loading...</p>
            ) : existing.length === 0 ? (
              <p className="text-sm text-slate-500">No Zoom account configured yet.</p>
            ) : (
              <div className="border rounded-lg divide-y">
                {existing.map((r) => (
                  <div key={r.id} className="px-3 py-2 text-sm flex items-center justify-between gap-2">
                    <div>
                      <div className="text-slate-700">{r.default_host_email}</div>
                      <div className="text-xs text-slate-500">{r.scope}</div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => handleEditClick(r)}
                        className="px-2 py-1 text-xs border rounded hover:bg-slate-100 text-slate-700"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeactivate(r)}
                        disabled={deletingId === r.id}
                        className="px-2 py-1 text-xs border border-red-200 rounded hover:bg-red-50 text-red-600 disabled:opacity-50"
                      >
                        {deletingId === r.id ? 'Deactivating...' : 'Deactivate'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <hr />

          <h3 className="text-sm font-semibold text-slate-700">
            {editingId !== null ? 'Edit Zoom Account' : 'Add Zoom Account'}
          </h3>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Scope</label>
            <select
              value={scopeType}
              onChange={(e) => setScopeType(e.target.value as 'branch' | 'shared')}
              disabled={editingId !== null}
              className="w-full px-3 py-2 border rounded-lg disabled:bg-slate-100 disabled:text-slate-500"
            >
              <option value="branch" disabled={!hasSpecificBranch}>
                This branch only {!hasSpecificBranch ? '(select a branch first)' : `(${currentBranchName})`}
              </option>
              <option value="shared" disabled={!canSetShared}>
                Shared across whole school {!canSetShared ? '(requires access to more than one branch)' : ''}
              </option>
            </select>
            {editingId !== null && (
              <p className="text-xs text-slate-500 mt-1">Scope can't be changed on an existing configuration — deactivate this one and create a new one instead if it's under the wrong branch/shared scope.</p>
            )}
            {editingId === null && !hasSpecificBranch && (
              <p className="text-xs text-slate-500 mt-1">You're viewing "All Branches" — pick a specific branch from the top bar to configure branch-only Zoom credentials.</p>
            )}
            {editingId === null && !canSetShared && (
              <p className="text-xs text-slate-500 mt-1">Your account only has access to one branch, so you can only configure branch-specific Zoom settings.</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Zoom Account ID *</label>
            <input value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Client ID *</label>
              <input value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Client Secret {editingId !== null ? '' : '*'}
              </label>
              <input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder={editingId !== null ? '•••••• (leave blank to keep existing)' : ''}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Default Host Email *</label>
            <input value={defaultHostEmail} onChange={(e) => setDefaultHostEmail(e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="e.g. admin@school.com" />
          </div>
        </div>
        <div className="p-4 border-t flex justify-end gap-3 bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 border text-slate-700 rounded-lg hover:bg-slate-100">Close</button>
          {editingId !== null && (
            <button onClick={resetForm} className="px-4 py-2 border text-slate-700 rounded-lg hover:bg-slate-100">Cancel Edit</button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className={`px-4 py-2 text-white rounded-lg ${saving ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {saving ? 'Saving...' : editingId !== null ? 'Save Changes' : 'Save Zoom Account'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OnlineClass;