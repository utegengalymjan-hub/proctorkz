import katex from 'katex';
import type { Exam, PreparedQuestion, Question, Submission } from '../types';

export function escapeHTML(str: string | number | null | undefined): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderRichTextToHtml(str: string | null | undefined): string {
  if (str === null || str === undefined) return '';
  let html = escapeHTML(str);
  const decode = (t: string) =>
    t
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"');

  html = html.replace(/\$\$([\s\S]+?)\$\$/g, (full, tex) => {
    try {
      return katex.renderToString(decode(tex), { throwOnError: false, displayMode: true });
    } catch {
      return full;
    }
  });

  html = html.replace(/\$([^$\n]+?)\$/g, (full, tex) => {
    try {
      return katex.renderToString(decode(tex), { throwOnError: false, displayMode: false });
    } catch {
      return full;
    }
  });

  return html;
}

export function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function formatDuration(sec: number): string {
  const safe = Math.max(0, Math.floor(sec));
  const mins = Math.floor(safe / 60);
  const rem = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

export function generateExamCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'KZ-';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function prepareExamQuestions(exam: Exam): {
  prepared: PreparedQuestion[];
  initialAnswers: Record<string, unknown>;
} {
  const initialAnswers: Record<string, unknown> = {};

  let prepared: PreparedQuestion[] = exam.questions.map((q) => {
    if (q.type === 'single' || q.type === 'multiple') {
      let opts = (q.options || []).map((text, idx) => ({ text, origIdx: idx }));
      if (exam.shuffleOptions) opts = shuffleArray(opts);
      return { ...q, shuffledOptions: opts };
    }
    if (q.type === 'binary') {
      return {
        ...q,
        shuffledOptions: (q.options || ['Дұрыс', 'Қате']).map((text, idx) => ({
          text,
          origIdx: idx,
        })),
      };
    }
    if (q.type === 'matching') {
      const pairs = q.pairs || [];
      const leftItems = pairs.map((p, idx) => ({ text: p.left, id: idx }));
      let rightPool = pairs.map((p) => p.right);
      if (exam.shuffleOptions) rightPool = shuffleArray(rightPool);
      return { ...q, leftItems, rightPool };
    }
    if (q.type === 'ordering') {
      initialAnswers[q.id] = shuffleArray([...(q.items || [])]);
      return { ...q };
    }
    if (q.type === 'fill') {
      const blanks: string[] = [];
      const regex = /\[([^\]]+)\]/g;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(q.text)) !== null) {
        blanks.push(m[1]);
      }
      return { ...q, blanks };
    }
    return { ...q };
  });

  if (exam.shuffleQuestions) {
    prepared = shuffleArray(prepared);
  }

  return { prepared, initialAnswers };
}

