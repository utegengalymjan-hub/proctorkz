export type Lang = 'kk' | 'en';

export type SubjectKey = 'math' | 'it' | 'history' | 'science' | 'lang' | 'general';

export type ExamModeKey = 'exam' | 'prep' | 'quiz' | 'homework';

export type QuestionType =
  | 'single'
  | 'multiple'
  | 'binary'
  | 'matching'
  | 'ordering'
  | 'fill'
  | 'open';

export type FontFamilyKey = 'sans' | 'serif' | 'lora' | 'mono' | 'rounded';
export type FontSizeKey = 'sm' | 'base' | 'lg' | 'xl';

export interface QuestionMedia {
  type: 'none' | 'image' | 'audio' | 'video' | 'diagram';
  url?: string;
  diagramData?: string;
}

export interface MatchingPair {
  left: string;
  right: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  points: number;
  text: string;
  fontFamily?: FontFamilyKey | '';
  media?: QuestionMedia;
  options?: string[];
  correct?: number | number[];
  pairs?: MatchingPair[];
  items?: string[];
  keywords?: string;
}

export interface PreparedQuestion extends Question {
  shuffledOptions?: { text: string; origIdx: number }[];
  leftItems?: { text: string; id: number }[];
  rightPool?: string[];
  blanks?: string[];
}

export interface Folder {
  id: string;
  teacherId: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface Exam {
  id: string;
  teacherId: string;
  folderId: string;
  code: string;
  title: string;
  subject: SubjectKey;
  mode: ExamModeKey;
  fontFamily: FontFamilyKey;
  fontSize: FontSizeKey;
  isOpen: boolean;
  requireTeacherStart: boolean;
  liveStarted: boolean;
  isTimed: boolean;
  timeLimitMin: number;
  maxViolations: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  questions: Question[];
  createdAt: string;
  updatedAt?: string;
}

export interface ViolationRecord {
  reason: string;
  time: string;
}

export interface SubmissionDetail {
  questionId: string;
  type: QuestionType;
  text: string;
  userAnswer: unknown;
  points: number;
  maxPoints: number;
  isCorrect: boolean;
  status: 'checked' | 'pending';
}

export interface Submission {
  id: string;
  examId: string;
  teacherId: string;
  examCode: string;
  examTitle: string;
  subject: SubjectKey;
  mode: ExamModeKey;
  studentId: string;
  studentName: string;
  studentClass: string;
  submittedAt: string;
  createdAt: string;
  spentSec: number;
  score: number;
  maxScore: number;
  percent: number;
  hasPendingManual: boolean;
  violations: ViolationRecord[];
  autoSubmitted: boolean;
  autoReason: string;
  details: SubmissionDetail[];
}

export interface TeacherProfile {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface TeacherDataResponse {
  teacher: TeacherProfile;
  folders: Folder[];
  exams: Exam[];
  submissions: Submission[];
}
