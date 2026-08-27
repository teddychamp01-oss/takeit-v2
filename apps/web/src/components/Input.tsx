import { forwardRef, useId, type InputHTMLAttributes } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, id, className = '', ...rest },
  ref,
) {
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
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`w-full min-h-touch rounded-xl border bg-white px-4 text-base text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-primary ${error ? 'border-status-disputed' : 'border-ink/15'} ${className}`}
        {...rest}
      />
      {error ? (
        <p id={`${inputId}-error`} className="mt-1 text-sm text-status-disputed">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="mt-1 text-sm text-ink-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
