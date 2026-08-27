// ROUTES CONTRACT — every path below is registered now as a lazy import of
// its exact feature file. Feature agents replace the page files; they do NOT
// need to touch this file unless adding a NEW route.

import { lazy, Suspense, type ReactNode } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { RequireAuth } from './components/RequireAuth';
import { RequireRole } from './components/RequireRole';
import { SpinnerBlock } from './components/Spinner';
import { EmptyState } from './components/EmptyState';
import { useT } from './lib/i18n';

const HomePage = lazy(() => import('./features/home/HomePage'));
const AuthPage = lazy(() => import('./features/auth/AuthPage'));
const OnboardingPage = lazy(() => import('./features/auth/OnboardingPage'));
const BrowsePage = lazy(() => import('./features/browse/BrowsePage'));
const CategoryPage = lazy(() => import('./features/browse/CategoryPage'));
const WorkerDetailPage = lazy(
  () => import('./features/browse/WorkerDetailPage'),
);
const PostJobPage = lazy(() => import('./features/jobs/PostJobPage'));
const MyJobsPage = lazy(() => import('./features/jobs/MyJobsPage'));
const JobDetailPage = lazy(() => import('./features/jobs/JobDetailPage'));
const InboxPage = lazy(() => import('./features/bookings/InboxPage'));
const BookingPage = lazy(() => import('./features/bookings/BookingPage'));
const MePage = lazy(() => import('./features/profile/MePage'));
const WorkerProfileEditPage = lazy(
  () => import('./features/profile/WorkerProfileEditPage'),
);
const VerificationPage = lazy(
  () => import('./features/profile/VerificationPage'),
);
const SafetyPage = lazy(() => import('./features/profile/SafetyPage'));
const AdminPage = lazy(() => import('./features/admin/AdminPage'));

function Page({ children }: { children: ReactNode }) {
  return <Suspense fallback={<SpinnerBlock />}>{children}</Suspense>;
}

function NotFound() {
  const t = useT();
  return (
    <EmptyState
      title={t('common.notFoundTitle')}
      body={t('common.notFoundBody')}
      action={
        <Link to="/" className="font-semibold text-primary-600 underline">
          {t('common.goHome')}
        </Link>
      }
    />
  );
}

export function AppRoutes() {
  return (
    <Routes>
      {/* Outside the shell — no bottom nav during auth/onboarding */}
      <Route
        path="/auth"
        element={
          <Page>
            <AuthPage />
          </Page>
        }
      />
      <Route
        path="/onboarding"
        element={
          <Page>
            <RequireAuth>
              <OnboardingPage />
            </RequireAuth>
          </Page>
        }
      />

      <Route element={<AppShell />}>
        <Route
          path="/"
          element={
            <Page>
              <HomePage />
            </Page>
          }
        />
        <Route
          path="/browse"
          element={
            <Page>
              <BrowsePage />
            </Page>
          }
        />
        <Route
          path="/browse/c/:slug"
          element={
            <Page>
              <CategoryPage />
            </Page>
          }
        />
        <Route
          path="/workers/:id"
          element={
            <Page>
              <WorkerDetailPage />
            </Page>
          }
        />
        <Route
          path="/post"
          element={
            <Page>
              <RequireAuth>
                <PostJobPage />
              </RequireAuth>
            </Page>
          }
        />
        <Route
          path="/jobs"
          element={
            <Page>
              <RequireAuth>
                <MyJobsPage />
              </RequireAuth>
            </Page>
          }
        />
        <Route
          path="/jobs/:id"
          element={
            <Page>
              <RequireAuth>
                <JobDetailPage />
              </RequireAuth>
            </Page>
          }
        />
        <Route
          path="/inbox"
          element={
            <Page>
              <RequireAuth>
                <InboxPage />
              </RequireAuth>
            </Page>
          }
        />
        <Route
          path="/bookings/:id"
          element={
            <Page>
              <RequireAuth>
                <BookingPage />
              </RequireAuth>
            </Page>
          }
        />
        <Route
          path="/me"
          element={
            <Page>
              <RequireAuth>
                <MePage />
              </RequireAuth>
            </Page>
          }
        />
        <Route
          path="/me/worker"
          element={
            <Page>
              <RequireAuth>
                <WorkerProfileEditPage />
              </RequireAuth>
            </Page>
          }
        />
        <Route
          path="/me/verification"
          element={
            <Page>
              <RequireAuth>
                <VerificationPage />
              </RequireAuth>
            </Page>
          }
        />
        <Route
          path="/me/safety"
          element={
            <Page>
              <RequireAuth>
                <SafetyPage />
              </RequireAuth>
            </Page>
          }
        />
        <Route
          path="/admin"
          element={
            <Page>
              <RequireAuth>
                <RequireRole roles={['admin', 'ops']}>
                  <AdminPage />
                </RequireRole>
              </RequireAuth>
            </Page>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
