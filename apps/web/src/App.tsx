import { BrowserRouter } from 'react-router-dom';
import { LocaleProvider } from './lib/i18n';
import { SessionProvider } from './hooks/useSession';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppRoutes } from './routes';

export default function App() {
  return (
    <LocaleProvider>
      <ErrorBoundary>
        <SessionProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </SessionProvider>
      </ErrorBoundary>
    </LocaleProvider>
  );
}
