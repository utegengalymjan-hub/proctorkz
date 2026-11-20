import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { GoogleGenAI, Type } from '@google/genai';
import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import type { Exam, Folder, Question, QuestionType, Submission, ViolationAction } from './src/types.ts';

interface TeacherRecord {
  id: string;
  email: string;
  name: string;
  passwordSalt: string;
  passwordHash: string;
  createdAt: string;
}

interface StoreData {
  teachers: TeacherRecord[];
  folders: Folder[];
  exams: Exam[];
  submissions: Submission[];
}

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'proctorkz-store.json');
const TOKEN_SECRET = process.env.AUTH_SECRET || 'proctorkz-cloud-session-secret-v1';

function hashPassword(password: string, salt?: string) {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, actualSalt, 64).toString('hex');
  return { salt: actualSalt, hash };
}

function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function createToken(payload: { id: string; email: string; name: string }): string {
  const body = Buffer.from(
    JSON.stringify({ ...payload, iat: Date.now(), exp: Date.now() + 1000 * 60 * 60 * 24 * 14 })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token: string): { id: string; email: string; name: string } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', TOKEN_SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!parsed.id || !parsed.email || (parsed.exp && Date.now() > parsed.exp)) return null;
    return { id: parsed.id, email: parsed.email, name: parsed.name || parsed.email };
  } catch {
    return null;
  }
}

function createStarterQuestions() {
  return [
    {
      id: 'q-demo-1',
      type: 'single' as const,
      points: 2,
      text: 'Диаграмма бойынша ең жоғары көрсеткіш қай қалада?',
      media: { type: 'diagram' as const, diagramData: 'Алматы:45, Астана:62, Шымкент:38' },
      options: ['Алматы', 'Астана', 'Шымкент'],
      correct: 1,
    },
    {
      id: 'q-demo-2',
      type: 'single' as const,
      points: 2,
      text: 'Теңдеудің $x^2 - 5x + 6 = 0$ түбірлерін табыңыз:',
      options: ['$x_1 = 2, \\; x_2 = 3$', '$x_1 = -2, \\; x_2 = 3$', '$x_1 = 1, \\; x_2 = 6$'],
      correct: 0,
    },
    {
      id: 'q-demo-3',
      type: 'binary' as const,
      points: 1,
      text: 'Қалыпты атмосфералық қысымда су $100^\\circ C$ температурада қайнайды.',
      options: ['Дұрыс', 'Қате'],
      correct: 0,
    },
    {
      id: 'q-demo-4',
      type: 'multiple' as const,
      points: 3,
      text: 'Веб-әзірлеуде қолданылатын негізгі технологияларды таңдаңыз:',
      options: ['HTML', 'CSS', 'JavaScript', 'Paint'],
      correct: [0, 1, 2],
    },
    {
      id: 'q-demo-5',
      type: 'matching' as const,
      points: 3,
      text: 'Ғалымдар мен олардың ашқан заңдарын сәйкестендіріңіз:',
      pairs: [
        { left: 'Исаак Ньютон', right: 'Бүкіләлемдік тартылыс заңы' },
        { left: 'Альберт Эйнштейн', right: '$E = mc^2$' },
        { left: 'Дмитрий Менделеев', right: 'Периодтық жүйе' },
      ],
    },
    {
      id: 'q-demo-6',
      type: 'ordering' as const,
      points: 3,
      text: 'Тарихи жылдарды өсу ретімен орналастырыңыз:',
      items: ['1465 — Қазақ хандығының құрылуы', '1991 — Тәуелсіздік алу', '1997 — Астананың ауысуы'],
    },
    {
      id: 'q-demo-7',
      type: 'fill' as const,
      points: 2,
      text: 'Қазақстан Республикасы [1991] жылы тәуелсіздігін жариялады.',
    },
    {
      id: 'q-demo-8',
      type: 'open' as const,
      points: 4,
      text: 'Алгоритм дегеніміз не және оның негізгі қасиеттерін қысқаша сипаттаңыз.',
      keywords: '',
    },
  ];
}

