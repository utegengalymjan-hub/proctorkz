import type { ExamModeKey, FontFamilyKey, FontSizeKey, Lang, QuestionType, SubjectKey } from '../types';

export const SUBJECTS: Record<
  SubjectKey,
  { kk: string; en: string; accent: string; headerBg: string }
> = {
  math: {
    kk: 'Математика',
    en: 'Mathematics',
    accent: 'text-blue-700',
    headerBg: 'bg-slate-900',
  },
  it: {
    kk: 'Информатика / IT',
    en: 'Computer Science / IT',
    accent: 'text-slate-700',
    headerBg: 'bg-slate-900',
  },
  history: {
    kk: 'Тарих / Қоғам',
    en: 'History & Civics',
    accent: 'text-amber-700',
    headerBg: 'bg-slate-900',
  },
  science: {
    kk: 'Физика / Химия / Био',
    en: 'Physics / Chemistry / Bio',
    accent: 'text-emerald-700',
    headerBg: 'bg-slate-900',
  },
  lang: {
    kk: 'Тілдер / Әдебиет',
    en: 'Languages & Literature',
    accent: 'text-rose-700',
    headerBg: 'bg-slate-900',
  },
  general: {
    kk: 'Жалпы / Аралас',
    en: 'General / Mixed',
    accent: 'text-indigo-700',
    headerBg: 'bg-slate-900',
  },
};

export const MODES: Record<
  ExamModeKey,
  { kk: string; en: string; descKk: string; descEn: string; strict: boolean }
> = {
  exam: {
    kk: 'Қатаң емтихан',
    en: 'Strict Exam',
    descKk: 'Прокторинг, толық экран, көшіруге тыйым',
    descEn: 'Proctoring, fullscreen lock, anti-copy',
    strict: true,
  },
  prep: {
    kk: 'Дайындық режимі',
    en: 'Exam Prep',
    descKk: 'Әр сұрақтан кейін дұрыс жауапты тексеру',
    descEn: 'Instant answer check per question',
    strict: false,
  },
  quiz: {
    kk: 'Квиз',
    en: 'Quick Quiz',
    descKk: 'Жылдам бағалау форматы',
    descEn: 'Fast interactive quiz format',
    strict: false,
  },
  homework: {
    kk: 'Үй жұмысы',
    en: 'Homework',
    descKk: 'Еркін тапсыру режимі',
    descEn: 'Flexible submission mode',
    strict: false,
  },
};

export const Q_TYPES: Record<QuestionType, { kk: string; en: string }> = {
  single: { kk: 'Таңдамалы (1 жауап)', en: 'Single Choice' },
  multiple: { kk: 'Таңдамалы (Көп жауап)', en: 'Multiple Choice' },
  binary: { kk: 'Баламалы (Дұрыс / Қате)', en: 'True / False' },
  matching: { kk: 'Сәйкестендіру', en: 'Matching Pairs' },
  ordering: { kk: 'Реттік (Тәртіппен қою)', en: 'Ordering Sequence' },
  fill: { kk: 'Толықтыру (Бос орын)', en: 'Fill in the Blank' },
  open: { kk: 'Ашық сұрақ (Еске түсіру)', en: 'Open Response' },
};

export const FONT_FAMILIES: Record<FontFamilyKey, { label: string; css: string }> = {
  sans: { label: 'DM Sans (Стандарт)', css: "'DM Sans', system-ui, sans-serif" },
  serif: { label: 'PT Serif (Кітаптық)', css: "'PT Serif', Georgia, serif" },
  lora: { label: 'Lora (Академиялық)', css: "'Lora', Georgia, serif" },
  mono: { label: 'JetBrains Mono (Код)', css: "'JetBrains Mono', monospace" },
  rounded: { label: 'Nunito (Жұмсақ)', css: "'Nunito', sans-serif" },
};

export const FONT_SIZES: Record<FontSizeKey, { kk: string; en: string; cls: string }> = {
  sm: { kk: 'Кіші', en: 'Small', cls: 'text-sm' },
  base: { kk: 'Қалыпты', en: 'Base', cls: 'text-base' },
  lg: { kk: 'Үлкен', en: 'Large', cls: 'text-lg' },
  xl: { kk: 'Өте үлкен', en: 'Extra Large', cls: 'text-xl' },
};

export const SYMBOL_PACKS = {
  math: {
    labelKk: 'Математика',
    labelEn: 'Math Symbols',
    items: [
      '±', '×', '÷', '≠', '≈', '≡', '≤', '≥', '∞', '√', '∛', '∑', '∏', '∫', '∂', '∆',
      'π', 'α', 'β', 'γ', 'θ', 'λ', 'Ω', '°', '²', '³', 'ⁿ', '½', '⅓', '¼', '∈', '∉',
      '⊂', '∪', '∩', '∅', '∀', '∃', '⊥', '∥', '∠',
    ].map((s) => ({ view: s, val: s })),
  },
  formulas: {
    labelKk: 'Формула (LaTeX)',
    labelEn: 'LaTeX Formulas',
    items: [
      { view: 'a/b', val: '$\\frac{a}{b}$' },
      { view: 'x²', val: '$x^{2}$' },
      { view: '√x', val: '$\\sqrt{x}$' },
      { view: 'ⁿ√x', val: '$\\sqrt[n]{x}$' },
      { view: '∫ f(x)dx', val: '$\\int_{a}^{b} f(x)\\,dx$' },
      { view: '∑ aᵢ', val: '$\\sum_{i=1}^{n} a_i$' },
      { view: 'lim', val: '$\\lim_{x \\to \\infty} f(x)$' },
      { view: 'F = ma', val: '$\\vec{F} = m\\vec{a}$' },
      { view: 'Дискр.', val: '$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$' },
      { view: 'sin²+cos²', val: '$\\sin^2\\alpha + \\cos^2\\alpha = 1$' },
      { view: 'H₂O', val: '$H_2O$' },
      { view: 'Матрица', val: '$\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$' },
    ],
  },
  symbols: {
    labelKk: 'Таңбалар',
    labelEn: 'Typography',
    items: [
      '«', '»', '—', '№', '§', '•', '→', '←', '↑', '↓', '↔', '⇒', '⇔', '✓', '✕', '₸', '$', '€',
    ].map((s) => ({ view: s, val: s })),
  },
};

export function tLabel(lang: Lang, kk: string, en: string): string {
  return lang === 'kk' ? kk : en;
}
