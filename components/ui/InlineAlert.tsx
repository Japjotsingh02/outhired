interface InlineAlertProps {
  variant?: "error" | "info";
  children: React.ReactNode;
  /** Optional single action, for example "Retry" or a link to the fix. */
  action?: { label: string; onClick?: () => void; href?: string };
}

/** Message for a failure tied to a form or panel. Errors announce as alerts, info as status. */
export function InlineAlert({ variant = "error", children, action }: InlineAlertProps) {
  const isError = variant === "error";
  const accent = isError ? "var(--red)" : "var(--blue)";
  return (
    <div
      role={isError ? "alert" : "status"}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
        padding: "10px 14px",
        borderLeft: `2px solid ${accent}`,
        background: isError ? "var(--red-soft)" : "rgba(122,143,163,0.12)",
        color: isError ? "#e9a093" : "var(--text-secondary)",
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      <span style={{ flex: 1, minWidth: 180 }}>{children}</span>
      {action &&
        (action.href ? (
          <a className="btn-ghost" href={action.href} style={{ textDecoration: "none" }}>
            {action.label}
          </a>
        ) : (
          <button className="btn-ghost" type="button" onClick={action.onClick}>
            {action.label}
          </button>
        ))}
    </div>
  );
}
