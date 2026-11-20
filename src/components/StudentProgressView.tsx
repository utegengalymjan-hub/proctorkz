import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileCheck2,
  Search,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { api, getOrCreateStudentId, getSavedStudentProfile } from '../lib/api';
import { MODES, SUBJECTS, tLabel } from '../lib/constants';
import { formatDuration } from '../lib/examUtils';
import type { Lang, Submission } from '../types';
import { RichText } from './RichText';

interface StudentProgressViewProps {
  lang: Lang;
  onStartExamTab: () => void;
}

export const StudentProgressView: React.FC<StudentProgressViewProps> = ({
  lang,
  onStartExamTab,
}) => {
  const savedProfile = useMemo(() => getSavedStudentProfile(), []);
  const [searchName, setSearchName] = useState(savedProfile.name);
  const [appliedQuery, setAppliedQuery] = useState(savedProfile.name);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isSampleMode, setIsSampleMode] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'clean' | 'violations' | 'pending'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchProgress = async (nameQuery: string) => {
    setLoading(true);
    setError('');
    setIsSampleMode(false);
    try {
      const studentId = getOrCreateStudentId();
      const res = await api.getStudentProgress({
        studentId,
        studentName: nameQuery.trim() || undefined,
      });
      setSubmissions(res.submissions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Деректерді жүктеу қатесі');
    } finally {
      setLoading(false);
    }
  };

  const loadSampleHistory = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.getSampleStudentProgress();
      setSubmissions(res.submissions);
      setIsSampleMode(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Деректерді жүктеу қатесі');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProgress(appliedQuery);
  }, [appliedQuery]);

  const filteredSubmissions = useMemo(() => {
    return submissions.filter((sub) => {
      if (statusFilter === 'clean') return sub.violations.length === 0;
      if (statusFilter === 'violations') return sub.violations.length > 0;
      if (statusFilter === 'pending') return sub.hasPendingManual;
      return true;
    });
  }, [submissions, statusFilter]);

  const stats = useMemo(() => {
    const count = submissions.length;
    const avgPercent = count
      ? Math.round(submissions.reduce((acc, s) => acc + s.percent, 0) / count)
      : 0;
    const bestPercent = count ? Math.max(...submissions.map((s) => s.percent)) : 0;
    const totalViolations = submissions.reduce((acc, s) => acc + s.violations.length, 0);
    return { count, avgPercent, bestPercent, totalViolations };
  }, [submissions]);

  const chartData = useMemo(() => {
    return [...submissions].reverse().slice(-8);
  }, [submissions]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAppliedQuery(searchName);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Header & Student Lookup */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            {tLabel(lang, 'Оқушы үлгерімі және емтихан тарихы', 'Student Progress & Exam History')}
          </h1>
          <p className="text-sm text-slate-600 mt-1.5 max-w-2xl">
            {tLabel(
              lang,
              'Тапсырылған барлық емтихандар, жинаған балдар, пайыздық көрсеткіштер және прокторинг барысында тіркелген ескертулер тарихы.',
              'Complete history of taken exams, scores, percentages, question reviews, and proctoring violation logs.'
            )}
          </p>
        </div>

        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full lg:w-auto">
          <div className="relative flex-1 lg:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              placeholder={tLabel(lang, 'Оқушы аты-жөнімен іздеу...', 'Search by student name...')}
              className="w-full pl-10 pr-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold whitespace-nowrap shrink-0 transition-colors"
          >
            {tLabel(lang, 'Іздеу', 'Lookup')}
          </button>
        </form>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">
            {tLabel(lang, 'Тапсырылған емтихандар', 'Exams Completed')}
          </div>
          <div className="text-3xl font-bold font-mono tabular-nums text-slate-900 mt-2">
            {stats.count}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {isSampleMode
              ? tLabel(lang, 'Демо үлгі деректері', 'Sample student records')
              : tLabel(lang, 'Жалпы жазба саны', 'Total recorded attempts')}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">
            {tLabel(lang, 'Орташа нәтиже', 'Average Score')}
          </div>
          <div className="text-3xl font-bold font-mono tabular-nums text-blue-600 mt-2">
            {stats.avgPercent}%
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {tLabel(lang, 'Барлық емтихандар бойынша', 'Across all attempts')}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">
            {tLabel(lang, 'Ең жоғары көрсеткіш', 'Highest Result')}
          </div>
          <div className="text-3xl font-bold font-mono tabular-nums text-emerald-700 mt-2">
            {stats.bestPercent}%
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {tLabel(lang, 'Үздік пайыздық нәтиже', 'Peak exam percentage')}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">
            {tLabel(lang, 'Тіркелген ескертулер', 'Recorded Violations')}
          </div>
          <div
            className={`text-3xl font-bold font-mono tabular-nums mt-2 ${
              stats.totalViolations > 0 ? 'text-red-600' : 'text-emerald-700'
            }`}
          >
            {stats.totalViolations}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {stats.totalViolations === 0
              ? tLabel(lang, 'Ереже бұзушылық жоқ', 'Clean proctoring record')
              : tLabel(lang, 'Прокторинг журналында', 'Logged in proctoring audit')}
          </div>
        </div>
      </div>

      {/* Score Progression Chart */}
      {chartData.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              <h2 className="text-base font-semibold text-slate-900">
                {tLabel(lang, 'Нәтижелер динамикасы', 'Score Progression')}
              </h2>
            </div>
            <span className="text-xs text-slate-500 tabular-nums">
              {tLabel(lang, `Соңғы ${chartData.length} тапсырыс`, `Latest ${chartData.length} attempts`)}
            </span>
          </div>

          <div className="relative h-44 flex items-end gap-3 sm:gap-5 pt-6 pb-2 px-2 border-b border-slate-200">
            {/* Reference guide lines */}
            <div className="pointer-events-none absolute inset-x-0 top-6 border-t border-dashed border-slate-100" />
            <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-slate-100" />

            {chartData.map((item) => {
              const barColor =
                item.violations.length > 0
                  ? 'bg-amber-500'
                  : item.percent >= 70
                    ? 'bg-blue-600'
                    : 'bg-slate-400';
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                  className="flex-1 flex flex-col items-center justify-end h-full group focus:outline-none"
                >
                  <span className="text-xs font-mono font-semibold tabular-nums text-slate-700 mb-1.5">
                    {item.percent}%
                  </span>
                  <div
                    className={`w-full max-w-[48px] rounded-t-md transition-opacity group-hover:opacity-85 ${barColor}`}
                    style={{ height: `${Math.max(8, item.percent)}%` }}
                  />
                </button>
              );
            })}
          </div>
          <div className="flex gap-3 sm:gap-5 px-2 pt-2.5">
            {chartData.map((item) => (
              <div
                key={`${item.id}-label`}
                className="flex-1 text-center text-xs text-slate-500 truncate"
                title={item.examTitle}
              >
                {item.examCode}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Filter Bar & Table */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                ['all', tLabel(lang, 'Барлығы', 'All')],
                ['clean', tLabel(lang, 'Ескертусіз', 'Clean')],
                ['violations', tLabel(lang, 'Ескертуі бар', 'With Violations')],
                ['pending', tLabel(lang, 'Тексерілуде', 'Pending Review')],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                  statusFilter === key
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500">
            {!isSampleMode && submissions.length === 0 && !loading && (
              <button
                type="button"
                onClick={loadSampleHistory}
                className="font-semibold text-blue-600 hover:text-blue-700 underline underline-offset-2 whitespace-nowrap"
              >
                {tLabel(lang, 'Үлгі тарихты көрсету', 'Load sample progress history')}
              </button>
            )}
            {isSampleMode && (
              <button
                type="button"
                onClick={() => fetchProgress(appliedQuery)}
                className="font-semibold text-slate-700 hover:text-slate-900 underline underline-offset-2 whitespace-nowrap"
              >
                {tLabel(lang, 'Жеке тарихқа оралу', 'Back to personal history')}
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
            {[1, 2, 3].map((n) => (
              <div key={n} className="p-5 animate-pulse flex items-center justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-slate-200 rounded w-1/3" />
                  <div className="h-3 bg-slate-100 rounded w-1/2" />
                </div>
                <div className="h-6 bg-slate-200 rounded w-20" />
              </div>
            ))}
          </div>
        ) : filteredSubmissions.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-4">
            <FileCheck2 className="w-10 h-10 text-slate-300 mx-auto" />
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                {tLabel(lang, 'Емтихан тарихы әзірге бос', 'No exam records found yet')}
              </h3>
              <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                {tLabel(
                  lang,
                  'Емтихан тапсырғаннан кейін барлық балдарыңыз, пайыздарыңыз және ескерту журналы осы бөлімде автоматты түрде сақталады.',
                  'Complete an exam using a teacher code to track your scores, percentages, and proctoring record here — or search by student name.'
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
              <button
                type="button"
                onClick={onStartExamTab}
                className="px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
              >
                {tLabel(lang, 'Емтихан тапсыру', 'Take an Exam')}
              </button>
              <button
                type="button"
                onClick={loadSampleHistory}
                className="px-4 py-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold transition-colors"
              >
                {tLabel(lang, 'Үлгі деректерді көру', 'Preview Sample History')}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-200">
            {filteredSubmissions.map((sub) => {
              const isExpanded = expandedId === sub.id;
              const subj = SUBJECTS[sub.subject] || SUBJECTS.general;
              const mode = MODES[sub.mode] || MODES.exam;
              const hasViolations = sub.violations.length > 0;

              return (
                <div key={sub.id} className="transition-colors">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : sub.id)}
                    className="w-full text-left px-5 py-4 hover:bg-slate-50/80 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-900 text-sm sm:text-base truncate">
                          {sub.examTitle}
                        </span>
                        <span className="font-mono text-xs text-slate-500">{sub.examCode}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                        <span className="font-medium text-slate-700">{sub.studentName}</span>
                        <span aria-hidden="true">·</span>
                        <span>{sub.studentClass}</span>
                        <span aria-hidden="true">·</span>
                        <span>{lang === 'kk' ? subj.kk : subj.en}</span>
                        <span aria-hidden="true">·</span>
                        <span>{lang === 'kk' ? mode.kk : mode.en}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{sub.submittedAt}</span>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <Clock className="w-3 h-3" />
                          {formatDuration(sub.spentSec)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-5 shrink-0">
                      {/* Score & Percentage */}
                      <div className="text-left md:text-right">
                        <div className="font-mono font-bold tabular-nums text-sm text-slate-900">
                          {sub.score} / {sub.maxScore}
                          <span className="text-blue-600 ml-2">{sub.percent}%</span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {sub.hasPendingManual
                            ? tLabel(lang, 'Ашық сұрақ тексерілуде', 'Pending manual review')
                            : sub.percent >= 70
                              ? tLabel(lang, 'Жоғары нәтиже', 'Passed')
                              : tLabel(lang, 'Қосымша дайындық қажет', 'Needs review')}
                        </div>
                      </div>

                      {/* Violations Status */}
                      <div className="min-w-[110px] flex items-center gap-1.5 text-xs font-semibold">
                        {hasViolations ? (
                          <span className="inline-flex items-center gap-1.5 text-red-700">
                            <ShieldAlert className="w-4 h-4 shrink-0" />
                            <span className="tabular-nums">
                              {sub.violations.length}{' '}
                              {tLabel(lang, 'ескерту', 'violations')}
                            </span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-emerald-700">
                            <ShieldCheck className="w-4 h-4 shrink-0" />
                            <span>{tLabel(lang, 'Таза', 'Clean')}</span>
                          </span>
                        )}
                      </div>

                      <div className="text-slate-400">
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-5 pb-5 pt-2 bg-slate-50/60 border-t border-slate-100 space-y-5">
                      {/* Violation Audit Log */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-semibold text-slate-700">
                            {tLabel(lang, 'Прокторинг және ескертулер журналы', 'Proctoring & Violation Log')}
                          </h4>
                          {sub.autoSubmitted && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              {tLabel(lang, 'Автоматты аяқталды:', 'Auto-submitted:')}{' '}
                              {sub.autoReason || tLabel(lang, 'Лимит асты', 'Limit reached')}
                            </span>
                          )}
                        </div>

                        {sub.violations.length === 0 ? (
                          <div className="flex items-center gap-2 text-xs text-emerald-700 bg-white border border-slate-200 rounded-lg px-3.5 py-2.5">
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            <span>
                              {tLabel(
                                lang,
                                'Емтихан барысында ешқандай ереже бұзушылық тіркелген жоқ.',
                                'No proctoring violations were recorded during this exam session.'
                              )}
                            </span>
                          </div>
                        ) : (
                          <div className="bg-white border border-red-200 rounded-lg divide-y divide-red-100">
                            {sub.violations.map((v, idx) => (
                              <div
                                key={`${v.time}-${idx}`}
                                className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
                              >
                                <span className="font-medium text-red-800">
                                  {idx + 1}. {v.reason}
                                </span>
                                <span className="font-mono tabular-nums text-slate-500 shrink-0">
                                  {v.time}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Question Breakdown */}
                      {sub.details.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-slate-700">
                            {tLabel(lang, 'Сұрақтар бойынша нәтиже', 'Question Breakdown')}
                          </h4>
                          <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
                            {sub.details.map((d, idx) => (
                              <div
                                key={`${d.questionId}-${idx}`}
                                className="px-3.5 py-2.5 flex items-start justify-between gap-4 text-xs"
                              >
                                <div className="min-w-0 space-y-0.5">
                                  <div className="text-slate-800 font-medium">
                                    {idx + 1}. <RichText text={d.text} />
                                  </div>
                                  {d.type === 'open' && d.userAnswer ? (
                                    <div className="text-slate-500">
                                      {tLabel(lang, 'Жауап:', 'Answer:')} {String(d.userAnswer)}
                                    </div>
                                  ) : null}
                                </div>
                                <div className="shrink-0 font-mono tabular-nums font-semibold">
                                  {d.status === 'pending' ? (
                                    <span className="text-amber-700">
                                      {tLabel(lang, 'Тексерілуде', 'Pending')}
                                    </span>
                                  ) : (
                                    <span className={d.isCorrect ? 'text-emerald-700' : 'text-red-700'}>
                                      {d.points} / {d.maxPoints}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
