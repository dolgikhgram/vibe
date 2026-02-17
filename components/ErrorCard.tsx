"use client";

interface ErrorCardProps {
  message: string;
  onRetry: () => void;
}

export function ErrorCard({ message, onRetry }: ErrorCardProps) {
  return (
    <div className="glass-panel flex w-full max-w-full flex-col gap-4 rounded-2xl border-red-500/30 p-6 sm:p-8">
      <div className="flex items-center gap-2 text-red-400">
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="font-medium">Ошибка</span>
      </div>
      <p className="text-sm text-zinc-400">{message}</p>
      <button
        onClick={onRetry}
        className="rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)] w-full sm:w-auto"
      >
        Попробовать снова
      </button>
    </div>
  );
}
