"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/admin/users", label: "Brukere og tilganger" },
  { href: "/admin/notifications", label: "Varselinnstillinger" },
  { href: "/admin/images", label: "Bildeinnstillinger" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="admin-nav" aria-label="Administrasjon">
      {tabs.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          aria-current={pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
