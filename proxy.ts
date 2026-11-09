import { NextResponse } from "next/server";
import { isGestorProfile } from "@/lib/auth/profile";
import type { NextRequest } from "next/server";
import { decrypt } from "@/lib/auth/session";

const protectedRoutes = ["/hoje", "/inicio", "/dashboard", "/checklist", "/relatorio", "/historico", "/gerenciar", "/perdas", "/filetagem", "/resto-ingesta", "/documentos", "/anomalias", "/diario-de-bordo", "/rotinas", "/resumo-do-dia", "/evolucao"];
const gestorOnlyRoutes = ["/gerenciar"];
const rhAllowedRoutes = ["/hoje", "/inicio", "/anomalias", "/diario-de-bordo"];

export default async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isProtected = protectedRoutes.some((route) => path.startsWith(route));
  const isLoginRoute = path === "/login";

  const token = request.cookies.get("session")?.value;
  const session = await decrypt(token);

  if (isProtected && !session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isLoginRoute && session) {
    return NextResponse.redirect(new URL("/hoje", request.url));
  }

  if (
    gestorOnlyRoutes.some((route) => path.startsWith(route)) &&
    session &&
    !isGestorProfile(session.profile)
  ) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (
    isProtected &&
    session &&
    session.profile === "rh" &&
    !rhAllowedRoutes.some((route) => path.startsWith(route))
  ) {
    return NextResponse.redirect(new URL("/hoje", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
