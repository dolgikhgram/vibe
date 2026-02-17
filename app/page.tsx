"use client";

import { useState } from "react";
import { UploadZone } from "@/components/UploadZone";
import { MetadataForm } from "@/components/MetadataForm";
import { ResultCard } from "@/components/ResultCard";
import { ErrorCard } from "@/components/ErrorCard";

type Status = "idle" | "uploading" | "success" | "error";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [resultUrl, setResultUrl] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const upload = async () => {
    if (!file) return;

    setStatus("uploading");
    setErrorMessage("");

    const formData = new FormData();
    formData.append("file", file);
    if (title.trim()) formData.append("title", title.trim());

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (data.success && data.url) {
        setResultUrl(data.url);
        setStatus("success");
      } else {
        setErrorMessage(data.error || "Ошибка загрузки");
        setStatus("error");
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Ошибка сети");
      setStatus("error");
    }
  };

  const reset = () => {
    setFile(null);
    setTitle("");
    setStatus("idle");
    setResultUrl("");
    setErrorMessage("");
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(255, 85, 0, 0.15), transparent), radial-gradient(ellipse 60% 40% at 80% 50%, rgba(99, 102, 241, 0.1), transparent), radial-gradient(ellipse 50% 30% at 20% 80%, rgba(236, 72, 153, 0.08), transparent), var(--background)",
        }}
      />

      <main className="mx-auto flex min-h-screen flex-col items-center justify-center px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <div className="w-full max-w-lg">
          <h1 className="mb-2 text-center text-2xl font-bold tracking-tight text-zinc-100 sm:text-3xl">
            SoundCloud Upload
          </h1>
          <p className="mb-8 text-center text-sm text-zinc-500 sm:text-base">
            Загрузи MP3 и получи ссылку
          </p>

          {status === "success" ? (
            <ResultCard url={resultUrl} onReset={reset} />
          ) : status === "error" ? (
            <ErrorCard message={errorMessage} onRetry={reset} />
          ) : (
            <div className="glass-panel flex flex-col gap-6 rounded-2xl p-6 sm:p-8">
              <UploadZone
                onFileSelect={setFile}
                disabled={status === "uploading"}
              />

              {file && (
                <>
                  <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                    <span>{file.name}</span>
                    <span className="text-zinc-500">
                      ({(file.size / 1024 / 1024).toFixed(2)} MB)
                    </span>
                  </div>

                  <MetadataForm
                    title={title}
                    onTitleChange={setTitle}
                    disabled={status === "uploading"}
                  />

                  <button
                    onClick={upload}
                    disabled={status === "uploading"}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] py-4 font-medium text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {status === "uploading" ? (
                      <>
                        <svg
                          className="h-5 w-5 animate-spin"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        Загрузка...
                      </>
                    ) : (
                      "Загрузить на SoundCloud"
                    )}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
