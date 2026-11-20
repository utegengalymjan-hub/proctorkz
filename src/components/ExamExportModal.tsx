import React, { useState } from 'react';
import { Download, FileSpreadsheet, FileText, Printer, X } from 'lucide-react';
import { tLabel } from '../lib/constants';
import {
  exportExamToExcel,
  exportExamToPdfPrint,
  exportExamToWord,
  type ExamExportOptions,
} from '../lib/examExport';
import type { Exam, Lang } from '../types';

interface ExamExportModalProps {
  lang: Lang;
  exam: Exam;
  onClose: () => void;
  notify: (msg: string, type?: 'info' | 'success' | 'warn' | 'error') => void;
}

export const ExamExportModal: React.FC<ExamExportModalProps> = ({
  lang,
  exam,
  onClose,
  notify,
}) => {
  const [format, setFormat] = useState<ExamExportOptions['format']>('docx');
  const [includeAnswerKey, setIncludeAnswerKey] = useState(true);
  const [includeStudentHeader, setIncludeStudentHeader] = useState(true);
  const [busy, setBusy] = useState(false);

  const totalPoints = exam.questions.reduce((acc, q) => acc + (Number(q.points) || 1), 0);

  const handleDownload = async () => {
    if (!exam.questions.length) {
      notify(tLabel(lang, 'Жүктеп алу үшін кемінде 1 сұрақ болуы тиіс', 'Add at least 1 question before exporting'), 'warn');
      return;
    }
    setBusy(true);
    const opts: ExamExportOptions = { format, includeAnswerKey, includeStudentHeader };
    try {
      if (format === 'docx') {
        await exportExamToWord(exam, opts, lang);
        notify(tLabel(lang, 'Word (.docx) файлы жүктелді', 'Word (.docx) file downloaded'), 'success');
      } else if (format === 'xlsx') {
        exportExamToExcel(exam, opts, lang);
        notify(tLabel(lang, 'Excel (.xlsx) файлы жүктелді', 'Excel (.xlsx) file downloaded'), 'success');
      } else {
        exportExamToPdfPrint(exam, opts, lang);
        notify(tLabel(lang, 'PDF / Баспа терезесі ашылды', 'PDF / Print view opened'), 'info');
      }
      onClose();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Экспорт қатесі', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 border border-slate-200 space-y-5">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-slate-900">
              {tLabel(lang, 'Емтиханды жүктеп алу', 'Download Exam')}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {exam.title} · <span className="font-mono">{exam.code}</span> · {exam.questions.length}{' '}
              {tLabel(lang, 'сұрақ', 'qs')} · {totalPoints} {tLabel(lang, 'балл', 'pts')}
            </p>
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

        {/* Format Picker */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-700">
            {tLabel(lang, 'Құжат форматын таңдаңыз', 'Choose Export Format')}
          </label>
          <div className="grid grid-cols-3 gap-2.5">
            {(
              [
                {
                  id: 'docx' as const,
                  title: 'Word (.docx)',
                  sub: tLabel(lang, 'Өңдеуге дайын', 'Editable doc'),
                  icon: <FileText className="w-5 h-5" />,
                },
                {
                  id: 'pdf' as const,
                  title: 'PDF / Баспа',
                  sub: tLabel(lang, 'KaTeX сақталады', 'Print with KaTeX'),
                  icon: <Printer className="w-5 h-5" />,
                },
                {
                  id: 'xlsx' as const,
                  title: 'Excel (.xlsx)',
                  sub: tLabel(lang, 'Кесте форматы', 'Spreadsheet'),
                  icon: <FileSpreadsheet className="w-5 h-5" />,
                },
              ] as const
            ).map((opt) => {
              const active = format === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setFormat(opt.id)}
                  className={`p-3.5 rounded-xl border text-left transition-colors space-y-2 ${
                    active
                      ? 'border-blue-600 bg-blue-50/60 text-blue-950'
                      : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                  }`}
                >
                  <div className={active ? 'text-blue-600' : 'text-slate-400'}>{opt.icon}</div>
                  <div>
                    <div className="text-xs font-bold">{opt.title}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{opt.sub}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Export Options */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
          <label className="flex items-start justify-between gap-3 cursor-pointer">
            <div>
              <div className="font-semibold text-slate-800">
                {tLabel(lang, 'Жауап кілтін қосу (Мұғалім нұсқасы)', 'Include Answer Key (Teacher Copy)')}
              </div>
              <div className="text-slate-500 mt-0.5">
                {tLabel(
                  lang,
                  'Өшірсеңіз, оқушыларға тарататын таза нұсқа жүктеледі.',
                  'Uncheck to generate a clean student handout without answers.'
                )}
              </div>
            </div>
            <input
              type="checkbox"
              checked={includeAnswerKey}
              onChange={(e) => setIncludeAnswerKey(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-blue-600"
            />
          </label>

          {format !== 'xlsx' && (
            <label className="flex items-start justify-between gap-3 pt-2.5 border-t border-slate-200 cursor-pointer">
              <div>
                <div className="font-semibold text-slate-800">
                  {tLabel(lang, 'Оқушы деректері жолын қосу', 'Include Student Info Header')}
                </div>
                <div className="text-slate-500 mt-0.5">
                  {tLabel(lang, 'Аты-жөні, сыныбы және күні жазылатын өрістер', 'Name, Class, and Date lines at the top')}
                </div>
              </div>
              <input
                type="checkbox"
                checked={includeStudentHeader}
                onChange={(e) => setIncludeStudentHeader(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-blue-600"
              />
            </label>
          )}
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50"
          >
            {tLabel(lang, 'Болдырмау', 'Cancel')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            {busy
              ? tLabel(lang, 'Дайындалуда...', 'Generating...')
              : tLabel(lang, 'Жүктеп алу', 'Download')}
          </button>
        </div>
      </div>
    </div>
  );
};
