import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Volleyball } from "lucide-react";
import { useId, type CSSProperties, type ReactNode } from "react";
import clubLogo from "@/assets/ntnui-volleyball-dark.png";
export { Avatar } from "./avatar";
export function Brand() {
  const tintId = `brand-tint-${useId().replace(/:/g, "")}`;
  return (
    <Link className="brand" href="/feed" aria-label="NTNUI Volleyball – til innlegg">
      <svg className="brand-filter" aria-hidden="true" width="0" height="0">
        <defs>
          <filter id={tintId} colorInterpolationFilters="sRGB">
            <feColorMatrix type="saturate" values="0" />
            {/* Brighten the lettering gently so antialiased edges retain their original weight. */}
            <feComponentTransfer result="bright-strokes">
              <feFuncR type="linear" slope="1.2" />
              <feFuncG type="linear" slope="1.2" />
              <feFuncB type="linear" slope="1.2" />
            </feComponentTransfer>
            <feFlood floodColor="var(--text)" result="tint" />
            <feBlend in="bright-strokes" in2="tint" mode="multiply" />
            <feComposite in2="SourceGraphic" operator="in" />
          </filter>
        </defs>
      </svg>
      <Image
        className="brand-logo"
        src={clubLogo}
        alt=""
        width={64}
        height={54}
        sizes="64px"
        style={{ "--brand-logo-filter": `url(#${tintId})` } as CSSProperties}
      />
      <strong>D2A</strong>
    </Link>
  );
}
export function PageHeading({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {children}
    </header>
  );
}
export function EmptyState({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon ?? <Volleyball size={30} />}</span>
      <h2>{title}</h2>
      <div className="muted">{children}</div>
    </div>
  );
}
export function Badge({ children, tone = "green" }: { children: ReactNode; tone?: string }) {
  return <span className={`badge tone-${tone}`}>{children}</span>;
}
export function Pagination({
  page,
  count,
  size,
  href,
}: {
  page: number;
  count: number;
  size: number;
  href: string;
}) {
  if (count <= size && page === 1) return null;
  return (
    <nav className="pagination" aria-label="Sidenavigering">
      {page > 1 ? (
        <Link
          className="button secondary"
          href={`${href}${href.includes("?") ? "&" : "?"}page=${page - 1}`}
        >
          <ArrowLeft size={16} /> Forrige
        </Link>
      ) : (
        <span />
      )}
      <span className="muted">
        Side {page} av {Math.max(1, Math.ceil(count / size))}
      </span>
      {page * size < count ? (
        <Link
          className="button secondary"
          href={`${href}${href.includes("?") ? "&" : "?"}page=${page + 1}`}
        >
          Neste <ArrowRight size={16} />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className="back-link" href={href}>
      <ArrowLeft size={15} />
      {children}
    </Link>
  );
}
export function pageNumber(value?: string) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? Math.min(n, 100000) : 1;
}
