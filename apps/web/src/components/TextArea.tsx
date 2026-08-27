import { forwardRef, useId, type TextareaHTMLAttributes } from 'react';

export interface TextAreaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  function TextArea({ label, error, hint, id, className = '', rows = 4, ...rest }, ref) {
    const autoId = useId();
    const inputId = id ?? autoId;
    const describedBy = error
      ? `${inputId}-error`
      : hint
        ? `${inputId}-hint`
        : undefined;
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="mb-1 block text-sm font-medium text-ink"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          rows={rows}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`w-full rounded-xl border bg-white px-4 py-3 text-base text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-primary ${error ? 'border-status-disputed' : 'border-ink/15'} ${className}`}
          {...rest}
        />
        {error ? (
          <p
            id={`${inputId}-error`}
            className="mt-1 text-sm text-status-disputed"
          >
            {error}
          </p>
        ) : hint ? (
          <p id={`${inputId}-hint`} className="mt-1 text-sm text-ink-faint">
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);
