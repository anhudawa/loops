"use client";

interface ShowRoutesButtonProps {
  count: number;
  onClick: () => void;
}

export default function ShowRoutesButton({
  count,
  onClick,
}: ShowRoutesButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        position: "fixed",
        bottom: "1rem",
        left: "1rem",
        right: "1rem",
        zIndex: 40,
        minHeight: "44px",
        padding: "0.875rem 1.5rem",
        backgroundColor: "var(--accent)",
        color: "var(--bg)",
        border: "none",
        borderRadius: "0.75rem",
        fontWeight: 700,
        fontSize: "1rem",
        cursor: "pointer",
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        transition: "opacity 0.15s ease",
      }}
      className="md:!hidden"
    >
      Show {count} Route{count !== 1 ? "s" : ""}
    </button>
  );
}
