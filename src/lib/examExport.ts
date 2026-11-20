import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import * as XLSX from 'xlsx';
import type { Exam, Lang, Question } from '../types';
import { MODES, Q_TYPES, SUBJECTS, tLabel } from './constants';
import { escapeHTML, renderRichTextToHtml } from './examUtils';

export interface ExamExportOptions {
  format: 'docx' | 'pdf' | 'xlsx';
  includeAnswerKey: boolean;
  includeStudentHeader: boolean;
}

function getSafeFileName(title: string, code: string, ext: string): string {
  const cleanTitle = title
    .replace(/[\\/:*?"<>|]+/g, '')
    .trim()
    .slice(0, 48)
    .replace(/\s+/g, '_');
  return `${code || 'EXAM'}_${cleanTitle || 'ProctorKZ'}.${ext}`;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatCorrectAnswerText(q: Question, lang: Lang): string {
  if (q.type === 'single' || q.type === 'binary') {
    const idx = typeof q.correct === 'number' ? q.correct : 0;
    const opt = q.options?.[idx] || '';
    const letter = String.fromCharCode(65 + idx);
    return `${letter}) ${opt}`;
  }
  if (q.type === 'multiple') {
    const indices = Array.isArray(q.correct) ? q.correct : [];
    return indices
      .map((idx) => `${String.fromCharCode(65 + idx)}) ${q.options?.[idx] || ''}`)
      .join('; ');
  }
  if (q.type === 'matching') {
    return (q.pairs || []).map((p) => `${p.left} → ${p.right}`).join('; ');
  }
  if (q.type === 'ordering') {
    return (q.items || []).map((it, idx) => `${idx + 1}. ${it}`).join(' → ');
  }
  if (q.type === 'fill') {
    const blanks: string[] = [];
    const regex = /\[([^\]]+)\]/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(q.text)) !== null) blanks.push(m[1]);
    return blanks.join(', ');
  }
  if (q.type === 'open') {
    return q.keywords?.trim()
      ? `${tLabel(lang, 'Кілт сөздер:', 'Keywords:')} ${q.keywords}`
      : tLabel(lang, 'Мұғалім тексереді', 'Manual teacher grading');
  }
  return '—';
}

function maskFillTextForStudent(text: string): string {
  return text.replace(/\[([^\]]+)\]/g, '____________');
}

