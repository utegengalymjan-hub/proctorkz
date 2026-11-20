import React, { useMemo, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { renderRichTextToHtml } from '../lib/examUtils';
import type { QuestionMedia } from '../types';

export const RichText: React.FC<{
  text: string;
  className?: string;
}> = ({ text, className = '' }) => {
  const html = useMemo(() => renderRichTextToHtml(text), [text]);
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
};

export const MediaBlock: React.FC<{ media?: QuestionMedia }> = ({ media }) => {
  const [imgError, setImgError] = useState(false);

  if (!media || media.type === 'none') return null;

  if (media.type === 'image' && media.url) {
    if (imgError) {
      return (
        <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 px-5 py-8 flex flex-col items-center justify-center gap-2 text-slate-500">
          <ImageOff className="w-6 h-6 text-slate-400" />
          <span className="text-xs font-medium">Сурет жүктелмеді</span>
        </div>
      );
    }
    return (
      <div className="mb-5 rounded-xl overflow-hidden border border-slate-200 bg-slate-50 flex justify-center p-3">
        <img
          src={media.url}
          alt="Сұраққа қосымша сурет"
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="max-h-72 rounded-lg object-contain"
        />
      </div>
    );
  }

  if (media.type === 'audio' && media.url) {
    return (
      <div className="mb-5 p-4 rounded-xl bg-slate-50 border border-slate-200">
        <div className="text-xs font-semibold text-slate-600 mb-2">Аудио материал</div>
        <audio controls className="w-full" src={media.url} />
      </div>
    );
  }

  if (media.type === 'video' && media.url) {
    const ytMatch = media.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) {
      return (
        <div className="mb-5 rounded-xl overflow-hidden border border-slate-200 aspect-video bg-slate-900">
          <iframe
            title="Видео материал"
            className="w-full h-full"
            src={`https://www.youtube.com/embed/${ytMatch[1]}`}
            allowFullScreen
          />
        </div>
      );
    }
    return (
      <div className="mb-5 rounded-xl overflow-hidden border border-slate-200 bg-slate-950">
        <video controls className="w-full max-h-72" src={media.url} />
      </div>
    );
  }

  if (media.type === 'diagram' && media.diagramData) {
    const items = media.diagramData
      .split(',')
      .map((segment) => {
        const [label, val] = segment.split(':').map((s) => s.trim());
        return { label: label || '—', value: parseFloat(val) || 0 };
      })
      .filter((item) => item.label);

    if (!items.length) return null;
    const maxVal = Math.max(...items.map((i) => i.value), 1);
    const barColors = ['#2563eb', '#059669', '#d97706', '#dc2626', '#0284c7', '#4f46e5'];

    return (
      <div className="mb-5 p-5 rounded-xl bg-white border border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-semibold text-slate-500">Деректер диаграммасы</span>
          <span className="text-xs font-mono tabular-nums text-slate-400">
            Макс: {maxVal}
          </span>
        </div>
        <div className="flex items-end gap-4 h-44 pt-4 pb-2 px-3 border-b border-slate-200">
          {items.map((item, idx) => {
            const pct = Math.max(10, Math.round((item.value / maxVal) * 100));
            return (
              <div
                key={`${item.label}-${idx}`}
                className="flex-1 flex flex-col items-center h-full justify-end"
              >
                <span className="text-xs font-mono font-semibold tabular-nums text-slate-700 mb-1.5">
                  {item.value}
                </span>
                <div
                  className="w-full max-w-[56px] rounded-t-md transition-all duration-300"
                  style={{
                    height: `${pct}%`,
                    backgroundColor: barColors[idx % barColors.length],
                  }}
                />
              </div>
            );
          })}
        </div>
        <div className="flex gap-4 px-3 pt-2.5">
          {items.map((item, idx) => (
            <div
              key={`${item.label}-lbl-${idx}`}
              className="flex-1 text-center text-xs font-medium text-slate-600 truncate"
              title={item.label}
            >
              {item.label}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
};
