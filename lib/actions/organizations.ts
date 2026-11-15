"use server";

import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { clientKey, rateLimit } from "@/lib/auth/rate-limit";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { organizations, users } from "@/lib/db/schema";
import { createSession } from "@/lib/auth/session";
import { getCurrentUser } from "@/lib/auth/dal";
import { isGestorProfile } from "@/lib/auth/profile";
import {
  isPlatformOperator,
  getOrganizationById,
  setOrganizationStatus,
  updateOrganizationBrand as updateOrganizationBrandData,
  type OrganizationStatus,
} from "@/lib/data/organizations";

export type SignupState = { error?: string } | undefined;
export type BrandState = { error?: string } | undefined;

function slugify(name: string) {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "empresa"
  );
}

/** Onboarding: cria uma empresa nova (organizations) + o primeiro
 * usuário, sempre gestor — sem nenhum dado do Kenkyo junto, ao
 * contrário do que os scripts de seed fazem hoje pro Kenkyo em si. */
export async function signupOrganization(
  _prevState: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const companyName = String(formData.get("companyName") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const username = String(formData.get("username") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!companyName || !name || !username || !password) {
    return { error: "Preencha todos os campos" };
  }
  if (password.length < 6) {
    return { error: "A senha precisa ter pelo menos 6 caracteres" };
  }

  // Anti-abuso de criação de contas: no máximo 5 signups por IP por hora.
  if (!rateLimit(await clientKey("signup"), 5, 60 * 60 * 1000)) {
    return { error: "Muitas tentativas. Tente novamente mais tarde." };
  }

  const existingUser = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  if (existingUser.length > 0) {
    return { error: "Esse login já está em uso" };
  }

  let slug = slugify(companyName);
  const existingSlug = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  if (existingSlug.length > 0) {
    slug = `${slug}-${Date.now().toString(36)}`;
  }

  const [org] = await db
    .insert(organizations)
    .values({ name: companyName, slug, status: "pending" })
    .returning({ id: organizations.id });

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db
    .insert(users)
    .values({
      organizationId: org.id,
      name,
      username,
      passwordHash,
      profile: "gestor",
    })
    .returning({ id: users.id });

  await createSession({ userId: user.id, profile: "gestor" });
  redirect("/hoje");
}

/** Aprova, recusa ou suspende uma empresa. A empresa-base da própria
 * plataforma (slug "kenkyo") nunca pode ser alterada por aqui — travaria
 * o único jeito de voltar a mexer no /plataforma. */
export async function updateOrganizationStatus(organizationId: number, status: OrganizationStatus) {
  const viewer = await getCurrentUser();
  if (!isPlatformOperator(viewer)) {
    throw new Error("Sem permissão");
  }

  const org = await getOrganizationById(organizationId);
  if (!org) {
    throw new Error("Empresa não encontrada");
  }
  if (org.slug === "kenkyo") {
    throw new Error("Não é possível alterar o status da empresa da plataforma");
  }

  await setOrganizationStatus(organizationId, status);
  revalidatePath("/plataforma");
}

/** Cada gestor edita a marca só da própria empresa (nunca passa um id
 * — sempre a do usuário logado). */
export async function updateOrganizationBrand(
  _prevState: BrandState,
  formData: FormData,
): Promise<BrandState> {
  const viewer = await getCurrentUser();
  if (!isGestorProfile(viewer.profile) || !viewer.organizationId) {
    return { error: "Sem permissão" };
  }

  const name = String(formData.get("name") ?? "").trim();
  const logoUrl = String(formData.get("logoUrl") ?? "").trim();
  const primaryColor = String(formData.get("primaryColor") ?? "").trim();

  if (!name) {
    return { error: "O nome da empresa não pode ficar em branco" };
  }
  if (primaryColor && !/^#[0-9a-fA-F]{6}$/.test(primaryColor)) {
    return { error: "Cor inválida — use o seletor de cor" };
  }
  if (logoUrl && !/^(https?:\/\/|\/)/.test(logoUrl)) {
    return { error: "URL da logo precisa começar com http:// ou https://" };
  }

  await updateOrganizationBrandData(viewer.organizationId, {
    name,
    logoUrl: logoUrl || null,
    primaryColor: primaryColor || null,
  });
  revalidatePath("/gerenciar");
  revalidatePath("/hoje");
}
