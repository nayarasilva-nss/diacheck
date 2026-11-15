import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";

// Só servimos arquivos hospedados no próprio blob storage (uploads seguem
// por @vercel/blob). Bloqueia SSRF: URL arbitrária nunca é buscada no servidor.
function isAllowedFileUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname;
    return host === "public.blob.vercel-storage.com" || host.endsWith(".public.blob.vercel-storage.com");
  } catch {
    return false;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user.organizationId) {
    return new Response("Não autorizado", { status: 403 });
  }

  const { id } = await params;
  const documentId = Number(id);
  if (!documentId) {
    return new Response("Documento inválido", { status: 400 });
  }

  const [doc] = await db
    .select({ fileUrl: documents.fileUrl })
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.organizationId, user.organizationId)))
    .limit(1);

  if (!doc) {
    return new Response("Documento não encontrado", { status: 404 });
  }

  if (!isAllowedFileUrl(doc.fileUrl)) {
    return new Response("Origem do arquivo não permitida", { status: 400 });
  }

  const blobResponse = await fetch(doc.fileUrl);
  if (!blobResponse.ok) {
    return new Response("Erro ao carregar documento", { status: 502 });
  }

  const contentType = blobResponse.headers.get("content-type") ?? "application/octet-stream";
  const body = await blobResponse.arrayBuffer();

  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": "inline",
    },
  });
}
