import { useRef } from 'react';

// Deliberately a plain <textarea> + synced line-number gutter rather than
// Monaco — keeps the bundle light (this app already flags >500KB chunk
// warnings on build) and needs no setup. Swap for @monaco-editor/react
// later if richer editing is worth the extra weight.
export default function CodeEditor({ value, onChange, disabled }) {
  const textareaRef = useRef(null);
  const gutterRef = useRef(null);

  const lineCount = (value.match(/\n/g)?.length ?? 0) + 1;

  function handleScroll() {
    if (gutterRef.current && textareaRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }

  function handleKeyDown(e) {
    // Tab inserts two spaces instead of moving focus away — expected editor
    // behavior for code, and without it Tab is unusable for indentation.
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = textareaRef.current;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = value.slice(0, start) + '  ' + value.slice(end);
      onChange(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 2;
      });
    }
  }

  return (
    <div className="flex bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden font-mono text-sm">
      <pre
        ref={gutterRef}
        className="select-none text-right px-3 py-4 text-[var(--color-text-tertiary)] overflow-hidden"
        style={{ lineHeight: '1.5rem' }}
        aria-hidden="true"
      >
        {Array.from({ length: lineCount }, (_, i) => i + 1).join('\n')}
      </pre>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className="flex-1 bg-transparent text-white px-3 py-4 outline-none resize-none"
        style={{ lineHeight: '1.5rem', minHeight: '320px' }}
      />
    </div>
  );
}
