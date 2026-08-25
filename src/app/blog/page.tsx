import type { Metadata } from "next";
import Link from "next/link";
import JsonLd from "@/components/JsonLd";
import { getAllPosts, getPostsGroupedByCategory, type BlogPost } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Road Cycling Training Guides — LOOPS",
  description:
    "Practical endurance and interval training guidance for road cyclists, with clear limits on which sessions LOOPS currently matches.",
  alternates: { canonical: "/blog" },
  keywords: [
    "cycling blog",
    "cycling training",
    "Zone 2 cycling",
    "threshold intervals",
    "VO2 max intervals",
    "cycling guides",
  ],
  openGraph: {
    title: "Road Cycling Training Guides — LOOPS",
    description:
      "Practical outdoor endurance and interval training guidance from LOOPS.",
    url: "https://www.loops.ie/blog",
    type: "website",
  },
};

const CATEGORY_BLURB: Record<string, string> = {
  Destinations: "Published only when the destination guidance is backed by approved local route evidence.",
  Training: "How to ride. Evidence-based interval and endurance training, applied outdoors.",
  Product: "How LOOPS helps you find and plan routes that fit your training and your trip.",
};

function PostCard({ post }: { post: BlogPost }) {
  const dateLabel = new Date(post.date).toLocaleDateString("en-IE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <Link href={`/blog/${post.slug}`} aria-label={post.title}>
      <article
        className="card-hover rounded-xl overflow-hidden h-full flex flex-col p-5"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2 mb-3">
          <span
            className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
            style={{ color: "var(--text)", background: "var(--bg-raised)", border: "1px solid var(--border)" }}
          >
            {post.category}
          </span>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {post.readingTime} min read
          </span>
        </div>
        <h3 className="text-lg font-bold tracking-tight mb-2 leading-snug" style={{ color: "var(--text)" }}>
          {post.title}
        </h3>
        <p className="text-sm leading-relaxed mb-4 flex-1" style={{ color: "var(--text-muted)" }}>
          {post.excerpt}
        </p>
        <time className="text-xs" style={{ color: "var(--text-muted)" }} dateTime={post.date}>
          {dateLabel}
        </time>
      </article>
    </Link>
  );
}

export default function BlogIndexPage() {
  const groups = getPostsGroupedByCategory();
  const allPosts = getAllPosts();

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "LOOPS Cycling Blog",
    url: "https://www.loops.ie/blog",
    description:
      "Road cycling destination guides and training advice from LOOPS — built around human-ridden, reviewed routes.",
    blogPost: allPosts.map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      url: `https://www.loops.ie/blog/${p.slug}`,
      datePublished: p.date,
      dateModified: p.updated ?? p.date,
      description: p.description,
      author: { "@type": "Organization", name: "LOOPS" },
    })),
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <JsonLd data={itemListJsonLd} />

      {/* Header */}
      <header className="sticky top-0 z-40 border-b" style={{ background: "var(--bg)", borderColor: "var(--border)" }}>
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-4">
          <Link href="/" className="font-black text-xl tracking-tight" style={{ color: "var(--accent)" }}>
            LOOPS
          </Link>
          <span style={{ color: "var(--border-light)" }} aria-hidden="true">/</span>
          <span className="font-semibold text-sm" style={{ color: "var(--text)" }}>
            Blog
          </span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10">
        <div className="mb-10">
          <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-2" style={{ color: "var(--text)" }}>
            Road cycling training guides
          </h1>
          <p className="text-base max-w-2xl leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Practical training advice you can take outdoors. Match a supported session only against our{" "}
            <Link href="/generate" className="font-semibold underline underline-offset-2" style={{ color: "var(--accent)" }}>
              human-ridden route library
            </Link>
            .
          </p>
        </div>

        <div className="space-y-12">
          {groups.map(({ category, posts }) => (
            <section key={category}>
              <div className="mb-4">
                <h2 className="text-xl font-black tracking-tight" style={{ color: "var(--text)" }}>
                  {category}
                </h2>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  {CATEGORY_BLURB[category]}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {posts.map((post) => (
                  <PostCard key={post.slug} post={post} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
