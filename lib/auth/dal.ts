import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, jobFunctions, organizations } from "@/lib/db/schema";
import { decrypt, getSessionCookie } from "./session";
import { isGestorProfile, type Profile } from "./profile";

export const verifySession = cache(async () => {
  const token = await getSessionCookie();
  const session = await decrypt(token);

  if (!session?.userId) {
    redirect("/login");
  }

  return session;
});

export const getCurrentUser = cache(async () => {
  const session = await verifySession();

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      profile: users.profile,
      unitId: users.unitId,
      jobFunctionId: users.jobFunctionId,
      jobFunctionName: jobFunctions.name,
      checklistObrigatorio: users.checklistObrigatorio,
      requisicaoUnidadesExtras: users.requisicaoUnidadesExtras,
      organizationId: users.organizationId,
      organizationName: organizations.name,
      organizationSlug: organizations.slug,
      organizationStatus: organizations.status,
      organizationLogoUrl: organizations.logoUrl,
      organizationPrimaryColor: organizations.primaryColor,
    })
    .from(users)
    .leftJoin(jobFunctions, eq(users.jobFunctionId, jobFunctions.id))
    .leftJoin(organizations, eq(users.organizationId, organizations.id))
    .where(eq(users.id, session.userId))
    .limit(1);

  const user = rows[0];
  if (!user) {
    redirect("/login");
  }

  return user;
});

export async function requireGestor() {
  const user = await getCurrentUser();
  if (!isGestorProfile(user.profile)) {
    redirect("/hoje");
  }
  return user;
}

export type { Profile };
