import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, KeyRound, ShieldCheck, UserCheck } from 'lucide-react';
import { ExamRunner } from './components/ExamRunner';
import { StudentProgressView } from './components/StudentProgressView';
import { TeacherAuthView } from './components/TeacherAuthView';
import { TeacherDashboardView } from './components/TeacherDashboardView';
import {
  api,
  getSavedStudentProfile,
  getStoredToken,
  saveStudentProfile,
  setStoredToken,
} from './lib/api';
import { tLabel } from './lib/constants';
import type { Exam, Folder, Lang, Submission, TeacherProfile } from './types';

type AppView = 'landing' | 'progress' | 'exam' | 'auth' | 'teacher';

interface ToastItem {
  id: string;
  msg: string;
  type: 'info' | 'success' | 'warn' | 'error';
}

export default function App() {
  const [lang, setLang] = useState<Lang>('kk');
  const [view, setView] = useState<AppView>('landing');
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Student Join Form State
  const initialCode = new URLSearchParams(window.location.search).get('code') || '';
  const savedStudent = getSavedStudentProfile();
  const [joinCode, setJoinCode] = useState(initialCode.toUpperCase());
  const [studentName, setStudentName] = useState(savedStudent.name);
  const [studentClass, setStudentClass] = useState(savedStudent.studentClass);
  const [joining, setJoining] = useState(false);
  const [activeExam, setActiveExam] = useState<Exam | null>(null);

  // Teacher Auth & Isolated Data State
  const [teacher, setTeacher] = useState<TeacherProfile | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loadingTeacherData, setLoadingTeacherData] = useState(false);

  const notify = useCallback(
    (msg: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
      const id = Math.random().toString(36).slice(2, 9);
      setToasts((prev) => [...prev, { id, msg, type }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3600);
    },
    []
  );

  const loadTeacherData = useCallback(async () => {
    setLoadingTeacherData(true);
    try {
      const data = await api.getTeacherData();
      setTeacher(data.teacher);
      setFolders(data.folders);
      setExams(data.exams);
      setSubmissions(data.submissions);
    } catch (err) {
      setStoredToken(null);
      setTeacher(null);
      setView('auth');
      notify(err instanceof Error ? err.message : 'Сессия аяқталды', 'warn');
    } finally {
      setLoadingTeacherData(false);
    }
  }, [notify]);

  // Restore existing teacher session silently on mount
  useEffect(() => {
    const token = getStoredToken();
    if (!token) return;
    api
      .me()
      .then((res) => setTeacher(res.teacher))
      .catch(() => setStoredToken(null));
  }, []);

  const openTeacherWorkspace = async () => {
    if (teacher) {
      setView('teacher');
      await loadTeacherData();
    } else {
      setView('auth');
    }
  };

  const handleLogout = () => {
    setStoredToken(null);
    setTeacher(null);
    setFolders([]);
    setExams([]);
    setSubmissions([]);
    setView('landing');
    notify(tLabel(lang, 'Жүйеден шықтыңыз', 'Signed out'), 'info');
  };

  const handleJoinExam = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    const name = studentName.trim();
    const cls = studentClass.trim() || tLabel(lang, 'Көрсетілмеген', 'Unspecified');

    if (!code) {
      notify(tLabel(lang, 'Мұғалім берген емтихан кодын енгізіңіз', 'Enter the exam code provided by your teacher'), 'error');
      return;
    }
    if (!name) {
      notify(tLabel(lang, 'Аты-жөніңізді енгізіңіз', 'Enter your full name'), 'error');
      return;
    }

    setJoining(true);
    try {
      const res = await api.getExamByCode(code);
      if (!res.exam.isOpen) {
        notify(
          tLabel(lang, 'Бұл емтихан қазір жабық. Мұғалім ашуын күтіңіз.', 'This exam is currently closed by the teacher.'),
          'warn'
        );
        return;
      }
      if (!res.exam.questions.length) {
        notify(tLabel(lang, 'Бұл емтиханда әлі сұрақтар жоқ.', 'This exam has no questions yet.'), 'warn');
        return;
      }

      saveStudentProfile(name, cls);
      setStudentName(name);
      setStudentClass(cls);
      setActiveExam(res.exam);
      setView('exam');
    } catch (err) {
      notify(
        err instanceof Error
          ? err.message
          : tLabel(lang, 'Бұл кодпен емтихан табылмады', 'Exam code not found'),
        'error'
      );
    } finally {
      setJoining(false);
    }
  };

  const toastBanner = (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 max-w-sm pointer-events-none">
      {toasts.map((t) => {
        const cls =
          t.type === 'error'
            ? 'bg-red-600 text-white'
            : t.type === 'success'
              ? 'bg-emerald-600 text-white'
              : t.type === 'warn'
                ? 'bg-amber-600 text-white'
                : 'bg-slate-900 text-white';
        return (
          <div
            key={t.id}
            className={`${cls} px-4 py-3 rounded-xl shadow-lg text-xs font-semibold pointer-events-auto`}
          >
            {t.msg}
          </div>
        );
      })}
    </div>
  );

  // Fullscreen dedicated views
  if (view === 'exam' && activeExam) {
    return (
      <>
        <ExamRunner
          lang={lang}
          initialExam={activeExam}
          studentName={studentName}
          studentClass={studentClass}
          onExitToLanding={() => {
            setActiveExam(null);
            setView('landing');
          }}
          onViewProgress={() => {
            setActiveExam(null);
            setView('progress');
          }}
          notify={notify}
        />
        {toastBanner}
      </>
    );
  }

  if (view === 'auth') {
    return (
      <>
        <TeacherAuthView
          lang={lang}
          onAuthenticated={async (tProfile) => {
            setTeacher(tProfile);
            setView('teacher');
            await loadTeacherData();
          }}
          onBack={() => setView('landing')}
          notify={notify}
        />
        {toastBanner}
      </>
    );
  }

  if (view === 'teacher' && teacher) {
    return (
      <>
        <TeacherDashboardView
          lang={lang}
          teacher={teacher}
          folders={folders}
          exams={exams}
          submissions={submissions}
          loading={loadingTeacherData}
          onRefresh={loadTeacherData}
          onLogout={handleLogout}
          onGoHome={() => setView('landing')}
          notify={notify}
        />
        {toastBanner}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      {/* 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xs border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark (single text element) */}
          <button
            type="button"
            onClick={() => setView('landing')}
            className="text-lg font-display font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            ProctorKZ
          </button>

          {/* Zone 2: Clean single-line text nav links */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
            <button
              type="button"
              onClick={() => setView('landing')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 ${
                view === 'landing' ? 'text-slate-900 font-semibold' : ''
              }`}
            >
              {tLabel(lang, 'Емтихан тапсыру', 'Take Exam')}
            </button>
            <button
              type="button"
              onClick={() => setView('progress')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 ${
                view === 'progress' ? 'text-slate-900 font-semibold' : ''
              }`}
            >
              {tLabel(lang, 'Оқушы үлгерімі', 'Student Progress')}
            </button>
            <button
              type="button"
              onClick={openTeacherWorkspace}
              className="whitespace-nowrap shrink-0 transition-colors hover:text-slate-900"
            >
              {tLabel(lang, 'Мұғалім панелі', 'Teacher Dashboard')}
            </button>
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={openTeacherWorkspace}
              className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold whitespace-nowrap shrink-0 transition-colors"
            >
              {teacher
                ? tLabel(lang, 'Менің панелім', 'My Dashboard')
                : tLabel(lang, 'Мұғалім кіруі', 'Teacher Login')}
            </button>
          </div>
        </div>

        {/* Mobile Quick Nav Row */}
        <div className="md:hidden border-t border-slate-100 px-4 py-2 flex items-center gap-4 text-xs font-semibold text-slate-600 overflow-x-auto">
          <button
            type="button"
            onClick={() => setView('landing')}
            className={`whitespace-nowrap shrink-0 ${view === 'landing' ? 'text-blue-600' : ''}`}
          >
            {tLabel(lang, 'Емтихан тапсыру', 'Take Exam')}
          </button>
          <button
            type="button"
            onClick={() => setView('progress')}
            className={`whitespace-nowrap shrink-0 ${view === 'progress' ? 'text-blue-600' : ''}`}
          >
            {tLabel(lang, 'Оқушы үлгерімі', 'Student Progress')}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {view === 'progress' ? (
          <StudentProgressView lang={lang} onStartExamTab={() => setView('landing')} />
        ) : (
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 lg:py-16 space-y-16">
            {/* Hero 2-Column Split */}
            <section className="grid lg:grid-cols-12 gap-10 lg:gap-12 items-center">
              <div className="lg:col-span-6 space-y-6">
                <div className="text-xs font-medium text-slate-500 flex flex-wrap items-center gap-2">
                  <span>{tLabel(lang, 'Көп мұғалімді жүйе', 'Multi-Teacher Isolation')}</span>
                  <span aria-hidden="true">·</span>
                  <span>{tLabel(lang, 'Прокторинг бақылауы', 'Browser Proctoring')}</span>
                  <span aria-hidden="true">·</span>
                  <span>{tLabel(lang, 'Үлгерім тарихы', 'Progress Analytics')}</span>
                </div>

                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-extrabold tracking-tight text-slate-900 leading-[1.12] text-balance">
                  {tLabel(
                    lang,
                    'Онлайн емтихан, квиз және үлгерім бақылау — бір жүйеде',
                    'Online exams, proctoring, and progress tracking in one workspace'
                  )}
                </h1>

                <p className="text-base text-slate-600 leading-relaxed max-w-xl">
                  {tLabel(
                    lang,
                    'Әр мұғалім өз Email және паролімен жеке кабинетінде тест құрастырады. Оқушылар арнайы код немесе тікелей сілтеме арқылы кіріп тапсырады, ал нәтижесі бірден мұғалім панеліне және оқушының үлгерім тарихына түседі.',
                    'Each teacher manages private exams in an isolated dashboard. Students join with a unique code or direct link, while scores, percentages, and proctoring logs sync instantly to both teacher and student views.'
                  )}
                </p>

                <div className="pt-2 space-y-2.5 text-sm text-slate-700">
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>
                      {tLabel(
                        lang,
                        'Қатаң прокторинг: қойынды ауыстыруды, көшіруді және толық экраннан шығуды тіркеу',
                        'Strict proctoring: tab switching, copy blocking, fullscreen lock & violation logs'
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>
                      {tLabel(
                        lang,
                        '7 сұрақ түрі, KaTeX формулалары, диаграммалар және Word / Excel импорт',
                        '7 question formats, KaTeX formulas, bar diagrams, and Word / Excel import'
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <UserCheck className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>
                      {tLabel(
                        lang,
                        'Оқушының барлық тапсырылған емтихан тарихы мен ескерту журналы',
                        'Dedicated student progress section with full score history and violation audit'
                      )}
                    </span>
                  </div>
                </div>

                <div className="pt-2 flex flex-wrap items-center gap-4 text-sm">
                  <button
                    type="button"
                    onClick={() => setView('progress')}
                    className="inline-flex items-center gap-1.5 font-semibold text-blue-600 hover:text-blue-700"
                  >
                    {tLabel(lang, 'Оқушы үлгерімін көру', 'View Student Progress')}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <span className="text-slate-300" aria-hidden="true">
                    |
                  </span>
                  <button
                    type="button"
                    onClick={openTeacherWorkspace}
                    className="font-semibold text-slate-700 hover:text-slate-900"
                  >
                    {tLabel(lang, 'Мұғалім панелін ашу', 'Open Teacher Dashboard')}
                  </button>
                </div>
              </div>

              {/* Dominant Focal Anchor: Student Join Card */}
              <div className="lg:col-span-6">
                <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">
                      {tLabel(lang, 'Оқушы ретінде кіру', 'Join an Exam')}
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">
                      {tLabel(
                        lang,
                        'Мұғалім берген емтихан кодын және деректеріңізді енгізіңіз',
                        'Enter the exam code provided by your teacher to begin'
                      )}
                    </p>
                  </div>

                  <form onSubmit={handleJoinExam} className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label
                          htmlFor="exam-code-field"
                          className="block text-xs font-semibold text-slate-700"
                        >
                          {tLabel(lang, 'Емтихан коды', 'Exam Code')} *
                        </label>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span>{tLabel(lang, 'Үлгі:', 'Try:')}</span>
                          <button
                            type="button"
                            onClick={() => setJoinCode('DEMO-1')}
                            className="font-mono font-semibold text-blue-600 hover:underline"
                          >
                            DEMO-1
                          </button>
                          <span aria-hidden="true">·</span>
                          <button
                            type="button"
                            onClick={() => setJoinCode('KZ-4821')}
                            className="font-mono font-semibold text-blue-600 hover:underline"
                          >
                            KZ-4821
                          </button>
                        </div>
                      </div>
                      <div className="relative">
                        <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          id="exam-code-field"
                          type="text"
                          value={joinCode}
                          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                          placeholder="KZ-4821"
                          className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 bg-slate-50/50 font-mono font-bold uppercase text-base tracking-wider text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/15"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="student-name-field"
                        className="block text-xs font-semibold text-slate-700 mb-1.5"
                      >
                        {tLabel(lang, 'Аты-жөніңіз', 'Full Name')} *
                      </label>
                      <input
                        id="student-name-field"
                        type="text"
                        value={studentName}
                        onChange={(e) => setStudentName(e.target.value)}
                        placeholder={tLabel(lang, 'Мысалы: Асқар Нұрланов', 'e.g. Askar Nurlanov')}
                        className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="student-class-field"
                        className="block text-xs font-semibold text-slate-700 mb-1.5"
                      >
                        {tLabel(lang, 'Сыныбы немесе тобы', 'Class / Group')}
                      </label>
                      <input
                        id="student-class-field"
                        type="text"
                        value={studentClass}
                        onChange={(e) => setStudentClass(e.target.value)}
                        placeholder={tLabel(lang, 'Мысалы: 10-А', 'e.g. 10-A')}
                        className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={joining}
                      className="w-full py-3.5 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <span>
                        {joining
                          ? tLabel(lang, 'Емтихан ізделуде...', 'Looking up exam...')
                          : tLabel(lang, 'Кіру және бастау', 'Enter & Start Exam')}
                      </span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </form>
                </div>
              </div>
            </section>

            {/* Structured Editorial Capabilities Row */}
            <section className="pt-10 border-t border-slate-200 grid md:grid-cols-3 gap-8">
              <div className="space-y-2">
                <h3 className="text-base font-bold text-slate-900">
                  01. {tLabel(lang, 'Мұғалімнің дербес кабинеті', 'Isolated Teacher Dashboard')}
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {tLabel(
                    lang,
                    'Қалташалар бойынша жүйелеу, бірегей код пен тікелей сілтеме беру, күту бөлмесін басқару және ашық сұрақтарды қолмен бағалау.',
                    'Organize exams into folders, share unique access codes or links, launch live waiting rooms, and manually grade open responses.'
                  )}
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="text-base font-bold text-slate-900">
                  02. {tLabel(lang, 'Оқушы үлгерімі және ескерту тарихы', 'Student Progress & Audit Log')}
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {tLabel(
                    lang,
                    'Барлық тапсырылған емтихандар, жинаған балдар, пайыздық өсу динамикасы және тіркелген прокторинг ескертулері бір бөлімде.',
                    'Review every completed exam, score, percentage trend chart, and exact timestamps for any proctoring violations.'
                  )}
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="text-base font-bold text-slate-900">
                  03. {tLabel(lang, 'Формулалар және жылдам импорт', 'KaTeX Formulas & Smart Import')}
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {tLabel(
                    lang,
                    'LaTeX формула тақтасы, бағанды диаграммалар, сурет/видео/аудио және Word (.docx), Excel (.xlsx), Google Drive-тан автоматты жүктеу.',
                    'Author rich math with KaTeX, embed bar diagrams or media, and bulk-import questions from Word, Excel, or Google Docs.'
                  )}
                </p>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* Quiet Footer with Language Switch */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <span>ProctorKZ Cloud · {tLabel(lang, 'Онлайн емтихан платформасы', 'Online Exam Platform')}</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setLang('kk')}
              className={`font-semibold transition-colors ${
                lang === 'kk' ? 'text-slate-900 underline underline-offset-4' : 'hover:text-slate-800'
              }`}
            >
              Қазақша
            </button>
            <span aria-hidden="true">/</span>
            <button
              type="button"
              onClick={() => setLang('en')}
              className={`font-semibold transition-colors ${
                lang === 'en' ? 'text-slate-900 underline underline-offset-4' : 'hover:text-slate-800'
              }`}
            >
              English
            </button>
          </div>
        </div>
      </footer>

      {toastBanner}
    </div>
  );
}
