 
import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { ProgressReportData } from '../reportcardtypes';
import api from '../api';
import ReceiptLogo from '../images/Receiptlogo.png'; // fallback logo (same as FeeReceipt)
import RightLogo from '../images/MSEA.png';
 
interface ReportCardProps {
  data: ProgressReportData;
}
 
// ─────────────────────────────────────────────────────────────────────────────
// RIGHT LOGO — static, same on all report cards.
// Change ReceiptLogo import above to point to your actual right-side logo file.
// ─────────────────────────────────────────────────────────────────────────────
const STATIC_RIGHT_LOGO: string = RightLogo;
 
const GRADE_LABELS = ['E', 'D', 'C2', 'C1', 'B2', 'B1', 'A2', 'A1'] as const;
 
const GRADE_HEADER_COLORS: Record<string, string> = {
  E:  '#dc2626', D:  '#dc2626',
  C2: '#ea580c', C1: '#ea580c',
  B2: '#15803d', B1: '#15803d', A2: '#15803d', A1: '#15803d',
};
 
const GRADE_BADGE_COLORS: Record<string, string> = {
  'A+': '#15803d', A1: '#15803d', A2: '#16a34a', A: '#15803d',
  'B+': '#b45309', B1: '#d97706', B2: '#f59e0b', B: '#d97706',
  C:    '#c2410c', C1: '#ea580c', C2: '#f97316',
  D:    '#b91c1c', E:  '#b91c1c',
};
const gradeColor = (g?: string) => GRADE_BADGE_COLORS[g ?? ''] ?? '#6b7280';
 
const calcPct = (num: number, den: number) =>
  den > 0 ? Math.round((num / den) * 100) : 0;
 
const buildGradeCells = (values: number[]): string[] => {
  const thresholds = values.slice(1);
  return GRADE_LABELS.map((_, i) => {
    const lo = i === 0 ? 0 : (thresholds[i - 1] ?? 0) + 1;
    const hi = thresholds[i] ?? 0;
    if (lo === hi) return String(hi);
    return `${lo}–${hi}`;
  });
};
 
const COLOR = {
  navy:    '#1e3a5f',
  purple:  '#4a235a',
  teal:    '#0d6e6e',
  gold:    '#b45309',
  red:     '#b91c1c',
  slate:   '#475569',
  lightBg: '#f8fafc',
  border:  '#e2e8f0',
  white:   '#ffffff',
};
 
const sectionHdr = (color: string): React.CSSProperties => ({
  backgroundColor: color,
  color: COLOR.white,
  padding: '5px 12px',
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.6px',
  textTransform: 'uppercase' as const,
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
});
 
const cell: React.CSSProperties = {
  border: `1px solid ${COLOR.border}`,
  padding: '4px 7px',
  fontSize: '10.5px',
};
 
