import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Save, ShieldAlert, Trash2, X } from 'lucide-react';
import { Q_TYPES, tLabel } from '../lib/constants';
import { formatDuration } from '../lib/examUtils';
import type { Lang, Submission, SubmissionDetail } from '../types';
import { RichText } from './RichText';

interface SubmissionDetailModalProps {
  lang: Lang;
  submission: Submission;
  onClose: () => void;
  onSaveGrades: (id: string, details: SubmissionDetail[]) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export const SubmissionDetailModal: React.FC<SubmissionDetailModalProps> = ({
  lang,
  submission,
  onClose,
  onSaveGrades,
  onDelete,
}) => {
  const [details, setDetails] = useState<SubmissionDetail[]>(() =>
    JSON.parse(JSON.stringify(submission.details || []))
  );
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const computedScore = Number(
    details.reduce((acc, d) => acc + (Number(d.points) || 0), 0).toFixed(2)
  );
  const computedMax =
    details.reduce((acc, d) => acc + (Number(d.maxPoints) || 0), 0) || submission.maxScore;
  const computedPercent =
    computedMax > 0 ? Math.round((computedScore / computedMax) * 100) : submission.percent;

  const handleGradeChange = (idx: number, rawVal: string) => {
    const val = parseFloat(rawVal);
    setDetails((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const clamped = Number.isNaN(val) ? 0 : Math.max(0, Math.min(item.maxPoints, val));
        return {
          ...item,
          points: clamped,
          status: 'checked',
          isCorrect: clamped > 0,
        };
      })
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSaveGrades(submission.id, details);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const formatUserAnswer = (d: SubmissionDetail): string => {
    if (d.userAnswer === undefined || d.userAnswer === null || d.userAnswer === '') {
      return tLabel(lang, 'Жауап берілмеген', 'No answer');
    }
    if (Array.isArray(d.userAnswer)) return d.userAnswer.join(', ');
    if (typeof d.userAnswer === 'object') return JSON.stringify(d.userAnswer);
    return String(d.userAnswer);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              {submission.studentName}{' '}
              <span className="text-slate-400 font-normal">· {submission.studentClass}</span>
            </h3>
            <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2">
              <span>{submission.examTitle}</span>
              <span>·</span>
              <span className="font-mono">{submission.examCode}</span>
              <span>·</span>
              <span className="tabular-nums">{submission.submittedAt}</span>
              <span>·</span>
              <span className="font-mono tabular-nums">{formatDuration(submission.spentSec)}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Score & Violation Summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-xs text-slate-500">{tLabel(lang, 'Жалпы балл', 'Total Score')}</div>
              <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                {computedScore} / {computedMax}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-xs text-slate-500">{tLabel(lang, 'Пайыз', 'Percentage')}</div>
              <div className="text-xl font-bold font-mono tabular-nums text-blue-600 mt-1">
                {computedPercent}%
              </div>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-xs text-slate-500">{tLabel(lang, 'Ескертулер', 'Violations')}</div>
              <div
                className={`text-xl font-bold font-mono tabular-nums mt-1 ${
                  submission.violations.length > 0 ? 'text-red-600' : 'text-emerald-700'
                }`}
              >
                {submission.violations.length}
              </div>
            </div>
          </div>

          {submission.autoSubmitted && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                {tLabel(lang, 'Автоматты аяқталды:', 'Auto-submitted:')} {submission.autoReason}
              </span>
            </div>
          )}

          {/* Proctoring Violations */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-700">
              {tLabel(lang, 'Прокторинг ескертулері', 'Proctoring Violation Log')}
            </h4>
            {submission.violations.length === 0 ? (
              <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-xs text-emerald-700 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                {tLabel(lang, 'Ереже бұзушылық тіркелмеген.', 'No proctoring violations recorded.')}
              </div>
            ) : (
              <div className="border border-red-200 rounded-lg divide-y divide-red-100">
                {submission.violations.map((v, idx) => (
                  <div
                    key={`${v.time}-${idx}`}
                    className="px-3.5 py-2.5 flex items-center justify-between text-xs bg-red-50/40"
                  >
                    <span className="font-medium text-red-800 flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                      {v.reason}
                    </span>
                    <span className="font-mono tabular-nums text-slate-500">{v.time}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Question-by-Question Details & Manual Grading */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-semibold text-slate-700">
              {tLabel(lang, 'Сұрақтар және бағалау', 'Question Responses & Manual Grading')}
            </h4>
            <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl">
              {details.map((d, idx) => (
                <div key={`${d.questionId}-${idx}`} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <div className="text-xs text-slate-500">
                        #{idx + 1} · {lang === 'kk' ? Q_TYPES[d.type].kk : Q_TYPES[d.type].en}
                      </div>
                      <div className="text-sm font-semibold text-slate-900">
                        <RichText text={d.text} />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <input
                        type="number"
                        step="0.5"
                        min={0}
                        max={d.maxPoints}
                        value={d.points}
                        onChange={(e) => handleGradeChange(idx, e.target.value)}
                        className="w-16 px-2 py-1 rounded-md border border-slate-300 font-mono font-semibold text-xs text-right tabular-nums"
                      />
                      <span className="text-xs font-mono text-slate-500 tabular-nums">
                        / {d.maxPoints}
                      </span>
                    </div>
                  </div>

                  <div className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                    <span className="font-semibold text-slate-700">
                      {tLabel(lang, 'Оқушы жауабы:', 'Student response:')}
                    </span>{' '}
                    {formatUserAnswer(d)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {tLabel(lang, 'Жазбаны өшіру', 'Delete Submission')}
            </button>
          ) : (
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-red-700">
                {tLabel(lang, 'Растайсыз ба?', 'Confirm delete?')}
              </span>
              <button
                type="button"
                onClick={async () => {
                  await onDelete(submission.id);
                  onClose();
                }}
                className="px-2.5 py-1 rounded-md bg-red-600 text-white font-semibold"
              >
                {tLabel(lang, 'Иә, өшіру', 'Yes, Delete')}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-2.5 py-1 rounded-md border border-slate-300 bg-white text-slate-700"
              >
                {tLabel(lang, 'Жоқ', 'No')}
              </button>
            </div>
          )}

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold"
            >
              {tLabel(lang, 'Жабу', 'Close')}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {saving
                ? tLabel(lang, 'Сақталуда...', 'Saving...')
                : tLabel(lang, 'Бағаларды сақтау', 'Save Grades')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
