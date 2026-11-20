import React, { useMemo, useState } from 'react';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  FileSpreadsheet,
  FileText,
  Globe,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { Q_TYPES, tLabel } from '../lib/constants';
import { parseSmartImport } from '../lib/examUtils';
import type { Lang, ParsedQuestionDraft, Question, QuestionType } from '../types';

interface ImportQuestionsModalProps {
  lang: Lang;
  onClose: () => void;
  onImported: (questions: Question[]) => void;
  notify: (msg: string, type?: 'info' | 'success' | 'warn' | 'error') => void;
}

function htmlToMarkedText(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  doc.querySelectorAll('strong, b').forEach((el) => {
    const txt = (el.textContent || '').trim();
    if (txt) el.textContent = `**${txt}**`;
  });
  const lines: string[] = [];
  doc.querySelectorAll('p, li, tr, h1, h2, h3, h4').forEach((el) => {
    if (el.tagName === 'TR') {
      const cells = Array.from(el.querySelectorAll('td, th')).map((c) =>
        (c.textContent || '').trim()
      );
      if (cells.some(Boolean)) lines.push(cells.join('\t'));
    } else if (!el.closest('tr')) {
      const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (txt) lines.push(txt);
    }
  });
  return lines.join('\n');
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const commaIdx = result.indexOf(',');
      resolve(commaIdx !== -1 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Файлды оқу мүмкін болмады'));
    reader.readAsDataURL(file);
  });
}

