interface ErrorStateProps {
  title: string;
  message: string;
  onRetry?: () => void;
}

/** In-place replacement for a block of data that failed to load. */
export function ErrorState({ title, message, onRetry }: ErrorStateProps) {
  return (
    <div className="card" role="alert" style={{ textAlign: "center", padding: "32px 20px" }}>
      <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>{title}</p>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: onRetry ? 16 : 0 }}>
        {message}
      </p>
      {onRetry && (
        <button className="btn-ghost" type="button" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
