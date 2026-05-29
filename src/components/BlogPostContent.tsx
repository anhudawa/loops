import Link from "next/link";
import type { ReactNode } from "react";
import type { BlogBlock } from "@/lib/blog";

// Minimal inline renderer supporting:
//   [label](href)  -> link (internal links use next/link)
//   **bold**       -> <strong>
// Anything else is rendered as plain text. This keeps post source readable
// while avoiding a markdown runtime dependency.

const TOKEN_RE = /(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*)/g;

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;

  while ((match = TOKEN_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];

    if (token.startsWith("[")) {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (linkMatch) {
        const [, label, href] = linkMatch;
        const isInternal = href.startsWith("/");
        if (isInternal) {
          nodes.push(
            <Link
              key={`l${key++}`}
              href={href}
              className="font-semibold underline underline-offset-2"
              style={{ color: "var(--accent)" }}
            >
              {label}
            </Link>
          );
        } else {
          nodes.push(
            <a
              key={`l${key++}`}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold underline underline-offset-2"
              style={{ color: "var(--accent)" }}
            >
              {label}
            </a>
          );
        }
      }
    } else if (token.startsWith("**")) {
      nodes.push(
        <strong key={`b${key++}`} style={{ color: "var(--text)" }}>
          {token.slice(2, -2)}
        </strong>
      );
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

export default function BlogPostContent({ body }: { body: BlogBlock[] }) {
  return (
    <div className="space-y-5">
      {body.map((block, i) => {
        switch (block.type) {
          case "h2":
            return (
              <h2
                key={i}
                className="text-2xl md:text-3xl font-black tracking-tight pt-6"
                style={{ color: "var(--text)" }}
              >
                {block.text}
              </h2>
            );
          case "h3":
            return (
              <h3
                key={i}
                className="text-lg md:text-xl font-bold tracking-tight pt-2"
                style={{ color: "var(--text)" }}
              >
                {block.text}
              </h3>
            );
          case "p":
            return (
              <p key={i} className="text-base leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {renderInline(block.text)}
              </p>
            );
          case "ul":
            return (
              <ul key={i} className="space-y-2 pl-5 list-disc">
                {block.items.map((item, j) => (
                  <li key={j} className="text-base leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    {renderInline(item)}
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="space-y-2 pl-5 list-decimal">
                {block.items.map((item, j) => (
                  <li key={j} className="text-base leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    {renderInline(item)}
                  </li>
                ))}
              </ol>
            );
          case "quote":
            return (
              <blockquote
                key={i}
                className="pl-4 py-1 text-base italic leading-relaxed border-l-2"
                style={{ color: "var(--text-secondary)", borderColor: "var(--accent)" }}
              >
                {renderInline(block.text)}
              </blockquote>
            );
          case "cta":
            return (
              <div
                key={i}
                className="rounded-xl p-5 my-2 flex flex-col sm:flex-row sm:items-center gap-4 justify-between"
                style={{ background: "var(--bg-raised)", border: "1px solid var(--border)" }}
              >
                <p className="text-base leading-relaxed m-0" style={{ color: "var(--text-secondary)" }}>
                  {renderInline(block.text)}
                </p>
                <Link
                  href={block.href}
                  className="shrink-0 inline-flex items-center justify-center font-bold text-sm px-5 py-2.5 rounded-lg"
                  style={{ background: "var(--accent)", color: "#0a0a0a" }}
                >
                  {block.label}
                </Link>
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
