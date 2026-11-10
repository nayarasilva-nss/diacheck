import { ETAPAS, type Etapa } from "@/lib/data/planos";

export function Stepper({ etapa }: { etapa: Etapa }) {
  const idx = etapa === "encerrado" ? ETAPAS.length : ETAPAS.findIndex((e) => e.chave === etapa);
  return (
    <ol className="pdca" aria-label="Ciclo PDCA">
      {ETAPAS.map((e, i) => (
        <li key={e.chave} className={i < idx ? "feita" : i === idx ? "atual" : ""}>
          <b>{e.letra}</b>
          <span>{e.nome}</span>
        </li>
      ))}
    </ol>
  );
}
