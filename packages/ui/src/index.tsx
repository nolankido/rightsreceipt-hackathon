import type { ReactNode } from "react";

export function AppHeader({
  productName,
  mode,
  children,
}: {
  productName: string;
  mode: ReactNode;
  children: ReactNode;
}) {
  return (
    <header className="rr-header">
      <div className="rr-header-topline">
        <span className="rr-wordmark">{productName}</span>
        {mode}
      </div>
      {children}
    </header>
  );
}

export function ModeBadge({
  mode,
}: {
  mode: string;
  tone: "neutral" | "sandbox" | "simulated";
}) {
  return <span className="rr-mode-badge">{mode}</span>;
}

export function RoleBanner({
  role,
  nextAction,
}: {
  role: string;
  nextAction: string;
}) {
  return (
    <section className="rr-role-banner" aria-label="Current role and next action">
      <p className="rr-role-label">
        Acting as <strong>{role}</strong>
      </p>
      <p className="rr-next-action">Next: {nextAction}</p>
    </section>
  );
}

export function SurfaceCard({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: ReactNode;
}) {
  return (
    <section className="rr-card">
      <p className="rr-eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function ScaffoldNotice({ children }: { children: ReactNode }) {
  return (
    <div className="rr-notice" role="note">
      {children}
    </div>
  );
}
