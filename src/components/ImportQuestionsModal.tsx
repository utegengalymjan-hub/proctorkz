import React, { useState } from 'react';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { FileSpreadsheet, FileText, Globe, Upload, X } from 'lucide-react';
import { api } from '../lib/api';
import { tLabel } from '../lib/constants';
import { parseSmartImport } from '../lib/examUtils';
import type { Lang, Question } from '../types';

interface ImportQuestionsModalProps {
  lang: Lang;
  onClose: () => void;
  onImported: (questions: Question[]) => void;
  notify: (msg: string, type?: 'info' | 'success' | 'warn' | 'error') => void;
}

export const ImportQuestionsModal: React.FC<ImportQuestionsModalProps> = ({
  lang,
  onClose,
  onImported,
  notify,
}) => {
  const [tab, setTab] = useState<'text' | 'file' | 'gdrive'>('file');
  const [rawText, setRawText] = useState('');
  const [gdriveUrl, setGdriveUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      if (ext === 'docx') {
        const res = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
        const qs = parseSmartImport(res.value);
        if (!qs.length) {
          notify(tLabel(lang, 'Word файлынан сұрақтар танылмады', 'No questions detected in Word file'), 'warn');
          return;
        }
        onImported(qs);
        notify(tLabel(lang, `Word файлынан ${qs.length} сұрақ қосылды`, `Imported ${qs.length} questions from Word`), 'success');
        onClose();
      } else if (ext === 'xlsx' || ext === 'xls') {
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 });
        const added: Question[] = [];
        const baseTs = Date.now();
        rows.forEach((r, i) => {
          if (!Array.isArray(r) || r.length < 4 || !r[0]) return;
          if (i === 0 && /сұрақ|question/i.test(String(r[0]))) return;
          const opts = r
            .slice(1, r.length - 1)
            .map((v) => String(v ?? '').trim())
            .filter(Boolean);
          if (opts.length < 2) return;
          const cIdx = (parseInt(String(r[r.length - 1]), 10) || 1) - 1;
          added.push({
            id: `q-${baseTs}-${i}`,
            type: 'single',
            points: 1,
            text: String(r[0]).trim(),
            options: opts,
            correct: Math.max(0, Math.min(cIdx, opts.length - 1)),
          });
        });
        if (!added.length) {
          notify(tLabel(lang, 'Excel кестесінің форматы сәйкес емес', 'Invalid Excel table format'), 'warn');
          return;
        }
        onImported(added);
        notify(tLabel(lang, `Excel-ден ${added.length} сұрақ қосылды`, `Imported ${added.length} questions from Excel`), 'success');
        onClose();
      } else {
        const text = await file.text();
        const qs = parseSmartImport(text);
        if (!qs.length) {
          notify(tLabel(lang, 'Файлдан сұрақтар танылмады', 'No questions parsed from file'), 'warn');
          return;
        }
        onImported(qs);
        notify(tLabel(lang, `${qs.length} сұрақ қосылды`, `Imported ${qs.length} questions`), 'success');
        onClose();
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Импорт қатесі', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleDriveImport = async () => {
    if (!gdriveUrl.trim()) {
      notify(tLabel(lang, 'Сілтемені енгізіңіз', 'Enter a Google Docs/Sheets link'), 'error');
      return;
    }
    setBusy(true);
    try {
      const { text } = await api.importGoogleDoc(gdriveUrl.trim());
      const normalized = text.replace(/","/g, '\t').replace(/^"|"$/gm, '');
      const qs = parseSmartImport(normalized);
      if (!qs.length) {
        notify(tLabel(lang, 'Құжаттан сұрақтар танылмады', 'No questions detected in document'), 'warn');
        return;
      }
      onImported(qs);
      notify(tLabel(lang, `Google Drive-тан ${qs.length} сұрақ қосылды`, `Imported ${qs.length} questions`), 'success');
      onClose();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Google Drive импорт қатесі', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleTextImport = () => {
    const qs = parseSmartImport(rawText);
    if (!qs.length) {
      notify(tLabel(lang, 'Мәтіннен сұрақтар танылмады', 'Could not parse questions from text'), 'error');
      return;
    }
    onImported(qs);
    notify(tLabel(lang, `${qs.length} сұрақ қосылды`, `Imported ${qs.length} questions`), 'success');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-xl w-full p-6 border border-slate-200 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <h3 className="text-lg font-bold text-slate-900">
            {tLabel(lang, 'Сұрақтарды импорттау', 'Import Questions')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 p-1 bg-slate-100 rounded-lg text-xs font-semibold">
          <button
            type="button"
            onClick={() => setTab('file')}
            className={`py-2 rounded-md flex items-center justify-center gap-1.5 ${
              tab === 'file' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Word / Excel
          </button>
          <button
            type="button"
            onClick={() => setTab('text')}
            className={`py-2 rounded-md flex items-center justify-center gap-1.5 ${
              tab === 'text' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            {tLabel(lang, 'Мәтін қою', 'Smart Paste')}
          </button>
          <button
            type="button"
            onClick={() => setTab('gdrive')}
            className={`py-2 rounded-md flex items-center justify-center gap-1.5 ${
              tab === 'gdrive' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            Google Drive
          </button>
        </div>

        {tab === 'file' && (
          <div className="space-y-3">
            <label className="block border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-8 text-center cursor-pointer bg-slate-50 transition-colors">
              <Upload className="w-7 h-7 text-slate-400 mx-auto mb-2" />
              <div className="text-sm font-semibold text-slate-800">
                {busy
                  ? tLabel(lang, 'Файл оқылуда...', 'Reading file...')
                  : tLabel(lang, '.docx, .xlsx, .xls, .csv немесе .txt файл таңдаңыз', 'Choose .docx, .xlsx, .xls, .csv, or .txt file')}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {tLabel(
                  lang,
                  'Excel: [Сұрақ | A | B | C | D | Дұрыс нөмір]. Word: сұрақтар бос жолмен бөлінеді.',
                  'Excel columns: Question | Opt1 | Opt2 | ... | CorrectIndex (1-based).'
                )}
              </div>
              <input
                type="file"
                accept=".docx,.xlsx,.xls,.csv,.txt"
                disabled={busy}
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          </div>
        )}

        {tab === 'text' && (
          <div className="space-y-3">
            <div className="text-xs text-slate-500 leading-relaxed">
              {tLabel(
                lang,
                'Дұрыс жауапты * белгісімен белгілеңіз. Бос орын үшін [жауап], сәйкестендіру үшін -> қолданыңыз.',
                'Prefix correct answers with *, use [blank] for fill-in-the-blank, or left -> right for matching.'
              )}
            </div>
            <textarea
              rows={8}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={`1. Қазақстанның астанасы қай қала?\nA) Алматы\n*B) Астана\nC) Шымкент\n\n2. Қазақстан [1991] жылы тәуелсіздік алды.`}
              className="w-full p-3.5 rounded-xl border border-slate-300 font-mono text-xs focus:outline-none focus:border-blue-600"
            />
            <button
              type="button"
              onClick={handleTextImport}
              className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
            >
              {tLabel(lang, 'Сұрақтарды тану және қосу', 'Parse & Add Questions')}
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
              className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50"
            >
              {busy
                ? tLabel(lang, 'Жүктелуде...', 'Fetching document...')
                : tLabel(lang, 'Google Drive-тан жүктеу', 'Import from Google Drive')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
