import Link from "next/link";
import { RotulosTabelas } from "../RotulosTabelas";
import { isGestorProfile } from "@/lib/auth/profile";
import { getCurrentUser } from "@/lib/auth/dal";
import { resolveEffectiveUnitId } from "@/lib/auth/covering-unit";
import {
  canSubmitFilleting,
  getFilletingRecords,
  getFilletingMonthlySummary,
} from "@/lib/data/filleting";
import {
  canSubmitRestoIngesta,
  getRestoIngestaRecords,
  getRestoIngestaMonthlySummary,
} from "@/lib/data/resto-ingesta";
import {
  canSubmitUtensilBreakage,
  getUtensilBreakageRecords,
  getUtensilBreakageMonthlySummary,
} from "@/lib/data/utensil-breakage";
import {
  canSubmitDeliveryError,
  getDeliveryErrorRecords,
  getDeliveryErrorMonthlySummary,
} from "@/lib/data/delivery-errors";
import { deleteFilletingRecord } from "@/lib/actions/filleting";
import { deleteRestoIngestaRecord } from "@/lib/actions/resto-ingesta";
import { deleteUtensilBreakageRecord } from "@/lib/actions/utensil-breakage";
import { deleteDeliveryErrorRecord } from "@/lib/actions/delivery-errors";
import { getUnits, resolveUnitScope } from "@/lib/data/units";
import { UnitFilter } from "../UnitFilter";
import { DeleteButton } from "../gerenciar/DeleteButton";
import { FiletagemForm } from "../filetagem/FiletagemForm";
import { RestoIngestaForm } from "../resto-ingesta/RestoIngestaForm";
import { QuebraUtensiliosForm } from "../quebra-utensilios/QuebraUtensiliosForm";
import { PedidosErroForm } from "../pedidos-erro/PedidosErroForm";

function lossBadge(pct: number) {
  if (pct < 32) return "badge-success";
  if (pct <= 45) return "badge-warning";
  return "badge-danger";
}

// Erro de pedido é muito mais grave por ponto percentual que perda de
// filetagem — uma taxa de 32% de pedidos errados seria um problema
// sério, não "dentro do padrão". Limiares bem mais baixos.
function deliveryErrorBadge(pct: number) {
  if (pct < 5) return "badge-success";
  if (pct <= 10) return "badge-warning";
  return "badge-danger";
}

export default async function PerdasPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; unit?: string }>;
}) {
  const user = await getCurrentUser();
  const isGestor = isGestorProfile(user.profile);
  const { tab: rawTab, unit: rawUnit } = await searchParams;
  const tab =
    rawTab === "resto" || rawTab === "utensilios" || rawTab === "delivery"
      ? rawTab
      : "filetagem";
  const requestedUnitId = rawUnit ? Number(rawUnit) : null;
  const unitId = resolveUnitScope(user, requestedUnitId);

  const effectiveUnitId = await resolveEffectiveUnitId(user);
  // Quem não tem unidade fixa hoje (Gestor sem "Unidade de hoje")
  // escolhe a unidade dentro do formulário ao registrar.
  const needsUnitPicker = isGestor && !effectiveUnitId;

  const units = isGestor ? await getUnits(user.organizationId!) : [];

  return (
    <>
      <div className="page-topbar">
        <h2 style={{ marginBottom: 0 }}>Perdas</h2>
      </div>

      <div className="filter-pills">
        <Link
          href={`/perdas?tab=filetagem${requestedUnitId ? `&unit=${requestedUnitId}` : ""}`}
          className={`pill${tab === "filetagem" ? " active" : ""}`}
        >
          Filetagem de pescado
        </Link>
        <Link
          href={`/perdas?tab=resto${requestedUnitId ? `&unit=${requestedUnitId}` : ""}`}
          className={`pill${tab === "resto" ? " active" : ""}`}
        >
          Resto ingesta
        </Link>
        <Link
          href={`/perdas?tab=utensilios${requestedUnitId ? `&unit=${requestedUnitId}` : ""}`}
          className={`pill${tab === "utensilios" ? " active" : ""}`}
        >
          Quebra de utensílios
        </Link>
        <Link
          href={`/perdas?tab=delivery${requestedUnitId ? `&unit=${requestedUnitId}` : ""}`}
          className={`pill${tab === "delivery" ? " active" : ""}`}
        >
          Pedidos com erro
        </Link>
      </div>

      {isGestor && (
        <div style={{ maxWidth: 280, marginBottom: 16 }}>
          <UnitFilter units={units} value={requestedUnitId} />
        </div>
      )}

      {!isGestor && user.unitId === null && (
        <p className="empty-state">
          Sua unidade ainda não foi definida. Peça a um Gestor para atribuir
          sua unidade no cadastro.
        </p>
      )}

      {tab === "filetagem" && (
        <FiletagemTab
          user={user}
          unitId={unitId}
          unitPickerOptions={needsUnitPicker ? units : []}
        />
      )}
      {tab === "resto" && (
        <RestoIngestaTab
          user={user}
          unitId={unitId}
          unitPickerOptions={needsUnitPicker ? units : []}
        />
      )}
      {tab === "utensilios" && (
        <UtensilBreakageTab
          user={user}
          unitId={unitId}
          unitPickerOptions={needsUnitPicker ? units : []}
        />
      )}
      {tab === "delivery" && (
        <DeliveryErrorTab
          user={user}
          unitId={unitId}
          unitPickerOptions={needsUnitPicker ? units : []}
        />
      )}
    </>
  );
}

