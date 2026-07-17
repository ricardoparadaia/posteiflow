"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ListVideo,
  BarChart3,
  LineChart,
  Settings,
  Menu,
  X,
} from "lucide-react";

const links = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/queue", label: "Fila", icon: ListVideo },
  { href: "/metrics", label: "Métricas", icon: BarChart3 },
  { href: "/analytics", label: "Analytics", icon: LineChart },
  { href: "/settings", label: "Configuração", icon: Settings },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 p-3">
      {links.map((link) => {
        const active = pathname === link.href;
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Sidebar de desktop (>= md) — usada dentro de <aside> em layout.tsx. */
export function AppNav() {
  return <NavLinks />;
}

/**
 * Barra com hambúrguer (< md) + drawer deslizante. Fica sempre montada no
 * DOM (não condicional em `open`) para que a transição de translate-x seja
 * uma animação de verdade, não um aparecer/sumir seco.
 */
export function MobileNavBar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between border-b border-border px-4 py-3 md:hidden">
        <span className="text-lg font-semibold">PosteiFlow</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      <div
        className={cn(
          "fixed inset-0 z-50 md:hidden",
          open ? "pointer-events-auto" : "pointer-events-none"
        )}
        aria-hidden={!open}
      >
        <div
          className={cn(
            "absolute inset-0 bg-black/50 transition-opacity",
            open ? "opacity-100" : "opacity-0"
          )}
          onClick={() => setOpen(false)}
        />
        <div
          className={cn(
            "absolute inset-y-0 left-0 w-64 max-w-[80vw] bg-background shadow-lg transition-transform duration-200",
            open ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="flex items-center justify-between px-4 py-4">
            <div>
              <span className="text-lg font-semibold">PosteiFlow</span>
              <p className="text-xs text-muted-foreground">@humordeporco</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              aria-label="Fechar menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <NavLinks onNavigate={() => setOpen(false)} />
        </div>
      </div>
    </>
  );
}