function createInitialStore(): StoreData {
  const now = new Date().toISOString();
  const demoTeacherId = 'teacher-demo-01';
  const { salt, hash } = hashPassword('demo1234');

  const demoFolders: Folder[] = [
    {
      id: 'f-demo-main',
      teacherId: demoTeacherId,
      name: '10-сынып емтихандары',
      color: 'blue',
      createdAt: now,
    },
    {
      id: 'f-demo-math',
      teacherId: demoTeacherId,
      name: 'Алгебра және дайындық',
      color: 'emerald',
      createdAt: now,
    },
  ];

  const demoExams: Exam[] = [
    {
      id: 'ex-demo-1',
      teacherId: demoTeacherId,
      folderId: 'f-demo-main',
      code: 'DEMO-1',
      title: 'Демо-Емтихан: Барлық 7 сұрақ түрі және KaTeX',
      subject: 'general',
      mode: 'exam',
      fontFamily: 'sans',
      fontSize: 'base',
      isOpen: true,
      requireTeacherStart: false,
      liveStarted: false,
      isTimed: true,
      timeLimitMin: 15,
      maxViolations: 3,
      violationAction: 'auto_submit',
      shuffleQuestions: false,
      shuffleOptions: true,
      questions: createStarterQuestions(),
      createdAt: now,
    },
    {
      id: 'ex-math-2026',
      teacherId: demoTeacherId,
      folderId: 'f-demo-math',
      code: 'KZ-4821',
      title: 'Алгебра: Квадрат теңдеулер мен дискриминант',
      subject: 'math',
      mode: 'prep',
      fontFamily: 'serif',
      fontSize: 'base',
      isOpen: true,
      requireTeacherStart: false,
      liveStarted: false,
      isTimed: true,
      timeLimitMin: 20,
      maxViolations: 3,
      violationAction: 'auto_submit',
      shuffleQuestions: true,
      shuffleOptions: true,
      questions: [
        {
          id: 'qm-1',
          type: 'single',
          points: 2,
          text: '$2x^2 - 7x + 3 = 0$ теңдеуінің дискриминантын есептеңіз:',
          options: ['$D = 25$', '$D = 49$', '$D = 16$', '$D = 36$'],
          correct: 0,
        },
        {
          id: 'qm-2',
          type: 'fill',
          points: 2,
          text: 'Виет теоремасы бойынша $x^2 - 9x + 20 = 0$ теңдеуінің түбірлерінің қосындысы [9], ал көбейтіндісі [20] болады.',
        },
        {
          id: 'qm-3',
          type: 'binary',
          points: 1,
          text: 'Егер $D < 0$ болса, квадрат теңдеудің нақты түбірлері болмайды.',
          options: ['Дұрыс', 'Қате'],
          correct: 0,
        },
      ],
      createdAt: now,
    },
  ];

  const demoSubmissions: Submission[] = [
    {
      id: 'sub-demo-1',
      examId: 'ex-demo-1',
      teacherId: demoTeacherId,
      examCode: 'DEMO-1',
      examTitle: 'Демо-Емтихан: Барлық 7 сұрақ түрі және KaTeX',
      subject: 'general',
      mode: 'exam',
      studentId: 'demo-student-askar',
      studentName: 'Асқар Нұрланов',
      studentClass: '10-А',
      submittedAt: '18.11.2026, 10:24',
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      spentSec: 512,
      score: 16,
      maxScore: 20,
      percent: 80,
      hasPendingManual: true,
      violations: [],
      autoSubmitted: false,
      autoReason: '',
      details: [
        {
          questionId: 'q-demo-1',
          type: 'single',
          text: 'Диаграмма бойынша ең жоғары көрсеткіш қай қалада?',
          userAnswer: 1,
          points: 2,
          maxPoints: 2,
          isCorrect: true,
          status: 'checked',
        },
        {
          questionId: 'q-demo-2',
          type: 'single',
          text: 'Теңдеудің $x^2 - 5x + 6 = 0$ түбірлерін табыңыз:',
          userAnswer: 0,
          points: 2,
          maxPoints: 2,
          isCorrect: true,
          status: 'checked',
        },
        {
          questionId: 'q-demo-8',
          type: 'open',
          text: 'Алгоритм дегеніміз не және оның негізгі қасиеттерін қысқаша сипаттаңыз.',
          userAnswer: 'Алгоритм — белгілі бір есепті шешуге бағытталған нақты қадамдар тізбегі. Қасиеттері: дискреттілік, анықтылық, нәтижелілік.',
          points: 0,
          maxPoints: 4,
          isCorrect: false,
          status: 'pending',
        },
      ],
    },
    {
      id: 'sub-demo-2',
      examId: 'ex-math-2026',
      teacherId: demoTeacherId,
      examCode: 'KZ-4821',
      examTitle: 'Алгебра: Квадрат теңдеулер мен дискриминант',
      subject: 'math',
      mode: 'prep',
      studentId: 'demo-student-askar',
      studentName: 'Асқар Нұрланов',
      studentClass: '10-А',
      submittedAt: '19.11.2026, 09:15',
      createdAt: new Date(Date.now() - 3600000 * 6).toISOString(),
      spentSec: 348,
      score: 5,
      maxScore: 5,
      percent: 100,
      hasPendingManual: false,
      violations: [],
      autoSubmitted: false,
      autoReason: '',
      details: [
        {
          questionId: 'qm-1',
          type: 'single',
          text: '$2x^2 - 7x + 3 = 0$ теңдеуінің дискриминантын есептеңіз:',
          userAnswer: 0,
          points: 2,
          maxPoints: 2,
          isCorrect: true,
          status: 'checked',
        },
        {
          questionId: 'qm-2',
          type: 'fill',
          text: 'Виет теоремасы бойынша $x^2 - 9x + 20 = 0$ теңдеуінің түбірлерінің қосындысы [9], ал көбейтіндісі [20] болады.',
          userAnswer: ['9', '20'],
          points: 2,
          maxPoints: 2,
          isCorrect: true,
          status: 'checked',
        },
        {
          questionId: 'qm-3',
          type: 'binary',
          text: 'Егер $D < 0$ болса, квадрат теңдеудің нақты түбірлері болмайды.',
          userAnswer: 0,
          points: 1,
          maxPoints: 1,
          isCorrect: true,
          status: 'checked',
        },
      ],
    },
    {
      id: 'sub-demo-3',
      examId: 'ex-demo-1',
      teacherId: demoTeacherId,
      examCode: 'DEMO-1',
      examTitle: 'Демо-Емтихан: Барлық 7 сұрақ түрі және KaTeX',
      subject: 'general',
      mode: 'exam',
      studentId: 'demo-student-dana',
      studentName: 'Дана Мұратова',
      studentClass: '10-Б',
      submittedAt: '19.11.2026, 11:42',
      createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      spentSec: 420,
      score: 13,
      maxScore: 20,
      percent: 65,
      hasPendingManual: false,
      violations: [
        { reason: 'Басқа қойындыға немесе қосымшаға өту', time: '11:37:14' },
        { reason: 'Толық экраннан шығу', time: '11:39:48' },
      ],
      autoSubmitted: false,
      autoReason: '',
      details: [
        {
          questionId: 'q-demo-1',
          type: 'single',
          text: 'Диаграмма бойынша ең жоғары көрсеткіш қай қалада?',
          userAnswer: 1,
          points: 2,
          maxPoints: 2,
          isCorrect: true,
          status: 'checked',
        },
        {
          questionId: 'q-demo-2',
          type: 'single',
          text: 'Теңдеудің $x^2 - 5x + 6 = 0$ түбірлерін табыңыз:',
          userAnswer: 1,
          points: 0,
          maxPoints: 2,
          isCorrect: false,
          status: 'checked',
        },
      ],
    },
  ];

  return {
    teachers: [
      {
        id: demoTeacherId,
        email: 'teacher@proctorkz.kz',
        name: 'Айгүл Сәрсенбаева',
        passwordSalt: salt,
        passwordHash: hash,
        createdAt: now,
      },
    ],
    folders: demoFolders,
    exams: demoExams,
    submissions: demoSubmissions,
  };
}

