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

function stripBoldMarkers(s: string): string {
  return s.replace(/\*\*/g, '').trim();
}

function letterToOptionIndex(tok: string): number {
  const clean = tok.trim().toUpperCase().replace(/[.)]/g, '');
  const latin = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const lIdx = latin.indexOf(clean);
  if (lIdx !== -1) return lIdx;
  const cyrillic = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З'];
  const cIdx = cyrillic.indexOf(clean);
  if (cIdx !== -1) return cIdx;
  const num = parseInt(clean, 10);
  if (!Number.isNaN(num) && num >= 1 && num <= 8) return num - 1;
  return -1;
}

function isOptionLine(line: string): boolean {
  const stripped = stripBoldMarkers(line);
  return (
    /^(\*|\+|✓|✔)?\s*[A-Ha-hА-Да-дЕе][.)]\s+/.test(stripped) ||
    /^(\*|\+|✓|✔|-|•)\s+\S/.test(stripped)
  );
}

function isQuestionStartLine(line: string): boolean {
  const stripped = stripBoldMarkers(line);
  return (
    /^\d{1,3}[.)]\s+\S/.test(stripped) ||
    /^(сұрақ|question|тапсырма)\s*\d*\s*[:.)]/i.test(stripped) ||
    /^\[(реттік|ordering|толықтыру|fill|сәйкестендіру|matching|ашық|open)\]/i.test(stripped)
  );
}

function extractAnswerKeyMap(rawText: string): {
  cleanedText: string;
  keyMap: Map<number, number[]>;
} {
  const keyMap = new Map<number, number[]>();
  const lines = rawText.replace(/\r\n/g, '\n').split('\n');
  let keyStartIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const clean = stripBoldMarkers(lines[i]).trim();
    if (/^(жауап\s*кілт[іи]?|жауаптар[ы]?|дұрыс\s*жауаптар|ответы|ключ[и]?|answer\s*keys?|answers)\s*:?/i.test(clean)) {
      keyStartIdx = i;
      break;
    }
  }

  if (keyStartIdx === -1) {
    return { cleanedText: rawText, keyMap };
  }

  const keyBlock = lines.slice(keyStartIdx).join('\n');
  const pairRegex = /(\d{1,3})\s*[-–—.):]\s*([A-Ha-hА-Да-дЕе](?:\s*[,/]\s*[A-Ha-hА-Да-дЕе])*)/g;
  let m: RegExpExecArray | null;
  while ((m = pairRegex.exec(keyBlock)) !== null) {
    const qNum = parseInt(m[1], 10);
    const letters = m[2]
      .split(/[,/\s]+/)
      .map(letterToOptionIndex)
      .filter((idx) => idx >= 0);
    if (qNum > 0 && letters.length > 0) {
      keyMap.set(qNum, letters);
    }
  }

  const cleanedText = lines.slice(0, keyStartIdx).join('\n').trim();
  return { cleanedText, keyMap };
}

function splitIntoQuestionBlocks(rawText: string): string[] {
  const normalized = rawText.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  // First try splitting by blank lines
  const coarseBlocks = normalized.split(/\n\s*\n+/).map((b) => b.trim()).filter(Boolean);
  const finalBlocks: string[] = [];

  coarseBlocks.forEach((block) => {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    // If a single block contains multiple numbered questions separated by single newlines, split them
    let current: string[] = [];
    let hasSeenOption = false;

    for (const line of lines) {
      const startsNewQuestion =
        current.length > 0 &&
        isQuestionStartLine(line) &&
        (hasSeenOption || !/^\d+[.)]\s+/.test(stripBoldMarkers(current[0])) || current.length >= 2);

      // Avoid splitting ordered/matching list items under a tagged ordering/matching question
      const parentIsListType =
        current.length > 0 &&
        /\[(реттік|ordering|сәйкестендіру|matching)\]/i.test(stripBoldMarkers(current[0]));

      if (startsNewQuestion && !parentIsListType) {
        finalBlocks.push(current.join('\n'));
        current = [line];
        hasSeenOption = false;
      } else {
        current.push(line);
        if (isOptionLine(line)) hasSeenOption = true;
      }
    }

    if (current.length > 0) {
      finalBlocks.push(current.join('\n'));
    }
  });

  return finalBlocks;
}

