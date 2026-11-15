import { and, eq, inArray } from "drizzle-orm";
import { db } from "../lib/db";
import { checklistTypeItems, checklistTypes, jobFunctions, organizations } from "../lib/db/schema";

type Item = { label: string; requiresPhoto?: boolean };

type ChecklistDef = {
  name: string;
  description: string;
  type: "daily" | "weekly";
  jobFunctionName: string;
  items: Item[];
};

const OLD_CHECKLIST_NAMES_TO_REMOVE = [
  "Gerente - Pré-Operação",
  "Gerente - Pré-Abertura",
  "Gerente - Operação",
  "Gerente - Fechamento",
  "Verificação do Souschef",
];

const NEW_JOB_FUNCTIONS = [
  "Líder de Sushibar",
  "Líder de Delivery",
  "Líder de Bar",
  "Líder de Estoque/Produção",
  "Chefe de Sushibar",
];

const CHECKLISTS: ChecklistDef[] = [
  {
    name: "Abertura — Gerente",
    description: "Checklist de abertura do turno do Gerente",
    type: "daily",
    jobFunctionName: "Gerente",
    items: [
      { label: "Ler o diário de bordo anterior — mapear pendências, padrões e riscos do dia" },
      { label: "Definir as prioridades do dia — máximo 3" },
      { label: "Alinhar com os líderes: o que precisa acontecer e onde está o risco" },
      { label: "Tratar anomalias pendentes — primeiro as que impactam cliente, operação ou dinheiro" },
      { label: "Verificar estoque crítico — antecipar produção/reposição do que trava a casa" },
      { label: "Validar padrão da equipe: apresentação, uniforme e adornos conforme BPF" },
      { label: "Checar planilhas e controles — preenchidos e corretos; sistemas ligados, impressoras testadas" },
      { label: "Revisar WhatsApp do dia anterior — corrigir tempo de resposta e clareza" },
      { label: "Conduzir reunião de pré-abertura: prioridades, riscos e padrão esperado" },
      { label: "Garantir alinhamento entre salão/atendimento, cozinha e sushibar" },
    ],
  },
  {
    name: "Meio de Turno — Gerente",
    description: "Checklist de meio de turno do Gerente",
    type: "daily",
    jobFunctionName: "Gerente",
    items: [
      { label: "Monitorar fluxo, tempo de espera e gargalos — teste: isso irritaria o cliente?" },
      { label: "Corrigir desvios no ato — não corrigir = permitir" },
      { label: "Dar feedback direto e respeitoso — reforçar o certo, corrigir o errado" },
      { label: "Ajustar rota da operação — o que melhora o resultado agora?" },
    ],
  },
  {
    name: "Fechamento — Gerente",
    description: "Checklist de fechamento do turno do Gerente",
    type: "daily",
    jobFunctionName: "Gerente",
    items: [
      { label: "Atualizar estoque no sistema — tudo que saiu está lançado" },
      { label: "Fechar o caixa — divergências resolvidas no mesmo dia" },
      { label: "Gerar PDF de compras e enviar" },
      { label: "Registrar anomalias do dia — sem registro, não existiu" },
      { label: "Reportar ao RH tudo sobre pessoas: feedback, conflito, desvio ou destaque" },
      { label: "Preencher diário de bordo com análise real — o que faria diferente amanhã?" },
      { label: "Conferir casa organizada, limpa e pronta para o próximo turno", requiresPhoto: true },
    ],
  },
  {
    name: "Abertura — Chefe de Cozinha",
    description: "Checklist de abertura do turno do Chefe de Cozinha",
    type: "daily",
    jobFunctionName: "Chefe de Cozinha",
    items: [
      { label: "Conferir presença, uniforme e postura da equipe (touca, avental, sem adornos, sem celular)" },
      { label: "Delegar as funções do turno — cada um sabe o que executa" },
      { label: "Aferir temperatura: refrigeradores 0–4 °C, freezers abaixo de −18 °C", requiresPhoto: true },
      { label: "Verificar equipamentos funcionando (sem alarme, sem gelo excessivo, vedação ok)" },
      { label: "Conferir óleo das fritadeiras — trocar/filtrar conforme padrão" },
      { label: "Receber e conferir mercadorias: qualidade, validade e quantidade" },
      { label: "Conferir validades e aplicar PVPS — segregar/descartar vencidos" },
      { label: "Conferir etiquetagem dos recipientes em uso (produto, data de preparo, validade, responsável)" },
      { label: "Conferir higienização de bancadas e utensílios antes do primeiro preparo" },
      { label: "Conferir produções do dia (molhos, bases, finalizações) conforme plano" },
      { label: "Separar insumos por prioridade e montar mise en place (crus separados de cozidos)" },
    ],
  },
  {
    name: "Meio de Turno — Chefe de Cozinha",
    description: "Checklist de meio de turno do Chefe de Cozinha",
    type: "daily",
    jobFunctionName: "Chefe de Cozinha",
    items: [
      { label: "Pratos saindo conforme ficha técnica — sem substituições não autorizadas" },
      { label: "Porcionamento dentro da margem da ficha" },
      { label: "Tempo de preparo dentro do SLA (salão e delivery)" },
      { label: "Apresentação e finalização conforme padrão visual" },
      { label: "Desperdício de insumos sob controle — aparas e sobras registradas" },
      { label: "Temperatura da vitrine/balcão refrigerado: crus a no máx. 4 °C" },
    ],
  },
  {
    name: "Fechamento — Chefe de Cozinha",
    description: "Checklist de fechamento do turno do Chefe de Cozinha",
    type: "daily",
    jobFunctionName: "Chefe de Cozinha",
    items: [
      { label: "Guardar e etiquetar todos os itens — crus separados de cozidos" },
      { label: "Aferir temperatura de refrigeradores e freezers", requiresPhoto: true },
      { label: "Executar limpeza do setor conforme cronograma do dia", requiresPhoto: true },
      { label: "Retirar o lixo (ensacado, identificado, lixeira com tampa)", requiresPhoto: true },
      { label: "Coar/cobrir óleo das fritadeiras e conferir desligamento" },
      { label: "Desligar equipamentos de produção (aquecedores, ar-condicionado)" },
      { label: "Conferir refrigeradores e freezers ligados e fechados" },
      { label: "Conferir planilhas de controle da Nutrição preenchidas" },
      { label: "Verificar utensílios e ferramentas — solicitar manutenção/troca se necessário" },
      { label: "Preencher lista de requisição interna — faltas comunicadas ao gerente da unidade" },
      { label: "Preencher diário de bordo e registrar não conformidades do turno" },
      { label: "Reportar ao gerente da unidade os problemas do dia" },
    ],
  },
  {
    name: "Auditoria Semanal — Chefe de Cozinha",
    description: "Auditoria semanal do setor de cozinha",
    type: "weekly",
    jobFunctionName: "Chefe de Cozinha",
    items: [
      { label: "Auditar apresentação da equipe na semana: uniforme completo, higiene pessoal, sem adornos" },
      { label: "Verificar integração e acompanhamento de novos colaboradores nas rotinas do setor" },
      { label: "Conferir se os checklists diários da semana foram preenchidos todos os dias, sem lacunas" },
      { label: "Spot-check de etiquetagem: amostrar 10 recipientes na praça, câmara e freezer — zero sem identificação" },
      { label: "Spot-check de validades em todo o estoque de praça — nenhum produto vencido em uso" },
      { label: "Conferir PVPS na prática: produtos mais antigos na frente/topo, novos atrás" },
      { label: "Inspecionar equipamentos de refrigeração a fundo: borrachas, gelo, alarmes", requiresPhoto: true },
      { label: "Verificar indícios de pragas: rastros, ralos, telas e pontos de acesso" },
      { label: "Conferir planilhas da Nutrição preenchidas na semana, com dados reais e sem rasura" },
      { label: "Revisar as não conformidades da semana e o status de tratamento de cada uma" },
      { label: "Cruzar lista de compras com faltas recorrentes — padrão de ruptura comunicado ao gerente da unidade" },
      { label: "Elaborar lista de compras conforme cronograma estabelecido" },
      { label: "Conferir e aprovar/reprovar ajustes de ponto dos liderados" },
      { label: "Auditar filetação e porcionamento: cortes uniformes, pesagem conforme ficha" },
      { label: "Revisar registros de desperdício da semana — descartes sem autorização = não conformidade" },
      { label: "Executar limpeza profunda conforme cronograma semanal", requiresPhoto: true },
    ],
  },
  {
    name: "Abertura — Chefe de Sushibar",
    description: "Checklist de abertura do turno do Chefe de Sushibar (Souschef)",
    type: "daily",
    jobFunctionName: "Chefe de Sushibar",
    items: [
      { label: "Conferir equipe completa, pontual e uniformizada conforme BPF — sem celular na praça" },
      { label: "Delegar as funções do turno — cada um sabe o que executa" },
      { label: "Acompanhar integração de novo colaborador (quando houver)" },
      { label: "Conferir temperaturas aferidas e no padrão: refrigeradores 0–4 °C, freezer abaixo de −18 °C, vitrine máx. 4 °C" },
      { label: "Conferir etiquetagem — zero recipientes sem identificação na praça, câmara e freezer" },
      { label: "Conferir validades e PVPS aplicado — nenhum produto vencido em uso" },
      { label: "Conferir higienização de bancadas e utensílios antes do primeiro preparo" },
      { label: "Conferir mise en place e shari conforme ficha técnica — praça pronta para a operação" },
    ],
  },
  {
    name: "Meio de Turno — Chefe de Sushibar",
    description: "Checklist de meio de turno do Chefe de Sushibar (Souschef)",
    type: "daily",
    jobFunctionName: "Chefe de Sushibar",
    items: [
      { label: "Peças e pratos conforme ficha técnica: corte, gramatura e montagem" },
      { label: "Filetação e porcionamento dentro do padrão — desperdício de nobres registrado, nada descartado sem autorização" },
      { label: "Tempo de saída dentro do SLA (salão e delivery)" },
      { label: "Apresentação e finalização conforme padrão visual" },
      { label: "Crus e cozidos separados durante o serviço — sem contato cruzado" },
      { label: "Vitrine abastecida e na temperatura correta" },
    ],
  },
  {
    name: "Fechamento — Chefe de Sushibar",
    description: "Checklist de fechamento do turno do Chefe de Sushibar (Souschef)",
    type: "daily",
    jobFunctionName: "Chefe de Sushibar",
    items: [
      { label: "Conferir armazenamento e etiquetagem de fechamento — peixes em recipientes próprios" },
      { label: "Conferir temperaturas de fechamento dentro do padrão" },
      { label: "Conferir sobras e descartes registrados — nada sem autorização" },
      { label: "Conferir higienização final da praça conforme cronograma" },
      { label: "Conferir planilhas de controle do turno preenchidas com dados reais" },
      { label: "Registrar não conformidades do turno no formulário padrão" },
      { label: "Reportar faltas de insumos e problemas do dia ao gerente da unidade" },
    ],
  },
  {
    name: "Auditoria Semanal — Chefe de Sushibar",
    description: "Auditoria semanal do setor de sushibar",
    type: "weekly",
    jobFunctionName: "Chefe de Sushibar",
    items: [
      { label: "Auditar apresentação da equipe na semana: uniforme completo, higiene pessoal, sem adornos" },
      { label: "Verificar integração e acompanhamento de novos colaboradores" },
      { label: "Conferir se os checklists diários do sushibar foram preenchidos todos os dias, sem lacunas" },
      { label: "Spot-check de etiquetagem: amostrar 10 recipientes na praça, câmara e freezer" },
      { label: "Spot-check de validades em todo o estoque da praça — nenhum vencido" },
      { label: "Conferir PVPS na prática: antigos na frente/topo, novos atrás" },
      { label: "Inspecionar equipamentos de refrigeração a fundo: borrachas, gelo, alarmes", requiresPhoto: true },
      { label: "Verificar indícios de pragas na área de preparo" },
      { label: "Conferir planilhas da Nutrição da semana, com dados reais e sem rasura" },
      { label: "Revisar não conformidades da semana e status de tratamento" },
      { label: "Elaborar lista de compras conforme cronograma estabelecido" },
      { label: "Conferir e aprovar/reprovar ajustes de ponto dos liderados" },
      { label: "Auditar filetação e porcionamento de peixes: cortes uniformes, pesagem conforme ficha" },
      { label: "Revisar registros de desperdício da semana" },
      { label: "Executar limpeza profunda conforme cronograma semanal", requiresPhoto: true },
    ],
  },
  {
    name: "Abertura — Líder de Sushibar",
    description: "Checklist de abertura do turno do Líder de Sushibar",
    type: "daily",
    jobFunctionName: "Líder de Sushibar",
    items: [
      { label: "Aferir temperatura da vitrine e refrigeradores — crus a no máx. 4 °C", requiresPhoto: true },
      { label: "Conferir qualidade dos peixes: aparência, odor, etiqueta e validade" },
      { label: "Aplicar PVPS nos insumos da praça" },
      { label: "Preparar shari conforme ficha técnica — textura e tempero padrão" },
      { label: "Conferir molhos de finalização e produções abastecidos para a operação — solicitar reposição se necessário" },
      { label: "Conferir higienização de bancadas, facas, tábuas e sudare" },
      { label: "Montar mise en place — crus separados de cozidos" },
      { label: "Conferir uniforme e postura da equipe do sushibar" },
    ],
  },
  {
    name: "Meio de Turno — Líder de Sushibar",
    description: "Checklist de meio de turno do Líder de Sushibar",
    type: "daily",
    jobFunctionName: "Líder de Sushibar",
    items: [
      { label: "Peças conforme ficha técnica: corte, gramatura e montagem" },
      { label: "Filetação e porcionamento sem desperdício — aparas registradas" },
      { label: "Tempo de saída dentro do SLA (salão e delivery)" },
      { label: "Vitrine abastecida e na temperatura correta" },
      { label: "Apresentação conforme padrão visual" },
    ],
  },
  {
    name: "Fechamento — Líder de Sushibar",
    description: "Checklist de fechamento do turno do Líder de Sushibar",
    type: "daily",
    jobFunctionName: "Líder de Sushibar",
    items: [
      { label: "Guardar e etiquetar todos os insumos — peixes em recipientes próprios" },
      { label: "Aferir temperatura dos equipamentos", requiresPhoto: true },
      { label: "Registrar sobras e descartes — nada sem autorização" },
      { label: "Higienizar bancadas, utensílios e vitrine", requiresPhoto: true },
      { label: "Conferir planilhas de controle da Nutrição preenchidas" },
      { label: "Verificar utensílios e ferramentas — solicitar manutenção/troca se necessário" },
      { label: "Preencher requisição de insumos — faltas comunicadas ao gerente da unidade" },
      { label: "Registrar não conformidades e reportar ao gerente da unidade" },
    ],
  },
  {
    name: "Abertura — Líder de Delivery",
    description: "Checklist de abertura do turno do Líder de Delivery",
    type: "daily",
    jobFunctionName: "Líder de Delivery",
    items: [
      { label: "Abrir loja nas plataformas (iFood, Aiqfome, Neemo) — cardápio sincronizado" },
      { label: "Atualizar itens pausados/indisponíveis conforme estoque do dia" },
      { label: "Testar impressora de pedidos e integração com o Saipos" },
      { label: "Conferir estoque de embalagens, sacolas, hashi, molhos e descartáveis" },
      { label: "Confirmar escala de entregadores do turno" },
      { label: "Conferir bancada de expedição limpa e organizada" },
      { label: "Revisar reclamações e mensagens pendentes do dia anterior" },
    ],
  },
  {
    name: "Meio de Turno — Líder de Delivery",
    description: "Checklist de meio de turno do Líder de Delivery",
    type: "daily",
    jobFunctionName: "Líder de Delivery",
    items: [
      { label: "Tempo de aceite e despacho dentro do SLA" },
      { label: "Conferir pedido completo antes do despacho: itens, molhos, hashi, talheres" },
      { label: "Responder avaliações e mensagens no tempo padrão" },
      { label: "Corrigir gargalos de expedição no ato" },
    ],
  },
  {
    name: "Fechamento — Líder de Delivery",
    description: "Checklist de fechamento do turno do Líder de Delivery",
    type: "daily",
    jobFunctionName: "Líder de Delivery",
    items: [
      { label: "Fechar loja nas plataformas no horário" },
      { label: "Conferir todos os pedidos concluídos e baixados no sistema" },
      { label: "Registrar cancelamentos e erros de pedido do dia" },
      { label: "Repor embalagens do próximo turno — faltas comunicadas ao gerente da unidade" },
      { label: "Limpar e organizar bancada de expedição", requiresPhoto: true },
      { label: "Registrar anomalias e reportar ao gerente da unidade" },
    ],
  },
  {
    name: "Abertura — Líder de Bar",
    description: "Checklist de abertura do turno do Líder de Bar",
    type: "daily",
    jobFunctionName: "Líder de Bar",
    items: [
      { label: "Conferir estoque de bebidas, insumos e gelo do dia" },
      { label: "Aferir temperatura de refrigeradores, balcão refrigerado e freezer" },
      { label: "Conferir validades e PVPS (frutas, xaropes, laticínios)" },
      { label: "Higienizar bancada e utensílios do setor" },
      { label: "Montar mise en place: frutas, xaropes e guarnições etiquetados conforme Nutrição" },
      { label: "Testar equipamentos: carbonatador, desidratador, espremedor, liquidificador e impressora térmica" },
    ],
  },
  {
    name: "Meio de Turno — Líder de Bar",
    description: "Checklist de meio de turno do Líder de Bar",
    type: "daily",
    jobFunctionName: "Líder de Bar",
    items: [
      { label: "Drinks conforme ficha técnica: dosagem, montagem, apresentação" },
      { label: "Tempo de saída dentro do SLA" },
      { label: "Bancada limpa e abastecida durante o serviço" },
      { label: "Registrar consumo e quebras no ato" },
    ],
  },
  {
    name: "Fechamento — Líder de Bar",
    description: "Checklist de fechamento do turno do Líder de Bar",
    type: "daily",
    jobFunctionName: "Líder de Bar",
    items: [
      { label: "Guardar e etiquetar perecíveis conforme orientação da Nutrição" },
      { label: "Contagem dos destilados e bebidas de alto valor" },
      { label: "Higienizar bancada, utensílios e equipamentos", requiresPhoto: true },
      { label: "Desligar equipamentos e conferir refrigeração ligada" },
      { label: "Conferir planilhas de controle da Nutrição preenchidas" },
      { label: "Verificar utensílios e ferramentas — solicitar manutenção/troca se necessário" },
      { label: "Preencher requisição de reposição — faltas comunicadas ao gerente da unidade" },
      { label: "Registrar quebras e anomalias e reportar ao gerente da unidade" },
    ],
  },
  {
    name: "Abertura — Líder de Estoque/Produção",
    description: "Checklist de abertura do turno do Líder de Estoque/Produção",
    type: "daily",
    jobFunctionName: "Líder de Estoque/Produção",
    items: [
      { label: "Aferir temperatura de câmaras e freezers", requiresPhoto: true },
      { label: "Receber mercadorias conforme ordem de compra — divergência registrada e comunicada a compras" },
      { label: "Recusar no ato produtos fora do padrão" },
      { label: "Etiquetar e armazenar recebidos por categoria, temperatura e PVPS" },
      { label: "Separar insumos das praças conforme requisições internas" },
      { label: "Iniciar produções do dia conforme plano e fichas técnicas" },
    ],
  },
  {
    name: "Meio de Turno — Líder de Estoque/Produção",
    description: "Checklist de meio de turno do Líder de Estoque/Produção",
    type: "daily",
    jobFunctionName: "Líder de Estoque/Produção",
    items: [
      { label: "Lançar entradas e saídas no sistema em tempo real" },
      { label: "Produções conforme ficha técnica e rendimento esperado" },
      { label: "Estoque organizado: nada no chão, empilhamento e identificação corretos" },
      { label: "Registrar perdas no ato (vencimento, avaria, erro operacional)" },
    ],
  },
  {
    name: "Fechamento — Líder de Estoque/Produção",
    description: "Checklist de fechamento do turno do Líder de Estoque/Produção",
    type: "daily",
    jobFunctionName: "Líder de Estoque/Produção",
    items: [
      { label: "Conferir requisições do dia atendidas e lançadas" },
      { label: "Etiquetar e armazenar produções finalizadas" },
      { label: "Inventário rotativo dos itens críticos — divergências justificadas" },
      { label: "Sinalizar validades próximas para uso prioritário" },
      { label: "Limpeza e organização do estoque", requiresPhoto: true },
      { label: "Registrar perdas e anomalias e reportar ao gerente da unidade" },
    ],
  },
];