// =========================================================================
// 1. WORD (.docx) EXPORT
// =========================================================================
export async function exportExamToWord(
  exam: Exam,
  options: ExamExportOptions,
  lang: Lang
): Promise<void> {
  const subj = SUBJECTS[exam.subject] || SUBJECTS.general;
  const mode = MODES[exam.mode] || MODES.exam;
  const totalPoints = exam.questions.reduce((acc, q) => acc + (Number(q.points) || 1), 0);

  const children: Array<Paragraph | Table> = [];

  // Title
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: exam.title, bold: true, size: 32, font: 'Calibri' })],
    })
  );

  // Meta Line
  const metaText = [
    `${tLabel(lang, 'Пән', 'Subject')}: ${lang === 'kk' ? subj.kk : subj.en}`,
    `${tLabel(lang, 'Код', 'Code')}: ${exam.code}`,
    `${tLabel(lang, 'Режим', 'Mode')}: ${lang === 'kk' ? mode.kk : mode.en}`,
    `${tLabel(lang, 'Уақыт', 'Time')}: ${
      exam.isTimed ? `${exam.timeLimitMin} ${tLabel(lang, 'мин', 'min')}` : tLabel(lang, 'Шектеусіз', 'Untimed')
    }`,
    `${tLabel(lang, 'Жалпы балл', 'Total Points')}: ${totalPoints}`,
  ].join('   |   ');

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [new TextRun({ text: metaText, size: 20, color: '475569', font: 'Calibri' })],
    })
  );

  // Optional Student Header
  if (options.includeStudentHeader) {
    children.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [
          new TextRun({
            text: `${tLabel(lang, 'Оқушының аты-жөні', 'Student Name')}: ____________________________________    ${tLabel(lang, 'Сыныбы', 'Class')}: ____________`,
            size: 22,
            font: 'Calibri',
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 260 },
        children: [
          new TextRun({
            text: `${tLabel(lang, 'Күні', 'Date')}: ______________________    ${tLabel(lang, 'Жинаған балы', 'Score')}: ________ / ${totalPoints}`,
            size: 22,
            font: 'Calibri',
          }),
        ],
      })
    );
  }

  // Questions
  exam.questions.forEach((q, idx) => {
    const qStem = q.type === 'fill' ? maskFillTextForStudent(q.text) : q.text;
    const typeLabel = lang === 'kk' ? Q_TYPES[q.type].kk : Q_TYPES[q.type].en;

    children.push(
      new Paragraph({
        spacing: { before: 180, after: 80 },
        children: [
          new TextRun({
            text: `${idx + 1}. ${qStem} `,
            bold: true,
            size: 23,
            font: 'Calibri',
          }),
          new TextRun({
            text: `[${q.points || 1} ${tLabel(lang, 'балл', 'pts')} · ${typeLabel}]`,
            size: 18,
            color: '64748B',
            font: 'Calibri',
          }),
        ],
      })
    );

    if (q.media?.type === 'diagram' && q.media.diagramData) {
      children.push(
        new Paragraph({
          indent: { left: 360 },
          spacing: { after: 80 },
          children: [
            new TextRun({
              text: `${tLabel(lang, 'Диаграмма деректері', 'Diagram data')}: ${q.media.diagramData}`,
              italics: true,
              size: 20,
              color: '334155',
              font: 'Calibri',
            }),
          ],
        })
      );
    }

    if ((q.type === 'single' || q.type === 'multiple' || q.type === 'binary') && q.options) {
      q.options.forEach((opt, optIdx) => {
        const isCorrect =
          options.includeAnswerKey &&
          (q.type === 'multiple'
            ? Array.isArray(q.correct) && q.correct.includes(optIdx)
            : q.correct === optIdx);

        children.push(
          new Paragraph({
            indent: { left: 420 },
            spacing: { after: 40 },
            children: [
              new TextRun({
                text: `${String.fromCharCode(65 + optIdx)}) ${opt}${isCorrect ? '  ✓' : ''}`,
                bold: isCorrect,
                color: isCorrect ? '047857' : '0F172A',
                size: 22,
                font: 'Calibri',
              }),
            ],
          })
        );
      });
    } else if (q.type === 'matching' && q.pairs?.length) {
      const rows = q.pairs.map(
        (pair, pIdx) =>
          new TableRow({
            children: [
              new TableCell({
                width: { size: 50, type: WidthType.PERCENTAGE },
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: `${pIdx + 1}. ${pair.left}`, size: 21, font: 'Calibri' })],
                  }),
                ],
              }),
              new TableCell({
                width: { size: 50, type: WidthType.PERCENTAGE },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: `${String.fromCharCode(65 + pIdx)}) ${pair.right}`,
                        size: 21,
                        font: 'Calibri',
                      }),
                    ],
                  }),
                ],
              }),
            ],
          })
      );
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows,
        })
      );
    } else if (q.type === 'ordering' && q.items?.length) {
      q.items.forEach((item, iIdx) => {
        children.push(
          new Paragraph({
            indent: { left: 420 },
            spacing: { after: 40 },
            children: [
              new TextRun({
                text: `[   ] ${options.includeAnswerKey ? `(${iIdx + 1}) ` : ''}${item}`,
                size: 22,
                font: 'Calibri',
              }),
            ],
          })
        );
      });
    } else if (q.type === 'open') {
      children.push(
        new Paragraph({
          indent: { left: 360 },
          spacing: { before: 60, after: 40 },
          children: [
            new TextRun({
              text: '________________________________________________________________________',
              color: '94A3B8',
              size: 20,
            }),
          ],
        }),
        new Paragraph({
          indent: { left: 360 },
          spacing: { after: 80 },
          children: [
            new TextRun({
              text: '________________________________________________________________________',
              color: '94A3B8',
              size: 20,
            }),
          ],
        })
      );
    }
  });

  // Optional Answer Key Section
  if (options.includeAnswerKey) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 400, after: 140 },
        children: [
          new TextRun({
            text: tLabel(lang, 'Жауап кілті (Мұғалімге арналған)', 'Answer Key (Teacher Copy)'),
            bold: true,
            size: 26,
            font: 'Calibri',
          }),
        ],
      })
    );

    const keyRows: TableRow[] = [
      new TableRow({
        tableHeader: true,
        children: [
          new TableCell({
            width: { size: 10, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: '#', bold: true, size: 20 })] })],
          }),
          new TableCell({
            width: { size: 75, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: tLabel(lang, 'Дұрыс жауап', 'Correct Answer'),
                    bold: true,
                    size: 20,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 15, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: tLabel(lang, 'Балл', 'Points'),
                    bold: true,
                    size: 20,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      ...exam.questions.map(
        (q, idx) =>
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: String(idx + 1), size: 20 })] })],
              }),
              new TableCell({
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: formatCorrectAnswerText(q, lang), size: 20 })],
                  }),
                ],
              }),
              new TableCell({
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: String(q.points || 1), size: 20 })],
                  }),
                ],
              }),
            ],
          })
      ),
    ];

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
          left: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
          right: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
          insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
          insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
        },
        rows: keyRows,
      })
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const suffix = options.includeAnswerKey ? 'with_key' : 'student';
  triggerBlobDownload(blob, getSafeFileName(`${exam.title}_${suffix}`, exam.code, 'docx'));
}

