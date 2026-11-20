import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Copy,
  Download,
  Edit3,
  FilePlus2,
  FolderPlus,
  Folders,
  LayoutDashboard,
  Link2,
  Lock,
  LogOut,
  Play,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Trash2,
  Unlock,
  Users,
} from 'lucide-react';
import { api } from '../lib/api';
import { MODES, SUBJECTS, tLabel } from '../lib/constants';
import { exportSubmissionsToCsv, formatDuration, generateExamCode } from '../lib/examUtils';
import type {
  Exam,
  Folder,
  Lang,
  SubjectKey,
  Submission,
  SubmissionDetail,
  TeacherProfile,
  ViolationAction,
} from '../types';
import { ExamBuilderView } from './ExamBuilderView';
import { ExamExportModal } from './ExamExportModal';
import { SubmissionDetailModal } from './SubmissionDetailModal';

interface TeacherDashboardViewProps {
  lang: Lang;
  teacher: TeacherProfile;
  folders: Folder[];
  exams: Exam[];
  submissions: Submission[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onLogout: () => void;
  onGoHome: () => void;
  notify: (msg: string, type?: 'info' | 'success' | 'warn' | 'error') => void;
}

type TeacherNavTab = 'overview' | 'exams' | 'builder' | 'submissions';

export const TeacherDashboardView: React.FC<TeacherDashboardViewProps> = ({
  lang,
  teacher,
  folders,
  exams,
  submissions,
  loading,
  onRefresh,
  onLogout,
  onGoHome,
  notify,
}) => {
  const [activeTab, setActiveTab] = useState<TeacherNavTab>('overview');
  const [editingExam, setEditingExam] = useState<Exam | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  const [examSearch, setExamSearch] = useState('');

  // Submissions Filters
  const [subSearch, setSubSearch] = useState('');
  const [subExamFilter, setSubExamFilter] = useState<string>('all');
  const [subSubjectFilter, setSubSubjectFilter] = useState<string>('all');
  const [subStatusFilter, setSubStatusFilter] = useState<'all' | 'pending' | 'violations'>('all');
  const [inspectingSubmission, setInspectingSubmission] = useState<Submission | null>(null);

  // Modals
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [deletingExam, setDeletingExam] = useState<Exam | null>(null);
  const [exportingExam, setExportingExam] = useState<Exam | null>(null);
  const [proctorExam, setProctorExam] = useState<Exam | null>(null);
  const [draftMaxViolations, setDraftMaxViolations] = useState<number>(3);
  const [draftViolationAction, setDraftViolationAction] = useState<ViolationAction>('auto_submit');
  const [savingProctor, setSavingProctor] = useState(false);

  const kpis = useMemo(() => {
    const totalExams = exams.length;
    const openExams = exams.filter((e) => e.isOpen).length;
    const totalSubmissions = submissions.length;
    const avgPercent = totalSubmissions
      ? Math.round(submissions.reduce((acc, s) => acc + s.percent, 0) / totalSubmissions)
      : 0;
    const pendingManual = submissions.filter((s) => s.hasPendingManual).length;
    const totalViolations = submissions.reduce((acc, s) => acc + s.violations.length, 0);
    return { totalExams, openExams, totalSubmissions, avgPercent, pendingManual, totalViolations };
  }, [exams, submissions]);

  const filteredExams = useMemo(() => {
    const q = examSearch.trim().toLowerCase();
    return exams.filter((ex) => {
      if (selectedFolder !== 'all' && ex.folderId !== selectedFolder) return false;
      if (q && !ex.title.toLowerCase().includes(q) && !ex.code.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [exams, selectedFolder, examSearch]);

  const filteredSubmissions = useMemo(() => {
    const q = subSearch.trim().toLowerCase();
    return submissions.filter((s) => {
      if (subExamFilter !== 'all' && s.examId !== subExamFilter) return false;
      if (subSubjectFilter !== 'all' && s.subject !== subSubjectFilter) return false;
      if (subStatusFilter === 'pending' && !s.hasPendingManual) return false;
      if (subStatusFilter === 'violations' && s.violations.length === 0) return false;
      if (
        q &&
        !s.studentName.toLowerCase().includes(q) &&
        !s.studentClass.toLowerCase().includes(q) &&
        !s.examTitle.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [submissions, subExamFilter, subSubjectFilter, subStatusFilter, subSearch]);

  const startCreateNewExam = () => {
    const blank: Exam = {
      id: '',
      teacherId: teacher.id,
      folderId: folders[0]?.id || 'f-default',
      code: generateExamCode(),
      title: tLabel(lang, 'Жаңа емтихан', 'New Exam'),
      subject: 'general',
      mode: 'exam',
      fontFamily: 'sans',
      fontSize: 'base',
      isOpen: true,
      requireTeacherStart: false,
      liveStarted: false,
      isTimed: true,
      timeLimitMin: 15,
      maxViolations: 3,
      violationAction: 'auto_submit',
      shuffleQuestions: true,
      shuffleOptions: true,
      questions: [],
      createdAt: new Date().toISOString(),
    };
    setEditingExam(blank);
    setActiveTab('builder');
  };

  const openEditExam = (ex: Exam) => {
    setEditingExam(JSON.parse(JSON.stringify(ex)));
    setActiveTab('builder');
  };

  const copyExamLink = (code: string) => {
    const link = `${window.location.origin}${window.location.pathname}?code=${code}`;
    if (navigator.clipboard) {
      navigator.clipboard
        .writeText(link)
        .then(() =>
          notify(
            tLabel(lang, `Тікелей сілтеме көшірілді (${code})`, `Direct link copied (${code})`),
            'success'
          )
        )
        .catch(() => notify(link, 'info'));
    } else {
      notify(link, 'info');
    }
  };

  const handleToggleOpen = async (ex: Exam) => {
    try {
      await api.patchExam(ex.id, { isOpen: !ex.isOpen });
      await onRefresh();
      notify(
        !ex.isOpen
          ? tLabel(lang, 'Емтихан ашылды', 'Exam opened')
          : tLabel(lang, 'Емтихан жабылды', 'Exam closed'),
        'info'
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Қате', 'error');
    }
  };

  const handleToggleLiveStart = async (ex: Exam) => {
    try {
      await api.patchExam(ex.id, { liveStarted: !ex.liveStarted });
      await onRefresh();
      notify(
        !ex.liveStarted
          ? tLabel(lang, 'Емтихан барлық оқушыларға басталды!', 'Live session started for students!')
          : tLabel(lang, 'Күту режиміне ауыстырылды', 'Live session paused'),
        !ex.liveStarted ? 'success' : 'warn'
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Қате', 'error');
    }
  };

  const handleMoveFolder = async (ex: Exam, folderId: string) => {
    try {
      await api.patchExam(ex.id, { folderId });
      await onRefresh();
      notify(tLabel(lang, 'Қалташа жаңартылды', 'Moved to folder'), 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Қате', 'error');
    }
  };

  const handleSaveExam = async (examData: Exam) => {
    try {
      await api.saveExam(examData);
      await onRefresh();
      notify(tLabel(lang, 'Емтихан сақталды!', 'Exam saved successfully!'), 'success');
      setEditingExam(null);
      setActiveTab('exams');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Сақтау қатесі', 'error');
      throw err;
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      await api.createFolder(newFolderName.trim());
      setNewFolderName('');
      setShowNewFolderModal(false);
      await onRefresh();
      notify(tLabel(lang, 'Жаңа қалташа қосылды', 'Folder created'), 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Қате', 'error');
    }
  };

  const handleConfirmDeleteExam = async () => {
    if (!deletingExam) return;
    try {
      await api.deleteExam(deletingExam.id);
      setDeletingExam(null);
      await onRefresh();
      notify(tLabel(lang, 'Емтихан өшірілді', 'Exam deleted'), 'info');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Қате', 'error');
    }
  };

  const handleSaveGrades = async (id: string, details: SubmissionDetail[]) => {
    await api.updateSubmission(id, details);
    await onRefresh();
    notify(tLabel(lang, 'Бағалар сақталды', 'Grades updated'), 'success');
  };

  const handleDeleteSubmission = async (id: string) => {
    await api.deleteSubmission(id);
    await onRefresh();
    notify(tLabel(lang, 'Жазба өшірілді', 'Submission deleted'), 'info');
  };

  const openProctorEditor = (ex: Exam) => {
    setProctorExam(ex);
    setDraftMaxViolations(ex.maxViolations ?? 3);
    setDraftViolationAction(ex.violationAction || 'auto_submit');
  };

  const handleSaveProctorSettings = async () => {
    if (!proctorExam) return;
    setSavingProctor(true);
    try {
      await api.patchExam(proctorExam.id, {
        maxViolations: draftMaxViolations,
        violationAction: draftViolationAction,
      });
      await onRefresh();
      setProctorExam(null);
      notify(tLabel(lang, 'Ескерту баптауы сақталды', 'Violation settings updated'), 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Қате', 'error');
    } finally {
      setSavingProctor(false);
    }
  };

  const navItems: { id: TeacherNavTab; label: string; icon: React.ReactNode; count?: number }[] = [
    {
      id: 'overview',
      label: tLabel(lang, 'Шолу', 'Overview'),
      icon: <LayoutDashboard className="w-4 h-4" />,
    },
    {
      id: 'exams',
      label: tLabel(lang, 'Емтихандар', 'Exams'),
      icon: <Folders className="w-4 h-4" />,
      count: exams.length,
    },
    {
      id: 'builder',
      label: tLabel(lang, 'Жаңа емтихан', 'Create Exam'),
      icon: <FilePlus2 className="w-4 h-4" />,
    },
    {
      id: 'submissions',
      label: tLabel(lang, 'Оқушы нәтижелері', 'Submissions'),
      icon: <BarChart3 className="w-4 h-4" />,
      count: submissions.length,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Left Sidebar (SaaS Workspace) */}
      <aside className="lg:w-64 lg:shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col justify-between">
        <div className="p-4 lg:p-5 space-y-6">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onGoHome}
              className="text-lg font-display font-bold tracking-tight text-slate-900 hover:text-blue-600 transition-colors whitespace-nowrap"
            >
              ProctorKZ
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="lg:hidden inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-red-600"
            >
              <LogOut className="w-3.5 h-3.5" />
              {tLabel(lang, 'Шығу', 'Logout')}
            </button>
          </div>

          <nav className="flex lg:flex-col gap-1 overflow-x-auto pb-1 lg:pb-0">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.id === 'builder') {
                      startCreateNewExam();
                    } else {
                      setActiveTab(item.id);
                    }
                  }}
                  className={`flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 transition-colors ${
                    active
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    {item.icon}
                    <span>{item.label}</span>
                  </span>
                  {item.count !== undefined && (
                    <span
                      className={`text-xs font-mono tabular-nums ${
                        active ? 'text-slate-300' : 'text-slate-400'
                      }`}
                    >
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Teacher Account Footer */}
        <div className="hidden lg:block p-4 border-t border-slate-200 space-y-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900 truncate">{teacher.name}</div>
            <div className="text-xs text-slate-500 truncate">{teacher.email}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onGoHome}
              className="flex-1 py-1.5 px-2.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {tLabel(lang, 'Оқушы беті', 'Student View')}
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="py-1.5 px-2.5 rounded-lg border border-slate-200 text-xs font-semibold text-red-600 hover:bg-red-50"
              title={tLabel(lang, 'Шығу', 'Sign Out')}
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Viewport */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Breadcrumb Bar */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-4">
          <div className="text-sm font-medium text-slate-500 flex items-center gap-2 truncate">
            <span>{tLabel(lang, 'Мұғалім панелі', 'Teacher Dashboard')}</span>
            <span>/</span>
            <span className="text-slate-900 font-semibold">
              {navItems.find((n) => n.id === activeTab)?.label}
            </span>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {activeTab !== 'builder' && (
              <button
                type="button"
                onClick={startCreateNewExam}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold whitespace-nowrap transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                {tLabel(lang, 'Жаңа емтихан', 'New Exam')}
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 p-5 sm:p-6 lg:p-8 max-w-6xl w-full mx-auto">
          {loading ? (
            <div className="py-16 text-center text-sm text-slate-500">
              {tLabel(lang, 'Деректер жүктелуде...', 'Loading workspace data...')}
            </div>
          ) : activeTab === 'builder' && editingExam ? (
            <ExamBuilderView
              lang={lang}
              initialExam={editingExam}
              folders={folders}
              onSave={handleSaveExam}
              onCancel={() => {
                setEditingExam(null);
                setActiveTab('exams');
              }}
              notify={notify}
            />
          ) : activeTab === 'overview' ? (
            <div className="space-y-8">
              {/* KPI Row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <div className="text-xs font-medium text-slate-500">
                    {tLabel(lang, 'Емтихандар', 'Created Exams')}
                  </div>
                  <div className="text-3xl font-bold font-mono tabular-nums text-slate-900 mt-2">
                    {kpis.totalExams}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 tabular-nums">
                    {kpis.openExams} {tLabel(lang, 'қазір ашық', 'currently open')}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <div className="text-xs font-medium text-slate-500">
                    {tLabel(lang, 'Тапсырған оқушылар', 'Total Submissions')}
                  </div>
                  <div className="text-3xl font-bold font-mono tabular-nums text-slate-900 mt-2">
                    {kpis.totalSubmissions}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 tabular-nums">
                    {kpis.pendingManual} {tLabel(lang, 'тексеруді күтуде', 'pending review')}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <div className="text-xs font-medium text-slate-500">
                    {tLabel(lang, 'Орташа нәтиже', 'Average Score')}
                  </div>
                  <div className="text-3xl font-bold font-mono tabular-nums text-blue-600 mt-2">
                    {kpis.avgPercent}%
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {tLabel(lang, 'Барлық емтихандар бойынша', 'Across all exams')}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <div className="text-xs font-medium text-slate-500">
                    {tLabel(lang, 'Прокторинг ескертулері', 'Total Violations')}
                  </div>
                  <div
                    className={`text-3xl font-bold font-mono tabular-nums mt-2 ${
                      kpis.totalViolations > 0 ? 'text-red-600' : 'text-emerald-700'
                    }`}
                  >
                    {kpis.totalViolations}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {tLabel(lang, 'Тіркелген оқиғалар', 'Recorded incidents')}
                  </div>
                </div>
              </div>

              {/* Active Exams + Recent Submissions */}
              <div className="grid lg:grid-cols-12 gap-6 items-start">
                <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900">
                      {tLabel(lang, 'Соңғы емтихандар', 'Recent Exams')}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setActiveTab('exams')}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                    >
                      {tLabel(lang, 'Барлығын көру', 'View all')}
                    </button>
                  </div>
                  {exams.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500 space-y-3">
                      <p>{tLabel(lang, 'Емтихандар әлі жасалмаған.', 'No exams created yet.')}</p>
                      <button
                        type="button"
                        onClick={startCreateNewExam}
                        className="px-3.5 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold"
                      >
                        {tLabel(lang, 'Алғашқы емтиханды жасау', 'Create First Exam')}
                      </button>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {exams.slice(0, 5).map((ex) => (
                        <div
                          key={ex.id}
                          className="px-5 py-3.5 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-900 truncate">
                              {ex.title}
                            </div>
                            <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                              <span className="font-mono font-semibold text-slate-700">{ex.code}</span>
                              <span>·</span>
                              <span>
                                {ex.questions.length} {tLabel(lang, 'сұрақ', 'qs')}
                              </span>
                              <span>·</span>
                              <span className={ex.isOpen ? 'text-emerald-700' : 'text-red-600'}>
                                {ex.isOpen
                                  ? tLabel(lang, 'Ашық', 'Open')
                                  : tLabel(lang, 'Жабық', 'Closed')}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => copyExamLink(ex.code)}
                            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 shrink-0"
                            title={tLabel(lang, 'Сілтемені көшіру', 'Copy link')}
                          >
                            <Link2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900">
                      {tLabel(lang, 'Соңғы тапсырған оқушылар', 'Latest Student Submissions')}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setActiveTab('submissions')}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                    >
                      {tLabel(lang, 'Толық кесте', 'All submissions')}
                    </button>
                  </div>
                  {submissions.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500">
                      {tLabel(
                        lang,
                        'Оқушылар код арқылы емтихан тапсырған соң нәтижелер бірден осында түседі.',
                        'Student submissions will appear here immediately after they finish an exam.'
                      )}
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {submissions.slice(0, 6).map((sub) => (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => setInspectingSubmission(sub)}
                          className="w-full text-left px-5 py-3.5 hover:bg-slate-50 transition-colors flex items-center justify-between gap-4"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-900 truncate">
                              {sub.studentName}{' '}
                              <span className="font-normal text-slate-500">· {sub.studentClass}</span>
                            </div>
                            <div className="text-xs text-slate-500 truncate mt-0.5">
                              {sub.examTitle} · {sub.submittedAt}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-mono text-sm font-bold tabular-nums text-slate-900">
                              {sub.percent}%
                            </div>
                            <div className="text-xs text-slate-500 font-mono tabular-nums">
                              {sub.score}/{sub.maxScore}
                              {sub.violations.length > 0 && (
                                <span className="text-red-600 ml-1.5">
                                  ({sub.violations.length}!)
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </div>
          ) : activeTab === 'exams' ? (
            <div className="grid lg:grid-cols-12 gap-6 items-start">
              {/* Folders Panel */}
              <div className="lg:col-span-3 bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-700">
                    {tLabel(lang, 'Қалташалар', 'Folders')}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowNewFolderModal(true)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    {tLabel(lang, 'Қосу', 'Add')}
                  </button>
                </div>

                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => setSelectedFolder('all')}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between ${
                      selectedFolder === 'all'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span>{tLabel(lang, 'Барлық емтихандар', 'All Exams')}</span>
                    <span className="font-mono tabular-nums">{exams.length}</span>
                  </button>

                  {folders.map((f) => {
                    const count = exams.filter((e) => e.folderId === f.id).length;
                    const active = selectedFolder === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setSelectedFolder(f.id)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between ${
                          active
                            ? 'bg-slate-900 text-white font-semibold'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <span className="truncate">{f.name}</span>
                        <span className="font-mono tabular-nums">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Exams List */}
              <div className="lg:col-span-9 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="relative flex-1 min-w-[220px]">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={examSearch}
                      onChange={(e) => setExamSearch(e.target.value)}
                      placeholder={tLabel(lang, 'Атауы немесе коды бойынша іздеу...', 'Search by title or code...')}
                      className="w-full pl-9 pr-3.5 py-2 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:border-blue-600"
                    />
                  </div>
                </div>

                {filteredExams.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
                    <p className="text-sm text-slate-500">
                      {tLabel(lang, 'Бұл қалташада емтихан табылмады.', 'No exams found in this view.')}
                    </p>
                    <button
                      type="button"
                      onClick={startCreateNewExam}
                      className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold"
                    >
                      {tLabel(lang, 'Жаңа емтихан құру', 'Create Exam')}
                    </button>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-4">
                    {filteredExams.map((ex) => {
                      const subj = SUBJECTS[ex.subject] || SUBJECTS.general;
                      const mode = MODES[ex.mode] || MODES.exam;
                      const subCount = submissions.filter((s) => s.examId === ex.id).length;

                      return (
                        <div
                          key={ex.id}
                          className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4"
                        >
                          <div className="space-y-3">
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="font-medium text-slate-500">
                                {lang === 'kk' ? subj.kk : subj.en} ·{' '}
                                {lang === 'kk' ? mode.kk : mode.en}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleToggleOpen(ex)}
                                className={`inline-flex items-center gap-1 font-semibold ${
                                  ex.isOpen ? 'text-emerald-700' : 'text-red-600'
                                }`}
                              >
                                {ex.isOpen ? (
                                  <>
                                    <Unlock className="w-3.5 h-3.5" />
                                    {tLabel(lang, 'Ашық', 'Open')}
                                  </>
                                ) : (
                                  <>
                                    <Lock className="w-3.5 h-3.5" />
                                    {tLabel(lang, 'Жабық', 'Closed')}
                                  </>
                                )}
                              </button>
                            </div>

                            <h3 className="font-bold text-slate-900 text-base leading-snug">
                              {ex.title}
                            </h3>

                            {/* Code & Direct Link */}
                            <div className="flex flex-wrap items-center gap-2.5 pt-1">
                              <span className="px-2.5 py-1 rounded-md bg-slate-900 text-white font-mono text-xs font-bold tracking-wide">
                                {ex.code}
                              </span>
                              <button
                                type="button"
                                onClick={() => copyExamLink(ex.code)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
                              >
                                <Copy className="w-3.5 h-3.5" />
                                {tLabel(lang, 'Сілтемені көшіру', 'Copy Direct Link')}
                              </button>
                            </div>

                            <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500 tabular-nums">
                              <span>
                                {ex.questions.length} {tLabel(lang, 'сұрақ', 'questions')}
                              </span>
                              <span>·</span>
                              <span>
                                {ex.isTimed
                                  ? `${ex.timeLimitMin} ${tLabel(lang, 'мин', 'min')}`
                                  : tLabel(lang, 'Уақытсыз', 'Untimed')}
                              </span>
                              <span>·</span>
                              <span className="inline-flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                {subCount} {tLabel(lang, 'тапсырды', 'submissions')}
                              </span>
                            </div>

                            {ex.mode === 'exam' && (
                              <div className="flex items-center justify-between gap-2 text-xs text-slate-600 pt-0.5">
                                <span className="inline-flex items-center gap-1.5">
                                  <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
                                  <span className="tabular-nums">
                                    {ex.maxViolations === 0
                                      ? tLabel(lang, 'Ескерту: Шектеусіз', 'Violations: Unlimited')
                                      : `${tLabel(lang, 'Лимит:', 'Limit:')} ${ex.maxViolations} · ${
                                          ex.violationAction === 'warn_only'
                                            ? tLabel(lang, 'Тек ескерту', 'Warn only')
                                            : tLabel(lang, 'Авто-жабу', 'Auto-submit')
                                        }`}
                                  </span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => openProctorEditor(ex)}
                                  className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-700"
                                >
                                  <SlidersHorizontal className="w-3 h-3" />
                                  {tLabel(lang, 'Реттеу', 'Adjust')}
                                </button>
                              </div>
                            )}

                            {ex.requireTeacherStart && (
                              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-slate-700">
                                  {ex.liveStarted
                                    ? tLabel(lang, 'Тікелей сессия басталды', 'Live session active')
                                    : tLabel(lang, 'Күту бөлмесі белсенді', 'Waiting room active')}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleToggleLiveStart(ex)}
                                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold text-white ${
                                    ex.liveStarted
                                      ? 'bg-red-600 hover:bg-red-700'
                                      : 'bg-emerald-600 hover:bg-emerald-700'
                                  }`}
                                >
                                  {ex.liveStarted ? (
                                    <>
                                      <Square className="w-3 h-3" />
                                      {tLabel(lang, 'Тоқтату', 'Stop')}
                                    </>
                                  ) : (
                                    <>
                                      <Play className="w-3 h-3" />
                                      {tLabel(lang, 'Бастау', 'Launch')}
                                    </>
                                  )}
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => openEditExam(ex)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                {tLabel(lang, 'Өңдеу', 'Edit')}
                              </button>
                              <button
                                type="button"
                                onClick={() => setExportingExam(ex)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold"
                                title={tLabel(lang, 'Word / PDF / Excel жүктеп алу', 'Download exam')}
                              >
                                <Download className="w-3.5 h-3.5" />
                                {tLabel(lang, 'Жүктеу', 'Export')}
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingExam(ex)}
                                className="p-1.5 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600"
                                aria-label="Delete exam"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <select
                              value={ex.folderId}
                              onChange={(e) => handleMoveFolder(ex, e.target.value)}
                              className="text-xs border border-slate-200 bg-slate-50 rounded-lg px-2 py-1 text-slate-600 max-w-[140px]"
                            >
                              {folders.map((f) => (
                                <option key={f.id} value={f.id}>
                                  {f.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* SUBMISSIONS TAB */
            <div className="space-y-5">
              {/* Filter Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5 flex-1">
                  <div className="relative min-w-[200px] flex-1 max-w-xs">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={subSearch}
                      onChange={(e) => setSubSearch(e.target.value)}
                      placeholder={tLabel(lang, 'Оқушы, сынып немесе тест...', 'Student, class, or exam...')}
                      className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 bg-white text-xs focus:outline-none focus:border-blue-600"
                    />
                  </div>

                  <select
                    value={subExamFilter}
                    onChange={(e) => setSubExamFilter(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-medium"
                  >
                    <option value="all">{tLabel(lang, 'Барлық емтихандар', 'All Exams')}</option>
                    {exams.map((ex) => (
                      <option key={ex.id} value={ex.id}>
                        [{ex.code}] {ex.title}
                      </option>
                    ))}
                  </select>

                  <select
                    value={subSubjectFilter}
                    onChange={(e) => setSubSubjectFilter(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-medium"
                  >
                    <option value="all">{tLabel(lang, 'Барлық пәндер', 'All Subjects')}</option>
                    {(Object.keys(SUBJECTS) as SubjectKey[]).map((k) => (
                      <option key={k} value={k}>
                        {lang === 'kk' ? SUBJECTS[k].kk : SUBJECTS[k].en}
                      </option>
                    ))}
                  </select>

                  <div className="flex p-0.5 bg-slate-100 rounded-lg text-xs font-semibold">
                    {(
                      [
                        ['all', tLabel(lang, 'Барлығы', 'All')],
                        ['pending', tLabel(lang, 'Тексеру қажет', 'Pending')],
                        ['violations', tLabel(lang, 'Ескертуі бар', 'Violations')],
                      ] as const
                    ).map(([k, lbl]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setSubStatusFilter(k)}
                        className={`px-2.5 py-1.5 rounded-md ${
                          subStatusFilter === k
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600'
                        }`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (!filteredSubmissions.length) {
                      notify(tLabel(lang, 'Экспорттауға дерек жоқ', 'No records to export'), 'warn');
                      return;
                    }
                    exportSubmissionsToCsv(filteredSubmissions);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  {tLabel(lang, 'Excel (CSV) жүктеу', 'Export CSV')}
                </button>
              </div>

              {/* Submissions Table */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                {filteredSubmissions.length === 0 ? (
                  <div className="p-10 text-center text-sm text-slate-500">
                    {tLabel(lang, 'Сүзгіге сәйкес нәтижелер табылмады.', 'No student submissions match the filter.')}
                  </div>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                      <tr>
                        <th className="px-4 py-3 font-semibold">{tLabel(lang, 'Оқушы', 'Student')}</th>
                        <th className="px-4 py-3 font-semibold">{tLabel(lang, 'Емтихан', 'Exam')}</th>
                        <th className="px-4 py-3 font-semibold text-right">{tLabel(lang, 'Балл', 'Score')}</th>
                        <th className="px-4 py-3 font-semibold text-right">{tLabel(lang, 'Уақыт', 'Time')}</th>
                        <th className="px-4 py-3 font-semibold">{tLabel(lang, 'Прокторинг', 'Proctoring')}</th>
                        <th className="px-4 py-3 font-semibold text-right">{tLabel(lang, 'Әрекет', 'Action')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredSubmissions.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-900">{s.studentName}</div>
                            <div className="text-xs text-slate-500">{s.studentClass}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-xs font-medium text-slate-800 max-w-xs truncate">
                              {s.examTitle}
                            </div>
                            <div className="text-xs text-slate-400 font-mono tabular-nums">
                              {s.examCode} · {s.submittedAt}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums">
                            <div className="font-bold text-slate-900">
                              {s.score} / {s.maxScore}{' '}
                              <span className="text-blue-600 ml-1">({s.percent}%)</span>
                            </div>
                            {s.hasPendingManual && (
                              <div className="text-[11px] font-sans font-semibold text-amber-700">
                                {tLabel(lang, 'Ашық сұрақ тексерілмеген', 'Manual grading needed')}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-slate-600 tabular-nums">
                            {formatDuration(s.spentSec)}
                          </td>
                          <td className="px-4 py-3 text-xs font-semibold">
                            {s.violations.length > 0 ? (
                              <span className="inline-flex items-center gap-1 text-red-700">
                                <ShieldAlert className="w-3.5 h-3.5" />
                                <span className="tabular-nums">
                                  {s.violations.length} {tLabel(lang, 'ескерту', 'flags')}
                                </span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-emerald-700">
                                <ShieldCheck className="w-3.5 h-3.5" />
                                {tLabel(lang, 'Таза', 'Clean')}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => setInspectingSubmission(s)}
                              className="text-xs font-semibold text-blue-600 hover:text-blue-700 underline underline-offset-2"
                            >
                              {tLabel(lang, 'Толығырақ / Бағалау', 'Inspect / Grade')}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Create Folder Modal */}
      {showNewFolderModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateFolder}
            className="bg-white rounded-2xl max-w-sm w-full p-6 border border-slate-200 space-y-4"
          >
            <h3 className="text-base font-bold text-slate-900">
              {tLabel(lang, 'Жаңа қалташа ашу', 'Create Folder')}
            </h3>
            <input
              type="text"
              autoFocus
              required
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder={tLabel(lang, 'Мысалы: 11-сынып ТЖБ', 'e.g. Grade 11 Midterms')}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-blue-600"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewFolderModal(false)}
                className="px-3.5 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold"
              >
                {tLabel(lang, 'Болдырмау', 'Cancel')}
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold"
              >
                {tLabel(lang, 'Қосу', 'Create')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Confirm Delete Exam Modal */}
      {deletingExam && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              {tLabel(lang, 'Емтиханды өшіруді растаңыз', 'Delete Exam?')}
            </h3>
            <p className="text-sm text-slate-600">
              «{deletingExam.title}» ({deletingExam.code})
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingExam(null)}
                className="px-3.5 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold"
              >
                {tLabel(lang, 'Болдырмау', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteExam}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
              >
                {tLabel(lang, 'Өшіру', 'Delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inspect / Grade Submission Modal */}
      {inspectingSubmission && (
        <SubmissionDetailModal
          lang={lang}
          submission={inspectingSubmission}
          onClose={() => setInspectingSubmission(null)}
          onSaveGrades={handleSaveGrades}
          onDelete={handleDeleteSubmission}
        />
      )}

      {/* Export Exam Modal */}
      {exportingExam && (
        <ExamExportModal
          lang={lang}
          exam={exportingExam}
          onClose={() => setExportingExam(null)}
          notify={notify}
        />
      )}

      {/* Quick Proctoring Violation Limit Modal */}
      {proctorExam && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-slate-200 space-y-5">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {tLabel(lang, 'Ескерту санын реттеу', 'Adjust Proctoring Violation Limit')}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                {proctorExam.title} · <span className="font-mono">{proctorExam.code}</span>
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700">
                  {tLabel(lang, 'Рұқсат етілген ескерту саны', 'Allowed Violations')}
                </span>
                <span className="font-mono font-bold text-blue-600 tabular-nums">
                  {draftMaxViolations === 0
                    ? tLabel(lang, 'Шектеусіз', 'Unlimited')
                    : `${draftMaxViolations} ${tLabel(lang, 'рет', 'max')}`}
                </span>
              </div>

              <div className="grid grid-cols-5 gap-1.5">
                {[1, 3, 5, 10, 0].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setDraftMaxViolations(preset)}
                    className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                      draftMaxViolations === preset
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {preset === 0 ? tLabel(lang, '∞', '∞') : preset}
                  </button>
                ))}
              </div>

              {draftMaxViolations > 0 && (
                <div className="flex items-center gap-3 pt-1">
                  <input
                    type="range"
                    min={1}
                    max={20}
                    value={draftMaxViolations}
                    onChange={(e) => setDraftMaxViolations(Number(e.target.value))}
                    className="flex-1 accent-blue-600"
                  />
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={draftMaxViolations}
                    onChange={(e) =>
                      setDraftMaxViolations(
                        Math.max(1, Math.min(20, Number(e.target.value) || 1))
                      )
                    }
                    className="w-16 px-2 py-1 rounded-md border border-slate-300 font-mono text-center"
                  />
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 space-y-2">
                <div className="font-semibold text-slate-700">
                  {tLabel(lang, 'Лимит толғандағы әрекет', 'Action on Limit Reached')}
                </div>
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setDraftViolationAction('auto_submit')}
                    className={`py-2 rounded-md text-xs font-semibold ${
                      draftViolationAction === 'auto_submit'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    {tLabel(lang, 'Автоматты жабу', 'Auto-submit')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraftViolationAction('warn_only')}
                    className={`py-2 rounded-md text-xs font-semibold ${
                      draftViolationAction === 'warn_only'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    {tLabel(lang, 'Тек ескерту', 'Warn & log only')}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setProctorExam(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold"
              >
                {tLabel(lang, 'Болдырмау', 'Cancel')}
              </button>
              <button
                type="button"
                disabled={savingProctor}
                onClick={handleSaveProctorSettings}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50"
              >
                {savingProctor
                  ? tLabel(lang, 'Сақталуда...', 'Saving...')
                  : tLabel(lang, 'Сақтау', 'Save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
