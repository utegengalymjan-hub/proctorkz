import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { api, getOrCreateStudentId } from '../lib/api';
import { FONT_FAMILIES, FONT_SIZES, MODES, Q_TYPES, SUBJECTS, tLabel } from '../lib/constants';
import { evaluateSingleQuestion, formatDuration, prepareExamQuestions } from '../lib/examUtils';
import type { Exam, Lang, PreparedQuestion, Submission, ViolationRecord } from '../types';
import { MediaBlock, RichText } from './RichText';

interface ExamRunnerProps {
  lang: Lang;
  initialExam: Exam;
  studentName: string;
  studentClass: string;
  onExitToLanding: () => void;
  onViewProgress: () => void;
  notify: (msg: string, type?: 'info' | 'success' | 'warn' | 'error') => void;
}

export const ExamRunner: React.FC<ExamRunnerProps> = ({
  lang,
  initialExam,
  studentName,
  studentClass,
  onExitToLanding,
  onViewProgress,
  notify,
}) => {
  const [exam, setExam] = useState<Exam>(initialExam);
  const [phase, setPhase] = useState<'waiting' | 'active' | 'result'>(
    initialExam.requireTeacherStart && !initialExam.liveStarted ? 'waiting' : 'active'
  );
  const [questions, setQuestions] = useState<PreparedQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [checkedPrep, setCheckedPrep] = useState<
    Record<string, { earned: number; maxPts: number; isCorrect: boolean; status: string }>
  >({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [timeLeftSec, setTimeLeftSec] = useState((initialExam.timeLimitMin || 15) * 60);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [violations, setViolations] = useState<ViolationRecord[]>([]);
  const [violationModalReason, setViolationModalReason] = useState<string | null>(null);
  const [showConfirmFinish, setShowConfirmFinish] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastSubmission, setLastSubmission] = useState<Submission | null>(null);
  const [openDropdownKey, setOpenDropdownKey] = useState<string | null>(null);

  const enteredFsRef = useRef(false);
  const lastViolationTsRef = useRef(0);
  const finishedRef = useRef(false);
  const answersRef = useRef(answers);
  const questionsRef = useRef(questions);
  const violationsRef = useRef(violations);
  const elapsedRef = useRef(elapsedSec);

  answersRef.current = answers;
  questionsRef.current = questions;
  violationsRef.current = violations;
  elapsedRef.current = elapsedSec;

  const isStrict = phase === 'active' && exam.mode === 'exam';

  const requestFullscreenSafe = useCallback(() => {
    if (document.documentElement.requestFullscreen) {
      document.documentElement
        .requestFullscreen()
        .then(() => {
          enteredFsRef.current = true;
        })
        .catch(() => {});
    }
  }, []);

  const beginExamSession = useCallback(
    (targetExam: Exam) => {
      const { prepared, initialAnswers } = prepareExamQuestions(targetExam);
      setExam(targetExam);
      setQuestions(prepared);
      setAnswers(initialAnswers);
      setCheckedPrep({});
      setCurrentIdx(0);
      setTimeLeftSec((targetExam.timeLimitMin || 15) * 60);
      setElapsedSec(0);
      setViolations([]);
      setViolationModalReason(null);
      finishedRef.current = false;
      setPhase('active');
      if (targetExam.mode === 'exam') {
        requestFullscreenSafe();
      }
    },
    [requestFullscreenSafe]
  );

  // Initialize active session immediately if not waiting
  useEffect(() => {
    if (phase === 'active' && questions.length === 0) {
      beginExamSession(initialExam);
    }
  }, [phase, questions.length, initialExam, beginExamSession]);

  // Waiting room polling
  useEffect(() => {
    if (phase !== 'waiting') return;
    const interval = window.setInterval(async () => {
      try {
        const res = await api.getExamByCode(exam.code);
        if (res.exam.liveStarted) {
          window.clearInterval(interval);
          notify(tLabel(lang, 'Мұғалім емтиханды бастады!', 'Teacher started the exam!'), 'success');
          beginExamSession(res.exam);
        }
      } catch {
        // ignore transient polling errors
      }
    }, 2500);
    return () => window.clearInterval(interval);
  }, [phase, exam.code, beginExamSession, notify, lang]);

  const finishExam = useCallback(
    async (auto = false, autoReason = '') => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      setShowConfirmFinish(false);
      setSubmitting(true);

      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }

      const qs = questionsRef.current;
      const ansMap = answersRef.current;
      let totalEarned = 0;
      let totalMax = 0;
      let hasPendingManual = false;

      const details = qs.map((q) => {
        const res = evaluateSingleQuestion(q, ansMap[q.id]);
        totalEarned += res.earned;
        totalMax += res.maxPts;
        if (res.status === 'pending') hasPendingManual = true;
        return {
          questionId: q.id,
          type: q.type,
          text: q.text,
          userAnswer: ansMap[q.id],
          points: res.earned,
          maxPoints: res.maxPts,
          isCorrect: res.isCorrect,
          status: res.status,
        };
      });

      const score = Number(totalEarned.toFixed(2));
      const percent = totalMax > 0 ? Math.round((score / totalMax) * 100) : 0;

      const payload = {
        examId: exam.id,
        studentId: getOrCreateStudentId(),
        studentName,
        studentClass,
        submittedAt: new Date().toLocaleString('kk-KZ'),
        spentSec: elapsedRef.current,
        score,
        maxScore: totalMax,
        percent,
        hasPendingManual,
        violations: violationsRef.current,
        autoSubmitted: auto,
        autoReason,
        details,
      };

      try {
        const saved = await api.submitExam(payload);
        setLastSubmission(saved);
        notify(tLabel(lang, 'Нәтиже сақталды және мұғалімге жіберілді!', 'Submission saved and sent to teacher!'), 'success');
      } catch (err) {
        notify(
          err instanceof Error ? err.message : tLabel(lang, 'Сақтау қатесі', 'Failed to save submission'),
          'error'
        );
        setLastSubmission({
          ...payload,
          id: 'local-' + Date.now(),
          teacherId: exam.teacherId,
          examCode: exam.code,
          examTitle: exam.title,
          subject: exam.subject,
          mode: exam.mode,
          createdAt: new Date().toISOString(),
        });
      } finally {
        setSubmitting(false);
        setPhase('result');
      }
    },
    [exam, studentName, studentClass, notify, lang]
  );

  // Countdown / Elapsed Timer
  useEffect(() => {
    if (phase !== 'active') return;
    const timer = window.setInterval(() => {
      setElapsedSec((prev) => prev + 1);
      if (exam.isTimed) {
        setTimeLeftSec((prev) => {
          if (prev <= 1) {
            window.clearInterval(timer);
            finishExam(true, tLabel(lang, 'Уақыт аяқталды', 'Time expired'));
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase, exam.isTimed, finishExam, lang]);

  // Strict Proctoring Listeners
  useEffect(() => {
    if (!isStrict) return;

    const triggerViolation = (reason: string) => {
      if (finishedRef.current) return;
      const now = Date.now();
      if (now - lastViolationTsRef.current < 1500) return;
      lastViolationTsRef.current = now;

      const record: ViolationRecord = {
        reason,
        time: new Date().toLocaleTimeString('kk-KZ'),
      };
      const next = [...violationsRef.current, record];
      violationsRef.current = next;
      setViolations(next);

      const maxV = exam.maxViolations ?? 3;
      const isUnlimited = maxV === 0;
      const action = exam.violationAction || 'auto_submit';

      if (!isUnlimited && action === 'auto_submit' && next.length >= maxV) {
        notify(
          tLabel(
            lang,
            `Ереже ${maxV} рет бұзылды! Емтихан автоматты түрде аяқталды.`,
            `Violation limit (${maxV}) reached. Exam auto-submitted.`
          ),
          'error'
        );
        finishExam(
          true,
          tLabel(lang, 'Прокторинг лимиті асып кетті', 'Proctoring violation limit exceeded')
        );
      } else {
        setViolationModalReason(reason);
      }
    };

    const handleVisibility = () => {
      if (document.hidden) {
        triggerViolation(tLabel(lang, 'Басқа қойындыға немесе қосымшаға өту', 'Switched tab or application'));
      }
    };
    const handleBlur = () => {
      triggerViolation(tLabel(lang, 'Емтихан терезесінен шығу', 'Left exam window focus'));
    };
    const handleFs = () => {
      if (document.fullscreenElement) {
        enteredFsRef.current = true;
      } else if (enteredFsRef.current) {
        triggerViolation(tLabel(lang, 'Толық экран режимінен шығу', 'Exited fullscreen mode'));
      }
    };
    const preventCheat = (e: Event) => {
      if (e.type === 'contextmenu') {
        e.preventDefault();
        notify(tLabel(lang, 'Оң жақ батырма бұғатталған', 'Context menu is disabled'), 'warn');
      } else if (['copy', 'cut', 'paste'].includes(e.type)) {
        e.preventDefault();
        notify(tLabel(lang, 'Көшіруге және қоюға тыйым салынған', 'Copy and paste are disabled'), 'error');
      } else if (e.type === 'keydown') {
        const ke = e as KeyboardEvent;
        const k = ke.key.toLowerCase();
        const ctrl = ke.ctrlKey || ke.metaKey;
        if (
          ke.key === 'F12' ||
          ke.key === 'PrintScreen' ||
          (ctrl && ['c', 'v', 'x', 'u', 's', 'p', 'a'].includes(k)) ||
          (ctrl && ke.shiftKey && ['i', 'j', 'c'].includes(k))
        ) {
          ke.preventDefault();
          notify(tLabel(lang, 'Бұл перне тіркесімі бұғатталған', 'Keyboard shortcut is blocked'), 'error');
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('fullscreenchange', handleFs);
    ['contextmenu', 'copy', 'cut', 'paste', 'keydown'].forEach((ev) =>
      document.addEventListener(ev, preventCheat)
    );

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('fullscreenchange', handleFs);
      ['contextmenu', 'copy', 'cut', 'paste', 'keydown'].forEach((ev) =>
        document.removeEventListener(ev, preventCheat)
      );
    };
  }, [isStrict, exam.maxViolations, exam.violationAction, finishExam, notify, lang]);

  const currentQ = questions[currentIdx];

  const isQuestionAnswered = (q: PreparedQuestion) => {
    const ans = answers[q.id];
    if (ans === undefined || ans === null || ans === '') return false;
    if (Array.isArray(ans)) return ans.length > 0 && ans.some((v) => String(v || '').trim() !== '');
    if (typeof ans === 'object') return Object.keys(ans as Record<string, unknown>).length > 0;
    return true;
  };

  const answeredCount = useMemo(
    () => questions.filter((q) => isQuestionAnswered(q)).length,
    [questions, answers]
  );

  // WAITING ROOM
  if (phase === 'waiting') {
    const subj = SUBJECTS[exam.subject] || SUBJECTS.general;
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-6">
          <div className="space-y-2">
            <div className="text-xs font-mono font-semibold text-blue-600">{exam.code}</div>
            <h2 className="text-2xl font-bold text-slate-900">
              {tLabel(lang, 'Күту бөлмесі', 'Waiting Room')}
            </h2>
            <p className="text-sm text-slate-600">{exam.title}</p>
            <div className="text-xs text-slate-500">
              {lang === 'kk' ? subj.kk : subj.en} · {exam.questions.length}{' '}
              {tLabel(lang, 'сұрақ', 'questions')}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm space-y-1">
            <div className="font-semibold text-slate-900">
              {studentName} ({studentClass})
            </div>
            <p className="text-xs text-slate-500">
              {tLabel(
                lang,
                'Мұғалім «Барлығына бастау» батырмасын басқан кезде емтихан автоматты түрде ашылады.',
                'The exam will start automatically as soon as your teacher launches the live session.'
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={onExitToLanding}
            className="px-5 py-2.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-semibold transition-colors"
          >
            {tLabel(lang, 'Артқа қайту', 'Leave Waiting Room')}
          </button>
        </div>
      </div>
    );
  }

  // RESULT VIEW
  if (phase === 'result' && lastSubmission) {
    return (
      <div className="min-h-screen bg-slate-50 py-10 px-4 flex items-center justify-center">
        <div className="max-w-2xl w-full bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 space-y-6">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">
                {tLabel(lang, 'Емтихан аяқталды', 'Exam Submitted')}
              </h2>
              <p className="text-sm text-slate-600 mt-1">{lastSubmission.examTitle}</p>
              <div className="text-xs text-slate-500 mt-1">
                {lastSubmission.studentName} · {lastSubmission.studentClass} ·{' '}
                {formatDuration(lastSubmission.spentSec)}
              </div>
            </div>
            <div className="text-right font-mono">
              <div className="text-3xl font-bold text-blue-600 tabular-nums">
                {lastSubmission.percent}%
              </div>
              <div className="text-xs text-slate-500 tabular-nums">
                {lastSubmission.score} / {lastSubmission.maxScore}
              </div>
            </div>
          </div>

          {lastSubmission.autoSubmitted && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                {tLabel(lang, 'Автоматты аяқталды:', 'Auto-submitted:')} {lastSubmission.autoReason}
              </span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-xs text-slate-500">{tLabel(lang, 'Жинаған балл', 'Score')}</div>
              <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                {lastSubmission.score} / {lastSubmission.maxScore}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-xs text-slate-500">{tLabel(lang, 'Пайыз', 'Percentage')}</div>
              <div className="text-xl font-bold font-mono tabular-nums text-blue-600 mt-1">
                {lastSubmission.percent}%
              </div>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-xs text-slate-500">{tLabel(lang, 'Ескертулер', 'Violations')}</div>
              <div
                className={`text-xl font-bold font-mono tabular-nums mt-1 ${
                  lastSubmission.violations.length > 0 ? 'text-red-600' : 'text-emerald-700'
                }`}
              >
                {lastSubmission.violations.length}
              </div>
            </div>
          </div>

          {lastSubmission.hasPendingManual && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 font-medium">
              {tLabel(
                lang,
                'Ашық сұрақтар бар — мұғалім тексергеннен кейін қорытынды балыңыз жаңартылады.',
                'Open-ended questions are pending teacher review; your final score will update once graded.'
              )}
            </div>
          )}

          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {lastSubmission.details.map((d, idx) => (
              <div
                key={`${d.questionId}-${idx}`}
                className="p-3 rounded-lg border border-slate-200 flex items-center justify-between gap-3 text-xs"
              >
                <span className="text-slate-800 truncate">
                  {idx + 1}. <RichText text={d.text} />
                </span>
                <span
                  className={`font-mono font-semibold shrink-0 tabular-nums ${
                    d.status === 'pending'
                      ? 'text-amber-700'
                      : d.isCorrect
                        ? 'text-emerald-700'
                        : 'text-red-700'
                  }`}
                >
                  {d.status === 'pending'
                    ? tLabel(lang, 'Тексерілуде', 'Pending')
                    : `${d.points} / ${d.maxPoints}`}
                </span>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="button"
              onClick={onViewProgress}
              className="flex-1 py-3 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors"
            >
              {tLabel(lang, 'Үлгерім тарихын көру', 'View Progress History')}
            </button>
            <button
              type="button"
              onClick={onExitToLanding}
              className="flex-1 py-3 px-4 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-sm transition-colors"
            >
              {tLabel(lang, 'Басты бетке оралу', 'Return Home')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ACTIVE EXAM VIEW
  if (!currentQ) return null;

  const subj = SUBJECTS[exam.subject] || SUBJECTS.general;
  const mode = MODES[exam.mode] || MODES.exam;
  const fontKey = (currentQ.fontFamily || exam.fontFamily || 'sans') as keyof typeof FONT_FAMILIES;
  const fontCss = (FONT_FAMILIES[fontKey] || FONT_FAMILIES.sans).css;
  const fontSizeCls = (FONT_SIZES[exam.fontSize] || FONT_SIZES.base).cls;
  const maxV = exam.maxViolations ?? 3;
  const isUnlimitedViolations = maxV === 0;
  const isWarnOnly = exam.violationAction === 'warn_only';

  return (
    <div className={`${isStrict ? 'no-select' : ''} min-h-screen bg-slate-50 flex flex-col relative`}>
      {/* Proctoring Watermark Layer */}
      {isStrict && (
        <div className="proctor-watermark" aria-hidden="true">
          {Array.from({ length: 12 }).map((_, idx) => (
            <div key={idx} className="text-slate-900 font-semibold text-sm whitespace-nowrap">
              {studentName} · {studentClass} · {exam.code}
            </div>
          ))}
        </div>
      )}

      {/* Proctoring Violation Modal */}
      {violationModalReason && (
        <div className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border-2 border-red-500 space-y-4 text-center">
            <ShieldAlert className="w-10 h-10 text-red-600 mx-auto" />
            <h3 className="text-xl font-bold text-slate-900">
              {tLabel(lang, 'Емтихан ережесі бұзылды', 'Proctoring Warning')}
            </h3>
            <p className="text-sm font-medium text-red-700">{violationModalReason}</p>
            <div className="py-2 px-4 rounded-lg bg-red-50 border border-red-200 text-sm font-mono font-bold text-red-700 tabular-nums inline-block">
              {tLabel(lang, 'Ескерту:', 'Violation:')}{' '}
              {isUnlimitedViolations
                ? `${violations.length} (${tLabel(lang, 'Шектеусіз', 'Unlimited')})`
                : `${violations.length} / ${maxV}`}
            </div>
            {(isUnlimitedViolations || isWarnOnly) && (
              <p className="text-xs text-slate-500">
                {tLabel(
                  lang,
                  'Бұл оқиға мұғалімнің прокторинг журналына тіркелді.',
                  'This incident has been logged to your teacher’s proctoring report.'
                )}
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                setViolationModalReason(null);
                requestFullscreenSafe();
              }}
              className="w-full py-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm transition-colors"
            >
              {tLabel(lang, 'Емтиханға оралу', 'Return to Exam')}
            </button>
          </div>
        </div>
      )}

      {/* Confirm Submit Modal */}
      {showConfirmFinish && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-slate-200 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">
              {tLabel(lang, 'Емтиханды аяқтауды растаңыз', 'Confirm Exam Submission')}
            </h3>
            <p className="text-sm text-slate-600">
              {tLabel(
                lang,
                `Сіз ${questions.length} сұрақтың ${answeredCount} сұрағына жауап бердіңіз. Жауаптарды жіберуді растайсыз ба?`,
                `You have answered ${answeredCount} of ${questions.length} questions. Submit your exam now?`
              )}
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmFinish(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50"
              >
                {tLabel(lang, 'Болдырмау', 'Cancel')}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => finishExam(false)}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50"
              >
                {submitting
                  ? tLabel(lang, 'Жіберілуде...', 'Submitting...')
                  : tLabel(lang, 'Тапсыру', 'Submit Exam')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky Top Exam Header */}
      <header className="sticky top-0 z-20 bg-slate-900 text-white border-b border-slate-800">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="font-semibold text-sm sm:text-base truncate">{exam.title}</div>
            <div className="text-xs text-slate-300 flex flex-wrap items-center gap-x-2 mt-0.5">
              <span>{lang === 'kk' ? subj.kk : subj.en}</span>
              <span aria-hidden="true">·</span>
              <span>{lang === 'kk' ? mode.kk : mode.en}</span>
              <span aria-hidden="true">·</span>
              <span>{studentName}</span>
              {isStrict && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className={violations.length > 0 ? 'text-red-300 font-semibold' : 'text-emerald-300'}>
                    {tLabel(lang, 'Ескерту:', 'Violations:')}{' '}
                    {isUnlimitedViolations
                      ? `${violations.length} (∞)`
                      : `${violations.length}/${maxV}`}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div
              className={`px-3 py-1.5 rounded-lg bg-slate-800 font-mono font-semibold text-sm tabular-nums flex items-center gap-1.5 ${
                exam.isTimed && timeLeftSec <= 60 ? 'text-red-400' : 'text-white'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              {exam.isTimed ? formatDuration(timeLeftSec) : formatDuration(elapsedSec)}
            </div>
            <button
              type="button"
              onClick={() => setShowConfirmFinish(true)}
              className="px-4 py-2 rounded-lg bg-white text-slate-900 hover:bg-slate-100 font-semibold text-xs sm:text-sm whitespace-nowrap transition-colors"
            >
              {tLabel(lang, 'Аяқтау', 'Finish')}
            </button>
          </div>
        </div>
      </header>

      {/* Main Exam Area */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 relative z-10 grid lg:grid-cols-12 gap-6 items-start">
        {/* Question Card */}
        <div
          className={`lg:col-span-9 bg-white rounded-xl border border-slate-200 p-5 sm:p-8 flex flex-col justify-between min-h-[460px] ${fontSizeCls}`}
          style={{ fontFamily: fontCss }}
        >
          <div>
            <div
              className="flex flex-wrap items-center justify-between gap-2 pb-4 mb-5 border-b border-slate-100 text-xs text-slate-500"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              <span className="font-semibold text-slate-900 font-mono tabular-nums">
                {tLabel(lang, 'Сұрақ', 'Question')} {currentIdx + 1} / {questions.length}
              </span>
              <div className="flex items-center gap-2">
                <span>{lang === 'kk' ? Q_TYPES[currentQ.type].kk : Q_TYPES[currentQ.type].en}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono font-semibold text-slate-700 tabular-nums">
                  {currentQ.points || 1} {tLabel(lang, 'балл', 'pts')}
                </span>
              </div>
            </div>

            <MediaBlock media={currentQ.media} />

            {currentQ.type !== 'fill' && (
              <h2 className="font-bold text-slate-900 mb-6 leading-snug text-[1.15em]">
                <RichText text={currentQ.text} />
              </h2>
            )}

            {/* Single / Binary */}
            {(currentQ.type === 'single' || currentQ.type === 'binary') && (
              <div className={currentQ.type === 'binary' ? 'grid sm:grid-cols-2 gap-3' : 'space-y-3'}>
                {(currentQ.shuffledOptions || []).map((opt, idx) => {
                  const selected = answers[currentQ.id] === opt.origIdx;
                  return (
                    <button
                      key={opt.origIdx}
                      type="button"
                      onClick={() => setAnswers((prev) => ({ ...prev, [currentQ.id]: opt.origIdx }))}
                      className={`w-full text-left p-4 rounded-xl border transition-colors flex items-center gap-3.5 ${
                        selected
                          ? 'border-blue-600 bg-blue-50/60'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <span
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-mono font-bold shrink-0 ${
                          selected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <span className="text-slate-800 font-medium">
                        <RichText text={opt.text} />
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Multiple */}
            {currentQ.type === 'multiple' && (
              <div className="space-y-3">
                <p
                  className="text-xs font-medium text-blue-700"
                  style={{ fontFamily: 'var(--font-body)' }}
                >
                  {tLabel(lang, 'Бірнеше дұрыс жауапты таңдаңыз', 'Select all correct answers')}
                </p>
                {(currentQ.shuffledOptions || []).map((opt) => {
                  const arr = Array.isArray(answers[currentQ.id]) ? (answers[currentQ.id] as number[]) : [];
                  const selected = arr.includes(opt.origIdx);
                  return (
                    <button
                      key={opt.origIdx}
                      type="button"
                      onClick={() => {
                        const next = selected
                          ? arr.filter((v) => v !== opt.origIdx)
                          : [...arr, opt.origIdx];
                        setAnswers((prev) => ({ ...prev, [currentQ.id]: next }));
                      }}
                      className={`w-full text-left p-4 rounded-xl border transition-colors flex items-center gap-3.5 ${
                        selected
                          ? 'border-blue-600 bg-blue-50/60'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <span
                        className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                          selected
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'border-slate-300 bg-white'
                        }`}
                      >
                        {selected && <Check className="w-3.5 h-3.5" />}
                      </span>
                      <span className="text-slate-800 font-medium">
                        <RichText text={opt.text} />
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Matching */}
            {currentQ.type === 'matching' && (
              <div className="space-y-3">
                {(currentQ.leftItems || []).map((li) => {
                  const uMap = (answers[currentQ.id] as Record<number, string>) || {};
                  const chosen = uMap[li.id] || '';
                  const dk = `${currentQ.id}_${li.id}`;
                  const isOpen = openDropdownKey === dk;

                  return (
                    <div
                      key={li.id}
                      className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="font-medium text-slate-900 sm:w-5/12">
                        <RichText text={li.text} />
                      </div>
                      <div className="sm:w-6/12 relative">
                        <button
                          type="button"
                          onClick={() => setOpenDropdownKey(isOpen ? null : dk)}
                          className={`w-full px-3.5 py-2.5 rounded-lg border text-left text-sm font-medium flex items-center justify-between gap-2 ${
                            chosen
                              ? 'bg-blue-50/70 border-blue-400 text-blue-950'
                              : 'bg-white border-slate-300 text-slate-500'
                          }`}
                        >
                          <span className="truncate">
                            {chosen ? (
                              <RichText text={chosen} />
                            ) : (
                              tLabel(lang, 'Жұбын таңдаңыз...', 'Select match...')
                            )}
                          </span>
                          <ChevronDown className="w-4 h-4 shrink-0" />
                        </button>
                        {isOpen && (
                          <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-30 max-h-52 overflow-y-auto py-1">
                            {(currentQ.rightPool || []).map((rText, rIdx) => (
                              <button
                                key={`${rIdx}-${rText}`}
                                type="button"
                                onClick={() => {
                                  setAnswers((prev) => ({
                                    ...prev,
                                    [currentQ.id]: {
                                      ...((prev[currentQ.id] as Record<number, string>) || {}),
                                      [li.id]: rText,
                                    },
                                  }));
                                  setOpenDropdownKey(null);
                                }}
                                className="w-full text-left px-3.5 py-2 text-sm text-slate-800 hover:bg-blue-50"
                              >
                                <RichText text={rText} />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Ordering */}
            {currentQ.type === 'ordering' && (
              <div className="space-y-2.5">
                {((answers[currentQ.id] as string[]) || currentQ.items || []).map((item, idx, arr) => (
                  <div
                    key={`${item}-${idx}`}
                    className="p-3.5 rounded-xl border border-slate-200 bg-white flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 font-mono font-bold text-xs flex items-center justify-center shrink-0 tabular-nums">
                        {idx + 1}
                      </span>
                      <span className="font-medium text-slate-800">
                        <RichText text={item} />
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => {
                          const next = [...arr];
                          [next[idx], next[idx - 1]] = [next[idx - 1], next[idx]];
                          setAnswers((prev) => ({ ...prev, [currentQ.id]: next }));
                        }}
                        className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30 text-slate-700"
                        aria-label="Move up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === arr.length - 1}
                        onClick={() => {
                          const next = [...arr];
                          [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                          setAnswers((prev) => ({ ...prev, [currentQ.id]: next }));
                        }}
                        className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30 text-slate-700"
                        aria-label="Move down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Fill in the Blank */}
            {currentQ.type === 'fill' && (
              <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 leading-loose text-slate-900">
                {(() => {
                  const parts = currentQ.text.split(/(\[[^\]]+\])/);
                  const ub = Array.isArray(answers[currentQ.id])
                    ? (answers[currentQ.id] as string[])
                    : [];
                  let blankIdx = 0;
                  return parts.map((part, pIdx) => {
                    if (/^\[[^\]]+\]$/.test(part)) {
                      const idx = blankIdx++;
                      return (
                        <input
                          key={`blank-${pIdx}`}
                          type="text"
                          value={ub[idx] || ''}
                          onChange={(e) => {
                            const next = [...ub];
                            next[idx] = e.target.value;
                            setAnswers((prev) => ({ ...prev, [currentQ.id]: next }));
                          }}
                          placeholder={tLabel(lang, 'жауап...', 'answer...')}
                          className="inline-block mx-1.5 px-3 py-1 rounded-lg border-2 border-blue-400 bg-white text-blue-950 font-semibold text-sm w-36 focus:outline-none focus:border-blue-600"
                        />
                      );
                    }
                    return <RichText key={`txt-${pIdx}`} text={part} />;
                  });
                })()}
              </div>
            )}

            {/* Open Response */}
            {currentQ.type === 'open' && (
              <textarea
                rows={5}
                value={String(answers[currentQ.id] || '')}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [currentQ.id]: e.target.value }))}
                placeholder={tLabel(lang, 'Толық жауабыңызды осында жазыңыз...', 'Write your answer here...')}
                className="w-full p-4 rounded-xl border border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 outline-none text-slate-900 resize-y"
              />
            )}

            {/* Prep / Quiz Instant Check */}
            {(exam.mode === 'prep' || exam.mode === 'quiz') && (
              <div
                className="mt-6 pt-4 border-t border-slate-100 space-y-3"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                <button
                  type="button"
                  onClick={() => {
                    const res = evaluateSingleQuestion(currentQ, answers[currentQ.id]);
                    setCheckedPrep((prev) => ({ ...prev, [currentQ.id]: res }));
                  }}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition-colors"
                >
                  {tLabel(lang, 'Жауапты тексеру', 'Check Answer')}
                </button>
                {checkedPrep[currentQ.id] && (
                  <div
                    className={`p-3 rounded-lg border text-xs font-semibold flex items-center gap-2 ${
                      checkedPrep[currentQ.id].isCorrect
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-red-50 border-red-200 text-red-800'
                    }`}
                  >
                    {checkedPrep[currentQ.id].isCorrect ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 shrink-0" />
                    )}
                    <span>
                      {checkedPrep[currentQ.id].isCorrect
                        ? tLabel(lang, 'Дұрыс жауап!', 'Correct!')
                        : tLabel(lang, 'Қате жауап', 'Incorrect')}{' '}
                      ({checkedPrep[currentQ.id].earned} / {checkedPrep[currentQ.id].maxPts})
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Question Navigation Footer */}
          <div
            className="flex items-center justify-between pt-6 mt-8 border-t border-slate-100"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            <button
              type="button"
              disabled={currentIdx === 0}
              onClick={() => {
                setCurrentIdx((i) => Math.max(0, i - 1));
                setOpenDropdownKey(null);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold text-sm disabled:opacity-40"
            >
              <ArrowLeft className="w-4 h-4" />
              {tLabel(lang, 'Алдыңғы', 'Previous')}
            </button>

            {currentIdx < questions.length - 1 ? (
              <button
                type="button"
                onClick={() => {
                  setCurrentIdx((i) => Math.min(questions.length - 1, i + 1));
                  setOpenDropdownKey(null);
                }}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm"
              >
                {tLabel(lang, 'Келесі', 'Next')}
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowConfirmFinish(true)}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm"
              >
                <Check className="w-4 h-4" />
                {tLabel(lang, 'Тапсыру', 'Submit')}
              </button>
            )}
          </div>
        </div>

        {/* Question Navigator Sidebar */}
        <aside className="lg:col-span-3 bg-white rounded-xl border border-slate-200 p-4 space-y-4">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700">
              {tLabel(lang, 'Сұрақтар картасы', 'Question Map')}
            </span>
            <span className="font-mono tabular-nums text-slate-500">
              {answeredCount}/{questions.length}
            </span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {questions.map((q, idx) => {
              const answered = isQuestionAnswered(q);
              const active = idx === currentIdx;
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => {
                    setCurrentIdx(idx);
                    setOpenDropdownKey(null);
                  }}
                  className={`h-9 rounded-lg border text-xs font-mono font-semibold tabular-nums transition-colors ${
                    active
                      ? 'bg-blue-600 text-white border-blue-600'
                      : answered
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </aside>
      </main>
    </div>
  );
};
