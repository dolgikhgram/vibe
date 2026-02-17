"use client";

import { useState } from "react";

interface ResultCardProps {
  url: string;
  onReset: () => void;
}

export function ResultCard({ url, onReset }: ResultCardProps) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="glass-panel flex w-full max-w-full flex-col gap-4 rounded-2xl p-6 sm:p-8">
      <div className="flex items-center gap-2 text-emerald-400">
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <span className="font-medium">Загружено!</span>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <input
          type="text"
          readOnly
          value={url}
          className="glass-input flex-1 rounded-xl px-4 py-3 text-sm text-zinc-300"
        />
        <div className="flex gap-2">
          <button
            onClick={copyLink}
            className="rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)]"
          >
            {copied ? "Скопировано" : "Копировать"}
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-[var(--glass-border)] px-4 py-3 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/5"
          >
            Открыть
          </a>
        </div>
      </div>
      <button
        onClick={onReset}
        className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        Загрузить ещё
      </button>
    </div>
  );
}
