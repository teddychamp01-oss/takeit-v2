import { forwardRef, useId, type SelectHTMLAttributes } from 'react';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ label, error, id, className = '', children, ...rest }, ref) {
    const autoId = useId();
    const selectId = id ?? autoId;
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={selectId}
            className="mb-1 block text-sm font-medium text-ink"
          >
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${selectId}-error` : undefined}
          className={`w-full min-h-touch appearance-none rounded-xl border bg-white px-4 text-base text-ink focus:outline-none focus:ring-2 focus:ring-primary ${error ? 'border-status-disputed' : 'border-ink/15'} ${className}`}
          {...rest}
        >
          {children}
        </select>
        {error && (
          <p
            id={`${selectId}-error`}
            className="mt-1 text-sm text-status-disputed"
          >
            {error}
          </p>
        )}
      </div>
    );
  },
);
