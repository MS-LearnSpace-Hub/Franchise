export const getSchoolLogoUrl = (schoolId: number | string) => `/api/media/schools/${schoolId}/logo`;
export const getStudentPhotoUrl = (studentId: number | string) => `/api/media/students/${studentId}/photo`;
export const getStaffPhotoUrl = (staffId: number | string) => `/api/media/staff/${staffId}/photo`;
export const getStudentDocumentUrl = (studentId: number | string, documentId: number | string) => `/api/media/students/${studentId}/documents/${documentId}`;
