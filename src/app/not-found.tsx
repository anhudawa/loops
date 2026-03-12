import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: "var(--bg)" }}>
      <span className="logo-mark text-gradient text-5xl mb-6">LOOPS</span>
      <h1 className="text-6xl font-extrabold mb-2" style={{ color: "var(--text)" }}>404</h1>
      <p className="text-lg mb-8" style={{ color: "var(--text-muted)" }}>
        This loop doesn&apos;t exist — yet.
      </p>
      <Link
        href="/"
        className="btn-accent px-8 py-3 rounded-xl font-bold text-sm uppercase tracking-wider"
      >
        Back to exploring
      </Link>
    </div>
  );
}
