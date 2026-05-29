"use client";

import { useState } from "react";
import { buildRouteFaqs } from "@/lib/seo";

interface RouteFaqProps {
  routeName: string;
  distanceKm: number;
  elevationGainM: number;
  surfaceType: string;
  discipline: string;
}

export default function RouteFaq({
  routeName,
  distanceKm,
  elevationGainM,
  surfaceType,
  discipline,
}: RouteFaqProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = buildRouteFaqs({
    name: routeName,
    distance_km: distanceKm,
    elevation_gain_m: elevationGainM,
    surface_type: surfaceType,
    discipline,
  });

  return (
    <div>
      <h2 className="text-sm font-bold mb-3 uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
        FAQ
      </h2>
      <div className="space-y-1">
        {faqs.map((faq, i) => (
          <div key={i} className="rounded-lg" style={{ background: "var(--bg-raised)" }}>
            <button
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
              aria-expanded={openIndex === i}
              className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 text-sm font-medium"
              style={{ color: "var(--text)" }}
            >
              {faq.question}
              <svg
                className={`w-4 h-4 shrink-0 transition-transform ${openIndex === i ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {openIndex === i && (
              <div className="px-4 pb-3 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {faq.answer}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
