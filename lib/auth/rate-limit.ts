import "server-only";

/**
 * Rate limit simples, em memória, para login e signup.
 *
 * Limitação conhecida: em serverless (Vercel), cada instância tem a sua
 * memória — o limite não é global entre regiões/instâncias. Ainda assim,
 * eleva o custo de força bruta e cobre o caso mais comum (rajadas do mesmo
 * IP na mesma instância). Se um dia precisar de limite global, trocar a
 * estrutura por um store compartilhado (ex.: Upstash Redis) mantendo a
 * mesma interface.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Limpeza periódica para o Map não crescer sem limite.
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
let lastSweep = Date.now();

function sweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Tenta consumir 1 tentativa para a chave. Retorna false quando o limite
 * foi estourado (a chamada deve ser rejeitada antes de qualquer trabalho
 * caro, ex.: bcrypt ou consulta de usuário).
 */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  sweep(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= max) return false;
  bucket.count++;
  return true;
}

/** IP do pedido atual, caindo para uma chave fixa quando não há proxy header. */
export async function clientKey(prefix: string): Promise<string> {
  const { headers } = await import("next/headers");
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "desconhecido";
  return `${prefix}:${ip}`;
}
