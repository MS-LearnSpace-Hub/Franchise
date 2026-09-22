// FIX: Add React import to resolve 'Cannot find namespace React' error.
import React from 'react';

export interface NavItem {
  icon: React.ReactNode;
  text: string;
  href: string;
}

export interface NavCategory {
  title: string;
  icon: React.ReactNode;
  modules: NavItem[];
}

export interface FeeInstallment {
  sr: number;
  title: string;
  payable: number;
  paid: boolean;
  paidAmount?: number;
  paymentDate?: string;
}

export interface Student {
  student_id?: number; // Added for backend compatibility
  sr: number;
  photo: string;
  admNo: string;
  rollNo: number;
  class: string;
  section: string;
  dob: string;
  name: string;
  first_name?: string;
  StudentMiddleName?: string;
  last_name?: string;
  father: string;
  fatherFirstName: string;
  fatherMiddleName?: string;
  fatherLastName: string;
  fatherMobile: string;
  smsNo: string;
  status: string;
  // Add other fields from the form as needed
  branch?: string;
  location?: string;
  academic_year?: string;
  admissionDate?: string;
  studentStatus?: string;
  studentType?: string;
  gender?: string;
  email?: string;
  aadharNo?: string;
  presentAddress?: string;
  presentCity?: string;
  presentPin?: string;
  permanentAddress?: string;
  permanentCity?: string;
  permanentPin?: string;
  isSameAddress?: boolean;
  documents?: string[];
  feeInstallments: FeeInstallment[];
  total_due?: number;
  is_promoted?: boolean;
  is_locked?: boolean;
}
export interface OnlineClassItem {
  id: number;
  title: string;
  description?: string | null;
  subject_id?: number | null;
  subject_name?: string | null;
  class_id?: number | null;
  class_name?: string | null;
  section_id?: number | null;
  section_name?: string | null;
  teacher_id: number;
  teacher_name?: string | null;
  branch_id?: number | null;
  platform: 'zoom' | 'google_meet';
  join_url?: string | null;
  start_url?: string | null;
  meeting_password?: string | null;
  timezone: string;
  start_datetime: string;
  duration_minutes: number;
  is_recurring: boolean;
  recurrence_days?: string | null;
  recurrence_end_date?: string | null;
  target_section_ids?: string | null;
  status: 'SCHEDULED' | 'CANCELLED' | 'COMPLETED';
  cancel_reason?: string | null;
}

