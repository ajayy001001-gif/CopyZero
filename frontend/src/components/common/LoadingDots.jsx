export default function LoadingDots({ text = 'Loading' }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="dots-pulse">
        <span></span>
        <span></span>
        <span></span>
      </div>
      {text && (
        <span className="text-sm text-[var(--color-text-secondary)]">
          {text}
        </span>
      )}
    </div>
  );
}
