// Gate-2 proofs for the two MyJobsPage changes. Both fail against the
// pre-change page — see the report for the observed failures.
//
//   A8 — the per-tab query must WAIT for fetchOwnFlags. `tab` starts at
//        'mine' and flips to 'feed' for a worker-only account as soon as the
//        flags land, so firing first issued a fetchMyJobs whose answer was
//        thrown away and whose rows were never on screen.
//   A5 — the effects key on user.id, not the User OBJECT. supabase-js hands
//        SessionProvider a brand-new object on every auth event (a token
//        refresh is one), and with `[user]` deps every one of those re-ran
//        all three fetches and reset the visible list to a spinner.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { LocaleProvider } from '../../../lib/i18n';

const jobsApi = vi.hoisted(() => ({
  fetchActiveCategories: vi.fn(),
  fetchMyJobs: vi.fn(),
  fetchOpenJobsFeed: vi.fn(),
  fetchOwnApplications: vi.fn(),
  fetchOwnFlags: vi.fn(),
}));
vi.mock('../api', () => jobsApi);

const profileApi = vi.hoisted(() => ({
  fetchOwnProfile: vi.fn(),
  fetchOwnWorkerProfile: vi.fn(),
}));
vi.mock('../../profile/api', () => profileApi);

const session = vi.hoisted(() => ({
  state: { user: null as User | null, session: null, loading: false },
}));
vi.mock('../../../hooks/useSession', () => ({
  useSession: () => session.state,
}));

import MyJobsPage from '../MyJobsPage';

/** A distinct object each time, same id — exactly what a token refresh does. */
const userWithId = (id: string) => ({ id }) as User;

const EMPTY_PAGE = { rows: [], total: 0 };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <LocaleProvider>
        <MyJobsPage />
      </LocaleProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  session.state = { user: userWithId('u-1'), session: null, loading: false };
  jobsApi.fetchActiveCategories.mockReset().mockResolvedValue([]);
  jobsApi.fetchMyJobs.mockReset().mockResolvedValue(EMPTY_PAGE);
  jobsApi.fetchOpenJobsFeed.mockReset().mockResolvedValue(EMPTY_PAGE);
  jobsApi.fetchOwnApplications.mockReset().mockResolvedValue(EMPTY_PAGE);
  jobsApi.fetchOwnFlags.mockReset();
  profileApi.fetchOwnProfile.mockReset().mockResolvedValue(null);
  profileApi.fetchOwnWorkerProfile.mockReset().mockResolvedValue(null);
});

describe('MyJobsPage — A8 hold the tab query until the flags resolve', () => {
  it('issues no list query while fetchOwnFlags is still in flight', async () => {
    const flags = deferred<unknown>();
    jobsApi.fetchOwnFlags.mockReturnValue(flags.promise);
    renderPage();

    // Pre-fix: fetchMyJobs fired here, beside the flags query.
    expect(jobsApi.fetchMyJobs).not.toHaveBeenCalled();
    expect(jobsApi.fetchOpenJobsFeed).not.toHaveBeenCalled();

    await act(async () => {
      flags.resolve({
        is_worker: false,
        is_customer: true,
        default_neighborhood: null,
      });
      await flags.promise;
    });
    expect(jobsApi.fetchMyJobs).toHaveBeenCalledTimes(1);
    expect(jobsApi.fetchMyJobs).toHaveBeenCalledWith('u-1');
  });

  it('a worker-only account never issues the customer query at all', async () => {
    jobsApi.fetchOwnFlags.mockResolvedValue({
      is_worker: true,
      is_customer: false,
      default_neighborhood: null,
    });
    renderPage();
    await act(async () => {});

    // Pre-fix: one wasted fetchMyJobs, then the feed query it flipped to.
    expect(jobsApi.fetchMyJobs).not.toHaveBeenCalled();
    expect(jobsApi.fetchOpenJobsFeed).toHaveBeenCalledTimes(1);
  });

  it('still loads nothing for a signed-out render', async () => {
    session.state = { user: null, session: null, loading: false };
    jobsApi.fetchOwnFlags.mockResolvedValue(null);
    renderPage();
    await act(async () => {});
    expect(jobsApi.fetchOwnFlags).not.toHaveBeenCalled();
    expect(jobsApi.fetchMyJobs).not.toHaveBeenCalled();
  });
});

describe('MyJobsPage — A5 effects key on user.id, not the User object', () => {
  it('a new User object with the same id refetches nothing', async () => {
    jobsApi.fetchOwnFlags.mockResolvedValue({
      is_worker: true,
      is_customer: true,
      default_neighborhood: null,
    });
    const { rerender } = renderPage();
    await act(async () => {});

    expect(jobsApi.fetchOwnFlags).toHaveBeenCalledTimes(1);
    expect(jobsApi.fetchMyJobs).toHaveBeenCalledTimes(1);
    expect(profileApi.fetchOwnWorkerProfile).toHaveBeenCalledTimes(1);

    // A token refresh: same signed-in person, brand-new object.
    session.state = { user: userWithId('u-1'), session: null, loading: false };
    await act(async () => {
      rerender(
        <MemoryRouter>
          <LocaleProvider>
            <MyJobsPage />
          </LocaleProvider>
        </MemoryRouter>,
      );
    });

    // Pre-fix: 2, 2 and 2 — and the visible list went back to a spinner.
    expect(jobsApi.fetchOwnFlags).toHaveBeenCalledTimes(1);
    expect(jobsApi.fetchMyJobs).toHaveBeenCalledTimes(1);
    expect(profileApi.fetchOwnWorkerProfile).toHaveBeenCalledTimes(1);
  });

  it('a DIFFERENT signed-in user does refetch (the dep still works)', async () => {
    jobsApi.fetchOwnFlags.mockResolvedValue({
      is_worker: false,
      is_customer: true,
      default_neighborhood: null,
    });
    const { rerender } = renderPage();
    await act(async () => {});
    expect(jobsApi.fetchMyJobs).toHaveBeenCalledTimes(1);

    session.state = { user: userWithId('u-2'), session: null, loading: false };
    await act(async () => {
      rerender(
        <MemoryRouter>
          <LocaleProvider>
            <MyJobsPage />
          </LocaleProvider>
        </MemoryRouter>,
      );
    });
    expect(jobsApi.fetchOwnFlags).toHaveBeenCalledTimes(2);
    expect(jobsApi.fetchMyJobs).toHaveBeenCalledTimes(2);
    expect(jobsApi.fetchMyJobs).toHaveBeenLastCalledWith('u-2');
  });
});
