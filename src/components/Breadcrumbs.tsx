import Link from "next/link";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

export default function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-xs flex items-center gap-1 flex-wrap" style={{ color: "var(--text-muted)" }}>
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span aria-hidden="true">/</span>}
          {item.href ? (
            <Link href={item.href} className="hover:underline" style={{ color: "var(--text-muted)" }}>
              {item.label}
            </Link>
          ) : (
            <span style={{ color: "var(--text-secondary)" }}>{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
