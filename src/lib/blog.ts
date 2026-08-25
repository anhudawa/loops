// Blog content system for loops.ie
//
// Posts are authored as typed TS data files in src/content/blog/*.ts.
// We avoid a markdown runtime dependency (no node_modules at build-author time
// for some tooling) and instead use a small, fully-typed content-block model.
// This keeps headings/structure explicit (good for SEO + answer engines) and
// lets us emit clean JSON-LD from the same source of truth.

export type BlogCategory = "Destinations" | "Training" | "Product";

/** A single FAQ entry — surfaced as on-page H3s and as FAQPage JSON-LD. */
export interface BlogFaq {
  question: string;
  answer: string;
}

/**
 * Content blocks. Kept intentionally small so posts read like prose in source
 * while still producing semantic HTML (proper h2/h3, lists, links, callouts).
 */
export type BlogBlock =
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "quote"; text: string }
  // A highlighted call-to-action box, typically linking to /generate or a collection.
  | { type: "cta"; text: string; href: string; label: string };

export interface BlogPost {
  slug: string;
  title: string;
  /** Meta description + OpenGraph description. Keep ~150-160 chars. */
  description: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  /** ISO date of last meaningful update. Defaults to `date`. */
  updated?: string;
  category: BlogCategory;
  keywords: string[];
  /** One-line dek shown under the H1 and in the index card. */
  excerpt: string;
  /** Estimated reading time in minutes. */
  readingTime: number;
  /** Author name for Article JSON-LD byline. */
  author: string;
  /** Optional hero/OG image (absolute path or URL). */
  coverImage?: string;
  /** Body content, rendered in order. The H1 is the `title`; use h2/h3 here. */
  body: BlogBlock[];
  /** FAQ pairs — rendered on page and as FAQPage JSON-LD. */
  faqs: BlogFaq[];
}

import { girona } from "@/content/blog/cycling-in-girona-complete-guide";
import { mallorca } from "@/content/blog/cycling-in-mallorca-routes-climbs-when-to-go";
import { winterCamps } from "@/content/blog/best-winter-cycling-training-camps-europe";
import { zone2 } from "@/content/blog/how-to-structure-a-zone-2-endurance-ride";
import { thresholdIntervals } from "@/content/blog/where-to-do-threshold-intervals-safely-outdoors";
import { vo2max } from "@/content/blog/vo2-max-intervals-complete-outdoor-guide";
import { wicklow } from "@/content/blog/cycling-in-wicklow-dublins-mountain-playground";

/** All posts. Newest-first ordering is applied by helpers. */
const POSTS: BlogPost[] = [
  girona,
  mallorca,
  winterCamps,
  zone2,
  thresholdIntervals,
  vo2max,
  wicklow,
];

export const BLOG_CATEGORIES: BlogCategory[] = ["Destinations", "Training", "Product"];

function byDateDesc(a: BlogPost, b: BlogPost): number {
  return b.date.localeCompare(a.date);
}

export function getAllPosts(): BlogPost[] {
  return [...POSTS].sort(byDateDesc);
}

export function getAllSlugs(): string[] {
  return POSTS.map((p) => p.slug);
}

export function getPostBySlug(slug: string): BlogPost | undefined {
  return POSTS.find((p) => p.slug === slug);
}

export function getPostsByCategory(category: BlogCategory): BlogPost[] {
  return getAllPosts().filter((p) => p.category === category);
}

/** Grouped, ordered map for the index page. Empty categories are omitted. */
export function getPostsGroupedByCategory(): { category: BlogCategory; posts: BlogPost[] }[] {
  return BLOG_CATEGORIES.map((category) => ({
    category,
    posts: getPostsByCategory(category),
  })).filter((g) => g.posts.length > 0);
}

/** Plain-text rendering of the body — used as articleBody in Article JSON-LD. */
export function postPlainText(post: BlogPost): string {
  const parts: string[] = [post.excerpt];
  for (const block of post.body) {
    switch (block.type) {
      case "h2":
      case "h3":
      case "p":
      case "quote":
        parts.push(block.text);
        break;
      case "ul":
      case "ol":
        parts.push(block.items.join(" "));
        break;
      case "cta":
        parts.push(block.text);
        break;
    }
  }
  return parts.join(" ");
}

export const BLOG_BASE_URL = "https://www.loops.ie/blog";
