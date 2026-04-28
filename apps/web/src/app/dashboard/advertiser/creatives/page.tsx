"use client";

import { useEffect, useRef, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { creatives, ApiError, type Creative } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { Upload, FileVideo, Image as ImageIcon, Trash2, Plus } from "lucide-react";

const ACCEPTED_TYPES = [
  "video/mp4", "video/webm", "video/quicktime",
  "image/jpeg", "image/png", "image/gif", "image/webp",
];

export default function CreativesPage() {
  const [list, setList] = useState<Creative[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [step, setStep] = useState<"form" | "uploading" | "confirming" | "done">("form");
  const [form, setForm] = useState({ name: "", file: null as File | null });
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const token = getToken()!;

  useEffect(() => {
    creatives.list(token).then(setList).finally(() => setLoading(false));
  }, [token]);

  function resetModal() {
    setShowModal(false);
    setStep("form");
    setForm({ name: "", file: null });
    setProgress(0);
    setError("");
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!form.file) return;
    setError("");
    setStep("uploading");

    try {
      // 1. Request presigned URL
      const { creativeId, uploadUrl } = await creatives.requestUploadUrl(token, {
        name: form.name || form.file.name,
        filename: form.file.name,
        contentType: form.file.type,
        fileSizeBytes: form.file.size,
      });

      // 2. Upload directly to R2
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener("progress", (ev) => {
        if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100));
      });
      await new Promise<void>((resolve, reject) => {
        xhr.onload = () => xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`));
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", form.file!.type);
        xhr.send(form.file);
      });

      // 3. Confirm upload
      setStep("confirming");
      const confirmed = await creatives.confirm(token, creativeId, {});
      setList((l) => [confirmed, ...l]);
      setStep("done");
      setTimeout(resetModal, 1500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message ?? "Upload failed");
      setStep("form");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this creative?")) return;
    await creatives.delete(token, id).catch(() => null);
    setList((l) => l.filter((c) => c.id !== id));
  }

  return (
    <DashboardShell allowedRoles={["advertiser"]}>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Creatives</h1>
            <p className="text-slate-500 mt-1">Upload videos and images for your ads.</p>
          </div>
          <Button onClick={() => setShowModal(true)}><Plus size={16} /> Upload Creative</Button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-400">Loading…</div>
        ) : list.length === 0 ? (
          <Card>
            <CardBody className="py-16 text-center">
              <Upload size={48} className="text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-700 mb-2">No creatives yet</h3>
              <p className="text-slate-400 text-sm mb-6">Upload your first video or image to get started.</p>
              <Button onClick={() => setShowModal(true)}><Plus size={16} /> Upload Creative</Button>
            </CardBody>
          </Card>
        ) : (
          <div className="grid gap-4">
            {list.map((cr) => (
              <Card key={cr.id}>
                <CardBody className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                      {cr.type === "video"
                        ? <FileVideo size={20} className="text-blue-600" />
                        : <ImageIcon size={20} className="text-blue-600" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-900">{cr.name}</p>
                        <Badge status={cr.status} />
                      </div>
                      <p className="text-sm text-slate-500">
                        {cr.type} · {(cr.fileSizeBytes / 1e6).toFixed(1)} MB
                        {cr.widthPx && ` · ${cr.widthPx}×${cr.heightPx}`}
                        {cr.durationSec && ` · ${cr.durationSec}s`}
                      </p>
                      <p className="text-xs text-slate-400">{formatDate(cr.createdAt)}</p>
                    </div>
                  </div>
                  <button onClick={() => handleDelete(cr.id)} className="text-slate-400 hover:text-red-500 transition-colors p-2">
                    <Trash2 size={16} />
                  </button>
                </CardBody>
              </Card>
            ))}
          </div>
        )}

        <Modal open={showModal} onClose={resetModal} title="Upload Creative">
          {step === "form" && (
            <form onSubmit={handleUpload} className="space-y-4">
              <Input id="cname" label="Creative name (optional)" value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Leave blank to use filename" />

              <div>
                <label className="text-sm font-medium text-slate-700 mb-1 block">File</label>
                <div
                  className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-indigo-400 transition-colors"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload size={32} className="text-slate-400 mx-auto mb-2" />
                  <p className="text-sm text-slate-600">
                    {form.file ? form.file.name : "Click to select file"}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">MP4, WebM, JPEG, PNG, GIF, WebP</p>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept={ACCEPTED_TYPES.join(",")}
                  className="hidden"
                  onChange={(e) => setForm((f) => ({ ...f, file: e.target.files?.[0] ?? null }))}
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex gap-3">
                <Button type="button" variant="secondary" onClick={resetModal} className="flex-1">Cancel</Button>
                <Button type="submit" disabled={!form.file} className="flex-1">Upload</Button>
              </div>
            </form>
          )}

          {step === "uploading" && (
            <div className="space-y-4 text-center py-4">
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div className="bg-indigo-600 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-sm text-slate-600">Uploading… {progress}%</p>
            </div>
          )}

          {step === "confirming" && (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-slate-600">Processing…</p>
            </div>
          )}

          {step === "done" && (
            <div className="text-center py-8">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-900">Upload complete!</p>
            </div>
          )}
        </Modal>
      </div>
    </DashboardShell>
  );
}
