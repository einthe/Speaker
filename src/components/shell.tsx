"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  ListOrdered,
  LayoutDashboard,
  Users,
  ShieldCheck,
  Bell,
  CheckCheck,
  Volleyball,
  HandHelping,
  ReceiptText,
  PartyPopper,
  Menu,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { notificationPath } from "@/lib/notification-links";
import { baseRoles } from "@/lib/domain";
import { PaletteSelector } from "./palette-selector";
import {
  CardColorSelector,
  CardHighlightSelector,
  HighContrastToggle,
  useCardColors,
  useCardHighlighting,
  useHighContrast,
} from "./card-highlighting";
import { SignOutButton } from "./sign-out-button";
import { useTeam } from "./team-provider";
import { useQuery } from "@tanstack/react-query";
import { queries } from "@/lib/cache/queries";
import { ActionForm, Submit } from "./forms";
import { Avatar, Brand } from "./ui";
const links = [
  { href: "/feed", label: "Innlegg", icon: LayoutDashboard },
  { href: "/schedule", label: "Terminliste", icon: CalendarDays },
  { href: "/standings", label: "Tabell", icon: ListOrdered },
  { href: "/roster", label: "Tropp", icon: Users },
  { href: "/volunteer_work_points", label: "Dugnadspoeng", icon: HandHelping },
  { href: "/fines", label: "Bøter", icon: ReceiptText },
];
const shortcuts = [
  { type: "match", label: "Kamper", icon: Volleyball },
  { type: "volunteer_work", label: "Dugnader", icon: HandHelping },
  { type: "social", label: "Sosialt", icon: PartyPopper },
];
export function Shell({ children }: { children: ReactNode }) {
  const { profile, scope } = useTeam();
  const [cardHighlighting, setCardHighlighting] = useCardHighlighting(profile.id);
  const [cardColors, setCardColors] = useCardColors(profile.id);
  const [highContrast, setHighContrast] = useHighContrast(profile.id);
  const notificationsQuery = useQuery(queries.notifications(scope));
  const notifications = notificationsQuery.data ?? [];
  const pathname = usePathname();
  const params = useSearchParams();
  const unread = notifications.filter((n) => !n.read_at).length;
  const drawer = useRef<HTMLDialogElement>(null);
  const accountMenu = useRef<HTMLDetailsElement>(null);
  const notificationMenu = useRef<HTMLDetailsElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => drawer.current?.close();
  const route = `${pathname}?${params.toString()}`;
  useEffect(() => {
    drawer.current?.close();
    if (accountMenu.current) accountMenu.current.open = false;
    if (notificationMenu.current) notificationMenu.current.open = false;
  }, [route]);
  useEffect(() => {
    const menus = [accountMenu.current, notificationMenu.current];
    const dismissOutside = (event: Event) => {
      if (!(event.target instanceof Node)) return;
      for (const menu of menus) {
        if (menu?.open && !menu.contains(event.target)) menu.open = false;
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      for (const menu of menus) {
        if (!menu?.open) continue;
        const focusInside = menu.contains(document.activeElement);
        menu.open = false;
        if (focusInside) menu.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", dismissOutside, true);
    document.addEventListener("focusin", dismissOutside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside, true);
      document.removeEventListener("focusin", dismissOutside);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 761px)");
    const resized = () => {
      if (desktop.matches) drawer.current?.close();
    };
    desktop.addEventListener("change", resized);
    return () => desktop.removeEventListener("change", resized);
  }, []);
  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [menuOpen]);
  return (
    <div
      className="app-shell"
      data-card-highlighting={cardHighlighting}
      data-card-colors={cardColors}
      data-high-contrast={highContrast}
    >
      <a className="skip-link" href="#main">
        Hopp til innhold
      </a>
      <Sidebar />
      <dialog
        ref={drawer}
        id="mobile-navigation"
        className="mobile-drawer"
        aria-label="Navigasjon"
        onClose={() => setMenuOpen(false)}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const controls = event.currentTarget.querySelectorAll<HTMLElement>(
            "a[href], button:not([disabled])",
          );
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            closeMenu();
        }}
      >
        <Sidebar onClose={closeMenu} />
      </dialog>
      <div className="app-body">
        <header className="topbar">
          <button
            type="button"
            className="icon-button mobile-menu-toggle"
            aria-label="Åpne meny"
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            aria-haspopup="dialog"
            onClick={() => {
              drawer.current?.showModal();
              setMenuOpen(true);
            }}
          >
            <Menu size={22} />
          </button>
          <span className="topbar-breadcrumb">
            Lagrommet <span>/</span>{" "}
            {pathname.startsWith("/schedule")
              ? "Terminliste"
              : pathname.startsWith("/standings")
                ? "Tabell"
                : pathname.startsWith("/volunteer_work_points")
                  ? "Dugnadspoeng"
                  : pathname.startsWith("/fines")
                    ? "Bøter"
                    : pathname.startsWith("/roster")
                      ? "Tropp"
                      : pathname.startsWith("/admin")
                        ? "Administrasjon"
                        : pathname === "/profile"
                          ? "Min profil"
                          : "Innlegg"}
          </span>
          <div className="topbar-controls">
            <details ref={notificationMenu} className="notification-menu">
              <summary className="icon-button" aria-label={`Varsler, ${unread} uleste`}>
                <Bell size={20} />
                {unread > 0 && <span className="notification-dot" />}
              </summary>
              <div className="dropdown notification-dropdown">
                <div className="dropdown-heading">
                  <strong>Varsler</strong>
                  <span className="muted">{unread} uleste</span>
                </div>
                {unread > 0 && (
                  <ActionForm className="notification-read-all">
                    <input type="hidden" name="action" value="read-all-notifications" />
                    <Submit secondary>
                      <CheckCheck size={14} /> Merk alle som lest
                    </Submit>
                  </ActionForm>
                )}
                {notificationsQuery.isError && (
                  <p role="alert" className="message error">
                    Varsler kunne ikke hentes.{" "}
                    <button
                      className="text-button"
                      onClick={() => void notificationsQuery.refetch()}
                    >
                      Prøv igjen
                    </button>
                  </p>
                )}
                {!notifications.length &&
                  !notificationsQuery.isPending &&
                  !notificationsQuery.isError && (
                    <p className="muted notification-empty">Ingen varsler.</p>
                  )}
                {notifications.map((n) => (
                  <article key={n.id} className={`notification-item ${n.read_at ? "" : "unread"}`}>
                    <Link href={notificationPath(n.target_type, n.target_id)}>
                      <strong>{n.title}</strong>
                      <p>{n.body}</p>
                    </Link>
                    {!n.read_at && (
                      <ActionForm>
                        <input type="hidden" name="action" value="read-notification" />
                        <input type="hidden" name="id" value={n.id} />
                        <Submit secondary>
                          <CheckCheck size={14} /> Merk som lest
                        </Submit>
                      </ActionForm>
                    )}
                  </article>
                ))}
              </div>
            </details>
            <details ref={accountMenu} className="account-menu">
              <summary className="account-summary" aria-label={`Konto: ${profile.full_name}`}>
                <Avatar
                  name={profile.full_name}
                  userId={profile.id}
                  path={profile.profile_photos?.storage_path}
                />
                <span>
                  <strong>{profile.full_name}</strong>
                  <small>{profile.base_role ? baseRoles[profile.base_role] : ""}</small>
                </span>
              </summary>
              <div className="dropdown account-dropdown">
                <PaletteSelector />
                <HighContrastToggle
                  enabled={highContrast === "on"}
                  onChange={(enabled) => setHighContrast(enabled ? "on" : "off")}
                />
                <CardHighlightSelector value={cardHighlighting} onChange={setCardHighlighting} />
                <CardColorSelector value={cardColors} onChange={setCardColors} />
                <Link
                  href="/profile"
                  onClick={(event) =>
                    event.currentTarget.closest("details")?.removeAttribute("open")
                  }
                >
                  Min profil
                </Link>
                <Link href="/auth/update-password">Endre passord</Link>
                <SignOutButton />
              </div>
            </details>
          </div>
        </header>
        <main id="main" className="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
function Sidebar({ onClose }: { onClose?: () => void }) {
  const { profile } = useTeam();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <aside
      className={`sidebar ${onClose ? "mobile-sidebar" : "desktop-sidebar"}`}
      onClick={(event) => {
        if (
          !event.ctrlKey &&
          !event.metaKey &&
          !event.shiftKey &&
          !event.altKey &&
          event.button === 0 &&
          (event.target as HTMLElement).closest("a")
        )
          onClose?.();
      }}
    >
      <div className="sidebar-heading">
        <Brand />
        {onClose && (
          <button
            type="button"
            className="icon-button drawer-close"
            aria-label="Lukk meny"
            onClick={onClose}
            autoFocus
          >
            <X size={22} />
          </button>
        )}
      </div>
      <div className="nav-label">LAGROMMET</div>
      <nav aria-label="Hovedmeny">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`nav-link ${pathname.startsWith(href) || (href === "/feed" && pathname.startsWith("/posts")) ? "active" : ""}`}
          >
            <Icon size={20} />
            {label}
            {pathname === href && <span className="nav-dot" />}
          </Link>
        ))}
      </nav>
      <div className="nav-label shortcuts-label">SNARVEIER</div>
      <nav aria-label="Snarveier" className="shortcut-nav">
        {shortcuts.map(({ type, label, icon: Icon }) => {
          const active = pathname === "/schedule" && params.get("type") === type;
          return (
            <Link
              key={type}
              href={`/schedule?type=${type}`}
              className={`nav-link ${active ? "active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={20} />
              {label}
              {active && <span className="nav-dot" />}
            </Link>
          );
        })}
      </nav>
      {profile.base_role === "admin" && (
        <>
          <Link
            className={`nav-link admin-label ${pathname.startsWith("/admin") ? "active" : ""}`}
            href="/admin/users"
            aria-label="Administrasjon"
          >
            <ShieldCheck size={20} /> Administrasjon
          </Link>
        </>
      )}
      <div className="sidebar-bottom" hidden>
        <div className="team-note">
          <VolleyballMark />
        </div>
      </div>
    </aside>
  );
}
function VolleyballMark() {
  return (
    <svg width="110" height="80" viewBox="0 0 110 80" fill="none" aria-hidden="true">
      <path
        d="M10 70 30 12h58l12 58H10Z M20 41h74 M48 12 42 70 M69 12l8 58"
        stroke="currentColor"
        strokeWidth="1"
      />
      <circle cx="52" cy="33" r="16" stroke="currentColor" />
      <path d="M37 28c12 0 17 10 18 20m-7-30c-2 13 9 19 19 18" stroke="currentColor" />
    </svg>
  );
}
