// Gate-2 proofs for the three ChatSection changes. Each of these fails
// against the pre-change component — see the report for the observed failure.
//
//   A6  — a realtime row that lands BEFORE the initial fetch settles must
//         still appear. The old handler dropped it on the floor.
//   A12 — typing must not re-render the message list. Observed through
//         formatRelativeTime, which the list calls once per message per
//         render; with the draft in ChatSection every keystroke re-ran it.
//   A14 — a burst of inbound rows must collapse to ONE
//         markBookingMessagesRead, and a pending one must still flush.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LocaleProvider } from '../../../lib/i18n';
import type { MessageRow } from '../types';

const api = vi.hoisted(() => ({
  fetchMessages: vi.fn(),
  fetchMessageById: vi.fn(),
  markBookingMessagesRead: vi.fn(),
  sendMessage: vi.fn(),
  subscribeToBookingMessages: vi.fn(),
  unsubscribe: vi.fn(),
  /** The handler ChatSection passed to subscribeToBookingMessages. */
  onInsert: null as null | ((m: MessageRow) => void),
}));

vi.mock('../api', () => ({
  MESSAGES_LIMIT: 200,
  fetchMessages: api.fetchMessages,
  fetchMessageById: api.fetchMessageById,
  markBookingMessagesRead: api.markBookingMessagesRead,
  sendMessage: api.sendMessage,
  subscribeToBookingMessages: api.subscribeToBookingMessages,
}));

// Spy that still runs the real formatter — the call COUNT is the signal.
const format = vi.hoisted(() => ({ relativeTime: vi.fn() }));
vi.mock('../../../lib/format', async () => {
  const real =
    await vi.importActual<typeof import('../../../lib/format')>(
      '../../../lib/format',
    );
  return {
    ...real,
    formatRelativeTime: (...args: Parameters<typeof real.formatRelativeTime>) => {
      format.relativeTime(...args);
      return real.formatRelativeTime(...args);
    },
  };
});

import { ChatSection, MARK_READ_DEBOUNCE_MS } from '../ChatSection';

const UID = 'me-0001';
const OTHER = 'them-0002';

function message(id: string, body: string, sender = OTHER): MessageRow {
  return {
    id,
    booking_id: 'b1',
    sender_id: sender,
    body,
    created_at: `2026-08-28T10:0${id.length}:00Z`,
    read_at: null,
  } as MessageRow;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderChat() {
  return render(
    <MemoryRouter>
      <LocaleProvider>
        <ChatSection bookingId="b1" uid={UID} status="confirmed" />
      </LocaleProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  api.onInsert = null;
  api.fetchMessages.mockReset();
  api.fetchMessageById.mockReset().mockResolvedValue(null);
  api.markBookingMessagesRead.mockReset().mockResolvedValue(undefined);
  api.sendMessage.mockReset();
  api.unsubscribe.mockReset();
  api.subscribeToBookingMessages
    .mockReset()
    .mockImplementation((_id: string, cb: (m: MessageRow) => void) => {
      api.onInsert = cb;
      return api.unsubscribe;
    });
  format.relativeTime.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ChatSection — A6 realtime before the snapshot settles', () => {
  it('shows a row that arrived while the initial fetch was still in flight', async () => {
    const d = deferred<{ rows: MessageRow[]; total: number }>();
    api.fetchMessages.mockReturnValue(d.promise);
    renderChat();

    // The channel joined and delivered a row; fetchMessages has NOT settled.
    expect(api.onInsert).not.toBeNull();
    act(() => api.onInsert!(message('m-early', 'ቀድሞ የደረሰ መልእክት')));

    await act(async () => {
      d.resolve({ rows: [], total: 0 });
      await d.promise;
    });

    // Pre-fix this row was discarded and stayed invisible until a reload.
    expect(screen.getByText('ቀድሞ የደረሰ መልእክት')).toBeInTheDocument();
  });

  it('merges the buffered row exactly once when the snapshot also has it', async () => {
    const d = deferred<{ rows: MessageRow[]; total: number }>();
    api.fetchMessages.mockReturnValue(d.promise);
    renderChat();

    const row = message('m-dup', 'ድርብ መልእክት');
    act(() => api.onInsert!(row));
    await act(async () => {
      d.resolve({ rows: [row], total: 1 });
      await d.promise;
    });

    expect(screen.getAllByText('ድርብ መልእክት')).toHaveLength(1);
  });
});

describe('ChatSection — A12 composer owns the draft', () => {
  it('typing does not re-render the message list', async () => {
    api.fetchMessages.mockResolvedValue({
      rows: [message('m1', 'one'), message('m2', 'two')],
      total: 2,
    });
    renderChat();
    await act(async () => {});

    const textarea = screen.getByRole('textbox');
    const before = format.relativeTime.mock.calls.length;
    expect(before).toBeGreaterThan(0); // the list really did render

    for (const value of ['s', 'se', 'sel', 'sela', 'selam']) {
      fireEvent.change(textarea, { target: { value } });
    }

    // Pre-fix: 5 keystrokes × 2 messages = 10 extra formatter calls.
    expect(format.relativeTime.mock.calls.length).toBe(before);
    expect(textarea).toHaveValue('selam'); // still a controlled input
  });
});

describe('ChatSection — A14 debounced mark-read', () => {
  it('collapses a burst of inbound rows into one request, then flushes on unmount', async () => {
    vi.useFakeTimers();
    api.fetchMessages.mockResolvedValue({ rows: [], total: 0 });
    const { unmount } = renderChat();
    await act(async () => {});

    // The initial-load mark is itself debounced; let it fire and reset.
    await act(async () => {
      vi.advanceTimersByTime(MARK_READ_DEBOUNCE_MS + 10);
    });
    expect(api.markBookingMessagesRead).toHaveBeenCalledTimes(1);
    api.markBookingMessagesRead.mockClear();

    act(() => {
      api.onInsert!(message('a', 'one'));
      api.onInsert!(message('b', 'two'));
      api.onInsert!(message('c', 'three'));
    });
    // Pre-fix: three rows meant three immediate UPDATEs.
    expect(api.markBookingMessagesRead).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(MARK_READ_DEBOUNCE_MS + 10);
    });
    expect(api.markBookingMessagesRead).toHaveBeenCalledTimes(1);
    expect(api.markBookingMessagesRead).toHaveBeenCalledWith('b1', UID);

    // A pending mark must NOT be silently dropped by unmounting.
    api.markBookingMessagesRead.mockClear();
    act(() => {
      api.onInsert!(message('d', 'four'));
    });
    unmount();
    expect(api.markBookingMessagesRead).toHaveBeenCalledTimes(1);
  });

  it('does not mark read for my own outgoing rows', async () => {
    vi.useFakeTimers();
    api.fetchMessages.mockResolvedValue({ rows: [], total: 0 });
    renderChat();
    await act(async () => {});
    await act(async () => {
      vi.advanceTimersByTime(MARK_READ_DEBOUNCE_MS + 10);
    });
    api.markBookingMessagesRead.mockClear();

    act(() => api.onInsert!(message('mine', 'hi', UID)));
    await act(async () => {
      vi.advanceTimersByTime(MARK_READ_DEBOUNCE_MS + 10);
    });
    expect(api.markBookingMessagesRead).not.toHaveBeenCalled();
  });
});