// =========================================================================
// 2. EXCEL (.xlsx) EXPORT
// =========================================================================
export function exportExamToExcel(exam: Exam, options: ExamExportOptions, lang: Lang): void {
  const wb = XLSX.utils.book_new();
  const subj = SUBJECTS[exam.subject] || SUBJECTS.general;
  const mode = MODES[exam.mode] || MODES.exam;

  const headers = [
    '#',
    tLabel(lang, 'Түрі', 'Type'),
    tLabel(lang, 'Сұрақ', 'Question'),
    tLabel(lang, 'Балл', 'Points'),
    'A',
    'B',
    'C',
    'D',
    tLabel(lang, 'Қосымша (Жұптар / Реттік)', 'Extra (Pairs / Order)'),
  ];
  if (options.includeAnswerKey) {
    headers.push(tLabel(lang, 'Дұрыс жауап', 'Correct Answer'));
  }

  const rows: (string | number)[][] = [headers];

  exam.questions.forEach((q, idx) => {
    const opts = q.options || [];
    const extra =
      q.type === 'matching'
        ? (q.pairs || []).map((p) => `${p.left} -> ${p.right}`).join(' | ')
        : q.type === 'ordering'
          ? (q.items || []).join(' | ')
          : q.media?.type === 'diagram'
            ? `Diagram: ${q.media.diagramData || ''}`
            : '';

    const row: (string | number)[] = [
      idx + 1,
      lang === 'kk' ? Q_TYPES[q.type].kk : Q_TYPES[q.type].en,
      q.type === 'fill' && !options.includeAnswerKey ? maskFillTextForStudent(q.text) : q.text,
      q.points || 1,
      opts[0] || '',
      opts[1] || '',
      opts[2] || '',
      opts[3] || '',
      extra,
    ];

    if (options.includeAnswerKey) {
      row.push(formatCorrectAnswerText(q, lang));
    }

    rows.push(row);
  });

  const wsQuestions = XLSX.utils.aoa_to_sheet(rows);
  wsQuestions['!cols'] = [
    { wch: 5 },
    { wch: 22 },
    { wch: 48 },
    { wch: 8 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 30 },
    ...(options.includeAnswerKey ? [{ wch: 30 }] : []),
  ];
  XLSX.utils.book_append_sheet(wb, wsQuestions, tLabel(lang, 'Сұрақтар', 'Questions'));

  const totalPoints = exam.questions.reduce((acc, q) => acc + (Number(q.points) || 1), 0);
  const metaRows = [
    [tLabel(lang, 'Атауы', 'Title'), exam.title],
    [tLabel(lang, 'Код', 'Access Code'), exam.code],
    [tLabel(lang, 'Пән', 'Subject'), lang === 'kk' ? subj.kk : subj.en],
    [tLabel(lang, 'Режим', 'Mode'), lang === 'kk' ? mode.kk : mode.en],
    [
      tLabel(lang, 'Уақыт шектеуі', 'Time Limit'),
      exam.isTimed ? `${exam.timeLimitMin} ${tLabel(lang, 'мин', 'min')}` : tLabel(lang, 'Шектеусіз', 'Untimed'),
    ],
    [
      tLabel(lang, 'Ескерту лимиті', 'Violation Limit'),
      exam.maxViolations === 0
        ? tLabel(lang, 'Шектеусіз', 'Unlimited')
        : `${exam.maxViolations} (${
            exam.violationAction === 'warn_only'
              ? tLabel(lang, 'Тек ескерту', 'Warn only')
              : tLabel(lang, 'Автоматты жабу', 'Auto-submit')
          })`,
    ],
    [tLabel(lang, 'Сұрақ саны', 'Questions'), exam.questions.length],
    [tLabel(lang, 'Жалпы балл', 'Total Points'), totalPoints],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(metaRows);
  wsSummary['!cols'] = [{ wch: 22 }, { wch: 44 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, tLabel(lang, 'Ақпарат', 'Summary'));

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerBlobDownload(blob, getSafeFileName(exam.title, exam.code, 'xlsx'));
}

// =========================================================================
// 3. PRINTABLE / PDF EXPORT (Via Hidden Iframe — No window.open!)
// =========================================================================
export function exportExamToPdfPrint(exam: Exam, options: ExamExportOptions, lang: Lang): void {
  const subj = SUBJECTS[exam.subject] || SUBJECTS.general;
  const mode = MODES[exam.mode] || MODES.exam;
  const totalPoints = exam.questions.reduce((acc, q) => acc + (Number(q.points) || 1), 0);

  // Collect active stylesheets (including KaTeX CSS) so formulas render crisply in print
  const styleTags = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((node) => node.outerHTML)
    .join('\n');

  const questionsHtml = exam.questions
    .map((q, idx) => {
      const stem =
        q.type === 'fill'
          ? renderRichTextToHtml(maskFillTextForStudent(q.text))
          : renderRichTextToHtml(q.text);
      const typeLabel = lang === 'kk' ? Q_TYPES[q.type].kk : Q_TYPES[q.type].en;

      let mediaHtml = '';
      if (q.media?.type === 'diagram' && q.media.diagramData) {
        const items = q.media.diagramData
          .split(',')
          .map((s) => {
            const [k, v] = s.split(':').map((x) => x.trim());
            return { label: k || '', value: parseFloat(v) || 0 };
          })
          .filter((x) => x.label);
        const maxV = Math.max(...items.map((i) => i.value), 1);
        mediaHtml = `
          <div style="margin: 10px 0 12px 18px; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px; max-width: 480px;">
            <div style="display:flex; align-items:flex-end; gap:14px; height:110px; border-bottom:1px solid #cbd5e1; padding-bottom:4px;">
              ${items
                .map(
                  (it) => `
                <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%;">
                  <span style="font-size:11px; font-weight:700; margin-bottom:4px;">${it.value}</span>
                  <div style="width:36px; height:${Math.max(10, Math.round((it.value / maxV) * 100))}%; background:#2563eb; border-radius:4px 4px 0 0;"></div>
                </div>`
                )
                .join('')}
            </div>
            <div style="display:flex; gap:14px; padding-top:4px;">
              ${items
                .map(
                  (it) =>
                    `<div style="flex:1; text-align:center; font-size:11px; color:#475569;">${escapeHTML(it.label)}</div>`
                )
                .join('')}
            </div>
          </div>`;
      } else if (q.media?.type === 'image' && q.media.url) {
        mediaHtml = `<div style="margin: 8px 0 12px 18px;"><img src="${escapeHTML(q.media.url)}" style="max-height:180px; border-radius:6px; border:1px solid #e2e8f0;" /></div>`;
      }

      let bodyHtml = '';
      if ((q.type === 'single' || q.type === 'multiple' || q.type === 'binary') && q.options) {
        bodyHtml = `<div style="margin-left:18px; display:flex; flex-direction:column; gap:5px;">
          ${q.options
            .map((opt, optIdx) => {
              const isCorr =
                options.includeAnswerKey &&
                (q.type === 'multiple'
                  ? Array.isArray(q.correct) && q.correct.includes(optIdx)
                  : q.correct === optIdx);
              return `<div style="font-size:13.5px; ${isCorr ? 'font-weight:700; color:#047857;' : 'color:#1e293b;'}">
                <span style="font-weight:700; margin-right:6px;">${String.fromCharCode(65 + optIdx)})</span>
                ${renderRichTextToHtml(opt)}${isCorr ? ' ✓' : ''}
              </div>`;
            })
            .join('')}
        </div>`;
      } else if (q.type === 'matching' && q.pairs?.length) {
        bodyHtml = `<table style="margin-left:18px; width:calc(100% - 18px); border-collapse:collapse; font-size:13px; margin-top:6px;">
          ${q.pairs
            .map(
              (p, pIdx) => `<tr>
              <td style="border:1px solid #cbd5e1; padding:6px 10px; width:50%;">${pIdx + 1}. ${renderRichTextToHtml(p.left)}</td>
              <td style="border:1px solid #cbd5e1; padding:6px 10px; width:50%;">${String.fromCharCode(65 + pIdx)}) ${renderRichTextToHtml(p.right)}</td>
            </tr>`
            )
            .join('')}
        </table>`;
      } else if (q.type === 'ordering' && q.items?.length) {
        bodyHtml = `<div style="margin-left:18px; display:flex; flex-direction:column; gap:5px;">
          ${q.items
            .map(
              (it, iIdx) =>
                `<div style="font-size:13.5px;">[ &nbsp; ] ${options.includeAnswerKey ? `<b>(${iIdx + 1})</b> ` : ''}${renderRichTextToHtml(it)}</div>`
            )
            .join('')}
        </div>`;
      } else if (q.type === 'open') {
        bodyHtml = `<div style="margin-left:18px; margin-top:10px;">
          <div style="border-bottom:1px solid #94a3b8; height:24px;"></div>
          <div style="border-bottom:1px solid #94a3b8; height:24px;"></div>
          <div style="border-bottom:1px solid #94a3b8; height:24px;"></div>
        </div>`;
      }

      return `
        <div style="margin-bottom:18px; page-break-inside:avoid;">
          <div style="font-size:14.5px; font-weight:700; color:#0f172a; margin-bottom:6px;">
            ${idx + 1}. ${stem}
            <span style="font-size:11px; font-weight:500; color:#64748b; margin-left:6px;">[${q.points || 1} ${tLabel(lang, 'балл', 'pts')} · ${escapeHTML(typeLabel)}]</span>
          </div>
          ${mediaHtml}
          ${bodyHtml}
        </div>
      `;
    })
    .join('');

  const answerKeyHtml = options.includeAnswerKey
    ? `
      <div style="margin-top:28px; page-break-before:auto; border-top:2px solid #0f172a; padding-top:16px;">
        <h2 style="font-size:16px; font-weight:700; margin:0 0 10px 0;">${tLabel(lang, 'Жауап кілті (Мұғалімге арналған)', 'Answer Key')}</h2>
        <table style="width:100%; border-collapse:collapse; font-size:12.5px;">
          <thead>
            <tr style="background:#f1f5f9;">
              <th style="border:1px solid #cbd5e1; padding:6px 8px; text-align:left; width:40px;">#</th>
              <th style="border:1px solid #cbd5e1; padding:6px 8px; text-align:left;">${tLabel(lang, 'Дұрыс жауап', 'Correct Answer')}</th>
              <th style="border:1px solid #cbd5e1; padding:6px 8px; text-align:right; width:64px;">${tLabel(lang, 'Балл', 'Pts')}</th>
            </tr>
          </thead>
          <tbody>
            ${exam.questions
              .map(
                (q, idx) => `<tr>
                <td style="border:1px solid #cbd5e1; padding:6px 8px;">${idx + 1}</td>
                <td style="border:1px solid #cbd5e1; padding:6px 8px;">${renderRichTextToHtml(formatCorrectAnswerText(q, lang))}</td>
                <td style="border:1px solid #cbd5e1; padding:6px 8px; text-align:right;">${q.points || 1}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `
    : '';

  const html = `<!doctype html>
  <html lang="${lang}">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHTML(exam.title)} — ProctorKZ</title>
    ${styleTags}
    <style>
      @page { margin: 16mm; }
      body { background: #ffffff !important; color: #0f172a !important; font-family: 'DM Sans', system-ui, sans-serif; padding: 0; margin: 0; }
    </style>
  </head>
  <body>
    <div style="max-width: 780px; margin: 0 auto; padding: 8px 4px;">
      <div style="text-align:center; border-bottom:1px solid #cbd5e1; padding-bottom:14px; margin-bottom:18px;">
        <h1 style="font-size:20px; font-weight:800; margin:0 0 6px 0;">${escapeHTML(exam.title)}</h1>
        <div style="font-size:12px; color:#475569;">
          ${escapeHTML(lang === 'kk' ? subj.kk : subj.en)} · ${tLabel(lang, 'Код', 'Code')}: <b>${escapeHTML(exam.code)}</b> · ${escapeHTML(lang === 'kk' ? mode.kk : mode.en)} · ${exam.isTimed ? `${exam.timeLimitMin} ${tLabel(lang, 'мин', 'min')}` : tLabel(lang, 'Шектеусіз', 'Untimed')} · ${tLabel(lang, 'Жалпы балл', 'Total')}: <b>${totalPoints}</b>
        </div>
      </div>

      ${
        options.includeStudentHeader
          ? `<div style="display:flex; flex-wrap:wrap; gap:16px; justify-content:space-between; margin-bottom:20px; padding:10px 14px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px;">
              <div>${tLabel(lang, 'Аты-жөні', 'Student Name')}: ___________________________</div>
              <div>${tLabel(lang, 'Сыныбы', 'Class')}: __________</div>
              <div>${tLabel(lang, 'Күні', 'Date')}: ______________</div>
            </div>`
          : ''
      }

      ${questionsHtml}
      ${answerKeyHtml}
    </div>
  </body>
  </html>`;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  window.setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    window.setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 1500);
  }, 350);
}
