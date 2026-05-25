import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { ProgressReportData } from '../reportcardtypes';

interface ReportCardProps {
  data: ProgressReportData;
}

// ─────────────────────────────────────────────────────────────────────────────
// BRANCH LOGO MAP
// LEFT logo  → branch-specific (looked up by data.student.branchName)
// RIGHT logo → always the static MS-HIFZ Academy logo (never changes)
// ─────────────────────────────────────────────────────────────────────────────
const BRANCH_LOGO_MAP: Record<string, string> = {
  'Main Campus': 'https://mshifzacademy.com/assets/images/ms-logo.jpg',
  'Murad Nagar': 'https://mshifzacademy.com/assets/images/ms-logo.jpg',
  '__default__': 'https://mshifzacademy.com/assets/images/ms-logo.jpg',
};

const STATIC_RIGHT_LOGO = 'https://mshifzacademy.com/assets/images/ms-logo.jpg';

// ─────────────────────────────────────────────────────────────────────────────
// GRADE CONFIG
// Backend builds values as [0, maxE, maxD, maxC2, maxC1, maxB2, maxB1, maxA2, maxA1]
// ─────────────────────────────────────────────────────────────────────────────
const GRADE_LABELS = ['E', 'D', 'C2', 'C1', 'B2', 'B1', 'A2', 'A1'] as const;

const GRADE_HEADER_COLORS: Record<string, string> = {
  E:  '#dc2626',
  D:  '#dc2626',
  C2: '#ea580c',
  C1: '#ea580c',
  B2: '#15803d',
  B1: '#15803d',
  A2: '#15803d',
  A1: '#15803d',
};