async function main() {
  // Script exclusivo de seed da Kenkyo — dados que só fazem sentido pra
  // essa empresa, não roda nada equivalente pra outras organizações.
  const [kenkyo] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, "kenkyo"));
  if (!kenkyo) {
    console.log("Organização Kenkyo não encontrada, pulando.");
    return;
  }

  // Restringe a exclusão à organização piloto (Kenkyo): apagar por nome
  // global derruba modelos homônimos de outras empresas via cascade.
  const existingOldScoped = await db
    .select({ id: checklistTypes.id, name: checklistTypes.name })
    .from(checklistTypes)
    .where(
      and(
        inArray(checklistTypes.name, OLD_CHECKLIST_NAMES_TO_REMOVE),
        eq(checklistTypes.organizationId, kenkyo.id),
      ),
    );

  if (existingOldScoped.length > 0) {
    await db.delete(checklistTypes).where(
      inArray(checklistTypes.id, existingOldScoped.map((e) => e.id)),
    );
    for (const e of existingOldScoped) {
      console.log(`Removido: "${e.name}"`);
    }
  }

  const allFunctions = await db.select().from(jobFunctions);
  const funcByName = new Map(allFunctions.map((f) => [f.name, f.id]));

  for (const name of NEW_JOB_FUNCTIONS) {
    if (!funcByName.has(name)) {
      const [created] = await db
        .insert(jobFunctions)
        .values({ name, organizationId: kenkyo.id })
        .returning({ id: jobFunctions.id });
      funcByName.set(name, created.id);
      console.log(`Função criada: "${name}"`);
    }
  }

  const chefeId = funcByName.get("Chefe");
  if (chefeId) {
    funcByName.set("Chefe de Cozinha", chefeId);
  }

  const existingNames = new Set(
    (await db.select({ name: checklistTypes.name }).from(checklistTypes)).map(
      (r) => r.name,
    ),
  );

  for (const def of CHECKLISTS) {
    if (existingNames.has(def.name)) {
      console.log(`"${def.name}" já existe, pulando.`);
      continue;
    }
    const jobFunctionId = funcByName.get(def.jobFunctionName);
    if (!jobFunctionId) {
      console.error(`Função "${def.jobFunctionName}" não encontrada, abortando "${def.name}".`);
      continue;
    }

    const [createdType] = await db
      .insert(checklistTypes)
      .values({
        organizationId: kenkyo.id,
        name: def.name,
        description: def.description,
        type: def.type,
        jobFunctionId,
        assignedUserId: null,
      })
      .returning({ id: checklistTypes.id });

    await db.insert(checklistTypeItems).values(
      def.items.map((item, idx) => ({
        checklistTypeId: createdType.id,
        label: item.label,
        position: idx + 1,
        requiresPhoto: item.requiresPhoto ?? false,
      })),
    );

    console.log(`"${def.name}" criado com ${def.items.length} itens.`);
  }

  console.log("Migração de checklists concluída.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
