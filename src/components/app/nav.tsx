"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { LayoutGrid, List, BarChart3, Settings, Menu, X } from "lucide-react";

const links = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/queue", label: "Fila de Postagens", icon: List },
  { href: "/metrics", label: "Métricas", icon: BarChart3 },
  { href: "/settings", label: "Configuração", icon: Settings },
];

function Logo({ size = 32 }: { size?: number }) {
  return (
    <div
      className="brand-gradient flex shrink-0 items-center justify-center rounded-[9px]"
      style={{ width: size, height: size }}
    >
      <svg width={size * 0.53} height={size * 0.53} viewBox="0 0 24 24" fill="none">
        <path d="M4 20 L14 4 L20 4 L10 20 Z" fill="#fff" />
      </svg>
    </div>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {links.map((link) => {
        const active = pathname === link.href;
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-colors",
              active ? "bg-accent font-bold text-primary" : "font-medium text-[#5B5876] hover:bg-muted"
            )}
          >
            <Icon className="h-[18px] w-[18px]" />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarFooter({ username }: { username: string | null }) {
  if (!username) return null;
  const initials = username.slice(0, 2).toUpperCase();

  return (
    <div className="flex items-center gap-2.5 border-t border-border pt-4">
      <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-accent text-[13px] font-bold text-primary">
        {initials}
      </div>
      <div className="min-w-0 text-[13px] font-semibold text-nowrap overflow-hidden text-ellipsis">{username}</div>
    </div>
  );
}

/** Sidebar de desktop (>= md) — usada dentro de <aside> em layout.tsx. */
export function AppNav({ username }: { username: string | null }) {
  return (
    <div className="flex h-full flex-col justify-between p-4">
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-2.5 px-2">
          <Logo />
          <span className="text-[15px] font-extrabold tracking-tight">PosteiFlow</span>
        </div>
        <NavLinks />
      </div>
      <SidebarFooter username={username} />
    </div>
  );
}

/**
 * Barra com hambúrguer (< md) + drawer deslizante. Fica sempre montada no
 * DOM (não condicional em `open`) para que a transição de translate-x seja
 * uma animação de verdade, não um aparecer/sumir seco.
 */
export function MobileNavBar({ username }: { username: string | null }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b border-border bg-card px-4 py-3.5 md:hidden">
        <div className="flex items-center gap-2">
          <Logo size={28} />
          <span className="text-sm font-extrabold">PosteiFlow</span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-muted text-foreground"
          aria-label="Abrir menu"
        >
          <Menu className="h-[18px] w-[18px]" />
        </button>
      </div>

      <div
        className={cn("fixed inset-0 z-50 md:hidden", open ? "pointer-events-auto" : "pointer-events-none")}
        aria-hidden={!open}
      >
        <div
          className={cn("absolute inset-0 bg-[#15132A]/40 transition-opacity", open ? "opacity-100" : "opacity-0")}
          onClick={() => setOpen(false)}
        />
        <div
          className={cn(
            "absolute inset-y-0 left-0 w-[78vw] max-w-[280px] bg-card p-4 shadow-lg transition-transform duration-300",
            open ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="flex h-full flex-col justify-between">
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2.5">
                  <Logo />
                  <span className="text-[15px] font-extrabold">PosteiFlow</span>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex h-7 w-7 items-center justify-center text-muted-foreground"
                  aria-label="Fechar menu"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <NavLinks onNavigate={() => setOpen(false)} />
            </div>
            <SidebarFooter username={username} />
          </div>
        </div>
      </div>
    </>
  );
}
