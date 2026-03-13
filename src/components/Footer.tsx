export default function Footer() {
  const currentYear = new Date().getFullYear();

  const links = [
    { label: "About", href: "#" },
    { label: "Privacy Policy", href: "#" },
    { label: "Terms", href: "#" },
    { label: "Feedback", href: "#" },
  ];

  return (
    <footer
      className="w-full"
      style={{
        background: "var(--bg)",
        borderTop: "1px solid var(--border)",
      }}
    >
      <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col items-center gap-5">
        {/* Links */}
        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {links.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-[11px] font-bold uppercase tracking-wider transition-colors hover:opacity-80"
              style={{ color: "var(--text-muted)" }}
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Wordmark + year */}
        <div className="flex items-center gap-2">
          <span
            className="text-sm font-extrabold uppercase tracking-wider"
            style={{ color: "var(--accent)" }}
          >
            LOOPS
          </span>
          <span
            className="text-[11px] font-bold uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            &copy; {currentYear}
          </span>
        </div>
      </div>
    </footer>
  );
}
