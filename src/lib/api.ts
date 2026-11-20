import type { Exam, Folder, Submission, TeacherDataResponse, TeacherProfile } from '../types';

const TOKEN_KEY = 'proctorkz_teacher_token';
const STUDENT_ID_KEY = 'proctorkz_student_device_id';
const STUDENT_PROFILE_KEY = 'proctorkz_student_profile';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getOrCreateStudentId(): string {
  let id = localStorage.getItem(STUDENT_ID_KEY);
  if (!id) {
    id = 'stu-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);
    localStorage.setItem(STUDENT_ID_KEY, id);
  }
  return id;
}

export function getSavedStudentProfile(): { name: string; studentClass: string } {
  try {
    const raw = localStorage.getItem(STUDENT_PROFILE_KEY);
    if (!raw) return { name: '', studentClass: '' };
    const parsed = JSON.parse(raw);
    return {
      name: String(parsed.name || ''),
      studentClass: String(parsed.studentClass || ''),
    };
  } catch {
    return { name: '', studentClass: '' };
  }
}

export function saveStudentProfile(name: string, studentClass: string) {
  localStorage.setItem(STUDENT_PROFILE_KEY, JSON.stringify({ name, studentClass }));
}

async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data as T;
}

export const api = {
  register: (payload: { email: string; password: string; name?: string }) =>
    apiFetch<{ token: string; teacher: TeacherProfile }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  login: (payload: { email: string; password: string }) =>
    apiFetch<{ token: string; teacher: TeacherProfile }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  me: () => apiFetch<{ teacher: TeacherProfile }>('/api/auth/me'),

  getTeacherData: () => apiFetch<TeacherDataResponse>('/api/teacher/data'),

  createFolder: (name: string, color = 'blue') =>
    apiFetch<Folder>('/api/folders', {
      method: 'POST',
      body: JSON.stringify({ name, color }),
    }),

  deleteFolder: (id: string) =>
    apiFetch<{ ok: boolean; fallbackFolderId: string }>(`/api/folders/${id}`, {
      method: 'DELETE',
    }),

  saveExam: (exam: Partial<Exam>) =>
    apiFetch<Exam>('/api/exams', {
      method: 'POST',
      body: JSON.stringify(exam),
    }),

  patchExam: (
    id: string,
    patch: Partial<
      Pick<Exam, 'isOpen' | 'liveStarted' | 'folderId' | 'maxViolations' | 'violationAction'>
    >
  ) =>
    apiFetch<Exam>(`/api/exams/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  deleteExam: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/exams/${id}`, {
      method: 'DELETE',
    }),

  updateSubmission: (id: string, details: Submission['details']) =>
    apiFetch<Submission>(`/api/submissions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ details }),
    }),

  deleteSubmission: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/submissions/${id}`, {
      method: 'DELETE',
    }),

  getExamByCode: (code: string) =>
    apiFetch<{ exam: Exam; teacherName: string }>(
      `/api/public/exams/by-code/${encodeURIComponent(code.trim().toUpperCase())}`
    ),

  submitExam: (payload: Omit<Submission, 'id' | 'teacherId' | 'examCode' | 'examTitle' | 'subject' | 'mode' | 'createdAt'>) =>
    apiFetch<Submission>('/api/public/submissions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getStudentProgress: (params: { studentId?: string; studentName?: string }) => {
    const qs = new URLSearchParams();
    if (params.studentId) qs.set('studentId', params.studentId);
    if (params.studentName) qs.set('studentName', params.studentName);
    return apiFetch<{ submissions: Submission[]; totalRecordsInSystem: number }>(
      `/api/public/student-progress?${qs.toString()}`
    );
  },

  getSampleStudentProgress: () =>
    apiFetch<{ submissions: Submission[] }>('/api/public/student-progress/sample'),

  importGoogleDoc: (url: string) =>
    apiFetch<{ text: string }>('/api/import/google-doc', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),

  parseDocumentWithAI: (payload: {
    fileName?: string;
    mimeType?: string;
    textContent?: string;
    base64Data?: string;
  }) =>
    apiFetch<{
      questions: Array<import('../types').Question & { needsAnswerReview?: boolean }>;
    }>('/api/import/parse-document', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
