import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useT } from '../lib/i18n';
import { Button } from './Button';

function ErrorFallback() {
  const t = useT();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-cream p-6 text-center">
      <h1 className="text-xl font-bold text-ink">{t('common.errorTitle')}</h1>
      <p className="text-ink-light">{t('common.errorBody')}</p>
      <Button onClick={() => window.location.reload()}>
        {t('common.reload')}
      </Button>
    </div>
  );
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Console only — no third-party error reporting on the client (C6/no
    // third-party hosts). Server-side observability comes later.
    console.error('[takeit] render error', error, info);
  }

  render() {
    return this.state.hasError ? <ErrorFallback /> : this.props.children;
  }
}