export function evaluateSingleQuestion(
  q: PreparedQuestion,
  userAns: unknown
): { earned: number; maxPts: number; isCorrect: boolean; status: 'checked' | 'pending' } {
  const maxPts = Number(q.points) || 1;
  let earned = 0;
  let isCorrect = false;
  let status: 'checked' | 'pending' = 'checked';

  if (q.type === 'single' || q.type === 'binary') {
    isCorrect = userAns === q.correct;
    earned = isCorrect ? maxPts : 0;
  } else if (q.type === 'multiple') {
    const sel = Array.isArray(userAns) ? [...userAns].sort() : [];
    const cor = Array.isArray(q.correct) ? [...q.correct].sort() : [];
    isCorrect = sel.length === cor.length && sel.every((v, i) => v === cor[i]);
    earned = isCorrect ? maxPts : 0;
  } else if (q.type === 'matching') {
    const pairs = q.pairs || [];
    const map = (userAns && typeof userAns === 'object' ? userAns : {}) as Record<number, string>;
    let rc = 0;
    pairs.forEach((p, idx) => {
      if (map[idx] === p.right) rc++;
    });
    earned = pairs.length > 0 ? Number(((rc / pairs.length) * maxPts).toFixed(2)) : 0;
    isCorrect = pairs.length > 0 && rc === pairs.length;
  } else if (q.type === 'ordering') {
    const items = q.items || [];
    const arr = Array.isArray(userAns) ? (userAns as string[]) : [];
    let m = 0;
    items.forEach((item, idx) => {
      if (arr[idx] === item) m++;
    });
    earned = items.length > 0 ? Number(((m / items.length) * maxPts).toFixed(2)) : 0;
    isCorrect = items.length > 0 && m === items.length;
  } else if (q.type === 'fill') {
    const blanks = q.blanks || [];
    const ub = Array.isArray(userAns) ? (userAns as string[]) : [];
    if (blanks.length > 0) {
      let ok = 0;
      blanks.forEach((exp, i) => {
        const uVal = (ub[i] || '').trim().toLowerCase();
        const accepted = exp.split('/').map((s) => s.trim().toLowerCase());
        if (uVal && accepted.includes(uVal)) ok++;
      });
      earned = Number(((ok / blanks.length) * maxPts).toFixed(2));
      isCorrect = ok === blanks.length;
    }
  } else if (q.type === 'open') {
    const txt = String(userAns || '').trim().toLowerCase();
    if (q.keywords && q.keywords.trim()) {
      isCorrect = q.keywords
        .split(',')
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean)
        .some((k) => txt.includes(k));
      earned = isCorrect ? maxPts : 0;
    } else {
      status = 'pending';
    }
  }

  return { earned, maxPts, isCorrect, status };
}

