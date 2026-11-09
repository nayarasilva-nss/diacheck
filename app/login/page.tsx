import Image from "next/image";
import Link from "next/link";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  // A tela de login não sabe que empresa é: o logo/genérico fica neutro —
  // "Sistema de Checklists" serve a qualquer cliente (fase multi-empresa).
  return (
    <div className="login-container">
      <div className="login-card">
        <Image
          src="/diacheck-icon.png"
          alt="DiaCheck"
          width={64}
          height={64}
          className="login-logo"
          priority
        />
        <h1>DiaCheck</h1>
        <p>Tudo em ordem, do começo ao fim do dia.</p>
        <LoginForm />
        <p style={{ marginTop: 16, fontSize: 13, textAlign: "center" }}>
          Sua empresa ainda não usa o sistema?{" "}
          <Link href="/signup">Criar empresa</Link>
        </p>
      </div>
    </div>
  );
}
