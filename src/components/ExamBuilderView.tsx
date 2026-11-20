import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Download,
  Edit3,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  FONT_FAMILIES,
  FONT_SIZES,
  MODES,
  Q_TYPES,
  SUBJECTS,
  SYMBOL_PACKS,
  tLabel,
} from '../lib/constants';
import { generateExamCode } from '../lib/examUtils';
import type {
  Exam,
  ExamModeKey,
  Folder,
  FontFamilyKey,
  FontSizeKey,
  Lang,
  Question,
  QuestionMedia,
  QuestionType,
  SubjectKey,
} from '../types';
import { ExamExportModal } from './ExamExportModal';
import { ImportQuestionsModal } from './ImportQuestionsModal';
import { RichText } from './RichText';

interface ExamBuilderViewProps {
  lang: Lang;
  initialExam: Exam;
  folders: Folder[];
  onSave: (exam: Exam) => Promise<void>;
  onCancel: () => void;
  notify: (msg: string, type?: 'info' | 'success' | 'warn' | 'error') => void;
}

export const ExamBuilderView: React.FC<ExamBuilderViewProps> = ({
  lang,
  initialExam,
  folders,
  onSave,
  onCancel,
  notify,
}) => {
  const [exam, setExam] = useState<Exam>(() => JSON.parse(JSON.stringify(initialExam)));
  const [saving, setSaving] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showExport, setShowExport] = useState(false);

  // Question Draft State
  const [editingQuestionIdx, setEditingQuestionIdx] = useState<number | null>(null);
  const [qType, setQType] = useState<QuestionType>('single');
  const [qPoints, setQPoints] = useState(1);
  const [qText, setQText] = useState('');
  const [qFont, setQFont] = useState<FontFamilyKey | ''>('');
  const [qMedia, setQMedia] = useState<QuestionMedia>({ type: 'none', url: '', diagramData: '' });
  const [qOptions, setQOptions] = useState<string[]>(['', '', '', '']);
  const [qSingleCorrect, setQSingleCorrect] = useState<number>(0);
  const [qMultiCorrect, setQMultiCorrect] = useState<number[]>([0]);
  const [qPairs, setQPairs] = useState<{ left: string; right: string }[]>([
    { left: '', right: '' },
    { left: '', right: '' },
    { left: '', right: '' },
  ]);
  const [qOrderItems, setQOrderItems] = useState<string[]>(['', '', '', '']);
  const [qKeywords, setQKeywords] = useState('');

  const [symTab, setSymTab] = useState<keyof typeof SYMBOL_PACKS>('math');
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  const totalPoints = useMemo(
    () => exam.questions.reduce((acc, q) => acc + (Number(q.points) || 1), 0),
    [exam.questions]
  );

  const resetDraft = () => {
    setEditingQuestionIdx(null);
    setQType('single');
    setQPoints(1);
    setQText('');
    setQFont('');
    setQMedia({ type: 'none', url: '', diagramData: '' });
    setQOptions(['', '', '', '']);
    setQSingleCorrect(0);
    setQMultiCorrect([0]);
    setQPairs([
      { left: '', right: '' },
      { left: '', right: '' },
      { left: '', right: '' },
    ]);
    setQOrderItems(['', '', '', '']);
    setQKeywords('');
  };

  const loadQuestionIntoDraft = (idx: number) => {
    const q = exam.questions[idx];
    if (!q) return;
    setEditingQuestionIdx(idx);
    setQType(q.type);
    setQPoints(q.points || 1);
    setQText(q.text || '');
    setQFont(q.fontFamily || '');
    setQMedia(q.media ? { ...q.media } : { type: 'none', url: '', diagramData: '' });

    if (q.type === 'binary') {
      setQOptions([q.options?.[0] || 'Дұрыс', q.options?.[1] || 'Қате', '', '']);
      setQSingleCorrect(typeof q.correct === 'number' ? q.correct : 0);
    } else if (q.type === 'single' || q.type === 'multiple') {
      const padded = [0, 1, 2, 3].map((i) => q.options?.[i] || '');
      setQOptions(padded);
      if (q.type === 'multiple') {
        setQMultiCorrect(Array.isArray(q.correct) ? q.correct : [0]);
      } else {
        setQSingleCorrect(typeof q.correct === 'number' ? q.correct : 0);
      }
    } else if (q.type === 'matching') {
      const pairs = (q.pairs || []).slice();
      while (pairs.length < 3) pairs.push({ left: '', right: '' });
      setQPairs(pairs);
    } else if (q.type === 'ordering') {
      const items = (q.items || []).slice();
      while (items.length < 4) items.push('');
      setQOrderItems(items);
    } else if (q.type === 'open') {
      setQKeywords(q.keywords || '');
    }
  };

  const handleTypeSwitch = (nextType: QuestionType) => {
    setQType(nextType);
    if (nextType === 'binary') {
      setQOptions(['Дұрыс (Иә)', 'Қате (Жоқ)', '', '']);
      setQSingleCorrect(0);
    }
  };

  const insertSymbol = (val: string) => {
    const el = textAreaRef.current;
    if (!el) {
      setQText((prev) => prev + val);
      return;
    }
    const start = el.selectionStart ?? qText.length;
    const end = el.selectionEnd ?? qText.length;
    const next = qText.slice(0, start) + val + qText.slice(end);
    setQText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + val.length;
    });
  };

  const handleMediaFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = String(ev.target?.result || '');
      setQMedia((prev) => ({ ...prev, url: dataUrl }));
      notify(tLabel(lang, 'Медиа файл жүктелді', 'Media file attached'), 'success');
    };
    reader.readAsDataURL(file);
  };

  const handleAddOrUpdateQuestion = () => {
    const trimmedText = qText.trim();
    if (!trimmedText) {
      notify(tLabel(lang, 'Сұрақ мәтінін жазыңыз', 'Enter question text'), 'error');
      return;
    }

    const baseQ: Question = {
      id:
        editingQuestionIdx !== null
          ? exam.questions[editingQuestionIdx].id
          : 'q-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      type: qType,
      points: Math.max(1, Number(qPoints) || 1),
      text: trimmedText,
      fontFamily: qFont,
      media: qMedia.type === 'none' ? undefined : { ...qMedia },
    };

    if (qType === 'single' || qType === 'multiple' || qType === 'binary') {
      const limit = qType === 'binary' ? 2 : 4;
      const opts = qOptions
        .slice(0, limit)
        .map((o) => o.trim())
        .filter(Boolean);
      if (opts.length < 2) {
        notify(tLabel(lang, 'Кемінде 2 жауап нұсқасын енгізіңіз', 'Provide at least 2 options'), 'error');
        return;
      }
      baseQ.options = opts;
      if (qType === 'multiple') {
        const validCorrect = qMultiCorrect.filter((i) => i < opts.length);
        baseQ.correct = validCorrect.length ? validCorrect : [0];
      } else {
        baseQ.correct = qSingleCorrect < opts.length ? qSingleCorrect : 0;
      }
    } else if (qType === 'matching') {
      const pairs = qPairs
        .map((p) => ({ left: p.left.trim(), right: p.right.trim() }))
        .filter((p) => p.left && p.right);
      if (pairs.length < 2) {
        notify(tLabel(lang, 'Кемінде 2 жұп енгізіңіз', 'Provide at least 2 matching pairs'), 'error');
        return;
      }
      baseQ.pairs = pairs;
    } else if (qType === 'ordering') {
      const items = qOrderItems.map((i) => i.trim()).filter(Boolean);
      if (items.length < 2) {
        notify(tLabel(lang, 'Кемінде 2 элемент енгізіңіз', 'Provide at least 2 sequence items'), 'error');
        return;
      }
      baseQ.items = items;
    } else if (qType === 'fill') {
      if (!/\[[^\]]+\]/.test(trimmedText)) {
        notify(
          tLabel(lang, 'Бос орынды [жауап] түрінде жазыңыз', 'Include at least one [blank] in square brackets'),
          'error'
        );
        return;
      }
    } else if (qType === 'open') {
      baseQ.keywords = qKeywords.trim();
    }

    setExam((prev) => {
      const nextQs = [...prev.questions];
      if (editingQuestionIdx !== null) {
        nextQs[editingQuestionIdx] = baseQ;
      } else {
        nextQs.push(baseQ);
      }
      return { ...prev, questions: nextQs };
    });

    notify(
      editingQuestionIdx !== null
        ? tLabel(lang, 'Сұрақ жаңартылды', 'Question updated')
        : tLabel(lang, 'Сұрақ қосылды', 'Question added'),
      'success'
    );
    resetDraft();
  };

  const handleSaveExam = async () => {
    if (!exam.title.trim() || !exam.code.trim()) {
      notify(tLabel(lang, 'Емтихан атауы мен кіру кодын енгізіңіз', 'Enter exam title and access code'), 'error');
      return;
    }
    setSaving(true);
    try {
      await onSave({ ...exam, code: exam.code.trim().toUpperCase() });
    } finally {
      setSaving(false);
    }
  };

  const moveQuestion = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= exam.questions.length) return;
    setExam((prev) => {
      const copy = [...prev.questions];
      [copy[idx], copy[target]] = [copy[target], copy[idx]];
      return { ...prev, questions: copy };
    });
  };

  const previewFontCss =
    (FONT_FAMILIES[(qFont || exam.fontFamily || 'sans') as FontFamilyKey] || FONT_FAMILIES.sans)
      .css;

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            {initialExam.questions.length > 0
              ? tLabel(lang, 'Емтиханды өңдеу', 'Edit Exam')
              : tLabel(lang, 'Жаңа емтихан құрастыру', 'Create New Exam')}
          </h2>
          <div className="text-xs text-slate-500 mt-0.5 tabular-nums">
            {exam.questions.length} {tLabel(lang, 'сұрақ', 'questions')} · {totalPoints}{' '}
            {tLabel(lang, 'балл', 'total points')} · {exam.code}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold"
          >
            <Upload className="w-3.5 h-3.5" />
            {tLabel(lang, 'Құжаттан импорт', 'Import Doc')}
          </button>
          <button
            type="button"
            onClick={() => setShowExport(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold"
          >
            <Download className="w-3.5 h-3.5" />
            {tLabel(lang, 'Жүктеп алу', 'Download')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold"
          >
            {tLabel(lang, 'Болдырмау', 'Cancel')}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSaveExam}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {saving
              ? tLabel(lang, 'Сақталуда...', 'Saving...')
              : tLabel(lang, 'Емтиханды сақтау', 'Save Exam')}
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-6 items-start">
        {/* Left: Exam Configuration */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-900">
            {tLabel(lang, 'Емтихан баптаулары', 'Exam Configuration')}
          </h3>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              {tLabel(lang, 'Емтихан атауы', 'Exam Title')}
            </label>
            <input
              type="text"
              value={exam.title}
              onChange={(e) => setExam((prev) => ({ ...prev, title: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              {tLabel(lang, 'Бірегей кіру коды', 'Unique Access Code')}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={exam.code}
                onChange={(e) =>
                  setExam((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))
                }
                className="flex-1 px-3 py-2 rounded-lg border border-slate-300 font-mono font-bold text-sm uppercase focus:outline-none focus:border-blue-600"
              />
              <button
                type="button"
                onClick={() => setExam((prev) => ({ ...prev, code: generateExamCode() }))}
                className="px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700"
                title={tLabel(lang, 'Жаңа код генерациялау', 'Generate new code')}
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                {tLabel(lang, 'Пән', 'Subject')}
              </label>
              <select
                value={exam.subject}
                onChange={(e) =>
                  setExam((prev) => ({ ...prev, subject: e.target.value as SubjectKey }))
                }
                className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-xs font-medium bg-white"
              >
                {Object.entries(SUBJECTS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {lang === 'kk' ? v.kk : v.en}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                {tLabel(lang, 'Режим', 'Mode')}
              </label>
              <select
                value={exam.mode}
                onChange={(e) =>
                  setExam((prev) => ({ ...prev, mode: e.target.value as ExamModeKey }))
                }
                className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-xs font-medium bg-white"
              >
                {Object.entries(MODES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {lang === 'kk' ? v.kk : v.en}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                {tLabel(lang, 'Қалташа', 'Folder')}
              </label>
              <select
                value={exam.folderId}
                onChange={(e) => setExam((prev) => ({ ...prev, folderId: e.target.value }))}
                className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-xs font-medium bg-white"
              >
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                {tLabel(lang, 'Қолжетімділік', 'Access')}
              </label>
              <select
                value={exam.isOpen ? 'true' : 'false'}
                onChange={(e) =>
                  setExam((prev) => ({ ...prev, isOpen: e.target.value === 'true' }))
                }
                className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-xs font-medium bg-white"
              >
                <option value="true">{tLabel(lang, 'Ашық', 'Open')}</option>
                <option value="false">{tLabel(lang, 'Жабық', 'Closed')}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                {tLabel(lang, 'Шрифт', 'Font')}
              </label>
              <select
                value={exam.fontFamily}
                onChange={(e) =>
                  setExam((prev) => ({ ...prev, fontFamily: e.target.value as FontFamilyKey }))
                }
                className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-xs font-medium bg-white"
              >
                {Object.entries(FONT_FAMILIES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                {tLabel(lang, 'Мәтін өлшемі', 'Font Size')}
              </label>
              <select
                value={exam.fontSize}
                onChange={(e) =>
                  setExam((prev) => ({ ...prev, fontSize: e.target.value as FontSizeKey }))
                }
                className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-xs font-medium bg-white"
              >
                {Object.entries(FONT_SIZES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {lang === 'kk' ? v.kk : v.en}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 space-y-3 text-xs">
            <label className="flex items-center justify-between gap-2 font-medium text-slate-700">
              <span>{tLabel(lang, 'Уақыт шектеуі', 'Time Limit')}</span>
              <input
                type="checkbox"
                checked={exam.isTimed}
                onChange={(e) => setExam((prev) => ({ ...prev, isTimed: e.target.checked }))}
                className="rounded border-slate-300 text-blue-600"
              />
            </label>

            {exam.isTimed && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">{tLabel(lang, 'Ұзақтығы (минут)', 'Duration (min)')}</span>
                <input
                  type="number"
                  min={1}
                  max={240}
                  value={exam.timeLimitMin}
                  onChange={(e) =>
                    setExam((prev) => ({ ...prev, timeLimitMin: Math.max(1, Number(e.target.value) || 15) }))
                  }
                  className="w-20 px-2.5 py-1 rounded-md border border-slate-300 font-mono text-right"
                />
              </div>
            )}

            {exam.mode === 'exam' && (
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-800">
                    {tLabel(lang, 'Ескерту саны (Прокторинг)', 'Violation Limit')}
                  </span>
                  <span className="font-mono font-bold text-blue-600 tabular-nums">
                    {exam.maxViolations === 0
                      ? tLabel(lang, 'Шектеусіз', 'Unlimited')
                      : `${exam.maxViolations} ${tLabel(lang, 'рет', 'max')}`}
                  </span>
                </div>

                {/* Quick Presets */}
                <div className="grid grid-cols-5 gap-1">
                  {[1, 3, 5, 10, 0].map((preset) => {
                    const active = exam.maxViolations === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setExam((prev) => ({ ...prev, maxViolations: preset }))}
                        className={`py-1.5 rounded-md text-[11px] font-semibold transition-colors ${
                          active
                            ? 'bg-slate-900 text-white'
                            : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {preset === 0 ? '∞' : preset}
                      </button>
                    );
                  })}
                </div>

                {/* Exact 1-20 Slider + Input */}
                {exam.maxViolations > 0 && (
                  <div className="flex items-center gap-2.5">
                    <input
                      type="range"
                      min={1}
                      max={20}
                      value={exam.maxViolations}
                      onChange={(e) =>
                        setExam((prev) => ({
                          ...prev,
                          maxViolations: Math.max(1, Math.min(20, Number(e.target.value) || 3)),
                        }))
                      }
                      className="flex-1 accent-blue-600"
                    />
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={exam.maxViolations}
                      onChange={(e) =>
                        setExam((prev) => ({
                          ...prev,
                          maxViolations: Math.max(1, Math.min(20, Number(e.target.value) || 1)),
                        }))
                      }
                      className="w-14 px-2 py-1 rounded-md border border-slate-300 bg-white font-mono text-center"
                    />
                  </div>
                )}

                {/* Action on Limit Reached */}
                <div className="pt-2 border-t border-slate-200 space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-600">
                    {tLabel(lang, 'Лимит толғандағы әрекет:', 'When limit is reached:')}
                  </div>
                  <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-200/70 rounded-lg">
                    <button
                      type="button"
                      onClick={() =>
                        setExam((prev) => ({ ...prev, violationAction: 'auto_submit' }))
                      }
                      className={`py-1.5 px-2 rounded-md text-[11px] font-semibold transition-colors ${
                        (exam.violationAction || 'auto_submit') === 'auto_submit'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600'
                      }`}
                    >
                      {tLabel(lang, 'Автоматты жабу', 'Auto-submit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setExam((prev) => ({ ...prev, violationAction: 'warn_only' }))}
                      className={`py-1.5 px-2 rounded-md text-[11px] font-semibold transition-colors ${
                        exam.violationAction === 'warn_only'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600'
                      }`}
                    >
                      {tLabel(lang, 'Тек ескерту', 'Warn & log only')}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {exam.maxViolations === 0 || exam.violationAction === 'warn_only'
                      ? tLabel(
                          lang,
                          'Ескертулер оқушыға көрсетіліп, мұғалім журналына жазылады, бірақ емтихан жабылмайды.',
                          'Violations are warned and logged to teacher & student reports without forcing submission.'
                        )
                      : tLabel(
                          lang,
                          `Оқушы ${exam.maxViolations} рет ереже бұзғанда емтихан автоматты түрде аяқталады.`,
                          `Exam automatically submits if the student reaches ${exam.maxViolations} violation(s).`
                        )}
                  </p>
                </div>
              </div>
            )}

            <label className="flex items-center justify-between gap-2 font-medium text-slate-700 pt-2 border-t border-slate-100">
              <span>{tLabel(lang, 'Күту бөлмесі (мұғалім бастайды)', 'Waiting room (teacher launch)')}</span>
              <input
                type="checkbox"
                checked={exam.requireTeacherStart}
                onChange={(e) =>
                  setExam((prev) => ({ ...prev, requireTeacherStart: e.target.checked }))
                }
                className="rounded border-slate-300 text-blue-600"
              />
            </label>

            <label className="flex items-center justify-between gap-2 text-slate-600">
              <span>{tLabel(lang, 'Сұрақтарды араластыру', 'Shuffle questions')}</span>
              <input
                type="checkbox"
                checked={exam.shuffleQuestions}
                onChange={(e) =>
                  setExam((prev) => ({ ...prev, shuffleQuestions: e.target.checked }))
                }
                className="rounded border-slate-300 text-blue-600"
              />
            </label>

            <label className="flex items-center justify-between gap-2 text-slate-600">
              <span>{tLabel(lang, 'Жауап нұсқаларын араластыру', 'Shuffle options')}</span>
              <input
                type="checkbox"
                checked={exam.shuffleOptions}
                onChange={(e) =>
                  setExam((prev) => ({ ...prev, shuffleOptions: e.target.checked }))
                }
                className="rounded border-slate-300 text-blue-600"
              />
            </label>
          </div>
        </div>

        {/* Right: Question Composer + Questions List */}
        <div className="lg:col-span-8 space-y-6">
          {/* Question Composer */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-900">
                {editingQuestionIdx !== null
                  ? tLabel(lang, `${editingQuestionIdx + 1}-сұрақты өңдеу`, `Editing Question #${editingQuestionIdx + 1}`)
                  : tLabel(lang, 'Жаңа сұрақ қосу', 'Add Question')}
              </h3>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">{tLabel(lang, 'Балл:', 'Points:')}</span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={qPoints}
                  onChange={(e) => setQPoints(Math.max(1, Number(e.target.value) || 1))}
                  className="w-16 px-2 py-1 rounded-md border border-slate-300 font-mono font-semibold text-center"
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              <select
                value={qType}
                onChange={(e) => handleTypeSwitch(e.target.value as QuestionType)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-medium bg-white"
              >
                {Object.entries(Q_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {lang === 'kk' ? v.kk : v.en}
                  </option>
                ))}
              </select>

              <select
                value={qMedia.type}
                onChange={(e) =>
                  setQMedia({
                    type: e.target.value as QuestionMedia['type'],
                    url: '',
                    diagramData: '',
                  })
                }
                className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-medium bg-white"
              >
                <option value="none">{tLabel(lang, 'Медиасыз', 'No Media')}</option>
                <option value="image">{tLabel(lang, 'Сурет / GIF', 'Image')}</option>
                <option value="diagram">{tLabel(lang, 'Бағанды диаграмма', 'Bar Diagram')}</option>
                <option value="video">{tLabel(lang, 'Видео (YouTube / MP4)', 'Video')}</option>
                <option value="audio">{tLabel(lang, 'Аудио', 'Audio')}</option>
              </select>

              <select
                value={qFont}
                onChange={(e) => setQFont(e.target.value as FontFamilyKey | '')}
                className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-medium bg-white"
              >
                <option value="">{tLabel(lang, 'Емтихан шрифті', 'Default Exam Font')}</option>
                {Object.entries(FONT_FAMILIES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>

            {qMedia.type !== 'none' && (
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                {qMedia.type === 'diagram' ? (
                  <input
                    type="text"
                    value={qMedia.diagramData || ''}
                    onChange={(e) => setQMedia((prev) => ({ ...prev, diagramData: e.target.value }))}
                    placeholder="Алматы:45, Астана:62, Шымкент:38"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white"
                  />
                ) : (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={qMedia.url || ''}
                      onChange={(e) => setQMedia((prev) => ({ ...prev, url: e.target.value }))}
                      placeholder={tLabel(lang, 'URL сілтеме қойыңыз немесе файл таңдаңыз...', 'Paste URL or upload file...')}
                      className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white"
                    />
                    <input
                      type="file"
                      onChange={handleMediaFileUpload}
                      className="text-xs text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border file:border-slate-300 file:bg-white file:text-xs file:font-semibold"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Symbol & Formula Toolbar */}
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-2">
                {(Object.keys(SYMBOL_PACKS) as Array<keyof typeof SYMBOL_PACKS>).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setSymTab(k)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                      symTab === k
                        ? 'bg-slate-900 text-white'
                        : 'bg-white text-slate-600 border border-slate-200 hover:text-slate-900'
                    }`}
                  >
                    {lang === 'kk' ? SYMBOL_PACKS[k].labelKk : SYMBOL_PACKS[k].labelEn}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                {SYMBOL_PACKS[symTab].items.map((item, idx) => (
                  <button
                    key={`${item.view}-${idx}`}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertSymbol(item.val);
                    }}
                    className="px-2 py-1 rounded-md bg-white hover:bg-blue-50 border border-slate-200 text-xs font-medium text-slate-800"
                  >
                    {item.view}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              ref={textAreaRef}
              rows={2}
              value={qText}
              onChange={(e) => setQText(e.target.value)}
              placeholder={tLabel(
                lang,
                'Сұрақ мәтіні... (LaTeX формула: $x^2$, Толықтыру: [жауап])',
                'Question text... (LaTeX: $x^2$, Fill blank: [answer])'
              )}
              className="w-full p-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-blue-600"
            />

            {qText.trim() && (
              <div
                className="p-3 rounded-lg bg-slate-50 border border-dashed border-slate-300 text-sm text-slate-800"
                style={{ fontFamily: previewFontCss }}
              >
                <div className="text-[11px] text-slate-400 mb-1" style={{ fontFamily: 'var(--font-body)' }}>
                  {tLabel(lang, 'Алдын ала көру (KaTeX):', 'Live Preview (KaTeX):')}
                </div>
                <RichText text={qText} />
              </div>
            )}

            {/* Dynamic Type Fields */}
            {(qType === 'single' || qType === 'multiple') && (
              <div className="space-y-2">
                {qOptions.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2.5">
                    {qType === 'single' ? (
                      <input
                        type="radio"
                        name="draft-single-corr"
                        checked={qSingleCorrect === idx}
                        onChange={() => setQSingleCorrect(idx)}
                      />
                    ) : (
                      <input
                        type="checkbox"
                        checked={qMultiCorrect.includes(idx)}
                        onChange={(e) => {
                          setQMultiCorrect((prev) =>
                            e.target.checked ? [...prev, idx] : prev.filter((v) => v !== idx)
                          );
                        }}
                      />
                    )}
                    <input
                      type="text"
                      value={opt}
                      onChange={(e) => {
                        const next = [...qOptions];
                        next[idx] = e.target.value;
                        setQOptions(next);
                      }}
                      placeholder={`${tLabel(lang, 'Нұсқа', 'Option')} ${idx + 1}`}
                      className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 text-xs focus:outline-none focus:border-blue-600"
                    />
                  </div>
                ))}
              </div>
            )}

            {qType === 'binary' && (
              <div className="grid grid-cols-2 gap-3">
                {[0, 1].map((idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 bg-slate-50"
                  >
                    <input
                      type="radio"
                      name="draft-binary-corr"
                      checked={qSingleCorrect === idx}
                      onChange={() => setQSingleCorrect(idx)}
                    />
                    <input
                      type="text"
                      value={qOptions[idx] || ''}
                      onChange={(e) => {
                        const next = [...qOptions];
                        next[idx] = e.target.value;
                        setQOptions(next);
                      }}
                      className="flex-1 bg-transparent text-xs font-semibold outline-none"
                    />
                  </div>
                ))}
              </div>
            )}

            {qType === 'matching' && (
              <div className="space-y-2">
                {qPairs.map((pair, idx) => (
                  <div key={idx} className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={pair.left}
                      onChange={(e) => {
                        const next = [...qPairs];
                        next[idx] = { ...next[idx], left: e.target.value };
                        setQPairs(next);
                      }}
                      placeholder={`${tLabel(lang, 'Сол жақ', 'Left')} ${idx + 1}`}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs"
                    />
                    <input
                      type="text"
                      value={pair.right}
                      onChange={(e) => {
                        const next = [...qPairs];
                        next[idx] = { ...next[idx], right: e.target.value };
                        setQPairs(next);
                      }}
                      placeholder={`${tLabel(lang, 'Оң жақ', 'Right')} ${idx + 1}`}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs"
                    />
                  </div>
                ))}
              </div>
            )}

            {qType === 'ordering' && (
              <div className="space-y-2">
                {qOrderItems.map((item, idx) => (
                  <input
                    key={idx}
                    type="text"
                    value={item}
                    onChange={(e) => {
                      const next = [...qOrderItems];
                      next[idx] = e.target.value;
                      setQOrderItems(next);
                    }}
                    placeholder={`${idx + 1}-${tLabel(lang, 'элемент (дұрыс ретпен)', 'item (in correct order)')}`}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs"
                  />
                ))}
              </div>
            )}

            {qType === 'fill' && (
              <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">
                {tLabel(
                  lang,
                  'Бос орынды тік жақшаға алыңыз. Мысалы: Қазақстан [1991] жылы тәуелсіздік алды. Бірнеше нұсқа үшін / қолданыңыз.',
                  'Wrap blanks in brackets. Example: Kazakhstan gained independence in [1991]. Use / for alternatives.'
                )}
              </div>
            )}

            {qType === 'open' && (
              <input
                type="text"
                value={qKeywords}
                onChange={(e) => setQKeywords(e.target.value)}
                placeholder={tLabel(
                  lang,
                  'Авто-тексеру кілт сөздері (үтірмен, бос қалса мұғалім тексереді)',
                  'Optional auto-grade keywords (comma-separated; leave empty for manual teacher grading)'
                )}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
              />
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleAddOrUpdateQuestion}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
              >
                <Plus className="w-3.5 h-3.5" />
                {editingQuestionIdx !== null
                  ? tLabel(lang, 'Өзгерісті сақтау', 'Update Question')
                  : tLabel(lang, 'Сұрақты қосу', 'Add Question')}
              </button>
              {editingQuestionIdx !== null && (
                <button
                  type="button"
                  onClick={resetDraft}
                  className="px-3.5 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50"
                >
                  {tLabel(lang, 'Өңдеуден бас тарту', 'Cancel Edit')}
                </button>
              )}
            </div>
          </div>

          {/* Question List */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                {tLabel(lang, 'Емтихан сұрақтары', 'Exam Questions')} ({exam.questions.length})
              </h3>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {tLabel(lang, 'Барлығы:', 'Total:')} {totalPoints} {tLabel(lang, 'балл', 'pts')}
              </span>
            </div>

            {exam.questions.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-lg">
                {tLabel(
                  lang,
                  'Әзірге сұрақ жоқ. Жоғарыдағы формадан қосыңыз немесе Word/Excel файлынан импорттаңыз.',
                  'No questions yet. Add questions above or import from Word/Excel.'
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                {exam.questions.map((q, idx) => (
                  <div
                    key={q.id}
                    className="p-3.5 flex items-start justify-between gap-3 hover:bg-slate-50/70"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
                        <span className="font-mono font-semibold text-slate-700">#{idx + 1}</span>
                        <span>·</span>
                        <span>{lang === 'kk' ? Q_TYPES[q.type].kk : Q_TYPES[q.type].en}</span>
                        <span>·</span>
                        <span className="font-mono tabular-nums font-semibold text-slate-700">
                          {q.points || 1} {tLabel(lang, 'балл', 'pts')}
                        </span>
                      </div>
                      <div className="text-sm font-medium text-slate-900">
                        <RichText text={q.text} />
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveQuestion(idx, -1)}
                        className="p-1.5 rounded-md text-slate-500 hover:bg-slate-200/70 disabled:opacity-30"
                        aria-label="Move up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === exam.questions.length - 1}
                        onClick={() => moveQuestion(idx, 1)}
                        className="p-1.5 rounded-md text-slate-500 hover:bg-slate-200/70 disabled:opacity-30"
                        aria-label="Move down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => loadQuestionIntoDraft(idx)}
                        className="p-1.5 rounded-md text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                        aria-label="Edit"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setExam((prev) => ({
                            ...prev,
                            questions: prev.questions.filter((_, i) => i !== idx),
                          }));
                          if (editingQuestionIdx === idx) resetDraft();
                        }}
                        className="p-1.5 rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600"
                        aria-label="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showImport && (
        <ImportQuestionsModal
          lang={lang}
          onClose={() => setShowImport(false)}
          onImported={(qs) =>
            setExam((prev) => ({ ...prev, questions: [...prev.questions, ...qs] }))
          }
          notify={notify}
        />
      )}

      {showExport && (
        <ExamExportModal
          lang={lang}
          exam={exam}
          onClose={() => setShowExport(false)}
          notify={notify}
        />
      )}
    </div>
  );
};