// ─────────────────────────────────────────────────────────────────────────────
const ReportCard: React.FC<ReportCardProps> = ({ data }) => {
 
  // ── Dynamic branch logo — exact same pattern as FeeReceipt.tsx ──────────────
  // 1. Fetches all branches from /api/branches
  // 2. Finds the branch matching student.branchName
  // 3. Uses branch.school_logo from the DB (served by your Flask backend)
  // 4. Falls back to local ReceiptLogo if no match or no logo in DB
  const [leftLogoUrl, setLeftLogoUrl] = useState<string>(ReceiptLogo);
 
  useEffect(() => {
    if (!data?.student?.branchName) return;
 
    api.get('/branches')
      .then(res => {
        const branches: any[] = res.data.branches || [];
        const match = branches.find(
          b => b.branch_name === data.student.branchName
        );
        const logo = match?.school_logo || ReceiptLogo;
        // Resolve relative path — if logo is '/static/logos/abc.png'
        // make it 'http://yourserver.com/static/logos/abc.png'
        const resolved = typeof logo === 'string' && logo.startsWith('/')
          ? `${window.location.origin}${logo}`
          : logo;
        setLeftLogoUrl(resolved);
      })
      .catch(() => {
        // API failed — silently keep the fallback logo
        setLeftLogoUrl(ReceiptLogo);
      });
  }, [data?.student?.branchName]);
  // ────────────────────────────────────────────────────────────────────────────
 
  if (!data) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af' }}>
        No report data available
      </div>
    );
  }
 
  const {
    student, academicPerformance, DeeniyathData, attendance,
    teacherRemark, gradingScales,
  } = data;
 
  // leftLogoUrl is resolved dynamically above via useEffect + /api/branches
 
  // Grading scale
  const gradingRows = (gradingScales ?? []).filter(
    gs => gs?.values && gs.values.length >= 2
  );
 
  // ── Academic rows — sorted by subject_order from backend, Total/Grade always last ──
  const acadAll      = (academicPerformance ?? []).filter(ap => ap.subject && ap.subject !== '');
  const acadSorted   = [...acadAll]
    .filter(ap => ap.subject !== 'Total/Grade')
    .sort((a, b) => ((a as any).subject_order ?? 999) - ((b as any).subject_order ?? 999));
  const acadTotal    = acadAll.find(ap => ap.subject === 'Total/Grade');
  // acadRows = sorted subjects + Total row at the end (for table rendering)
  const acadRows     = acadTotal ? [...acadSorted, acadTotal] : acadSorted;
  const acadSubjects = acadSorted; // excludes Total/Grade
 
   // ── deeniyath / Deeniyath rows — sorted by subject_order, Total always last ──
  const deeniyathAll      = (DeeniyathData ?? []).filter(h => h.subject && h.subject !== '');
  const deeniyathSorted   = [...deeniyathAll]
    .filter(h => h.subject !== 'Total/Grade')
    .sort((a, b) => ((a as any).subject_order ?? 999) - ((b as any).subject_order ?? 999));
  const deeniyathTotal    = deeniyathAll.find(h => h.subject === 'Total/Grade');
  const deeniyathRows     = deeniyathTotal ? [...deeniyathSorted, deeniyathTotal] : deeniyathSorted;
  const deeniyathSubjects = deeniyathSorted; // excludes Total/Grade
 
  // Marks
  const totalMarks    = acadTotal?.totalMarks ?? acadSubjects.reduce((s, a) => s + a.totalMarks, 0);
  const obtainedMarks = typeof acadTotal?.securedMarks === 'number'
    ? acadTotal.securedMarks
    : acadSubjects.reduce((s, a) => s + Number(a.securedMarks), 0);
  const finalPct   = calcPct(obtainedMarks, totalMarks);
 
  // Attendance
  const attSummary = attendance?.summary;
  const attPct     = attSummary?.presentPercentage
    ?? calcPct(attSummary?.presentCount ?? 0, attSummary?.totalCount ?? 1);
 
  // Title
  const titleParts = (data.reportTitle ?? '').split(' OF ');
  const mainTitle  = titleParts[0] || 'PROGRESS REPORT';
  const subTitle   = titleParts.slice(1).join(' OF ') || '';
 
  return (
    <div
      className="report-card-container"
      style={{
        width: '100%',
        maxWidth: '920px',
        margin: '0 auto',
        fontFamily: "'Segoe UI', Tahoma, Geneva, sans-serif",
        fontSize: '12px',
        border: `2px solid ${COLOR.navy}`,
        borderRadius: '6px',
        overflow: 'hidden',
        backgroundColor: COLOR.white,
        // pageBreakAfter: 'always',
      }}
    >
 
      {/* ══════════════════════════════════════════════════════════════
          HEADER
      ══════════════════════════════════════════════════════════════ */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 16px',
        borderBottom: `3px solid ${COLOR.navy}`,
        background: 'linear-gradient(135deg, #f0f4ff 0%, #ffffff 50%, #f0f4ff 100%)',
      }}>
        {/* ── LEFT: branch-specific logo (from BRANCH_LOGO_MAP, key = student.branchName) ── */}
        <img
          src={leftLogoUrl}
          alt="Branch Logo"
          style={{ height: '62px', width: 'auto', objectFit: 'contain' }}
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
 
        {/* ── CENTRE: report title ── */}
        <div style={{ textAlign: 'center', flex: 1, padding: '0 12px' }}>
          <div style={{
            fontSize: '20px', fontWeight: 800, color: COLOR.navy,
            letterSpacing: '1px', lineHeight: 1.2, textTransform: 'uppercase',
          }}>
            {mainTitle}
          </div>
          {subTitle && (
            <div style={{
              fontSize: '13px', fontWeight: 700, color: COLOR.red,
              letterSpacing: '1.5px', textDecoration: 'underline',
              marginTop: '3px', textTransform: 'uppercase',
            }}>
              {subTitle}
            </div>
          )}
        </div>
 
        {/* ── RIGHT: static logo — same on every report card (STATIC_RIGHT_LOGO) ── */}
        <img
          src={STATIC_RIGHT_LOGO}
          alt="MS LearnSpace"
          style={{ height: '62px', width: 'auto', objectFit: 'contain' }}
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      </div>
 
      {/* ══════════════════════════════════════════════════════════════
          ROW 1 — Student Details (2-column split)
      ══════════════════════════════════════════════════════════════ */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        borderBottom: `1px solid ${COLOR.border}`,
        backgroundColor: '#fafbff',
      }}>
        <div style={{ padding: '10px 16px', borderRight: `1px solid ${COLOR.border}` }}>
          {([
            ['Student Name',  student?.studentName],
            ["Father's Name", student?.fathersName],
            ['Academic Year', student?.academicYear],
          ] as [string, string][]).map(([label, value]) => (
            <InfoRow key={label} label={label} value={value} />
          ))}
        </div>
        <div style={{ padding: '10px 16px' }}>
          {([
            ['Group',           student?.groupRollNo?.split('/')[0] ?? student?.groupRollNo],
            ['Class / Section', student?.classSection],
            ['Branch',          student?.branchName],
          ] as [string, string][]).map(([label, value]) => (
            <InfoRow key={label} label={label} value={value} />
          ))}
        </div>
      </div>
 
      {/* ══════════════════════════════════════════════════════════════
          ROW 2 — Academic Performance + Pie Chart
      ══════════════════════════════════════════════════════════════ */}
      {acadSubjects.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          borderBottom: `1px solid ${COLOR.border}`,
        }}>
          {/* Academic Table */}
          <div style={{ borderRight: `1px solid ${COLOR.border}` }}>
            <div style={sectionHdr(COLOR.navy)}>
              <Dot color="#93c5fd" /> Academic Performance
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr style={{ backgroundColor: '#eef2ff' }}>
                  {['Subjects', 'Total Marks', 'Obtained Marks', 'Grade'].map(h => (
                    <th key={h} style={{ ...cell, fontWeight: 700, color: COLOR.navy, textAlign: 'left', backgroundColor: '#eef2ff' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {acadRows.map((ap, i) => {
                  const isTotal = ap.subject === 'Total/Grade';
                  return (
                    <tr key={i} style={{
                      backgroundColor: isTotal ? '#f0f9ff' : (i % 2 === 0 ? COLOR.white : COLOR.lightBg),
                      fontWeight: isTotal ? 700 : 400,
                      borderTop: isTotal ? `2px solid ${COLOR.navy}` : undefined,
                    }}>
                      <td style={{ ...cell, color: isTotal ? COLOR.navy : '#1f2937' }}>
                        {isTotal ? 'Total' : ap.subject}
                      </td>
                      <td style={{ ...cell, textAlign: 'center' }}>{ap.totalMarks}</td>
                      <td style={{ ...cell, textAlign: 'center' }}>{ap.securedMarks}</td>
                      <td style={{ ...cell, textAlign: 'center' }}>
                        {isTotal ? (
                          <span style={{ fontWeight: 700, color: gradeColor(ap.grade) }}>
                            {ap.grade} ({finalPct}%)
                          </span>
                        ) : (
                          <GradeBadge grade={ap.grade} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
 
          {/* Academic Bar Chart */}
        <div>
        <div style={sectionHdr(COLOR.teal)}>
            <Dot color="#6ee7b7" /> Subject Performance Visual
        </div>
 
        <div
            style={{
            padding: '10px',
            height: '250px',
            display: 'flex',
            justifyContent: 'left',
            alignItems: 'center',
            }}
        >
            <ResponsiveContainer width="85%" height="100%">
            <BarChart
                data={acadSubjects.map(ap => ({
                name: ap.subject,
                'Total Marks': ap.totalMarks,
                'Secured Marks': Number(ap.securedMarks) || 0,
                }))}
                barSize={24}
                margin={{ left: 0, right: 6, top: 4, bottom: 20 }}
            >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
 
                <XAxis
                dataKey="name"
                fontSize={9}
                interval={0}
                angle={-20}
                textAnchor="end"
                />
 
                <YAxis fontSize={9} />
 
                <Tooltip />
 
                <Bar
                dataKey="Total Marks"
                fill="#1d4ed8"
                radius={[3, 3, 0, 0]}
                />
 
                <Bar
                dataKey="Secured Marks"
                fill="#16a34a"
                radius={[3, 3, 0, 0]}
                />
            </BarChart>
            </ResponsiveContainer>
        </div>
 
        {/* Result Percentage */}
        <div
            style={{
            textAlign: 'center',
            paddingBottom: '10px',
            fontSize: '15px',
            fontWeight: 800,
            color: COLOR.navy,
            }}
        >
            Result: {finalPct}%
        </div>
        </div>
 
        </div>
      )}
 
      {/* ══════════════════════════════════════════════════════════════
          ROW 3 — Deeniyath Table + Bar Chart (only if has subjects)
      ══════════════════════════════════════════════════════════════ */}
      {deeniyathSubjects.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          borderBottom: `1px solid ${COLOR.border}`,
        }}>
          {/* Deeniyath Table */}
          <div style={{ borderRight: `1px solid ${COLOR.border}` }}>
            <div style={sectionHdr(COLOR.purple)}>
              <Dot color="#d8b4fe" /> Deeniyath Report
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr style={{ backgroundColor: '#faf5ff' }}>
                  {['Subject', 'Total', 'Secured', 'Grade'].map(h => (
                    <th key={h} style={{ ...cell, fontWeight: 700, color: COLOR.purple, textAlign: 'left', backgroundColor: '#faf5ff' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deeniyathRows.map((h, i) => {
                  const isTotal = h.subject === 'Total/Grade';
                  return (
                    <tr key={i} style={{
                      backgroundColor: isTotal ? '#faf5ff' : (i % 2 === 0 ? COLOR.white : COLOR.lightBg),
                      fontWeight: isTotal ? 700 : 400,
                      borderTop: isTotal ? `2px solid ${COLOR.purple}` : undefined,
                    }}>
                      <td style={{ ...cell, color: isTotal ? COLOR.purple : '#1f2937' }}>
                        {isTotal ? 'Total' : h.subject}
                      </td>
                      <td style={{ ...cell, textAlign: 'center' }}>{h.totalMarks}</td>
                      <td style={{ ...cell, textAlign: 'center' }}>{h.securedMarks}</td>
                      <td style={{ ...cell, textAlign: 'center' }}><GradeBadge grade={h.grade} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
 
          {/* Deeniyath Pie Chart */}
            <div>
            <div style={sectionHdr('#0d6e6e')}>
                <Dot color="#99f6e4" /> Deeniyath Performance
            </div>
 
            <div
                style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px',
                height: '230px',
                position: 'relative',
                }}
            >
                <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                    <Pie
                    data={deeniyathSubjects.map(h => ({
                        name: h.subject,
                        value:
                        h.totalMarks > 0
                            ? Math.round(
                                (Number(h.securedMarks) / h.totalMarks) * 100
                            )
                            : 0,
                        color: h.color ?? '#0fbe53',
                    }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={46}
                    outerRadius={72}
                    dataKey="value"
                    startAngle={90}
                    endAngle={-270}
                    >
                    {deeniyathSubjects.map((h, i) => (
                        <Cell
                        key={i}
                        fill={
                            h.color ??
                            ['#7c3aed', '#16a34a', '#ea580c', '#2563eb', '#dc2626', '#0fbe53'][i % 6]
                        }
                        />
                    ))}
                    </Pie>
 
                    <Tooltip formatter={(v: any) => `${v}%`} />
                </PieChart>
                </ResponsiveContainer>
 
                {/* Center Label */}
                <div
                style={{
                    position: 'absolute',
                    top: '42%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    textAlign: 'center',
                    pointerEvents: 'none',
                }}
                >
                <div
                    style={{
                    fontSize: '15px',
                    fontWeight: 800,
                    color: COLOR.purple,
                    }}
                >
                   
                </div>
                </div>
 
                {/* Legend */}
                <div
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '6px',
                    justifyContent: 'center',
                    fontSize: '9.5px',
                    marginTop: '4px',
                }}
                >
                {deeniyathSubjects.map((h, i) => {
                    const pct =
                    h.totalMarks > 0
                        ? Math.round(
                            (Number(h.securedMarks) / h.totalMarks) * 100
                        )
                        : 0;
 
                    const clr =
                    h.color ??
                    ['#7c3aed', '#16a34a', '#ea580c', '#2563eb', '#dc2626', '#0fbe53'][i % 6  ];
 
                    return (
                    <span
                        key={i}
                        style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                        }}
                    >
                        <span
                        style={{
                            width: 9,
                            height: 9,
                            borderRadius: '2px',
                            backgroundColor: clr,
                            display: 'inline-block',
                            flexShrink: 0,
                        }}
                        />
 
                        {h.subject}: {pct}%
                    </span>
                    );
                })}
                </div>
            </div>
            </div>
 
        </div>
      )}
 
      {/* ══════════════════════════════════════════════════════════════
          ROW 4 — ATTENDANCE TRACK  full width horizontal
          No split box. Progress bar + stats on one line.
          Monthly table below spanning full width.
      ══════════════════════════════════════════════════════════════ */}
      <div style={{ borderBottom: `1px solid ${COLOR.border}` }}>
        <div style={sectionHdr(COLOR.navy)}>
          <Dot color="#93c5fd" /> Attendance Track
        </div>
        <div style={{ padding: '10px 16px' }}>
 
          {/* ── Line 1: progress bar + summary stats side by side ── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '10px',
          }}>
            {/* Progress bar */}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '10.5px' }}>
                <span style={{ fontWeight: 600, color: COLOR.slate }}>Overall Attendance Percentage</span>
                <span style={{ fontWeight: 700, color: COLOR.navy }}>{attPct}%</span>
              </div>
              <div style={{ height: '10px', borderRadius: '5px', backgroundColor: '#e2e8f0', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.min(attPct, 100)}%`,
                  borderRadius: '5px',
                  background: 'linear-gradient(90deg, #3b82f6 0%, #1d4ed8 100%)',
                }} />
              </div>
            </div>
 
            {/* Stats inline — no separate box */}
            <div style={{ display: 'flex', gap: '16px', fontSize: '10px', fontWeight: 700, flexShrink: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: 10, height: 10, backgroundColor: '#4ade80', display: 'inline-block', borderRadius: '2px' }} />
                PRESENT: {attSummary?.presentCount ?? 0} ({attSummary?.presentPercentage ?? 0}%)
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: 10, height: 10, backgroundColor: '#f87171', display: 'inline-block', borderRadius: '2px' }} />
                ABSENT: {attSummary?.absentCount ?? 0} ({attSummary?.absentPercentage ?? 0}%)
              </span>
              <span style={{ color: COLOR.navy }}>
                TOTAL: {attSummary?.totalCount ?? 0}
              </span>
            </div>
          </div>
 
          {/* ── Monthly attendance table — full width with Total column at end ── */}
          {attendance?.monthly && attendance.monthly.length > 0 && (
            <>
              <div style={{ fontSize: '10px', fontWeight: 700, color: COLOR.red, marginBottom: '4px' }}>
                MONTHLY ATTENDANCE
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#dbeafe' }}>
                    {/* Row label column */}
                    <td style={{ ...cell, fontWeight: 700, width: '70px', fontSize: '9px' }}></td>
                    {/* One column per month */}
                    {attendance.monthly.map((m, i) => (
                      <td key={i} style={{ ...cell, textAlign: 'center', fontWeight: 700 }}>{m.month}</td>
                    ))}
                    {/* Total column header */}
                    <td style={{
                      ...cell,
                      textAlign: 'center',
                      fontWeight: 700,
                      backgroundColor: '#1e3a5f',
                      color: '#ffffff',
                      fontSize: '9px',
                    }}>
                      TOTAL
                    </td>
                  </tr>
                </thead>
                <tbody>
                  {(['total', 'present', 'absent'] as const).map((key, ri) => {
                    // Sum across all months for this row
                    const rowSum = attendance.monthly!.reduce(
                      (acc, m) => acc + (Number(m[key]) || 0), 0
                    );
                    const labelColor =
                      key === 'present' ? '#15803d' :
                      key === 'absent'  ? '#b91c1c' :
                      COLOR.slate;
                    return (
                      <tr key={key} style={{ backgroundColor: ri % 2 === 0 ? COLOR.lightBg : COLOR.white }}>
                        {/* Row label */}
                        <td style={{
                          ...cell,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          fontSize: '9px',
                          color: labelColor,
                        }}>
                          {key}
                        </td>
                        {/* Monthly values */}
                        {attendance.monthly!.map((m, i) => (
                          <td key={i} style={{ ...cell, textAlign: 'center' }}>{m[key] ?? 0}</td>
                        ))}
                        {/* Total cell — bold, highlighted */}
                        <td style={{
                          ...cell,
                          textAlign: 'center',
                          fontWeight: 700,
                          backgroundColor: key === 'present' ? '#dcfce7' :
                                           key === 'absent'  ? '#fee2e2' :
                                           '#eff6ff',
                          color: labelColor,
                        }}>
                          {rowSum}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
 
      {/* ══════════════════════════════════════════════════════════════
          ROW 5 — GRADING SCALE  full width (above teacher remarks)
      ══════════════════════════════════════════════════════════════ */}
      <div style={{ borderBottom: `1px solid ${COLOR.border}` }}>
        <div style={sectionHdr(COLOR.gold)}>
          <Dot color="#fde68a" /> Grading Scale
        </div>
        <div style={{ padding: '8px 14px' }}>
          {gradingRows.length === 0 ? (
            <div style={{ color: '#9ca3af', fontSize: '11px', padding: '6px 0' }}>
              Grading scale not available
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5px' }}>
              <thead>
                <tr>
                  <th style={{
                    ...cell,
                    backgroundColor: '#374151', color: COLOR.white,
                    fontWeight: 700, textAlign: 'center', width: '70px',
                  }}>
                    Max Marks
                  </th>
                  {GRADE_LABELS.map(g => (
                    <th key={g} style={{
                      ...cell,
                      backgroundColor: GRADE_HEADER_COLORS[g],
                      color: COLOR.white, fontWeight: 700, textAlign: 'center',
                    }}>
                      {g}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gradingRows.map((scale, si) => {
                  const cells = buildGradeCells(scale.values);
                  return (
                    <tr key={si} style={{ backgroundColor: si % 2 === 0 ? COLOR.lightBg : COLOR.white }}>
                      <td style={{ ...cell, textAlign: 'center', fontWeight: 700, color: COLOR.navy }}>
                        {scale.label}
                      </td>
                      {cells.map((c, ci) => (
                        <td key={ci} style={{ ...cell, textAlign: 'center', color: '#374151' }}>{c}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
 
      {/* ══════════════════════════════════════════════════════════════
          ROW 6 — TEACHER REMARKS  full width horizontal (one row)
      ══════════════════════════════════════════════════════════════ */}
      <div style={{ borderBottom: `1px solid ${COLOR.border}` }}>
        <div style={sectionHdr(COLOR.navy)}>
          <Dot color="#93c5fd" /> Teacher Remarks
        </div>
        <div style={{ padding: '10px 16px', minHeight: '50px' }}>
          <p style={{
            margin: 0,
            color: '#374151',
            fontStyle: 'italic',
            lineHeight: 1.8,
            fontSize: '11px',
          }}>
            {teacherRemark ? `"${teacherRemark}"` : ''}
          </p>
        </div>
      </div>
 
      {/* ══════════════════════════════════════════════════════════════
          SIGNATURE FOOTER
      ══════════════════════════════════════════════════════════════ */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
        padding: '16px 40px 14px', gap: '16px',
        backgroundColor: '#fafbff',
      }}>
        {['Signature of Parent', 'Signature of Teacher', 'Signature of Principal'].map(label => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ borderBottom: '1.5px dotted #94a3b8', marginBottom: '8px', height: '40px' }} />
            <span style={{ fontSize: '10.5px', fontWeight: 700, color: COLOR.navy }}>{label}</span>
          </div>
        ))}
      </div>
 
    </div>
  );
};
 
// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
 
const Dot: React.FC<{ color: string }> = ({ color }) => (
  <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color, display: 'inline-block', flexShrink: 0 }} />
);
 
const InfoRow: React.FC<{ label: string; value?: string }> = ({ label, value }) => (
  <div style={{ display: 'flex', gap: '8px', marginBottom: '5px', fontSize: '11.5px' }}>
    <span style={{ color: '#374151', fontWeight: 600, minWidth: '110px', flexShrink: 0 }}>{label}</span>
    <span style={{ color: '#111827' }}>: {value || '—'}</span>
  </div>
);
 
const GradeBadge: React.FC<{ grade?: string }> = ({ grade }) => {
  if (!grade || grade === '-') return <span style={{ color: '#9ca3af' }}>—</span>;
  const color = gradeColor(grade);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: '26px', height: '26px', borderRadius: '50%',
      backgroundColor: color, color: '#fff', fontSize: '9px', fontWeight: 700,
    }}>
      {grade}
    </span>
  );
};
 
export default ReportCard;
 
 