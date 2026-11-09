import { notFound } from "next/navigation";
import { requireGestor } from "@/lib/auth/dal";
import { getAudit } from "@/lib/data/audits";
import { resolveBrandColors } from "@/lib/branding";
import { renderAuditPdf } from "@/lib/pdf/audit-report";
import { nomeArquivoAuditoria } from "@/lib/pdf/nome-arquivo";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireGestor();
  const { id } = await params;
  const audit = await getAudit(Number(id), user.organizationId!);
  if (!audit || audit.status !== "finalizada") notFound();

  const pdf = await renderAuditPdf(audit, {
    name: user.organizationName ?? "DiaCheck",
    logoUrl: user.organizationLogoUrl,
    slug: user.organizationSlug,
    brandColor: resolveBrandColors(user.organizationPrimaryColor).red,
  }, new URL(req.url).origin);

  const nome = nomeArquivoAuditoria({ unitName: audit.unitName, dia: audit.visitDate });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nome}"; filename*=UTF-8''${nome}`,
      "Cache-Control": "private, no-store",
    },
  });
}
