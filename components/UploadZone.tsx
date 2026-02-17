"use client";

import { useCallback, useState } from "react";

interface UploadZoneProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
}

export function UploadZone({ onFileSelect, disabled }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      const file = e.dataTransfer.files[0];
      if (file?.type === "audio/mpeg" || file?.name.toLowerCase().endsWith(".mp3")) {
        onFileSelect(file);
      }
    },
    [onFileSelect, disabled]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onFileSelect(file);
      e.target.value = "";
    },
    [onFileSelect]
  );

  return (
    <label
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`
        flex min-h-[160px] sm:min-h-[200px] cursor-pointer flex-col items-center justify-center
        rounded-2xl border-2 border-dashed transition-all duration-200
        w-full max-w-full
        ${isDragging && !disabled ? "border-[var(--accent)] bg-[var(--accent)]/10" : "border-[var(--glass-border)] hover:border-[var(--accent)]/50"}
        ${disabled ? "cursor-not-allowed opacity-60" : ""}
      `}
    >
      <input
        type="file"
        accept="audio/mpeg,.mp3"
        onChange={handleChange}
        disabled={disabled}
        className="hidden"
      />
      <svg
        className="mb-3 h-12 w-12 sm:h-14 sm:w-14 text-zinc-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
        />
      </svg>
      <span className="text-sm sm:text-base text-zinc-400 text-center px-4">
        Перетащи MP3 сюда или нажми для выбора
      </span>
      <span className="mt-1 text-xs text-zinc-500">До 500 MB</span>
    </label>
  );
}
