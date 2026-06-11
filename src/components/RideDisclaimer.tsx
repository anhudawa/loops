/**
 * Ride-at-your-own-risk disclaimer (launch spec §6: surfaced, never
 * buried). Shown on route detail pages and under generated results.
 */
export default function RideDisclaimer() {
  return (
    <p
      className="text-[11px] leading-relaxed mt-3 mb-1"
      style={{ color: "var(--text-muted)" }}
      role="note"
    >
      Ride at your own risk. Roads, surfaces and conditions change — check
      the weather, carry what you need, obey traffic law and use your own
      judgement. Route information is provided as a guide only.
    </p>
  );
}
