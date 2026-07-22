"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const ACCEPT =
  ".pdf,.jpg,.jpeg,.png,.csv,.xlsx,.docx," +
  "application/pdf,image/jpeg,image/png,text/csv," +
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export default function UploadPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Upload failed. Please try again.");
        setBusy(false);
        return;
      }
      router.push(`/admin/upload/${json.id}/review`);
    } catch {
      setError("Upload failed. Please check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-bold">Upload a menu</h1>
      <p className="mt-1 text-brand-muted">
        Upload your existing drink menu and we&apos;ll pull out the drinks for you
        to review. Nothing is published until you approve it.
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) setFile(f);
        }}
        className={`mt-6 rounded-2xl border-2 border-dashed p-8 text-center transition ${
          dragOver ? "border-brand-secondary bg-brand-secondary/5" : "border-black/20 bg-white"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          aria-label="Choose a menu file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <p className="text-4xl" aria-hidden>
          📄
        </p>
        {file ? (
          <p className="mt-2 font-medium">{file.name}</p>
        ) : (
          <p className="mt-2 text-brand-muted">
            Drag a file here, or choose one below
          </p>
        )}
        <p className="mt-1 text-xs text-brand-muted">
          PDF, JPG, PNG, CSV, XLSX, or DOCX — up to 10&nbsp;MB
        </p>
        <button
          type="button"
          className="btn-ghost mt-4"
          onClick={() => inputRef.current?.click()}
        >
          Choose file
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-6 flex gap-3">
        <button className="btn-primary" disabled={!file || busy} onClick={submit}>
          {busy ? "Reading menu…" : "Upload & extract"}
        </button>
        <a href="/admin/menu" className="btn-ghost">
          Skip — build menu manually
        </a>
      </div>

      <p className="mt-6 text-xs text-brand-muted">
        Tip: extraction currently runs in mock mode, returning a sample parsed
        menu so you can try the review flow. Connect a real AI/OCR key later (see
        DEPLOYMENT.md) to read your actual file.
      </p>
    </div>
  );
}
