"use client";

import { useEffect, useState } from "react";
import { removerInscricaoPush, salvarInscricaoPush } from "@/lib/actions/push";

type Estado = "carregando" | "sem-suporte" | "iphone-instalar" | "bloqueado" | "desligado" | "ligado";

function chaveParaBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Liga ou desliga os avisos (push) neste aparelho. */
export function AvisosPush() {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    (async () => {
      if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return setEstado("sem-suporte");
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const instalado = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
      if (ios && !instalado) return setEstado("iphone-instalar");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setEstado("sem-suporte");
      if (Notification.permission === "denied") return setEstado("bloqueado");
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setEstado(sub && Notification.permission === "granted" ? "ligado" : "desligado");
      } catch {
        setEstado("sem-suporte");
      }
    })();
  }, []);

  async function ligar() {
    setOcupado(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setEstado(perm === "denied" ? "bloqueado" : "desligado");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: chaveParaBytes(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""),
      });
      const j = sub.toJSON();
      await salvarInscricaoPush({ endpoint: sub.endpoint, p256dh: j.keys?.p256dh ?? "", auth: j.keys?.auth ?? "", userAgent: navigator.userAgent });
      setEstado("ligado");
    } catch {
      setEstado("desligado");
    } finally {
      setOcupado(false);
    }
  }

  async function desligar() {
    setOcupado(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await removerInscricaoPush(sub.endpoint);
        await sub.unsubscribe();
      }
      setEstado("desligado");
    } finally {
      setOcupado(false);
    }
  }

  if (estado === "carregando" || estado === "sem-suporte") return null;
  const dica: Record<string, string> = {
    "iphone-instalar": "No iPhone, instale o app na tela inicial (Compartilhar › Adicionar à Tela de Início) para ativar os avisos.",
    bloqueado: "Os avisos estão bloqueados neste aparelho. Libere nas configurações do navegador.",
  };
  return (
    <div className="avisos-push">
      <div>
        <strong>Avisos no celular</strong>
        <small>{dica[estado] ?? "Prazo e atraso de checklists, anomalias e requisições."}</small>
      </div>
      {(estado === "desligado" || estado === "ligado") && (
        <button type="button" className="btn btn-secondary" disabled={ocupado} onClick={estado === "ligado" ? desligar : ligar}>
          {estado === "ligado" ? "Desativar" : "Ativar"}
        </button>
      )}
    </div>
  );
}
