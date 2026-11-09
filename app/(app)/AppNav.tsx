"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/auth/actions";
import { isGestorProfile } from "@/lib/auth/profile";
import { ThemeSegmented, ThemeToggle } from "./ThemeToggle";
import { AvisosPush } from "./AvisosPush";

type NavItem = { href: string; label: string; badge?: number };
type NavGroup = { label: string; items: NavItem[] };

const PROFILE_LABELS: Record<string, string> = {
  gestor: "Gestor",
  gerente: "Gerente",
  lider: "Líder",
  rh: "RH",
  master: "Master",
};

function buildGroups(
  profile: string,
  showRequisicoes: boolean,
  showContagem: boolean,
  showCaixa: boolean,
  showEscala: boolean,
  showEstoque: boolean,
  showSolicitacoes: boolean,
  showFormularios: boolean,
  showPlataforma: boolean,
  pendingAuditCount: number,
): NavGroup[] {
  if (profile === "rh") {
    return [
      {
        label: "OPERAÇÃO",
        items: [
          { href: "/hoje", label: "Hoje" },
          { href: "/anomalias", label: "Anomalias" },
          { href: "/diario-de-bordo", label: "Diário de bordo" },
        ],
      },
    ];
  }

  const gestor = isGestorProfile(profile);
  const groups: NavGroup[] = [
    {
      label: "TURNO",
      items: [
        { href: "/hoje", label: "Hoje" },
        { href: "/checklist", label: "Checklists" },
        { href: "/diario-de-bordo", label: "Diário de bordo" },
        { href: "/rotinas", label: "Minhas rotinas" },
      ],
    },
    {
      label: "PEDIDOS E ESTOQUE",
      items: [
        ...(showRequisicoes ? [{ href: "/requisicoes", label: "Requisições" }] : []),
        ...(showSolicitacoes ? [{ href: "/solicitacoes", label: "Solicitações" }] : []),
        ...(showEstoque ? [{ href: "/estoque", label: "Estoque" }] : []),
        ...(showContagem ? [{ href: "/contagem", label: "Contagem" }] : []),
      ],
    },
    {
      label: "REGISTROS",
      items: [
        { href: "/anomalias", label: "Anomalias" },
        { href: "/perdas", label: "Perdas" },
        ...(showCaixa ? [{ href: "/caixa", label: "Fechamento de caixa" }] : []),
        ...(showFormularios ? [{ href: "/formularios", label: "Formulários" }] : []),
      ],
    },
    {
      label: "ACOMPANHAMENTO",
      items: [
        ...(gestor ? [{ href: "/indicadores", label: "Indicadores" }] : []),
        ...(gestor ? [{ href: "/auditorias", label: "Auditorias", badge: pendingAuditCount }] : []),
        { href: "/relatorio", label: "Relatórios" },
        { href: "/historico", label: "Histórico" },
        ...(showEscala ? [{ href: "/escala", label: "Escala" }] : []),
      ],
    },
    {
      label: "BIBLIOTECA",
      items: [{ href: "/documentos", label: "Fichas e POPs" }],
    },
  ];

  if (gestor) {
    groups.push({
      label: "SISTEMA",
      items: [
        { href: "/gerenciar", label: "Gerenciar" },
        ...(showPlataforma ? [{ href: "/plataforma", label: "Plataforma" }] : []),
      ],
    });
  }

  // grupo sem nenhum item para esta pessoa não aparece
  return groups.filter((g) => g.items.length > 0);
}

const DESCRICOES: Record<string, string> = {
  "/rotinas": "Listas só suas, com lembrete",
  "/requisicoes": "Pedidos de estoque",
  "/solicitacoes": "Itens avulsos, com aprovação",
  "/estoque": "Saldo e alertas da unidade",
  "/contagem": "Contar o estoque da unidade",
  "/anomalias": "Ocorrências registradas",
  "/perdas": "Filetagem, resto ingesta, quebras e pedidos com erro",
  "/caixa": "Fechar o caixa do dia",
  "/formularios": "Registros personalizados",
  "/indicadores": "Conclusão, ranking e evolução",
  "/auditorias": "Visitas técnicas às unidades",
  "/relatorio": "Dia e semana",
  "/historico": "Atividades registradas",
  "/escala": "Folgas do mês",
  "/documentos": "Fichas técnicas e procedimentos",
  "/gerenciar": "Usuários, unidades e modelos",
  "/plataforma": "Empresas da plataforma",
};

const ICONES = {
  hoje: "M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z",
  checklists: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  diario: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14zM20 17v4H6.5A2.5 2.5 0 0 1 4 18.5",
  mais: "M4 6h16M4 12h16M4 18h16",
} as const;

