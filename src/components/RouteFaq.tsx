"use client";

import { useState } from "react";
import JsonLd from "@/components/JsonLd";
import { generateFaqJsonLd } from "@/lib/seo";

interface RouteFaqProps {
  routeName: string;
  distanceKm: number;
  elevationGainM: number;
  surfaceType: string;
  discipline: string;
  difficulty: string;
}

const DIFFICULTY_CONTEXT: Record<string, string> = {
  easy: "Suitable for beginners and casual riders. Mostly flat or gentle gradients.",
  moderate: "Some climbing and varied terrain. Good fitness recommended.",
  hard: "Significant climbing and technical sections. Strong fitness required.",
  expert: "Extreme terrain and sustained climbing. For experienced cyclists only.",
};

export default function RouteFaq({
  routeName,
  distanceKm,
  elevationGainM,
  surfaceType,
  discipline,
  difficulty,
}: RouteFaqProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const faqs = [
    {
      question: `How long is ${routeName}?`,
      answer: `${distanceKm}km with ${elevationGainM}m of climbing.`,
    },
    {
      question: `What surface is ${routeName}?`,
      answer: `${surfaceType.charAt(0).toUpperCase() + surfaceType.slice(1)}. Suitable for ${discipline} bikes.`,
    },
    {
      question: `How do I ride ${routeName}?`,
      answer: `Download the free GPX file and load it into Strava, Komoot, Wahoo, or Garmin.`,
    },
    {
      question: `What difficulty is ${routeName}?`,
      answer: `${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}. ${DIFFICULTY_CONTEXT[difficulty] || ""}`,
    },
  ];

  return (
    <div>
      <JsonLd data={generateFaqJsonLd(faqs)} />
      <h3 className="text-sm font-bold mb-3 uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
        FAQ
      </h3>
      <div className="space-y-1">
        {faqs.map((faq, i) => (
          <div key={i} className="rounded-lg" style={{ background: "var(--bg-raised)" }}>
            <button
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
              className="w-full text-left px-4 py-3 flex items-center justify-between text-sm font-medium"
              style={{ color: "var(--text)" }}
            >
              {faq.question}
              <svg
                className={`w-4 h-4 transition-transform ${openIndex === i ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {openIndex === i && (
              <div className="px-4 pb-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                {faq.answer}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
