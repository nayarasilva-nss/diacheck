"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { upload } from "@vercel/blob/client";
import { setChecklistItemStatus } from "@/lib/actions/checklist";
import type { CompletionStatus } from "@/lib/data/checklists";

type Item = {
  id: number;
  label: string;
  requiresPhoto: boolean;
  requiresShiftLog: boolean;
  requiresRequisicao: boolean;
  requiresContagem?: boolean;
  status: CompletionStatus;
  justification: string | null;
  photoUrl: string | null;
};

const STATUS_CLASS: Record<CompletionStatus, string> = {
  conforme: "status-conforme",
  "nao-conforme": "status-nao-conforme",
  "nao-se-aplica": "status-nao-se-aplica",
  pending: "",
};

const MAX_PHOTO_DIMENSION = 1600;
const PHOTO_QUALITY = 0.75;

// Evidence photos come straight off phone cameras (often 3-4 MB each), and
// storage quota is limited — resize/recompress to JPEG client-side before
// upload. Falls back to the original file on any decode error (e.g. a HEIC
// variant the browser can't rasterize) so a photo never fails to submit
// just because compression didn't work.
async function compressPhoto(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_PHOTO_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", PHOTO_QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;

    const baseName = file.name.replace(/\.\w+$/, "");
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

const STATUS_MARKER: Record<CompletionStatus, string> = {
  conforme: "✓",
  "nao-conforme": "!",
  "nao-se-aplica": "–",
  pending: "",
};

export function ChecklistItemRow({
  item,
  checklistTypeId,
  organizationId,
  locked,
}: {
  item: Item;
  checklistTypeId: number;
  checklistTypeName?: string;
  // Isola o arquivo no Blob por empresa — ver app/api/upload/route.ts,
  // que valida esse prefixo contra a empresa do usuário autenticado.
  organizationId: number;
  // Pré-requisitos do checklist ainda não cumpridos — o check fica
  // desabilitado; o servidor recusaria de qualquer forma.
  locked?: boolean;
}) {
  const [askPhoto, setAskPhoto] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Resposta mostrada na hora, antes do servidor confirmar; volta ao valor
  // real se der erro.
  const [shown, setShown] = useState<CompletionStatus | null>(null);
  const status = shown ?? item.status;
  const done = status !== "pending";

  function send(next: "conforme" | "pending", photoUrl: string | null) {
    const fd = new FormData();
    fd.set("itemId", String(item.id));
    fd.set("checklistTypeId", String(checklistTypeId));
    fd.set("status", next);
    if (photoUrl) fd.set("photoUrl", photoUrl);
    setShown(next);
    startTransition(async () => {
      const result = await setChecklistItemStatus(undefined, fd);
      if (result?.error) {
        setError(result.error);
        setShown(null);
      } else {
        setError(null);
        setAskPhoto(false);
        setShown(null);
      }
    });
  }

  function toggle() {
    setError(null);
    if (done && status !== "nao-conforme" && status !== "nao-se-aplica") {
      send("pending", null);
      return;
    }
    if (item.requiresPhoto) {
      setPhotoFile(null);
      setAskPhoto((v) => !v);
      return;
    }
    send("conforme", null);
  }

  async function handleSubmitPhoto(event: React.FormEvent) {
    event.preventDefault();
    if (!photoFile) {
      setError("Essa tarefa exige uma foto de evidência");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const compressed = await compressPhoto(photoFile);
      if (compressed.size > 10 * 1024 * 1024) {
        setUploading(false);
        setError("Essa foto tem mais de 10MB mesmo depois de compactada — tente uma foto com menos resolução.");
        return;
      }
      const blob = await upload(
        `org-${organizationId}/evidencias/${checklistTypeId}-${item.id}-${Date.now()}-${compressed.name}`,
        compressed,
        { access: "public", handleUploadUrl: "/api/upload" },
      );
      setUploading(false);
      send("conforme", blob.url);
    } catch (err) {
      setUploading(false);
      console.error("Falha ao enviar foto de evidência:", err);
      const detail = err instanceof Error ? err.message : "";
      const amigavel = detail.includes("Não autenticado")
        ? "Sua sessão expirou — atualize a página e tente de novo."
        : detail.includes("exceeds")
          ? "A foto é grande demais pra esse limite."
          : detail || "Verifique sua conexão e tente de novo.";
      setError(`Falha ao enviar a foto: ${amigavel}`);
    }
  }

  const busy = isPending || uploading || locked;

  return (
    <div className={`checklist-item ${STATUS_CLASS[status]}`}>
      <div className="item-marker-row">
        <button
          type="button"
          className="item-check"
          role="checkbox"
          aria-checked={done}
          aria-label={item.label}
          onClick={toggle}
          disabled={busy}
        >
          <span className={`item-marker ${status}`}>{STATUS_MARKER[status]}</span>
        </button>
        <span className={`item-text${done ? " feito" : ""}`}>{item.label}</span>
        {item.requiresPhoto && <span className="requires-photo-badge">Foto obrigatória</span>}
        {item.requiresShiftLog && <span className="requires-photo-badge">Exige diário de bordo enviado</span>}
        {item.requiresRequisicao && <span className="requires-photo-badge">Exige requisição de insumos enviada</span>}
        {item.requiresContagem && (
          <Link href="/contagem" className="requires-photo-badge">Exige a contagem do estoque da semana no ERP</Link>
        )}
      </div>

      {askPhoto && (
        <form className="justification-form" onSubmit={handleSubmitPhoto}>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
          />
          {error && <p className="login-error">{error}</p>}
          <div className="justification-form-buttons">
            <button type="button" className="btn-cancel" onClick={() => setAskPhoto(false)}>
              Cancelar
            </button>
            <button className="btn-save" type="submit" disabled={busy}>
              {uploading ? "Enviando foto..." : "Concluir"}
            </button>
          </div>
        </form>
      )}

      {!askPhoto && error && <p className="login-error">{error}</p>}

      {status === "nao-conforme" && item.justification && (
        <div className="justification-box">
          <strong>Justificativa:</strong> {item.justification}
        </div>
      )}

      {item.photoUrl && (
        <div className="justification-box">
          <strong>Evidência:</strong>{" "}
          <a href={item.photoUrl} target="_blank" rel="noopener noreferrer">
            Ver foto
          </a>
        </div>
      )}
    </div>
  );
}