function Icone({ nome }: { nome: keyof typeof ICONES }) {
  return (
    <svg className="mobile-nav-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONES[nome]} />
    </svg>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
}

type SheetOptionDef = { href: string; title: string; description: string };

function SheetOption({ href, title, description, onNavigate }: SheetOptionDef & { onNavigate: () => void }) {
  return (
    <Link href={href} className="sheet-option" onClick={onNavigate}>
      <span className="sheet-option-icon" />
      <span>
        <span className="sheet-option-title">{title}</span>
        <br />
        <span className="sheet-option-desc">{description}</span>
      </span>
      <span className="sheet-option-chevron">›</span>
    </Link>
  );
}

function BottomSheet({
  title,
  header,
  onClose,
  children,
}: {
  title?: string;
  header?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="bottom-sheet">
        <div className="bottom-sheet-handle" />
        {header ?? <div className="bottom-sheet-title">{title}</div>}
        <div className="sheet-options">{children}</div>
        <button type="button" className="sheet-cancel" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </>
  );
}

export function AppNav({
  userName,
  profile,
  jobFunctionName,
  orgName,
  orgLogoUrl,
  vapidKey,
  canCreateAnomaly,
  canSubmitFilleting,
  canSubmitRestoIngesta,
  canWriteShiftLog,
  showRequisicoes,
  showContagem = false,
  showCaixa = false,
  showEscala = false,
  showEstoque = false,
  canCreateRequisicao,
  showSolicitacoes,
  showFormularios,
  showPlataforma,
  pendingAuditCount,
  contexto,
}: {
  userName: string;
  profile: string;
  jobFunctionName: string | null;
  orgName: string;
  orgLogoUrl: string;
  vapidKey?: string;
  canCreateAnomaly: boolean;
  canSubmitFilleting: boolean;
  canSubmitRestoIngesta: boolean;
  canWriteShiftLog: boolean;
  showRequisicoes: boolean;
  showContagem?: boolean;
  showCaixa?: boolean;
  showEscala?: boolean;
  showEstoque?: boolean;
  canCreateRequisicao: boolean;
  showSolicitacoes: boolean;
  showFormularios: boolean;
  showPlataforma: boolean;
  pendingAuditCount: number;
  // Unidade de hoje e função de hoje: ficam aqui, no menu, e não numa faixa no topo da página.
  contexto?: React.ReactNode;
}) {
  const pathname = usePathname();
  const groups = buildGroups(profile, showRequisicoes, showContagem, showCaixa, showEscala, showEstoque, showSolicitacoes, showFormularios, showPlataforma, pendingAuditCount);
  const scope =
    isGestorProfile(profile) || profile === "rh"
      ? "Todas as unidades"
      : (jobFunctionName ?? "Sem função definida");

  const [registerOpen, setRegisterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  // Cada grupo abre e fecha. Sem escolha da pessoa, ficam abertos o de "Turno" e o grupo da tela em que ela está.
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const grupoAtivo = (g: NavGroup) => g.label === "TURNO" || g.items.some((i) => isActive(i.href));

  const registerOptions: SheetOptionDef[] = [
    ...(canCreateAnomaly
      ? [{ href: "/anomalias", title: "Anomalia", description: "Registrar uma ocorrência" }]
      : []),
    ...(canCreateRequisicao
      ? [{ href: "/requisicoes", title: "Requisição", description: "Pedir itens ao estoque" }]
      : []),
    ...(showSolicitacoes
      ? [{ href: "/solicitacoes", title: "Solicitação", description: "Pedir item avulso (ex: rádio, lâmpada)" }]
      : []),
    ...(canSubmitRestoIngesta
      ? [{ href: "/perdas?tab=resto", title: "Resto ingesta", description: "Lançar desperdício do dia" }]
      : []),
    ...(canSubmitFilleting
      ? [{ href: "/perdas?tab=filetagem", title: "Filetagem", description: "Lançar filetagem de pescado" }]
      : []),
    ...(canWriteShiftLog
      ? [{ href: "/diario-de-bordo", title: "Diário de bordo", description: "Registrar o turno" }]
      : []),
  ];

  // A folha "Mais" espelha os mesmos grupos do menu lateral. Hoje, Checklists e Diário já estão na barra de baixo.
  const NA_BARRA = ["/hoje", "/checklist", "/diario-de-bordo"];
  const maisGrupos = groups
    .map((g) => ({
      label: g.label,
      options: g.items
        .filter((i) => !NA_BARRA.includes(i.href))
        .map((i): SheetOptionDef => ({
          href: i.href,
          title: i.badge ? `${i.label} (${i.badge})` : i.label,
          description: i.badge ? `${i.badge} em conjunto com você` : (DESCRICOES[i.href] ?? ""),
        })),
    }))
    .filter((g) => g.options.length > 0);

  return (
    <>
      <aside className="app-nav">
        <Link href="/hoje" className="app-nav-brand">
          {/* eslint-disable-next-line @next/next/no-img-element -- logo pode vir de URL externa configurada por empresa */}
          <img src={orgLogoUrl} alt={orgName} width={28} height={28} />
          <span>{orgName}</span>
        </Link>

        {contexto && <div className="app-nav-contexto">{contexto}</div>}

        <nav className="app-nav-groups">
          {groups.map((group) => {
            const aberto = abertos[group.label] ?? grupoAtivo(group);
            return (
              <div key={group.label}>
                <button
                  type="button"
                  className="app-nav-group-toggle"
                  aria-expanded={aberto}
                  onClick={() => setAbertos((a) => ({ ...a, [group.label]: !aberto }))}
                >
                  <span className="app-nav-group-label">{group.label}</span>
                  <span className={`app-nav-group-chevron${aberto ? " aberto" : ""}`} aria-hidden="true">›</span>
                </button>
                {aberto && (
                  <div className="app-nav-items">
                    {group.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`app-nav-link${isActive(item.href) ? " active" : ""}`}
                      >
                        {item.label}
                        {!!item.badge && (
                          <span
                            className="badge badge-brand"
                            style={{ marginLeft: 8 }}
                            aria-label={`${item.badge} pendente${item.badge > 1 ? "s" : ""}`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <AvisosPush chave={vapidKey} />
        <ThemeToggle className="app-nav-theme" />
        <div className="app-nav-footer">
          <div className="app-nav-avatar">{initials(userName)}</div>
          <div className="app-nav-user">
            <div className="app-nav-user-name">{userName}</div>
            <div className="app-nav-user-scope">
              {PROFILE_LABELS[profile] ?? profile} · {scope}
            </div>
          </div>
          <form action={logout}>
            <button className="app-nav-logout" type="submit" aria-label="Sair">
              Sair
            </button>
          </form>
        </div>
      </aside>

      <nav className="mobile-bottom-bar">
        <Link href="/hoje" className={`mobile-nav-item${isActive("/hoje") ? " active" : ""}`}>
          <Icone nome="hoje" />
          <span className="mobile-nav-label">Hoje</span>
        </Link>
        <Link
          href="/checklist"
          className={`mobile-nav-item${isActive("/checklist") ? " active" : ""}`}
        >
          <Icone nome="checklists" />
          <span className="mobile-nav-label">Checklists</span>
        </Link>
        {registerOptions.length > 0 && (
          <button
            type="button"
            className="mobile-nav-fab"
            onClick={() => setRegisterOpen(true)}
            aria-label="Registrar"
          >
            +
          </button>
        )}
        <Link
          href="/diario-de-bordo"
          className={`mobile-nav-item${isActive("/diario-de-bordo") ? " active" : ""}`}
        >
          <Icone nome="diario" />
          <span className="mobile-nav-label">Diário</span>
        </Link>
        <button type="button" className="mobile-nav-item" onClick={() => setMoreOpen(true)}>
          <Icone nome="mais" />
          <span className="mobile-nav-label">Mais</span>
        </button>
      </nav>

      {registerOpen && (
        <BottomSheet title="Registrar" onClose={() => setRegisterOpen(false)}>
          {registerOptions.map((opt) => (
            <SheetOption key={opt.href} {...opt} onNavigate={() => setRegisterOpen(false)} />
          ))}
        </BottomSheet>
      )}

      {moreOpen && (
        <BottomSheet
          onClose={() => setMoreOpen(false)}
          header={
            <>
              <div className="sheet-user">
                <div className="sheet-user-avatar">{initials(userName)}</div>
                <div>
                  <div className="sheet-user-name">{userName}</div>
                  <div className="sheet-user-meta">{PROFILE_LABELS[profile] ?? profile} · {scope}</div>
                </div>
              </div>
              <div className="sheet-label">Tema</div>
              <ThemeSegmented />
              <div className="sheet-label">Avisos</div>
              <AvisosPush chave={vapidKey} />
              {contexto && (
                <>
                  <div className="sheet-label">Hoje</div>
                  <div className="app-nav-contexto">{contexto}</div>
                </>
              )}
            </>
          }
        >
          {maisGrupos.map((g) => (
            <div key={g.label}>
              <div className="sheet-label" style={{ margin: "14px 0 2px" }}>{g.label}</div>
              {g.options.map((opt) => (
                <SheetOption key={opt.href} {...opt} onNavigate={() => setMoreOpen(false)} />
              ))}
            </div>
          ))}
          <form action={logout}>
            <button type="submit" className="sheet-option" style={{ width: "100%" }}>
              <span className="sheet-option-icon" />
              <span>
                <span className="sheet-option-title">Sair</span>
              </span>
            </button>
          </form>
        </BottomSheet>
      )}
    </>
  );
}