export function parseSmartImport(
  rawText: string
): Array<Question & { needsAnswerReview?: boolean }> {
  const { cleanedText, keyMap } = extractAnswerKeyMap(rawText);
  const blocks = splitIntoQuestionBlocks(cleanedText);
  const parsed: Array<Question & { needsAnswerReview?: boolean }> = [];
  const baseTs = Date.now();

  blocks.forEach((block, idx) => {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return;

    // Tab-separated multi-line or single-line format (Excel / Word table paste)
    if (lines.every((l) => l.includes('\t')) && lines[0].split('\t').length >= 4) {
      lines.forEach((rowLine, rIdx) => {
        const cols = rowLine.split('\t').map((c) => stripBoldMarkers(c));
        if (cols.length < 4 || !cols[0]) return;
        if (idx === 0 && rIdx === 0 && /^(сұрақ|question|#|№)/i.test(cols[0])) return;
        const opts = cols.slice(1, cols.length - 1).filter(Boolean);
        if (opts.length < 2) return;
        const lastCell = cols[cols.length - 1];
        const parsedIdx = letterToOptionIndex(lastCell);
        parsed.push({
          id: `q-${baseTs}-${idx}-${rIdx}`,
          type: 'single',
          points: 1,
          text: cols[0],
          options: opts,
          correct: parsedIdx >= 0 && parsedIdx < opts.length ? parsedIdx : 0,
          needsAnswerReview: parsedIdx < 0 || parsedIdx >= opts.length,
        });
      });
      return;
    }

    const rawHead = lines[0];
    const head = stripBoldMarkers(rawHead);
    const numMatch = head.match(/^(\d{1,3})[.)]\s*/);
    const qNumber = numMatch ? parseInt(numMatch[1], 10) : parsed.length + 1;

    // Ordering
    if (/\[(реттік|ordering)\]/i.test(head)) {
      const qText =
        head
          .replace(/\[(реттік|ordering)\]/i, '')
          .replace(/^\d+[.)]\s*/, '')
          .trim() || 'Ретпен орналастырыңыз:';
      const items = lines
        .slice(1)
        .map((l) => stripBoldMarkers(l).replace(/^(\d+[.)]|-|•)\s*/, '').trim())
        .filter(Boolean);
      if (items.length >= 2) {
        parsed.push({
          id: `q-${baseTs}-${idx}`,
          type: 'ordering',
          points: 2,
          text: qText,
          items,
          needsAnswerReview: false,
        });
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
        needsAnswerReview: false,
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
        const clean = stripBoldMarkers(l).replace(/^(\d+[.)]|-|•)\s*/, '');
        const parts = clean.split(clean.includes('==') ? '==' : '->').map((s) => s.trim());
        if (parts.length >= 2) pairs.push({ left: parts[0], right: parts[1] });
      });
      if (pairs.length) {
        parsed.push({
          id: `q-${baseTs}-${idx}`,
          type: 'matching',
          points: 2,
          text: qText,
          pairs,
          needsAnswerReview: false,
        });
        return;
      }
    }

    // Choice / Binary / Open
    const qParts: string[] = [
      head.replace(/^(сұрақ:|question:|тапсырма:|\d{1,3}[.)])\s*/i, '').trim(),
    ];
    const optLines: { text: string; isMarkedCorrect: boolean }[] = [];
    let expAns: string | null = null;
    let startedOptions = false;

    for (let i = 1; i < lines.length; i++) {
      const rawLine = lines[i];
      const cleanLine = stripBoldMarkers(rawLine);

      if (/^(жауабы|жауап|answer|дұрыс\s*жауабы?|ответ|correct)[:\s]/i.test(cleanLine)) {
        expAns = cleanLine
          .replace(/^(жауабы|жауап|answer|дұрыс\s*жауабы?|ответ|correct)[:\s]+/i, '')
          .trim();
        continue;
      }

      if (isOptionLine(rawLine)) {
        startedOptions = true;
        const hasBoldCue = /\*\*[^*]+\*\*/.test(rawLine);
        const hasSymbolCue =
          /^(\*|\+|✓|✔)/.test(cleanLine) ||
          /(\*|✓|✔|\(дұрыс\)|\(correct\)|\(true\))$/i.test(cleanLine);

        const optText = cleanLine
          .replace(/^(\*|\+|✓|✔)\s*/, '')
          .replace(/(\*|✓|✔|\(дұрыс\)|\(correct\)|\(true\))$/i, '')
          .replace(/^([A-Ha-hА-Да-дЕе])[.)]\s+/, '')
          .replace(/^(-|•)\s+/, '')
          .trim();

        if (optText) {
          optLines.push({
            text: optText,
            isMarkedCorrect: hasBoldCue || hasSymbolCue,
          });
        }
      } else if (!startedOptions && !/^(кілт|keywords)[:\s]/i.test(cleanLine)) {
        // Multi-line question stem continuation
        qParts.push(cleanLine);
      }
    }

    const qText = qParts.filter(Boolean).join(' ').trim();

    if (optLines.length >= 2) {
      const corr: number[] = [];

      // Only treat bold cues as answer indicator if NOT all options are bolded
      const allMarked = optLines.every((o) => o.isMarkedCorrect);
      if (!allMarked) {
        optLines.forEach((o, i) => {
          if (o.isMarkedCorrect) corr.push(i);
        });
      }

      if (expAns && !corr.length) {
        expAns.split(/[,;\s/]+/).forEach((tok) => {
          const li = letterToOptionIndex(tok);
          if (li !== -1 && li < optLines.length && !corr.includes(li)) {
            corr.push(li);
          }
        });
        // Also check if expAns matches an option's text directly
        if (!corr.length) {
          const normExp = expAns.toLowerCase();
          const txtIdx = optLines.findIndex((o) => o.text.toLowerCase() === normExp);
          if (txtIdx !== -1) corr.push(txtIdx);
        }
      }

      // Check trailing answer key block if still unknown
      if (!corr.length && keyMap.has(qNumber)) {
        const mapped = keyMap.get(qNumber)!.filter((i) => i >= 0 && i < optLines.length);
        mapped.forEach((i) => {
          if (!corr.includes(i)) corr.push(i);
        });
      }

      const needsAnswerReview = corr.length === 0;

      if (
        optLines.length === 2 &&
        ['иә', 'жоқ', 'дұрыс', 'қате', 'true', 'false', 'yes', 'no', 'верно', 'неверно'].includes(
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
          needsAnswerReview,
        });
      } else if (corr.length > 1) {
        parsed.push({
          id: `q-${baseTs}-${idx}`,
          type: 'multiple',
          points: 2,
          text: qText,
          options: optLines.map((o) => o.text),
          correct: corr,
          needsAnswerReview: false,
        });
      } else {
        parsed.push({
          id: `q-${baseTs}-${idx}`,
          type: 'single',
          points: 1,
          text: qText,
          options: optLines.map((o) => o.text),
          correct: corr[0] ?? 0,
          needsAnswerReview,
        });
      }
    } else if (qText) {
      const kw = lines.find((l) => /^(кілт|keywords)[:\s]/i.test(stripBoldMarkers(l)));
      parsed.push({
        id: `q-${baseTs}-${idx}`,
        type: 'open',
        points: 2,
        text: qText.replace(/\[(ашық|open)\]/i, '').trim(),
        keywords: kw
          ? stripBoldMarkers(kw).replace(/^(кілт|keywords)[:\s]+/i, '').trim()
          : '',
        needsAnswerReview: false,
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
