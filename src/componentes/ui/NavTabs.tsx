"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export function NavTabs({ items }: { items: { href: string; etiqueta: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Secciones" className="eike-nav">
      {items.map((item) => {
        const activa = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={activa ? "page" : undefined}
            className={cn("eike-nav-tab", activa && "eike-nav-tab--activa")}
          >
            {item.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