function parseExcelRowsLocally(rows: unknown[][]): ParsedQuestionDraft[] {
  const added: ParsedQuestionDraft[] = [];
  const baseTs = Date.now();
  rows.forEach((r, i) => {
    if (!Array.isArray(r) || r.length < 4 || !r[0]) return;
    if (i === 0 && /сұрақ|question|#/i.test(String(r[0]))) return;
    const opts = r
      .slice(1, r.length - 1)
      .map((v) => String(v ?? '').trim())
      .filter(Boolean);
    if (opts.length < 2) return;
    const lastCell = String(r[r.length - 1] ?? '').trim();
    const numericIdx = parseInt(lastCell, 10);
    const letterIdx = ['A', 'B', 'C', 'D', 'E', 'F'].indexOf(lastCell.toUpperCase());
    const cIdx = !Number.isNaN(numericIdx)
      ? numericIdx - 1
      : letterIdx !== -1
        ? letterIdx
        : 0;
    added.push({
      id: `q-xls-${baseTs}-${i}`,
      type: 'single',
      points: 1,
      text: String(r[0]).trim(),
      options: opts,
      correct: Math.max(0, Math.min(cIdx, opts.length - 1)),
      selected: true,
      needsAnswerReview: Number.isNaN(numericIdx) && letterIdx === -1,
    });
  });
  return added;
}

export const ImportQuestionsModal: React.FC<ImportQuestionsModalProps> = ({
  lang,
  onClose,
  onImported,
  notify,
}) => {
  const [step, setStep] = useState<'upload' | 'review'>('upload');
  const [tab, setTab] = useState<'file' | 'text' | 'gdrive'>('file');
  const [useAI, setUseAI] = useState(true);
  const [rawText, setRawText] = useState('');
  const [gdriveUrl, setGdriveUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [drafts, setDrafts] = useState<ParsedQuestionDraft[]>([]);
  const [sourceLabel, setSourceLabel] = useState('');

  const selectedCount = useMemo(() => drafts.filter((d) => d.selected).length, [drafts]);
  const reviewNeededCount = useMemo(
    () => drafts.filter((d) => d.selected && d.needsAnswerReview).length,
    [drafts]
  );

  const openReviewStep = (
    items: Array<Question & { needsAnswerReview?: boolean }>,
    label: string
  ) => {
    if (!items.length) {
      setErrorMsg(
        tLabel(
          lang,
          'Құжаттан сұрақтар табылмады. Файл мазмұнын тексеріңіз немесе AI тануды қосып көріңіз.',
          'No questions detected. Check the document content or enable AI recognition.'
        )
      );
      return;
    }
    setDrafts(items.map((q) => ({ ...q, selected: true })));
    setSourceLabel(label);
    setErrorMsg('');
    setStep('review');
  };

  const runTextOrAiRecognition = async (
    textContent: string,
    fileName: string,
    preferAI: boolean
  ) => {
    if (preferAI) {
      setStatusText(
        tLabel(
          lang,
          'AI құжатты талдап, сұрақтар мен жауаптарды бөліп жатыр...',
          'AI is analyzing the document and separating questions & answers...'
        )
      );
      const res = await api.parseDocumentWithAI({
        fileName,
        mimeType: 'text/plain',
        textContent,
      });
      openReviewStep(res.questions, fileName);
    } else {
      const qs = parseSmartImport(textContent);
      openReviewStep(qs, fileName);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setErrorMsg('');
    setStatusText(tLabel(lang, 'Файл оқылуда...', 'Reading file...'));

    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';

      if (ext === 'pdf') {
        if (!useAI) {
          setErrorMsg(
            tLabel(
              lang,
              'PDF құжаттарын автоматты тану үшін «AI тану (Gemini)» режимін қосыңыз.',
              'Enable "AI Recognition (Gemini)" to automatically extract questions from PDF documents.'
            )
          );
          return;
        }
        setStatusText(
          tLabel(
            lang,
            'PDF құжаты AI арқылы талдануда...',
            'Analyzing PDF document with Gemini AI...'
          )
        );
        const base64Data = await fileToBase64(file);
        const res = await api.parseDocumentWithAI({
          fileName: file.name,
          mimeType: 'application/pdf',
          base64Data,
        });
        openReviewStep(res.questions, file.name);
        return;
      }

      if (ext === 'docx') {
        const buffer = await file.arrayBuffer();
        const htmlRes = await mammoth.convertToHtml({ arrayBuffer: buffer });
        const markedText = htmlToMarkedText(htmlRes.value);
        const rawFallback = (await mammoth.extractRawText({ arrayBuffer: buffer })).value;
        const combined = markedText.trim().length >= rawFallback.trim().length * 0.6 ? markedText : rawFallback;
        await runTextOrAiRecognition(combined, file.name, useAI);
        return;
      }

      if (ext === 'xlsx' || ext === 'xls') {
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
        if (!useAI) {
          const localQs = parseExcelRowsLocally(rows);
          openReviewStep(localQs, file.name);
        } else {
          const tsvText = rows
            .map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? '').trim()).join('\t') : ''))
            .filter(Boolean)
            .join('\n');
          await runTextOrAiRecognition(tsvText, file.name, true);
        }
        return;
      }

      const text = await file.text();
      await runTextOrAiRecognition(text, file.name, useAI);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Құжатты өңдеу қатесі';
      setErrorMsg(msg);
      notify(msg, 'error');
    } finally {
      setBusy(false);
      setStatusText('');
      e.target.value = '';
    }
  };

  const handleTextSubmit = async () => {
    if (!rawText.trim()) {
      setErrorMsg(tLabel(lang, 'Мәтінді енгізіңіз', 'Please paste exam text first'));
      return;
    }
    setBusy(true);
    setErrorMsg('');
    try {
      await runTextOrAiRecognition(rawText, tLabel(lang, 'Мәтін үзіндісі', 'Pasted Text'), useAI);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Мәтінді талдау қатесі';
      setErrorMsg(msg);
      notify(msg, 'error');
    } finally {
      setBusy(false);
      setStatusText('');
    }
  };

  const handleGoogleDriveImport = async () => {
    if (!gdriveUrl.trim()) {
      setErrorMsg(tLabel(lang, 'Сілтемені енгізіңіз', 'Enter a Google Docs/Sheets link'));
      return;
    }
    setBusy(true);
    setErrorMsg('');
    setStatusText(tLabel(lang, 'Google Drive құжаты жүктелуде...', 'Fetching Google Drive document...'));
    try {
      const { text } = await api.importGoogleDoc(gdriveUrl.trim());
      const normalized = text.replace(/","/g, '\t').replace(/^"|"$/gm, '');
      await runTextOrAiRecognition(normalized, 'Google Drive', useAI);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google Drive импорт қатесі';
      setErrorMsg(msg);
      notify(msg, 'error');
    } finally {
      setBusy(false);
      setStatusText('');
    }
  };

  const updateDraft = (idx: number, patch: Partial<ParsedQuestionDraft>) => {
    setDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  };

  const handleConfirmImport = () => {
    const chosen: Question[] = drafts
      .filter((d) => d.selected && d.text.trim())
      .map(({ selected: _sel, needsAnswerReview: _rev, ...q }) => q);

    if (!chosen.length) {
      notify(tLabel(lang, 'Қосу үшін кемінде 1 сұрақ таңдаңыз', 'Select at least 1 question to import'), 'warn');
      return;
    }
    onImported(chosen);
    notify(
      tLabel(lang, `${chosen.length} сұрақ емтиханға қосылды!`, `Added ${chosen.length} questions to exam!`),
      'success'
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        className={`bg-white rounded-2xl w-full border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden ${
          step === 'review' ? 'max-w-4xl' : 'max-w-xl'
        }`}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {step === 'review' && (
              <button
                type="button"
                onClick={() => setStep('upload')}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                title={tLabel(lang, 'Артқа', 'Back')}
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                {step === 'upload'
                  ? tLabel(lang, 'Құжаттан сұрақтарды автоматты тану', 'Auto-Recognize Questions from Document')
                  : tLabel(lang, 'Танылған сұрақтарды тексеру және түзету', 'Review & Edit Recognized Questions')}
              </h3>
              {step === 'review' && (
                <div className="text-xs text-slate-500 truncate mt-0.5">
                  {sourceLabel} · {drafts.length} {tLabel(lang, 'сұрақ танылды', 'detected')} ·{' '}
                  {selectedCount} {tLabel(lang, 'таңдалды', 'selected')}
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* STEP 1: UPLOAD / INPUT */}
        {step === 'upload' ? (
          <div className="p-6 space-y-5 overflow-y-auto">
            {/* Recognition Engine Selector */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  {tLabel(lang, 'AI автоматты тану (Word, PDF, Excel, TXT)', 'AI Auto-Recognition (Word, PDF, Excel, TXT)')}
                </div>
                <div className="text-[11px] text-slate-500">
                  {tLabel(
                    lang,
                    'Кез келген құжаттағы сұрақтарды, нұсқаларды және жауап кілтін автоматты ажыратып бөледі.',
                    'Automatically separates stems, options, and answer keys even from unstructured documents.'
                  )}
                </div>
              </div>
              <div className="flex p-0.5 bg-slate-200/80 rounded-lg text-xs font-semibold shrink-0">
                <button
                  type="button"
                  onClick={() => setUseAI(true)}
                  className={`px-3 py-1.5 rounded-md transition-colors ${
                    useAI ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  AI (Gemini)
                </button>
                <button
                  type="button"
                  onClick={() => setUseAI(false)}
                  className={`px-3 py-1.5 rounded-md transition-colors ${
                    !useAI ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  {tLabel(lang, 'Жылдам', 'Fast')}
                </button>
              </div>
            </div>

            {/* Source Tabs */}
            <div className="grid grid-cols-3 p-1 bg-slate-100 rounded-lg text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setTab('file');
                  setErrorMsg('');
                }}
                className={`py-2 rounded-md flex items-center justify-center gap-1.5 ${
                  tab === 'file' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                {tLabel(lang, 'Құжат жүктеу', 'Upload File')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('text');
                  setErrorMsg('');
                }}
                className={`py-2 rounded-md flex items-center justify-center gap-1.5 ${
                  tab === 'text' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                {tLabel(lang, 'Мәтін қою', 'Paste Text')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('gdrive');
                  setErrorMsg('');
                }}
                className={`py-2 rounded-md flex items-center justify-center gap-1.5 ${
                  tab === 'gdrive' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                Google Drive
              </button>
            </div>

            {errorMsg && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {tab === 'file' && (
              <label
                className={`block border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                  busy
                    ? 'border-blue-400 bg-blue-50/40 cursor-wait'
                    : 'border-slate-300 hover:border-blue-500 bg-slate-50 cursor-pointer'
                }`}
              >
                {busy ? (
                  <Loader2 className="w-8 h-8 text-blue-600 mx-auto mb-2.5 animate-spin" />
                ) : (
                  <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2.5" />
                )}
                <div className="text-sm font-semibold text-slate-800">
                  {busy
                    ? statusText || tLabel(lang, 'Өңделуде...', 'Processing...')
                    : tLabel(
                        lang,
                        'Word (.docx), PDF (.pdf), Excel (.xlsx), TXT немесе CSV таңдаңыз',
                        'Choose Word (.docx), PDF (.pdf), Excel (.xlsx), TXT, or CSV'
                      )}
                </div>
                <div className="text-xs text-slate-500 mt-1.5 max-w-md mx-auto">
                  {tLabel(
                    lang,
                    'Қалың шрифтпен белгіленген жауаптар, * белгілері немесе құжат соңындағы жауап кілті автоматты анықталады.',
                    'Bolded options, asterisks (*), and end-of-document answer keys are automatically detected.'
                  )}
                </div>
                <input
                  type="file"
                  accept=".docx,.pdf,.xlsx,.xls,.csv,.txt"
                  disabled={busy}
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            )}

            {tab === 'text' && (
              <div className="space-y-3">
                <textarea
                  rows={8}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder={`1. Қазақстанның астанасы қай қала?\nA) Алматы\n*B) Астана\nC) Шымкент\n\n2. Қазақстан [1991] жылы тәуелсіздік алды.`}
                  className="w-full p-3.5 rounded-xl border border-slate-300 font-mono text-xs focus:outline-none focus:border-blue-600"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleTextSubmit}
                  className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                  {busy
                    ? statusText || tLabel(lang, 'Талдануда...', 'Analyzing...')
                    : tLabel(lang, 'Сұрақтар мен жауаптарды тану', 'Recognize Questions & Answers')}
                </button>
              </div>
            )}

            {tab === 'gdrive' && (
              <div className="space-y-3">
                <p className="text-xs text-slate-600">
                  {tLabel(
                    lang,
                    'Ашық Google Docs немесе Google Sheets сілтемесін қойыңыз («Anyone with the link»):',
                    'Paste a public Google Docs or Google Sheets link ("Anyone with the link"):'
                  )}
                </p>
                <input
                  type="url"
                  value={gdriveUrl}
                  onChange={(e) => setGdriveUrl(e.target.value)}
                  placeholder="https://docs.google.com/document/d/..."
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-blue-600"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleGoogleDriveImport}
                  className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                  {busy
                    ? statusText || tLabel(lang, 'Жүктелуде...', 'Fetching...')
                    : tLabel(lang, 'Google Drive-тан тану', 'Fetch & Recognize')}
                </button>
              </div>
            )}
          </div>
        ) : (
          /* STEP 2: EDITABLE REVIEW SCREEN */
          <>
            {reviewNeededCount > 0 && (
              <div className="px-6 py-2.5 bg-amber-50 border-b border-amber-200 text-xs font-medium text-amber-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>
                  {tLabel(
                    lang,
                    `${reviewNeededCount} сұрақта құжат ішінде дұрыс жауап анық көрсетілмеген — төменде дұрыс жауабын белгілеп тексеріңіз.`,
                    `${reviewNeededCount} question(s) did not have an explicit answer key in the document — please verify their correct answers below.`
                  )}
                </span>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50">
              {drafts.map((q, idx) => {
                const isChoice =
                  q.type === 'single' || q.type === 'multiple' || q.type === 'binary';
                return (
                  <div
                    key={q.id}
                    className={`bg-white rounded-xl border p-4 space-y-3 transition-opacity ${
                      q.selected ? 'border-slate-200' : 'border-slate-200 opacity-50'
                    }`}
                  >
                    {/* Row Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={q.selected}
                          onChange={(e) => updateDraft(idx, { selected: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600"
                        />
                        <span className="font-mono text-xs font-bold text-slate-700">
                          #{idx + 1}
                        </span>
                        <select
                          value={q.type}
                          onChange={(e) => {
                            const nextType = e.target.value as QuestionType;
                            const patch: Partial<ParsedQuestionDraft> = { type: nextType };
                            if (
                              (nextType === 'single' || nextType === 'multiple') &&
                              (!q.options || q.options.length < 2)
                            ) {
                              patch.options = ['', '', '', ''];
                              patch.correct = nextType === 'multiple' ? [0] : 0;
                            } else if (nextType === 'binary') {
                              patch.options = ['Дұрыс', 'Қате'];
                              patch.correct = 0;
                            } else if (nextType === 'multiple' && !Array.isArray(q.correct)) {
                              patch.correct = [typeof q.correct === 'number' ? q.correct : 0];
                            } else if (nextType === 'single' && Array.isArray(q.correct)) {
                              patch.correct = q.correct[0] ?? 0;
                            } else if (nextType === 'matching' && (!q.pairs || !q.pairs.length)) {
                              patch.pairs = [
                                { left: '', right: '' },
                                { left: '', right: '' },
                              ];
                            } else if (nextType === 'ordering' && (!q.items || !q.items.length)) {
                              patch.items = ['', ''];
                            }
                            updateDraft(idx, patch);
                          }}
                          className="px-2 py-1 rounded-md border border-slate-300 text-xs font-medium bg-white"
                        >
                          {Object.entries(Q_TYPES).map(([k, v]) => (
                            <option key={k} value={k}>
                              {lang === 'kk' ? v.kk : v.en}
                            </option>
                          ))}
                        </select>
                        {q.needsAnswerReview && (
                          <span className="text-[11px] font-semibold text-amber-700">
                            · {tLabel(lang, 'Жауабын тексеріңіз', 'Verify answer')}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <label className="text-xs text-slate-500 flex items-center gap-1">
                          {tLabel(lang, 'Балл:', 'Pts:')}
                          <input
                            type="number"
                            min={1}
                            max={50}
                            value={q.points || 1}
                            onChange={(e) =>
                              updateDraft(idx, { points: Math.max(1, Number(e.target.value) || 1) })
                            }
                            className="w-14 px-2 py-0.5 rounded-md border border-slate-300 font-mono text-xs text-center"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => setDrafts((prev) => prev.filter((_, i) => i !== idx))}
                          className="p-1.5 rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"
                          aria-label="Remove"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Editable Question Text */}
                    <textarea
                      rows={2}
                      value={q.text}
                      onChange={(e) => updateDraft(idx, { text: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-blue-600"
                    />

                    {/* Editable Options */}
                    {isChoice && (
                      <div className="space-y-1.5 pl-1">
                        {(q.options || []).map((opt, optIdx) => {
                          const isCorrect =
                            q.type === 'multiple'
                              ? Array.isArray(q.correct) && q.correct.includes(optIdx)
                              : q.correct === optIdx;
                          return (
                            <div key={optIdx} className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  if (q.type === 'multiple') {
                                    const arr = Array.isArray(q.correct) ? q.correct : [];
                                    const next = arr.includes(optIdx)
                                      ? arr.filter((v) => v !== optIdx)
                                      : [...arr, optIdx];
                                    updateDraft(idx, {
                                      correct: next.length ? next : [0],
                                      needsAnswerReview: false,
                                    });
                                  } else {
                                    updateDraft(idx, {
                                      correct: optIdx,
                                      needsAnswerReview: false,
                                    });
                                  }
                                }}
                                className={`w-6 h-6 rounded-md border flex items-center justify-center text-xs font-mono font-bold shrink-0 transition-colors ${
                                  isCorrect
                                    ? 'bg-emerald-600 border-emerald-600 text-white'
                                    : 'bg-slate-50 border-slate-300 text-slate-500 hover:border-slate-400'
                                }`}
                                title={tLabel(lang, 'Дұрыс жауап ретінде белгілеу', 'Mark as correct')}
                              >
                                {isCorrect ? <Check className="w-3.5 h-3.5" /> : String.fromCharCode(65 + optIdx)}
                              </button>
                              <input
                                type="text"
                                value={opt}
                                onChange={(e) => {
                                  const nextOpts = [...(q.options || [])];
                                  nextOpts[optIdx] = e.target.value;
                                  updateDraft(idx, { options: nextOpts });
                                }}
                                className={`flex-1 px-2.5 py-1.5 rounded-lg border text-xs ${
                                  isCorrect
                                    ? 'border-emerald-300 bg-emerald-50/40 font-semibold text-slate-900'
                                    : 'border-slate-200 bg-white text-slate-700'
                                }`}
                              />
                              {(q.options || []).length > 2 && q.type !== 'binary' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextOpts = (q.options || []).filter((_, i) => i !== optIdx);
                                    updateDraft(idx, {
                                      options: nextOpts,
                                      correct:
                                        q.type === 'multiple'
                                          ? (Array.isArray(q.correct) ? q.correct : [0]).filter(
                                              (c) => c < nextOpts.length
                                            )
                                          : Math.min(typeof q.correct === 'number' ? q.correct : 0, nextOpts.length - 1),
                                    });
                                  }}
                                  className="text-slate-400 hover:text-red-600 p-1"
                                  aria-label="Remove option"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                        {q.type !== 'binary' && (q.options || []).length < 6 && (
                          <button
                            type="button"
                            onClick={() =>
                              updateDraft(idx, { options: [...(q.options || []), ''] })
                            }
                            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 pt-1"
                          >
                            <Plus className="w-3 h-3" />
                            {tLabel(lang, 'Нұсқа қосу', 'Add option')}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Matching Pairs Preview */}
                    {q.type === 'matching' && (
                      <div className="space-y-1.5">
                        {(q.pairs || []).map((pair, pIdx) => (
                          <div key={pIdx} className="grid grid-cols-2 gap-2">
                            <input
                              type="text"
                              value={pair.left}
                              onChange={(e) => {
                                const next = [...(q.pairs || [])];
                                next[pIdx] = { ...next[pIdx], left: e.target.value };
                                updateDraft(idx, { pairs: next });
                              }}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs"
                            />
                            <input
                              type="text"
                              value={pair.right}
                              onChange={(e) => {
                                const next = [...(q.pairs || [])];
                                next[pIdx] = { ...next[pIdx], right: e.target.value };
                                updateDraft(idx, { pairs: next });
                              }}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs"
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Ordering Items Preview */}
                    {q.type === 'ordering' && (
                      <div className="space-y-1.5">
                        {(q.items || []).map((item, iIdx) => (
                          <input
                            key={iIdx}
                            type="text"
                            value={item}
                            onChange={(e) => {
                              const next = [...(q.items || [])];
                              next[iIdx] = e.target.value;
                              updateDraft(idx, { items: next });
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs"
                          />
                        ))}
                      </div>
                    )}

                    {/* Open Question Keywords */}
                    {q.type === 'open' && (
                      <input
                        type="text"
                        value={q.keywords || ''}
                        onChange={(e) => updateDraft(idx, { keywords: e.target.value })}
                        placeholder={tLabel(lang, 'Кілт сөздер (міндетті емес)', 'Grading keywords (optional)')}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Review Footer */}
            <div className="px-6 py-4 border-t border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => setDrafts((prev) => prev.map((d) => ({ ...d, selected: true })))}
                  className="font-semibold text-blue-600 hover:underline"
                >
                  {tLabel(lang, 'Барлығын таңдау', 'Select all')}
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() => setDrafts((prev) => prev.map((d) => ({ ...d, selected: false })))}
                  className="font-semibold text-slate-600 hover:underline"
                >
                  {tLabel(lang, 'Таңдауды алу', 'Deselect all')}
                </button>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50"
                >
                  {tLabel(lang, 'Болдырмау', 'Cancel')}
                </button>
                <button
                  type="button"
                  disabled={selectedCount === 0}
                  onClick={handleConfirmImport}
                  className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-40"
                >
                  {tLabel(
                    lang,
                    `Таңдалған ${selectedCount} сұрақты қосу`,
                    `Add ${selectedCount} Selected Questions`
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
