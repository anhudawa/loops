import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import JsonLd from "@/components/JsonLd";
import BlogPostContent from "@/components/BlogPostContent";
import { generateBreadcrumbJsonLd, generateFaqJsonLd } from "@/lib/seo";
import { getAllSlugs, getAllPosts, getPostBySlug, postPlainText, type BlogPost } from "@/lib/blog";

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};

  return {
    title: `${post.title} — LOOPS`,
    description: post.description,
    keywords: post.keywords,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: {
      title: post.title,
      description: post.description,
      url: `https://www.loops.ie/blog/${slug}`,
      type: "article",
      publishedTime: post.date,
      modifiedTime: post.updated ?? post.date,
      authors: [post.author],
      ...(post.coverImage && {
        images: [{ url: post.coverImage, width: 1200, height: 630, alt: post.title }],
      }),
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
      ...(post.coverImage && { images: [post.coverImage] }),
    },
  };
}

function articleJsonLd(post: BlogPost) {
  const url = `https://www.loops.ie/blog/${post.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    articleBody: postPlainText(post),
    datePublished: post.date,
    dateModified: post.updated ?? post.date,
    keywords: post.keywords.join(", "),
    articleSection: post.category,
    inLanguage: "en",
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    author: { "@type": "Organization", name: post.author, url: "https://www.loops.ie" },
    publisher: {
      "@type": "Organization",
      name: "LOOPS",
      url: "https://www.loops.ie",
    },
    // Fall back to the site OG image when a post has no dedicated cover.
    image: [post.coverImage ?? "https://www.loops.ie/api/og"],
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const dateLabel = new Date(post.date).toLocaleDateString("en-IE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const breadcrumb = generateBreadcrumbJsonLd([
    { name: "Home", url: "https://www.loops.ie" },
    { name: "Blog", url: "https://www.loops.ie/blog" },
    { name: post.title, url: `https://www.loops.ie/blog/${post.slug}` },
  ]);

  // Related posts: same category first, then fill, excluding current.
  const related = getAllPosts()
    .filter((p) => p.slug !== post.slug)
    .sort((a, b) => Number(b.category === post.category) - Number(a.category === post.category))
    .slice(0, 3);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <JsonLd data={articleJsonLd(post)} />
      <JsonLd data={generateFaqJsonLd(post.faqs)} />
      <JsonLd data={breadcrumb} />

      {/* Header */}
      <header className="sticky top-0 z-40 border-b" style={{ background: "var(--bg)", borderColor: "var(--border)" }}>
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/" className="font-black text-xl tracking-tight" style={{ color: "var(--accent)" }}>
            LOOPS
          </Link>
          <span style={{ color: "var(--border-light)" }} aria-hidden="true">/</span>
          <Link href="/blog" className="text-sm font-semibold hover:opacity-80" style={{ color: "var(--text-muted)" }}>
            Blog
          </Link>
          <span style={{ color: "var(--border-light)" }} aria-hidden="true">/</span>
          <span className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>
            {post.category}
          </span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10">
        <article>
          {/* Title block */}
          <div className="mb-8">
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

            <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-3 leading-tight" style={{ color: "var(--text)" }}>
              {post.title}
            </h1>

            <p className="text-lg leading-relaxed mb-4" style={{ color: "var(--text-muted)" }}>
              {post.excerpt}
            </p>

            <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
              <span>{post.author}</span>
              <span style={{ color: "var(--border-light)" }} aria-hidden="true">·</span>
              <time dateTime={post.date}>{dateLabel}</time>
            </div>
          </div>

          {/* Body */}
          <BlogPostContent body={post.body} />

          {/* FAQ */}
          {post.faqs.length > 0 && (
            <section className="mt-12 pt-8 border-t" style={{ borderColor: "var(--border)" }}>
              <h2 className="text-2xl md:text-3xl font-black tracking-tight mb-6" style={{ color: "var(--text)" }}>
                Frequently asked questions
              </h2>
              <div className="space-y-6">
                {post.faqs.map((faq, i) => (
                  <div key={i}>
                    <h3 className="text-lg font-bold mb-1" style={{ color: "var(--text)" }}>
                      {faq.question}
                    </h3>
                    <p className="text-base leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                      {faq.answer}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* End CTA */}
          <div
            className="mt-12 rounded-xl p-6 text-center"
            style={{ background: "var(--bg-raised)", border: "1px solid var(--border)" }}
          >
            <h2 className="text-xl font-black tracking-tight mb-2" style={{ color: "var(--text)" }}>
              Plan your next ride with LOOPS
            </h2>
            <p className="text-sm leading-relaxed mb-4 max-w-md mx-auto" style={{ color: "var(--text-muted)" }}>
              Tell our AI where you are, how long you want to ride and the training you&apos;re doing — get a
              route that fits.
            </p>
            <Link
              href="/generate"
              className="inline-flex items-center justify-center font-bold text-sm px-6 py-3 rounded-lg"
              style={{ background: "var(--accent)", color: "#0a0a0a" }}
            >
              Generate a route
            </Link>
          </div>
        </article>

        {/* Related */}
        {related.length > 0 && (
          <section className="mt-12 pt-8 border-t" style={{ borderColor: "var(--border)" }}>
            <h2 className="text-lg font-black tracking-tight mb-4" style={{ color: "var(--text)" }}>
              Keep reading
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {related.map((r) => (
                <Link key={r.slug} href={`/blog/${r.slug}`} aria-label={r.title}>
                  <div
                    className="card-hover rounded-xl p-4 h-full"
                    style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
                  >
                    <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                      {r.category}
                    </span>
                    <h3 className="text-sm font-bold mt-1 leading-snug" style={{ color: "var(--text)" }}>
                      {r.title}
                    </h3>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
