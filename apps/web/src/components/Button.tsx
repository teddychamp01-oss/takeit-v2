import { forwardRef, type ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    'bg-primary text-white active:bg-primary-600 disabled:bg-primary-200',
  secondary:
    'border border-primary bg-white text-primary-600 active:bg-primary-50 disabled:opacity-50',
  ghost: 'text-ink-light active:bg-ink/5 disabled:opacity-50',
  danger:
    'bg-status-disputed text-white active:opacity-90 disabled:opacity-50',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Stretch to full container width. */
  full?: boolean;
}

/** 44px-minimum touch target on every variant (in-cab / low-end reality). */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant = 'primary', full, className = '', type = 'button', ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={`inline-flex min-h-touch items-center justify-center gap-2 rounded-xl px-5 text-base font-semibold transition-colors ${VARIANT_CLASSES[variant]} ${full ? 'w-full' : ''} ${className}`}
        {...rest}
      />
    );
  },
);
