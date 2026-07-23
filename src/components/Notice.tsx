type NoticeProps = {
  error?: string;
  notice?: string;
};

export function Notice({ error, notice }: NoticeProps) {
  const message = error ?? notice;
  if (!message) return null;

  return (
    <div className={`notice ${error ? "notice-error" : ""}`} role="status">
      {message}
    </div>
  );
}