export function parseSmartImport(rawText: string): Question[] {
  const blocks = rawText.trim().split(/\n\s*\n+/);
  const parsed: Question[] = [];
  const baseTs = Date.now();

  blocks.forEach((block, idx) => {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return;

    // Tab-separated single-line format (Excel paste)
    if (lines.length === 1 && lines[0].includes('\t')) {
      const cols = lines[0].split('\t').map((c) => c.trim());
      if (cols.length >= 4) {
        const opts = cols.slice(1, cols.length - 1);
        const cIdx = parseInt(cols[cols.length - 1], 10) - 1;
        parsed.push({
          id: `q-${baseTs}-${idx}`,
          type: 'single',
          points: 1,
          text: cols[0],
          options: opts,
          correct: Number.isNaN(cIdx) ? 0 : Math.max(0, Math.min(cIdx, opts.length - 1)),
        });
        return;
      }
    }

    const head = lines[0];

    // Ordering
    if (/\[(реттік|ordering)\]/i.test(head)) {
      const qText =
        head
          .replace(/\[(реттік|ordering)\]/i, '')
          .replace(/^\d+[.)]\s*/, '')
          .trim() || 'Ретпен орналастырыңыз:';
      const items = lines
        .slice(1)
        .map((l) => l.replace(/^(\d+[.)]|-)\s*/, '').trim())
        .filter(Boolean);
      if (items.length >= 2) {
        parsed.push({ id: `q-${baseTs}-${idx}`, type: 'ordering', points: 2, text: qText, items });
        return;
      }
    }

    // Fill in the blank
    if (/\[(толықтыру|fill)\]/i.test(head) || (lines.length === 1 && /\[[^\]]+\]/.test(head))) {
      parsed.push({
        id: `q-${baseTs}-${idx}`,
        type: 'fill',
        points: 2,
        text: head
          .replace(/\[(толықтыру|fill)\]/i, '')
          .replace(/^\d+[.)]\s*/, '')
          .trim(),
      });
      return;
    }

    // Matching
    if (
      /\[(сәйкестендіру|matching)\]/i.test(head) ||
      (lines.length >= 3 && lines.slice(1).every((l) => l.includes('->') || l.includes('==')))
    ) {
      const qText =
        head
          .replace(/\[(сәйкестендіру|matching)\]/i, '')
          .replace(/^\d+[.)]\s*/, '')
          .trim() || 'Сәйкестендіріңіз:';
      const pairs: { left: string; right: string }[] = [];
      lines.slice(1).forEach((l) => {
        const parts = l.split(l.includes('==') ? '==' : '->').map((s) => s.trim());
        if (parts.length >= 2) pairs.push({ left: parts[0], right: parts[1] });
      });
      if (pairs.length) {
        parsed.push({ id: `q-${baseTs}-${idx}`, type: 'matching', points: 2, text: qText, pairs });
        return;
      }
    }

    // Choice / Binary / Open
    const qText = head.replace(/^(сұрақ:|question:|^\d+[.)])\s*/i, '').trim();
    const optLines: { text: string; isStarred: boolean }[] = [];
    let expAns: string | null = null;

    for (let i = 1; i < lines.length; i++) {
      const l = lines[i];
      if (/^(жауабы|answer|дұрыс)[:\s]/i.test(l)) {
        expAns = l.split(/[:\s]+/).slice(1).join(' ').toUpperCase();
      } else if (/^(\*?[A-Ha-hА-Яа-я])[.)]\s+/.test(l) || /^(\*|-)\s*/.test(l)) {
        const star = l.startsWith('*') || l.endsWith('*');
        optLines.push({
          text: l
            .replace(/^\*/, '')
            .replace(/\*$/, '')
            .replace(/^([A-Ha-hА-Яа-я])[.)]\s+/, '')
            .replace(/^-\s+/, '')
            .trim(),
          isStarred: star,
        });
      }
    }

    if (optLines.length >= 2) {
      const corr: number[] = [];
      optLines.forEach((o, i) => {
        if (o.isStarred) corr.push(i);
      });
      if (expAns && !corr.length) {
        expAns.split(/[,;\s]+/).forEach((tok) => {
          const li = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].indexOf(tok.trim());
          if (li !== -1 && li < optLines.length) corr.push(li);
        });
      }
      if (
        optLines.length === 2 &&
        ['иә', 'жоқ', 'дұрыс', 'қате', 'true', 'false', 'yes', 'no'].includes(
          optLines[0].text.toLowerCase()
        )
      ) {
        parsed.push({
          id: `q-${baseTs}-${idx}`,
          type: 'binary',
          points: 1,
          text: qText,
          options: optLines.map((o) => o.text),
          correct: corr[0] ?? 0,
        });
      } else if (corr.length > 1) {
        parsed.push({
          id: `q-${baseTs}-${idx}`,
          type: 'multiple',
          points: 2,
          text: qText,
          options: optLines.map((o) => o.text),
          correct: corr,
        });
      } else {
        parsed.push({
          id: `q-${baseTs}-${idx}`,
          type: 'single',
          points: 1,
          text: qText,
          options: optLines.map((o) => o.text),
          correct: corr[0] ?? 0,
        });
      }
    } else {
      const kw = lines.find((l) => /^(кілт|keywords)[:\s]/i.test(l));
      parsed.push({
        id: `q-${baseTs}-${idx}`,
        type: 'open',
        points: 2,
        text: qText.replace(/\[(ашық|open)\]/i, '').trim(),
        keywords: kw ? kw.replace(/^(кілт|keywords)[:\s]+/i, '').trim() : '',
      });
    }
  });

  return parsed;
}

export function exportSubmissionsToCsv(submissions: Submission[]) {
  let csv = '\uFEFFОқушы;Сынып;Емтихан;Код;Балл;Макс;Пайыз;Ескерту;Уақыт(сек);Тапсырылды\n';
  submissions.forEach((s) => {
    const clean = (v: string) => `"${String(v || '').replace(/"/g, '""')}"`;
    csv += `${clean(s.studentName)};${clean(s.studentClass)};${clean(s.examTitle)};${clean(
      s.examCode
    )};${s.score};${s.maxScore};${s.percent}%;${s.violations.length};${s.spentSec};${clean(
      s.submittedAt
    )}\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `proctorkz-results-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