const GRADE_BADGE_COLORS: Record<string, string> = {
  'A+': '#15803d', A1: '#15803d', A2: '#16a34a', A: '#15803d',
  'B+': '#b45309', B1: '#d97706', B2: '#f59e0b', B: '#d97706',
  C:    '#c2410c', C1: '#ea580c', C2: '#f97316',
  D:    '#b91c1c', E:  '#b91c1c',
};
const gradeColor = (g?: string) => GRADE_BADGE_COLORS[g ?? ''] ?? '#6b7280';

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// STYLE TOKENS
// ─────────────────────────────────────────────────────────────────────────────
const COLOR = {
  navy:       '#1e3a5f',
  purple:     '#4a235a',
  teal:       '#0d6e6e',
  gold:       '#b45309',
  red:        '#b91c1c',
  slate:      '#475569',
  lightBg:    '#f8fafc',
  border:     '#e2e8f0',
  white:      '#ffffff',
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
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
const ReportCard: React.FC<ReportCardProps> = ({ data }) => {
  if (!data) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af' }}>
        No report data available
      </div>
    );
  }

  const {
    student, academicPerformance, hifzData, attendance,
    teacherRemark, hifzTargetLevel, gradingScales,
  } = data;

  // ── Logo resolution ────────────────────────────────────────────────────────
  const branchKey   = student?.branchName ?? '';
  const leftLogoUrl = BRANCH_LOGO_MAP[branchKey] ?? BRANCH_LOGO_MAP['__default__'];

  // ── Grading scale rows ─────────────────────────────────────────────────────
  const gradingRows = (gradingScales ?? []).filter(
    gs => gs?.values && gs.values.length >= 2
  );

  // ── Academic rows ──────────────────────────────────────────────────────────
  const acadRows     = (academicPerformance ?? []).filter(ap => ap.subject && ap.subject !== '');
  const acadSubjects = acadRows.filter(ap => ap.subject !== 'Total/Grade');
  const acadTotal    = acadRows.find(ap => ap.subject === 'Total/Grade');

  const pieData = acadSubjects.map(ap => ({
    name:  ap.subject,
    value: ap.totalMarks > 0 ? Math.round((Number(ap.securedMarks) / ap.totalMarks) * 100) : 0,
    color: ap.color ?? '#6b7280',
  }));

  // ── Deeniyath (HIFZ) rows ──────────────────────────────────────────────────
  const hifzRows     = (hifzData ?? []).filter(h => h.subject && h.subject !== '');
  const hifzSubjects = hifzRows.filter(h => h.subject !== 'Total/Grade');

  // ── Marks summary ──────────────────────────────────────────────────────────
  const totalMarks    = acadTotal?.totalMarks ?? acadSubjects.reduce((s, a) => s + a.totalMarks, 0);
  const obtainedMarks = typeof acadTotal?.securedMarks === 'number'
    ? acadTotal.securedMarks
    : acadSubjects.reduce((s, a) => s + Number(a.securedMarks), 0);
  const finalPct   = calcPct(obtainedMarks, totalMarks);
  const finalGrade = acadTotal?.grade ?? '-';

  // ── Attendance ─────────────────────────────────────────────────────────────
  const attSummary = attendance?.summary;
  const attPct     = attSummary?.presentPercentage
    ?? calcPct(attSummary?.presentCount ?? 0, attSummary?.totalCount ?? 1);

  // ── Target level chart ─────────────────────────────────────────────────────
  const targetData = (hifzTargetLevel ?? []).map((d: any) => ({
    month:  d.month,
    target: d.targetParas ?? 0,
    actual: d.actualParas ?? 0,
  }));

  // ── Title parsing ──────────────────────────────────────────────────────────
  const titleParts = (data.reportTitle ?? '').split(' OF ');
  const mainTitle  = titleParts[0] || 'PROGRESS REPORT';
  const subTitle   = titleParts.slice(1).join(' OF ') || '';

  // ─────────────────────────────────────────────────────────────────────────
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
        pageBreakAfter: 'always',
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
        background: `linear-gradient(135deg, #f0f4ff 0%, #ffffff 50%, #f0f4ff 100%)`,
      }}>
        <img
          src={leftLogoUrl}
          alt="Branch Logo"
          style={{ height: '62px', width: 'auto', objectFit: 'contain' }}
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />

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

        <img
          src={STATIC_RIGHT_LOGO}
          alt="MS Education Academy"
          style={{ height: '62px', width: 'auto', objectFit: 'contain' }}
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      </div>

      {/* ══════════════════════════════════════════════════════════════
          ROW 1 — Student Details (2-column split like PDF)
      ══════════════════════════════════════════════════════════════ */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        borderBottom: `1px solid ${COLOR.border}`,
        backgroundColor: '#fafbff',
      }}>
        {/* LEFT column */}
        <div style={{ padding: '10px 16px', borderRight: `1px solid ${COLOR.border}` }}>
          {([
            ['Student Name',  student?.studentName],
            ["Father's Name", student?.fathersName],  
            ['Academic Year', student?.academicYear],
          ] as [string, string][]).map(([label, value]) => (
            <InfoRow key={label} label={label} value={value} />
          ))}
        </div>
        {/* RIGHT column */}
        <div style={{ padding: '10px 16px' }}>
          {([
            ['Group',          student?.groupRollNo?.split('/')[0] ?? student?.groupRollNo],
            ['Class / Section',student?.classSection],
            ['Branch',         student?.branchName],
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
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          borderBottom: `1px solid ${COLOR.border}`,
        }}>
          {/* Academic Table */}
          <div style={{ borderRight: `1px solid ${COLOR.border}` }}>
            <div style={sectionHdr(COLOR.navy)}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#93c5fd', display: 'inline-block' }} />
              Academic Performance
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr style={{ backgroundColor: '#eef2ff' }}>
                  {['Subjects', 'Total Marks', 'Obtained Marks', 'Grade'].map(h => (
                    <th key={h} style={{
                      ...cell,
                      fontWeight: 700,
                      color: COLOR.navy,
                      textAlign: 'left',
                      backgroundColor: '#eef2ff',
                    }}>{h}</th>
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
                        {ap.subject === 'Total/Grade' ? 'Total' : ap.subject}
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

          {/* Pie Chart */}
          <div>
            <div style={sectionHdr(COLOR.teal)}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#6ee7b7', display: 'inline-block' }} />
              Subject Performance Visual
            </div>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '8px',
              height: '230px',
              position: 'relative',
            }}>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%" cy="50%"
                    innerRadius={46} outerRadius={72}
                    dataKey="value"
                    startAngle={90} endAngle={-270}
                  >
                    {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => `${v}%`} />
                </PieChart>
              </ResponsiveContainer>
              {/* Centre label */}
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -62%)',
                textAlign: 'center',
                pointerEvents: 'none',
              }}>
                <div style={{ fontSize: '16px', fontWeight: 800, color: COLOR.navy }}>{finalPct}%</div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center', fontSize: '9.5px', marginTop: '4px' }}>
                {pieData.map((e, i) => (
                  <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <span style={{
                      width: 9, height: 9, borderRadius: '2px',
                      backgroundColor: e.color, display: 'inline-block', flexShrink: 0,
                    }} />
                    {e.name}: {e.value}%
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          ROW 3 — Grading Scale (replacing Tarbiyah)
      ══════════════════════════════════════════════════════════════ */}
      <div style={{ borderBottom: `1px solid ${COLOR.border}` }}>
        <div style={sectionHdr(COLOR.gold)}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#fde68a', display: 'inline-block' }} />
          Grading Scale
        </div>
        <div style={{ padding: '10px 14px' }}>
          {gradingRows.length === 0 ? (
            <div style={{ color: '#9ca3af', fontSize: '11px', padding: '8px' }}>
              Grading scale not available
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5px' }}>
              <thead>
                <tr>
                  <th style={{
                    ...cell,
                    backgroundColor: '#374151',
                    color: COLOR.white,
                    fontWeight: 700,
                    textAlign: 'center',
                    width: '60px',
                  }}>
                    Max Marks
                  </th>
                  {GRADE_LABELS.map(g => (
                    <th key={g} style={{
                      ...cell,
                      backgroundColor: GRADE_HEADER_COLORS[g],
                      color: COLOR.white,
                      fontWeight: 700,
                      textAlign: 'center',
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
                        <td key={ci} style={{ ...cell, textAlign: 'center', color: '#374151' }}>
                          {c}
                        </td>
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
          ROW 4 — Deeniyath (HIFZ renamed) Table + Bar Chart
      ══════════════════════════════════════════════════════════════ */}
      {hifzSubjects.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          borderBottom: `1px solid ${COLOR.border}`,
        }}>
          {/* Deeniyath Table */}
          <div style={{ borderRight: `1px solid ${COLOR.border}` }}>
            <div style={sectionHdr(COLOR.purple)}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#d8b4fe', display: 'inline-block' }} />
              Deeniyath Report
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr style={{ backgroundColor: '#faf5ff' }}>
                  {['Subject', 'Total', 'Secured', 'Grade'].map(h => (
                    <th key={h} style={{
                      ...cell,
                      fontWeight: 700,
                      color: COLOR.purple,
                      textAlign: 'left',
                      backgroundColor: '#faf5ff',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hifzRows.map((h, i) => {
                  const isTotal = h.subject === 'Total/Grade';
                  return (
                    <tr key={i} style={{
                      backgroundColor: isTotal ? '#faf5ff' : (i % 2 === 0 ? COLOR.white : COLOR.lightBg),
                      fontWeight: isTotal ? 700 : 400,
                      borderTop: isTotal ? `2px solid ${COLOR.purple}` : undefined,
                    }}>
                      <td style={{ ...cell, color: isTotal ? COLOR.purple : '#1f2937' }}>
                        {h.subject === 'Total/Grade' ? 'Total' : h.subject}
                      </td>
                      <td style={{ ...cell, textAlign: 'center' }}>{h.totalMarks}</td>
                      <td style={{ ...cell, textAlign: 'center' }}>{h.securedMarks}</td>
                      <td style={{ ...cell, textAlign: 'center' }}>
                        <GradeBadge grade={h.grade} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Deeniyath Bar Chart */}
          <div>
            <div style={sectionHdr('#0d6e6e')}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#99f6e4', display: 'inline-block' }} />
              Deeniyath Performance
            </div>
            <div style={{ padding: '8px', height: '220px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={hifzSubjects.map(h => ({
                    name: h.subject,
                    'Total Marks':   h.totalMarks,
                    'Secured Marks': Number(h.securedMarks) || 0,
                  }))}
                  barSize={24}
                  margin={{ left: 0, right: 8, top: 4, bottom: 28 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" fontSize={9} interval={0} angle={-20} textAnchor="end" />
                  <YAxis fontSize={9} />
                  <Tooltip />
                  <Bar dataKey="Total Marks"   fill="#c4b5fd" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Secured Marks" fill="#7c3aed" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          ROW 5 — Attendance Track + Deeniyath Target Level
      ══════════════════════════════════════════════════════════════ */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        borderBottom: `1px solid ${COLOR.border}`,
      }}>
        {/* Attendance Track */}
        <div style={{ borderRight: `1px solid ${COLOR.border}` }}>
          <div style={sectionHdr(COLOR.navy)}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#93c5fd', display: 'inline-block' }} />
            Attendance Track
          </div>
          <div style={{ padding: '12px 14px' }}>
            {/* Progress bar */}
            <div style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '10.5px' }}>
                <span style={{ fontWeight: 600, color: COLOR.slate }}>Overall Attendance Percentage</span>
                <span style={{ fontWeight: 700, color: COLOR.navy }}>{attPct}%</span>
              </div>
              <div style={{
                height: '10px', borderRadius: '5px',
                backgroundColor: '#e2e8f0', overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  width: `${attPct}%`,
                  borderRadius: '5px',
                  background: `linear-gradient(90deg, #3b82f6 0%, #1d4ed8 100%)`,
                  transition: 'width 0.3s ease',
                }} />
              </div>
            </div>

            {/* Monthly attendance table */}
            {attendance?.monthly && attendance.monthly.length > 0 && (
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, color: COLOR.red, marginBottom: '4px' }}>
                  MONTHLY ATTENDANCE
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9.5px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#dbeafe' }}>
                      <td style={{ ...cell, fontWeight: 700, fontSize: '9px' }}></td>
                      {attendance.monthly.map((m, i) => (
                        <td key={i} style={{ ...cell, textAlign: 'center', fontWeight: 700 }}>{m.month}</td>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(['total', 'present', 'absent'] as const).map(key => (
                      <tr key={key}>
                        <td style={{
                          ...cell,
                          fontWeight: 700,
                          backgroundColor: COLOR.lightBg,
                          textTransform: 'uppercase',
                          fontSize: '9px',
                          color: COLOR.slate,
                        }}>
                          {key}
                        </td>
                        {attendance.monthly!.map((m, i) => (
                          <td key={i} style={{ ...cell, textAlign: 'center' }}>{m[key] ?? 0}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Legend */}
            <div style={{ display: 'flex', gap: '14px', fontSize: '9.5px', fontWeight: 600, marginTop: '8px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: 10, height: 10, backgroundColor: '#4ade80', display: 'inline-block', borderRadius: '2px' }} />
                PRESENT: {attSummary?.presentCount ?? 0} ({attSummary?.presentPercentage ?? 0}%)
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: 10, height: 10, backgroundColor: '#f87171', display: 'inline-block', borderRadius: '2px' }} />
                ABSENT: {attSummary?.absentCount ?? 0} ({attSummary?.absentPercentage ?? 0}%)
              </span>
              <span style={{ color: COLOR.navy }}>TOTAL: {attSummary?.totalCount ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Deeniyath Target Level (was HIFZ Target Level) */}
        <div>
          <div style={sectionHdr(COLOR.purple)}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#d8b4fe', display: 'inline-block' }} />
            Deeniyath Target Level (Monthly Progress)
          </div>
          <div style={{ padding: '8px', height: '200px' }}>
            {targetData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={targetData}
                  barSize={14}
                  margin={{ left: 0, right: 8, top: 4, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="month" fontSize={9}
                    label={{ value: 'MONTHS', position: 'insideBottom', offset: -8, fontSize: 9 }}
                  />
                  <YAxis
                    fontSize={9}
                    label={{ value: 'PARAS', angle: -90, position: 'insideLeft', fontSize: 9 }}
                  />
                  <Tooltip />
                  <Bar dataKey="target" name="Target"             fill="#4a235a" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="actual" name="Student Performance" fill="#ef4444" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '100%', color: '#9ca3af', fontSize: '11px',
              }}>
                No target data available
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          ROW 6 — Attendance Summary | Marks Summary | Teacher Remarks
      ══════════════════════════════════════════════════════════════ */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 2fr',
        borderBottom: `1px solid ${COLOR.border}`,
      }}>
        {/* Attendance Summary */}
        <div style={{ borderRight: `1px solid ${COLOR.border}` }}>
          <div style={sectionHdr('#0369a1')}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#bae6fd', display: 'inline-block' }} />
            Attendance Summary
          </div>
          <div style={{ padding: '8px 12px' }}>
            {([
              ['Total Working Days', attSummary?.totalCount ?? '—'],
              ['Present Days',       attSummary?.presentCount ?? '—'],
              ['Absent Days',        attSummary?.absentCount ?? '—'],
            ] as [string, string | number][]).map(([label, value]) => (
              <SummaryRow key={label} label={label} value={String(value)} />
            ))}
          </div>
        </div>

        {/* Marks Summary */}
        <div style={{ borderRight: `1px solid ${COLOR.border}` }}>
          <div style={sectionHdr(COLOR.teal)}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#6ee7b7', display: 'inline-block' }} />
            Marks Summary
          </div>
          <div style={{ padding: '8px 12px' }}>
            {([
              ['Total Marks',     totalMarks],
              ['Obtained Marks',  obtainedMarks],
              ['Final Percentage',`${finalPct}%`],
              ['Final Grade',     finalGrade],
            ] as [string, string | number][]).map(([label, value]) => (
              <SummaryRow
                key={label}
                label={label}
                value={String(value)}
                highlight={label === 'Final Grade'}
                grade={label === 'Final Grade' ? finalGrade : undefined}
              />
            ))}
          </div>
        </div>

        {/* Teacher Remarks */}
        <div>
          <div style={sectionHdr(COLOR.navy)}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#93c5fd', display: 'inline-block' }} />
            Teacher Remarks
          </div>
          <div style={{ padding: '10px 14px' }}>
            <p style={{
              margin: 0,
              color: '#374151',
              fontStyle: 'italic',
              lineHeight: 1.7,
              fontSize: '11px',
              minHeight: '60px',
            }}>
              {teacherRemark
                ? `"${teacherRemark}"`
                : 'No remarks provided.'}
            </p>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          SIGNATURE FOOTER
      ══════════════════════════════════════════════════════════════ */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        padding: '16px 40px 14px',
        gap: '16px',
        backgroundColor: '#fafbff',
      }}>
        {['Signature of Parent', 'Signature of Teacher', 'Signature of Principal'].map(label => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{
              borderBottom: '1.5px dotted #94a3b8',
              marginBottom: '8px',
              height: '40px',
            }} />
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

const InfoRow: React.FC<{ label: string; value?: string }> = ({ label, value }) => (
  <div style={{ display: 'flex', gap: '8px', marginBottom: '5px', fontSize: '11.5px' }}>
    <span style={{ color: '#374151', fontWeight: 600, minWidth: '110px', flexShrink: 0 }}>{label}</span>
    <span style={{ color: '#111827' }}>: {value || '—'}</span>
  </div>
);

const SummaryRow: React.FC<{
  label: string;
  value: string;
  highlight?: boolean;
  grade?: string;
}> = ({ label, value, highlight, grade }) => (
  <div style={{
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '3px 0',
    borderBottom: '1px dashed #e2e8f0',
    fontSize: '10.5px',
  }}>
    <span style={{ color: '#374151', fontWeight: 600 }}>{label}</span>
    {highlight && grade ? (
      <GradeBadge grade={grade} />
    ) : (
      <span style={{ fontWeight: 700, color: '#1f2937' }}>{value}</span>
    )}
  </div>
);

const GradeBadge: React.FC<{ grade?: string }> = ({ grade }) => {
  if (!grade || grade === '-') return <span style={{ color: '#9ca3af' }}>—</span>;
  const color = gradeColor(grade);
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '26px',
      height: '26px',
      borderRadius: '50%',
      backgroundColor: color,
      color: '#fff',
      fontSize: '9px',
      fontWeight: 700,
    }}>
      {grade}
    </span>
  );
};

export default ReportCard;
