import React, { useState } from 'react';
import { ArrowLeft, KeyRound, Mail, User } from 'lucide-react';
import { api, setStoredToken } from '../lib/api';
import { tLabel } from '../lib/constants';
import type { Lang, TeacherProfile } from '../types';

interface TeacherAuthViewProps {
  lang: Lang;
  onAuthenticated: (teacher: TeacherProfile) => void;
  onBack: () => void;
  notify: (msg: string, type?: 'info' | 'success' | 'warn' | 'error') => void;
}

export const TeacherAuthView: React.FC<TeacherAuthViewProps> = ({
  lang,
  onAuthenticated,
  onBack,
  notify,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || password.length < 6) {
      notify(
        tLabel(lang, 'Email және кемінде 6 таңбалы пароль енгізіңіз', 'Enter email and password (min 6 chars)'),
        'error'
      );
      return;
    }

    setLoading(true);
    try {
      const res =
        mode === 'login'
          ? await api.login({ email: email.trim(), password })
          : await api.register({ email: email.trim(), password, name: name.trim() });
      setStoredToken(res.token);
      notify(
        mode === 'login'
          ? tLabel(lang, 'Мұғалім панеліне қош келдіңіз!', 'Welcome to Teacher Dashboard!')
          : tLabel(lang, 'Аккаунт сәтті тіркелді!', 'Teacher account created!'),
        'success'
      );
      onAuthenticated(res.teacher);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Қате орын алды', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fillDemoTeacher = () => {
    setMode('login');
    setEmail('teacher@proctorkz.kz');
    setPassword('demo1234');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {tLabel(lang, 'Басты бетке', 'Back')}
          </button>
          <span className="text-xs font-medium text-slate-500">
            {tLabel(lang, 'Мұғалім кабинеті', 'Teacher Workspace')}
          </span>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {mode === 'login'
              ? tLabel(lang, 'Жүйеге кіру', 'Sign In')
              : tLabel(lang, 'Жаңа мұғалім тіркелуі', 'Create Teacher Account')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {tLabel(
              lang,
              'Әр мұғалім тек өзінің қалташаларын, емтихандарын және оқушы нәтижелерін ғана көреді.',
              'Each teacher gets an isolated workspace with private exams, codes, and student submissions.'
            )}
          </p>
        </div>

        <div className="grid grid-cols-2 p-1 rounded-lg bg-slate-100 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`py-2 rounded-md transition-colors ${
              mode === 'login' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            {tLabel(lang, 'Кіру', 'Sign In')}
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`py-2 rounded-md transition-colors ${
              mode === 'register' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            {tLabel(lang, 'Тіркелу', 'Register')}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {tLabel(lang, 'Аты-жөніңіз', 'Full Name')}
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={tLabel(lang, 'Мысалы: Айгүл Сәрсенбаева', 'e.g. Aigul Sarsenbayeva')}
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teacher@school.kz"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              {tLabel(lang, 'Пароль', 'Password')}
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={tLabel(lang, 'Кемінде 6 таңба', 'At least 6 characters')}
                className="w-full pl-10 pr-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors disabled:opacity-50"
          >
            {loading
              ? tLabel(lang, 'Тексерілуде...', 'Please wait...')
              : mode === 'login'
                ? tLabel(lang, 'Панельге кіру', 'Sign In to Dashboard')
                : tLabel(lang, 'Тіркелу және кіру', 'Register & Continue')}
          </button>
        </form>

        <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-2 text-xs text-slate-500">
          <span>{tLabel(lang, 'Демо аккаунтты тексеру:', 'Try demo teacher account:')}</span>
          <button
            type="button"
            onClick={fillDemoTeacher}
            className="font-semibold text-blue-600 hover:text-blue-700 underline underline-offset-2"
          >
            teacher@proctorkz.kz
          </button>
        </div>
      </div>
    </div>
  );
};
