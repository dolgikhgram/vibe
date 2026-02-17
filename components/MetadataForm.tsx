"use client";

interface MetadataFormProps {
  title: string;
  onTitleChange: (value: string) => void;
  disabled?: boolean;
}

export function MetadataForm({ title, onTitleChange, disabled }: MetadataFormProps) {
  return (
    <div className="w-full">
      <label htmlFor="title" className="mb-2 block text-sm font-medium text-zinc-300">
        Название трека (опционально)
      </label>
      <input
        id="title"
        type="text"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="Мой трек"
        disabled={disabled}
        className="glass-input w-full rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-500 transition-colors"
      />
    </div>
  );
}