function loadStore(): StoreData {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DATA_FILE)) {
      const initial = createInitialStore();
      fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), 'utf8');
      return initial;
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw) as StoreData;
  } catch (err) {
    console.error('Failed loading store, reinitializing:', err);
    const initial = createInitialStore();
    saveStore(initial);
    return initial;
  }
}

function saveStore(data: StoreData) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpFile, DATA_FILE);
}

let store: StoreData = loadStore();

interface AuthRequest extends Request {
  teacher?: { id: string; email: string; name: string };
}

function requireTeacherAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Авторизация қажет' });
    return;
  }
  const decoded = verifyToken(header.slice(7));
  if (!decoded) {
    res.status(401).json({ error: 'Сессия мерзімі аяқталды. Қайта кіріңіз.' });
    return;
  }
  const exists = store.teachers.find((t) => t.id === decoded.id);
  if (!exists) {
    res.status(401).json({ error: 'Мұғалім аккаунты табылмады' });
    return;
  }
  req.teacher = { id: exists.id, email: exists.email, name: exists.name };
  next();
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // =====================================================
  // AUTH ROUTES
  // =====================================================
  app.post('/api/auth/register', (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const name = String(req.body?.name || '').trim() || email.split('@')[0];

    if (!email || !email.includes('@')) {
      res.status(400).json({ error: 'Жарамды Email мекенжайын енгізіңіз' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Пароль кемінде 6 таңбадан тұруы тиіс' });
      return;
    }
    if (store.teachers.some((t) => t.email === email)) {
      res.status(409).json({ error: 'Бұл Email бұрын тіркелген. Кіру қойындысын пайдаланыңыз.' });
      return;
    }

    const teacherId = 'teacher-' + crypto.randomUUID();
    const { salt, hash } = hashPassword(password);
    const now = new Date().toISOString();
    const teacher: TeacherRecord = {
      id: teacherId,
      email,
      name,
      passwordSalt: salt,
      passwordHash: hash,
      createdAt: now,
    };

    const defaultFolder: Folder = {
      id: 'f-' + crypto.randomUUID().slice(0, 8),
      teacherId,
      name: 'Негізгі қалташа',
      color: 'blue',
      createdAt: now,
    };

    store.teachers.push(teacher);
    store.folders.push(defaultFolder);
    saveStore(store);

    const token = createToken({ id: teacher.id, email: teacher.email, name: teacher.name });
    res.status(201).json({
      token,
      teacher: { id: teacher.id, email: teacher.email, name: teacher.name, createdAt: teacher.createdAt },
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    const teacher = store.teachers.find((t) => t.email === email);
    if (!teacher || !verifyPassword(password, teacher.passwordSalt, teacher.passwordHash)) {
      res.status(401).json({ error: 'Email немесе пароль қате' });
      return;
    }

    const token = createToken({ id: teacher.id, email: teacher.email, name: teacher.name });
    res.json({
      token,
      teacher: { id: teacher.id, email: teacher.email, name: teacher.name, createdAt: teacher.createdAt },
    });
  });

  app.get('/api/auth/me', requireTeacherAuth, (req: AuthRequest, res) => {
    const t = store.teachers.find((item) => item.id === req.teacher!.id)!;
    res.json({
      teacher: { id: t.id, email: t.email, name: t.name, createdAt: t.createdAt },
    });
  });

  // =====================================================
  // TEACHER ISOLATED DATA ROUTES (RLS Equivalent)
  // =====================================================
  app.get('/api/teacher/data', requireTeacherAuth, (req: AuthRequest, res) => {
    const tid = req.teacher!.id;
    const t = store.teachers.find((item) => item.id === tid)!;
    let folders = store.folders.filter((f) => f.teacherId === tid);
    if (folders.length === 0) {
      const def: Folder = {
        id: 'f-' + crypto.randomUUID().slice(0, 8),
        teacherId: tid,
        name: 'Негізгі қалташа',
        color: 'blue',
        createdAt: new Date().toISOString(),
      };
      store.folders.push(def);
      saveStore(store);
      folders = [def];
    }

    const exams = store.exams
      .filter((e) => e.teacherId === tid)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const submissions = store.submissions
      .filter((s) => s.teacherId === tid)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    res.json({
      teacher: { id: t.id, email: t.email, name: t.name, createdAt: t.createdAt },
      folders,
      exams,
      submissions,
    });
  });

  app.post('/api/folders', requireTeacherAuth, (req: AuthRequest, res) => {
    const name = String(req.body?.name || '').trim();
    const color = String(req.body?.color || 'blue');
    if (!name) {
      res.status(400).json({ error: 'Қалташа атауын енгізіңіз' });
      return;
    }
    const folder: Folder = {
      id: 'f-' + crypto.randomUUID().slice(0, 8),
      teacherId: req.teacher!.id,
      name,
      color,
      createdAt: new Date().toISOString(),
    };
    store.folders.push(folder);
    saveStore(store);
    res.status(201).json(folder);
  });

  app.delete('/api/folders/:id', requireTeacherAuth, (req: AuthRequest, res) => {
    const tid = req.teacher!.id;
    const folderId = req.params.id;
    const teacherFolders = store.folders.filter((f) => f.teacherId === tid);
    if (teacherFolders.length <= 1) {
      res.status(400).json({ error: 'Кемінде бір қалташа қалуы тиіс' });
      return;
    }
    const target = teacherFolders.find((f) => f.id === folderId);
    if (!target) {
      res.status(404).json({ error: 'Қалташа табылмады' });
      return;
    }
    const fallback = teacherFolders.find((f) => f.id !== folderId)!;
    store.exams.forEach((ex) => {
      if (ex.teacherId === tid && ex.folderId === folderId) {
        ex.folderId = fallback.id;
      }
    });
    store.folders = store.folders.filter((f) => !(f.teacherId === tid && f.id === folderId));
    saveStore(store);
    res.json({ ok: true, fallbackFolderId: fallback.id });
  });

  app.post('/api/exams', requireTeacherAuth, (req: AuthRequest, res) => {
    const tid = req.teacher!.id;
    const payload = req.body as Partial<Exam>;
    const title = String(payload.title || '').trim();
    const code = String(payload.code || '').trim().toUpperCase();

    if (!title || !code) {
      res.status(400).json({ error: 'Емтихан атауы мен кіру кодын енгізіңіз' });
      return;
    }

    const existingIdx = store.exams.findIndex((e) => e.id === payload.id && e.teacherId === tid);
    const duplicateCode = store.exams.find(
      (e) => e.code.toUpperCase() === code && e.id !== payload.id
    );
    if (duplicateCode) {
      res.status(409).json({ error: `"${code}" коды бос емес. Басқа код таңдаңыз.` });
      return;
    }

    const now = new Date().toISOString();
    const teacherFolders = store.folders.filter((f) => f.teacherId === tid);
    const validFolderId = teacherFolders.some((f) => f.id === payload.folderId)
      ? payload.folderId!
      : teacherFolders[0]?.id || 'f-default';

    const rawMaxViolations = payload.maxViolations !== undefined ? Number(payload.maxViolations) : 3;
    const clampedMaxViolations = Number.isNaN(rawMaxViolations)
      ? 3
      : Math.max(0, Math.min(20, Math.floor(rawMaxViolations)));
    const validViolationAction: ViolationAction =
      payload.violationAction === 'warn_only' ? 'warn_only' : 'auto_submit';

    const exam: Exam = {
      id: existingIdx !== -1 ? store.exams[existingIdx].id : 'ex-' + crypto.randomUUID().slice(0, 10),
      teacherId: tid,
      folderId: validFolderId,
      code,
      title,
      subject: payload.subject || 'general',
      mode: payload.mode || 'exam',
      fontFamily: payload.fontFamily || 'sans',
      fontSize: payload.fontSize || 'base',
      isOpen: payload.isOpen !== undefined ? Boolean(payload.isOpen) : true,
      requireTeacherStart: Boolean(payload.requireTeacherStart),
      liveStarted: Boolean(payload.liveStarted),
      isTimed: payload.isTimed !== undefined ? Boolean(payload.isTimed) : true,
      timeLimitMin: Math.max(1, Number(payload.timeLimitMin) || 15),
      maxViolations: clampedMaxViolations,
      violationAction: validViolationAction,
      shuffleQuestions: payload.shuffleQuestions !== undefined ? Boolean(payload.shuffleQuestions) : true,
      shuffleOptions: payload.shuffleOptions !== undefined ? Boolean(payload.shuffleOptions) : true,
      questions: Array.isArray(payload.questions) ? payload.questions : [],
      createdAt: existingIdx !== -1 ? store.exams[existingIdx].createdAt : now,
      updatedAt: now,
    };

    if (existingIdx !== -1) {
      store.exams[existingIdx] = exam;
    } else {
      store.exams.unshift(exam);
    }
    saveStore(store);
    res.json(exam);
  });

  app.patch('/api/exams/:id', requireTeacherAuth, (req: AuthRequest, res) => {
    const tid = req.teacher!.id;
    const exam = store.exams.find((e) => e.id === req.params.id && e.teacherId === tid);
    if (!exam) {
      res.status(404).json({ error: 'Емтихан табылмады' });
      return;
    }
    if (typeof req.body.isOpen === 'boolean') exam.isOpen = req.body.isOpen;
    if (typeof req.body.liveStarted === 'boolean') exam.liveStarted = req.body.liveStarted;
    if (typeof req.body.folderId === 'string') exam.folderId = req.body.folderId;
    if (typeof req.body.maxViolations === 'number' && !Number.isNaN(req.body.maxViolations)) {
      exam.maxViolations = Math.max(0, Math.min(20, Math.floor(req.body.maxViolations)));
    }
    if (req.body.violationAction === 'auto_submit' || req.body.violationAction === 'warn_only') {
      exam.violationAction = req.body.violationAction;
    }
    exam.updatedAt = new Date().toISOString();
    saveStore(store);
    res.json(exam);
  });

  app.delete('/api/exams/:id', requireTeacherAuth, (req: AuthRequest, res) => {
    const tid = req.teacher!.id;
    const before = store.exams.length;
    store.exams = store.exams.filter((e) => !(e.id === req.params.id && e.teacherId === tid));
    if (store.exams.length === before) {
      res.status(404).json({ error: 'Емтихан табылмады' });
      return;
    }
    saveStore(store);
    res.json({ ok: true });
  });

  app.patch('/api/submissions/:id', requireTeacherAuth, (req: AuthRequest, res) => {
    const tid = req.teacher!.id;
    const sub = store.submissions.find((s) => s.id === req.params.id && s.teacherId === tid);
    if (!sub) {
      res.status(404).json({ error: 'Нәтиже табылмады' });
      return;
    }

    if (Array.isArray(req.body.details)) {
      sub.details = req.body.details;
      const totalEarned = sub.details.reduce((acc, d) => acc + (Number(d.points) || 0), 0);
      const totalMax = sub.details.reduce((acc, d) => acc + (Number(d.maxPoints) || 0), 0);
      sub.score = Number(totalEarned.toFixed(2));
      sub.maxScore = totalMax || sub.maxScore;
      sub.percent = sub.maxScore > 0 ? Math.round((sub.score / sub.maxScore) * 100) : 0;
      sub.hasPendingManual = sub.details.some((d) => d.status === 'pending');
    }
    saveStore(store);
    res.json(sub);
  });

  app.delete('/api/submissions/:id', requireTeacherAuth, (req: AuthRequest, res) => {
    const tid = req.teacher!.id;
    store.submissions = store.submissions.filter(
      (s) => !(s.id === req.params.id && s.teacherId === tid)
    );
    saveStore(store);
    res.json({ ok: true });
  });

  // =====================================================
  // PUBLIC STUDENT ENDPOINTS (Isolated by exam code)
  // =====================================================
  app.get('/api/public/exams/by-code/:code', (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    const exam = store.exams.find((e) => e.code.toUpperCase() === code);
    if (!exam) {
      res.status(404).json({ error: 'Бұл кодпен емтихан табылмады' });
      return;
    }
    const teacher = store.teachers.find((t) => t.id === exam.teacherId);
    res.json({
      exam,
      teacherName: teacher?.name || 'Мұғалім',
    });
  });

  app.post('/api/public/submissions', (req, res) => {
    const body = req.body as Partial<Submission>;
    const exam = store.exams.find((e) => e.id === body.examId);
    if (!exam) {
      res.status(404).json({ error: 'Емтихан табылмады' });
      return;
    }

    const now = new Date();
    const submission: Submission = {
      id: 'sub-' + crypto.randomUUID().slice(0, 10),
      examId: exam.id,
      teacherId: exam.teacherId,
      examCode: exam.code,
      examTitle: exam.title,
      subject: exam.subject,
      mode: exam.mode,
      studentId: String(body.studentId || 'anon-' + crypto.randomUUID().slice(0, 8)),
      studentName: String(body.studentName || 'Аты көрсетілмеген').trim(),
      studentClass: String(body.studentClass || 'Көрсетілмеген').trim(),
      submittedAt: body.submittedAt || now.toLocaleString('kk-KZ'),
      createdAt: now.toISOString(),
      spentSec: Number(body.spentSec) || 0,
      score: Number(body.score) || 0,
      maxScore: Number(body.maxScore) || 0,
      percent: Number(body.percent) || 0,
      hasPendingManual: Boolean(body.hasPendingManual),
      violations: Array.isArray(body.violations) ? body.violations : [],
      autoSubmitted: Boolean(body.autoSubmitted),
      autoReason: String(body.autoReason || ''),
      details: Array.isArray(body.details) ? body.details : [],
    };

    store.submissions.unshift(submission);
    saveStore(store);
    res.status(201).json(submission);
  });

  app.get('/api/public/student-progress', (req, res) => {
    const studentId = String(req.query.studentId || '').trim();
    const studentName = String(req.query.studentName || '').trim().toLowerCase();

    let matches: Submission[] = [];
    if (studentName) {
      matches = store.submissions.filter(
        (s) =>
          s.studentName.toLowerCase().includes(studentName) ||
          (studentId && s.studentId === studentId)
      );
    } else if (studentId) {
      matches = store.submissions.filter((s) => s.studentId === studentId);
    }

    // If student has no submissions yet on this device and didn't filter by name,
    // also return a hint flag so the UI can show either their personal empty state or demo preview toggle
    matches.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    res.json({
      submissions: matches,
      totalRecordsInSystem: store.submissions.length,
    });
  });

  app.get('/api/public/student-progress/sample', (_req, res) => {
    const sample = store.submissions
      .filter((s) => s.studentId === 'demo-student-askar' || s.studentId === 'demo-student-dana')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ submissions: sample });
  });

  // Google Docs / Sheets import proxy to avoid CORS issues
  app.post('/api/import/google-doc', requireTeacherAuth, async (req: AuthRequest, res) => {
    const url = String(req.body?.url || '').trim();
    const docMatch = url.match(/document\/d\/([a-zA-Z0-9_-]+)/);
    const sheetMatch = url.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    const fetchUrl = docMatch
      ? `https://docs.google.com/document/d/${docMatch[1]}/export?format=txt`
      : sheetMatch
        ? `https://docs.google.com/spreadsheets/d/${sheetMatch[1]}/gviz/tq?tqx=out:csv`
        : '';

    if (!fetchUrl) {
      res.status(400).json({ error: 'Жарамды Google Docs немесе Google Sheets сілтемесін енгізіңіз' });
      return;
    }

    try {
      const response = await fetch(fetchUrl);
      if (!response.ok) {
        res.status(400).json({ error: 'Құжатқа қол жеткізу мүмкін болмады. "Anyone with the link" күйін тексеріңіз.' });
        return;
      }
      const text = await response.text();
      res.json({ text });
    } catch {
      res.status(502).json({ error: 'Google Drive құжатын жүктеу кезінде қате орын алды' });
    }
  });

  // AI-Powered Document Question & Answer Recognition (Gemini)
  app.post('/api/import/parse-document', requireTeacherAuth, async (req: AuthRequest, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(503).json({
        error:
          'GEMINI_API_KEY серверде бапталмаған. Settings > Secrets бөлімінде API кілтін тексеріңіз немесе «Жылдам құрылымдық тану» режимін таңдаңыз.',
      });
      return;
    }

    const fileName = String(req.body?.fileName || 'document');
    const mimeType = String(req.body?.mimeType || 'text/plain');
    const textContent = typeof req.body?.textContent === 'string' ? req.body.textContent.trim() : '';
    const base64Data = typeof req.body?.base64Data === 'string' ? req.body.base64Data.trim() : '';

    if (!textContent && !base64Data) {
      res.status(400).json({ error: 'Талдау үшін құжат мазмұны бос.' });
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const systemInstruction = `You are an expert exam parser for Kazakh, Russian, and English educational test documents.
Extract EVERY question from the provided document and cleanly separate the question stem, answer options, and correct answer(s).

Rules:
1. Preserve original language (Kazakh, Russian, English) accurately, including Cyrillic letters (Ә, І, Ң, Ғ, Ү, Ұ, Қ, Ө, Һ).
2. Strip leading numbering from question stems (e.g., "1.", "12)") and strip option prefixes (e.g., "A)", "А.", "b)", "*").
3. Detect correct answers from ANY cue: asterisks (*), bold markers (**text**), checkmarks (✓/+), "Жауабы:/Ответ:/Answer:" lines, OR an answer key table at the end of the document.
4. Choose the exact question type:
   - "single": 1 correct option among 2+ choices
   - "multiple": 2 or more correct options among choices
   - "binary": True/False or Yes/No (Дұрыс/Қате, Иә/Жоқ)
   - "matching": pairs of left -> right items
   - "ordering": items that must be placed in sequence
   - "fill": sentence with blanks formatted as [answer] inside the text
   - "open": open-ended question without options
5. If a question's correct answer is NOT clearly indicated anywhere in the document, set "needsAnswerReview": true and default correctIndices to [0] for choice questions. Otherwise set "needsAnswerReview": false.
6. Preserve mathematical formulas using LaTeX $...$ syntax when present.
7. Never invent questions not present in the document.`;

      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
      if (base64Data && mimeType === 'application/pdf') {
        parts.push({
          inlineData: {
            mimeType: 'application/pdf',
            data: base64Data,
          },
        });
        parts.push({
          text: `Extract all exam questions and answers from this PDF file (${fileName}). Return structured JSON matching the schema.`,
        });
      } else {
        parts.push({
          text: `Extract all exam questions and answers from this document (${fileName}). Note that **bold** text often indicates the correct answer option.\n\n---\n${textContent.slice(0, 120000)}`,
        });
      }

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: { parts },
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: {
                  type: Type.STRING,
                  description:
                    'One of: single, multiple, binary, matching, ordering, fill, open',
                },
                text: {
                  type: Type.STRING,
                  description:
                    'Clean question stem without leading number. For fill type, wrap each blank answer in [brackets].',
                },
                points: {
                  type: Type.NUMBER,
                  description: 'Point value (default 1, or 2 for matching/ordering/multiple/open).',
                },
                options: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: 'Answer options for single, multiple, or binary questions.',
                },
                correctIndices: {
                  type: Type.ARRAY,
                  items: { type: Type.INTEGER },
                  description: '0-based indices of correct options for single, multiple, or binary.',
                },
                pairs: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      left: { type: Type.STRING },
                      right: { type: Type.STRING },
                    },
                  },
                  description: 'Matching pairs for matching questions.',
                },
                items: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: 'Items in correct order for ordering questions.',
                },
                keywords: {
                  type: Type.STRING,
                  description: 'Comma-separated grading keywords for open questions if provided.',
                },
                needsAnswerReview: {
                  type: Type.BOOLEAN,
                  description:
                    'True if the correct answer was not explicitly marked in the source document.',
                },
              },
              required: ['type', 'text'],
            },
          },
        },
      });

      const rawJson = (response.text ?? '[]').trim();
      const parsedArray = JSON.parse(rawJson);
      if (!Array.isArray(parsedArray)) {
        res.status(502).json({ error: 'AI жауабын оқу мүмкін болмады.' });
        return;
      }

      const validTypes: QuestionType[] = [
        'single',
        'multiple',
        'binary',
        'matching',
        'ordering',
        'fill',
        'open',
      ];
      const baseTs = Date.now();
      const questions: Array<Question & { needsAnswerReview?: boolean }> = [];

      parsedArray.forEach((raw: Record<string, unknown>, idx: number) => {
        const text = String(raw.text || '').trim();
        if (!text) return;
        const type: QuestionType = validTypes.includes(raw.type as QuestionType)
          ? (raw.type as QuestionType)
          : 'single';
        const points = Math.max(1, Number(raw.points) || (type === 'single' || type === 'binary' ? 1 : 2));
        const needsAnswerReview = Boolean(raw.needsAnswerReview);

        const q: Question & { needsAnswerReview?: boolean } = {
          id: `q-ai-${baseTs}-${idx}`,
          type,
          points,
          text,
          needsAnswerReview,
        };

        if (type === 'single' || type === 'multiple' || type === 'binary') {
          const rawOpts = Array.isArray(raw.options)
            ? raw.options.map((o) => String(o || '').trim()).filter(Boolean)
            : [];
          const opts =
            type === 'binary' && rawOpts.length < 2 ? ['Дұрыс', 'Қате'] : rawOpts;
          if (opts.length < 2) {
            q.type = 'open';
            q.keywords = String(raw.keywords || '').trim();
          } else {
            q.options = opts;
            const rawCorr = Array.isArray(raw.correctIndices)
              ? raw.correctIndices
                  .map((n) => Number(n))
                  .filter((n) => Number.isInteger(n) && n >= 0 && n < opts.length)
              : [];
            if (type === 'multiple') {
              q.correct = rawCorr.length ? rawCorr : [0];
            } else {
              q.correct = rawCorr.length ? rawCorr[0] : 0;
            }
          }
        } else if (type === 'matching') {
          const pairs = Array.isArray(raw.pairs)
            ? raw.pairs
                .map((p: Record<string, unknown>) => ({
                  left: String(p?.left || '').trim(),
                  right: String(p?.right || '').trim(),
                }))
                .filter((p) => p.left && p.right)
            : [];
          if (pairs.length >= 2) {
            q.pairs = pairs;
          } else {
            q.type = 'open';
          }
        } else if (type === 'ordering') {
          const items = Array.isArray(raw.items)
            ? raw.items.map((it) => String(it || '').trim()).filter(Boolean)
            : [];
          if (items.length >= 2) {
            q.items = items;
          } else {
            q.type = 'open';
          }
        } else if (type === 'fill') {
          if (!/\[[^\]]+\]/.test(q.text)) {
            q.type = 'open';
          }
        } else if (type === 'open') {
          q.keywords = String(raw.keywords || '').trim();
        }

        questions.push(q);
      });

      res.json({ questions });
    } catch (err: unknown) {
      console.error('Gemini document parse error:', err);
      const message =
        err instanceof Error ? err.message : 'Құжатты AI арқылы тану кезінде қате орын алды';
      res.status(502).json({ error: message });
    }
  });

  // =====================================================
  // VITE DEV MIDDLEWARE / PRODUCTION STATIC SERVE
  // =====================================================
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`ProctorKZ Cloud server running on http://0.0.0.0:${port}`);
  });
}

startServer();