async function FiletagemTab({
  user,
  unitId,
  unitPickerOptions,
}: {
  user: { profile: string; unitId: number | null; jobFunctionName: string | null; name: string; organizationId: number | null };
  unitId: number | null;
  unitPickerOptions: { id: number; name: string }[];
}) {
  const isGestor = isGestorProfile(user.profile);
  const [records, summary] = await Promise.all([
    getFilletingRecords(unitId, user.organizationId!),
    getFilletingMonthlySummary(unitId, user.organizationId!),
  ]);

  const now = new Date();
  const monthRecords = records.filter((r) => {
    const d = new Date(`${r.date}T00:00:00`);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const kgPerdidosMes = monthRecords.reduce((sum, r) => sum + r.perdaKg, 0);
  const foraDoPadrao = monthRecords.filter((r) => r.perdaPercent > 45).length;

  return (
    <>
      {canSubmitFilleting(user) && (
        <div className="today-card" style={{ marginBottom: 20 }}>
          <FiletagemForm defaultResponsavel={user.name} units={unitPickerOptions} />
        </div>
      )}

      <div className="summary-cards" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className="summary-card">
          <div className="summary-card-label">Perda média do mês</div>
          <div className="summary-card-value">
            {summary.avgLossPercent !== null ? `${summary.avgLossPercent.toFixed(1)}%` : "—"}
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-card-label">Kg perdidos no mês</div>
          <div className="summary-card-value">{kgPerdidosMes.toFixed(1)} kg</div>
        </div>
        <div className="summary-card">
          <div className="summary-card-label">Fora do padrão (&gt;45%)</div>
          <div className="summary-card-value">{foraDoPadrao}</div>
        </div>
      </div>

      <RotulosTabelas />
      <div className="data-table rotulos">
        <div
          className="data-table-head"
          style={{ gridTemplateColumns: "78px 1fr 110px 110px 130px 90px" }}
        >
          <span>Data</span>
          <span>Espécie · Unidade</span>
          <span>Recebido</span>
          <span>Perda</span>
          <span>Responsável</span>
          <span>% Perda</span>
        </div>
        {records.length === 0 ? (
          <div className="data-table-empty">Nenhum registro de filetagem ainda</div>
        ) : (
          records.map((record) => (
            <div
              key={record.id}
              className="data-table-row"
              style={{ gridTemplateColumns: "78px 1fr 110px 110px 130px 90px", cursor: "default" }}
            >
              <span className="data-table-date">
                {new Date(`${record.date}T00:00:00`).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                })}
              </span>
              <span>
                {record.fishType} · {record.unitName}
              </span>
              <span>{record.recebidoKg.toFixed(3)} kg</span>
              <span>{record.perdaKg.toFixed(3)} kg</span>
              <span>{record.responsavel ?? record.userName}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className={`badge ${lossBadge(record.perdaPercent)}`}>
                  {record.perdaPercent.toFixed(1)}%
                </span>
                {isGestor && (
                  <DeleteButton
                    action={deleteFilletingRecord}
                    id={record.id}
                    confirmText={`Remover o registro de ${record.fishType} de ${new Date(`${record.date}T00:00:00`).toLocaleDateString("pt-BR")}?`}
                  />
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );
}

async function RestoIngestaTab({
  user,
  unitId,
  unitPickerOptions,
}: {
  user: { profile: string; organizationId: number | null };
  unitId: number | null;
  unitPickerOptions: { id: number; name: string }[];
}) {
  const isGestor = isGestorProfile(user.profile);
  const [records, summary] = await Promise.all([
    getRestoIngestaRecords(unitId, user.organizationId!),
    getRestoIngestaMonthlySummary(unitId, user.organizationId!),
  ]);

  return (
    <>
      {canSubmitRestoIngesta(user) && (
        <div className="today-card" style={{ marginBottom: 20 }}>
          <RestoIngestaForm units={unitPickerOptions} />
        </div>
      )}

      <div className="summary-cards" style={{ gridTemplateColumns: "repeat(1, 1fr)" }}>
        <div className="summary-card">
          <div className="summary-card-label">Desperdício médio por pessoa (mês)</div>
          <div className="summary-card-value">
            {summary.avgWastePerPersonKg !== null
              ? `${summary.avgWastePerPersonKg.toFixed(3)} kg`
              : "—"}
          </div>
        </div>
      </div>

      <RotulosTabelas />
      <div className="data-table rotulos">
        <div
          className="data-table-head"
          style={{ gridTemplateColumns: "78px 1fr 130px 130px 130px" }}
        >
          <span>Data</span>
          <span>Unidade</span>
          <span>Experiências</span>
          <span>Desperdício</span>
          <span>Kg/pessoa</span>
        </div>
        {records.length === 0 ? (
          <div className="data-table-empty">Nenhum registro de resto ingesta ainda</div>
        ) : (
          records.map((record) => (
            <div
              key={record.id}
              className="data-table-row"
              style={{ gridTemplateColumns: "78px 1fr 130px 130px 130px", cursor: "default" }}
            >
              <span className="data-table-date">
                {new Date(`${record.date}T00:00:00`).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                })}
              </span>
              <span>{record.unitName}</span>
              <span>{record.experienciasVendidas}</span>
              <span>{record.desperdicioKg.toFixed(3)} kg</span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {record.desperdicioPorPessoaKg.toFixed(3)} kg
                {isGestor && (
                  <DeleteButton
                    action={deleteRestoIngestaRecord}
                    id={record.id}
                    confirmText={`Remover o registro de ${new Date(`${record.date}T00:00:00`).toLocaleDateString("pt-BR")}?`}
                  />
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );
}

async function UtensilBreakageTab({
  user,
  unitId,
  unitPickerOptions,
}: {
  user: { profile: string; jobFunctionName: string | null; organizationId: number | null };
  unitId: number | null;
  unitPickerOptions: { id: number; name: string }[];
}) {
  const isGestor = isGestorProfile(user.profile);
  const [records, summary] = await Promise.all([
    getUtensilBreakageRecords(unitId, user.organizationId!),
    getUtensilBreakageMonthlySummary(unitId, user.organizationId!),
  ]);

  return (
    <>
      {canSubmitUtensilBreakage(user) && (
        <div className="today-card" style={{ marginBottom: 20 }}>
          <QuebraUtensiliosForm units={unitPickerOptions} />
        </div>
      )}

      <div className="summary-cards" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
        <div className="summary-card">
          <div className="summary-card-label">Total quebrado no mês</div>
          <div className="summary-card-value">{summary.totalQuebrado}</div>
        </div>
        <div className="summary-card">
          <div className="summary-card-label">Item mais quebrado</div>
          <div className="summary-card-value" style={{ fontSize: 18 }}>
            {summary.itemMaisQuebrado ?? "—"}
          </div>
        </div>
      </div>

      <RotulosTabelas />
      <div className="data-table rotulos">
        <div
          className="data-table-head"
          style={{ gridTemplateColumns: "78px 1fr 100px 1fr 130px" }}
        >
          <span>Data</span>
          <span>Item · Unidade</span>
          <span>Qtd.</span>
          <span>Motivo</span>
          <span>Registrado por</span>
        </div>
        {records.length === 0 ? (
          <div className="data-table-empty">Nenhum registro de quebra ainda</div>
        ) : (
          records.map((record) => (
            <div
              key={record.id}
              className="data-table-row"
              style={{ gridTemplateColumns: "78px 1fr 100px 1fr 130px", cursor: "default" }}
            >
              <span className="data-table-date">
                {new Date(`${record.date}T00:00:00`).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                })}
              </span>
              <span>
                {record.item} · {record.unitName}
              </span>
              <span>{record.quantidade}</span>
              <span>{record.motivo ?? "—"}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {record.userName}
                {isGestor && (
                  <DeleteButton
                    action={deleteUtensilBreakageRecord}
                    id={record.id}
                    confirmText={`Remover o registro de quebra de ${record.item}?`}
                  />
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );
}

async function DeliveryErrorTab({
  user,
  unitId,
  unitPickerOptions,
}: {
  user: { profile: string; jobFunctionName: string | null; organizationId: number | null };
  unitId: number | null;
  unitPickerOptions: { id: number; name: string }[];
}) {
  const isGestor = isGestorProfile(user.profile);
  const [records, summary] = await Promise.all([
    getDeliveryErrorRecords(unitId, user.organizationId!),
    getDeliveryErrorMonthlySummary(unitId, user.organizationId!),
  ]);

  return (
    <>
      {canSubmitDeliveryError(user) && (
        <div className="today-card" style={{ marginBottom: 20 }}>
          <PedidosErroForm units={unitPickerOptions} />
        </div>
      )}

      <div className="summary-cards" style={{ gridTemplateColumns: "repeat(1, 1fr)" }}>
        <div className="summary-card">
          <div className="summary-card-label">Taxa de erro média do mês</div>
          <div className="summary-card-value">
            {summary.errorRatePercent !== null ? `${summary.errorRatePercent.toFixed(1)}%` : "—"}
          </div>
        </div>
      </div>

      <RotulosTabelas />
      <div className="data-table rotulos">
        <div
          className="data-table-head"
          style={{ gridTemplateColumns: "78px 1fr 100px 100px 90px" }}
        >
          <span>Data</span>
          <span>Unidade</span>
          <span>Total</span>
          <span>Com erro</span>
          <span>% Erro</span>
        </div>
        {records.length === 0 ? (
          <div className="data-table-empty">Nenhum registro de pedidos com erro ainda</div>
        ) : (
          records.map((record) => (
            <div
              key={record.id}
              className="data-table-row"
              style={{ gridTemplateColumns: "78px 1fr 100px 100px 90px", cursor: "default" }}
            >
              <span className="data-table-date">
                {new Date(`${record.date}T00:00:00`).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                })}
              </span>
              <span>{record.unitName}</span>
              <span>{record.totalPedidos}</span>
              <span>{record.pedidosComErro}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className={`badge ${deliveryErrorBadge(record.errorPercent)}`}>
                  {record.errorPercent.toFixed(1)}%
                </span>
                {isGestor && (
                  <DeleteButton
                    action={deleteDeliveryErrorRecord}
                    id={record.id}
                    confirmText={`Remover o registro de ${new Date(`${record.date}T00:00:00`).toLocaleDateString("pt-BR")}?`}
                  />
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );
}
