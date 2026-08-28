// Booking-scoped realtime chat (SPEC C3).
//
// - Sends go through rpc_send_message ONLY (no direct insert path exists).
//   Pre-confirmation the SERVER masks phone-like content; the client also
//   runs containsPhoneNumber() on the draft (via logic.shouldWarnPhone) to
//   show the soft warning BEFORE the user sends.
// - New rows arrive over a supabase realtime channel on messages INSERT,
//   filtered to this booking; walrus applies the parties-only RLS policy.
// - After a send, the row is re-fetched AS STORED — never echo the raw
//   draft, because the server may have masked it.
//
// Three structural notes, each written after a specific defect:
//
// A6 — the channel join completes asynchronously AFTER fetchMessages is
//   issued, so a row can arrive while `messages` is still null. The old
//   handler discarded it: the row was in neither the snapshot nor the list
//   and stayed invisible until a reload. Inbound rows are now BUFFERED until
//   the snapshot settles and merged into it (repo law 6 — silence is not
//   safety, least of all in a chat).
//
// A12 — the composer owns its own draft. Keystrokes used to re-render every
//   message bubble (each one an Intl.RelativeTimeFormat call). The textarea
//   stays CONTROLLED: Amharic IME composition must not regress.
//
// A14 — markBookingMessagesRead is debounced on a trailing edge. A burst of
//   inbound messages used to fire one UPDATE per row against the same
//   predicate. A pending mark is FLUSHED on unmount, so read-receipt
//   semantics are unchanged — only the number of requests is.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useLocale } from '../../lib/i18n';
import { formatRelativeTime } from '../../lib/format';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import {
  fetchMessageById,
  fetchMessages,
  markBookingMessagesRead,
  MESSAGES_LIMIT,
  sendMessage,
  subscribeToBookingMessages,
} from './api';
import {
  appendMessage,
  canChat,
  getErrorMessage,
  MESSAGE_MAX,
  rpcErrorKey,
  shouldWarnPhone,
  validateMessageBody,
} from './logic';
import type { BookingStatus } from '../../components/StatusBadge';
import type { MessageKey } from '../../i18n';
import type { MessageRow } from './types';

/** A14 — trailing debounce window for markBookingMessagesRead. */
export const MARK_READ_DEBOUNCE_MS = 1500;

interface ChatSectionProps {
  bookingId: string;
  uid: string;
  status: BookingStatus;
}

export function ChatSection({ bookingId, uid, status }: ChatSectionProps) {
  const { locale, t } = useLocale();
  const location = useLocation();
  const [messages, setMessages] = useState<MessageRow[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadNonce, setLoadNonce] = useState(0);
  // N8 accept-to-chat: a caller (JobDetailPage after rpc_accept_application)
  // may hand over an opener via navigation state. It only PREFILLS the input
  // — the user still presses Send, so it is visibly their own message, and
  // it goes through rpc_send_message like any other (never auto-sent).
  const seededDraft = (() => {
    const seeded = (location.state as { chatDraft?: unknown } | null)?.chatDraft;
    return typeof seeded === 'string' ? seeded : '';
  })();
  const [maskedNotice, setMaskedNotice] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  // A6 — inbound rows that arrived before the snapshot settled.
  const pendingRef = useRef<MessageRow[]>([]);
  const settledRef = useRef(false);

  const open = canChat(status);

  // A14 — one pending trailing mark-read, flushed on unmount.
  const markTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markNowRef = useRef<() => void>(() => {});
  markNowRef.current = () => {
    markBookingMessagesRead(bookingId, uid).catch(() => {});
  };
  const scheduleMarkRead = useCallback(() => {
    if (markTimerRef.current !== null) clearTimeout(markTimerRef.current);
    markTimerRef.current = setTimeout(() => {
      markTimerRef.current = null;
      markNowRef.current();
    }, MARK_READ_DEBOUNCE_MS);
  }, []);
  useEffect(
    () => () => {
      if (markTimerRef.current === null) return;
      // Flush: the user DID view the thread. Debouncing changes how many
      // requests we send, never whether the read happens.
      clearTimeout(markTimerRef.current);
      markTimerRef.current = null;
      markNowRef.current();
    },
    [],
  );

  /**
   * A6 — the single entry point for a row that did not come from the initial
   * snapshot (realtime INSERT, or the as-stored refetch after a send). Before
   * the snapshot settles it goes into the buffer; after, straight into state.
   */
  const receiveMessage = useCallback((message: MessageRow) => {
    if (settledRef.current) {
      setMessages((prev) => (prev ? appendMessage(prev, message) : prev));
    } else {
      pendingRef.current = appendMessage(pendingRef.current, message);
    }
  }, []);

  // Initial load (+ retry via loadNonce). Viewing the thread marks incoming
  // messages read — fire-and-forget, a failure must never block the chat.
  useEffect(() => {
    let cancelled = false;
    setLoadFailed(false);
    // Reset the A6 buffer for THIS booking before subscribing again: a row
    // left over from a previous bookingId must never merge into this thread.
    settledRef.current = false;
    pendingRef.current = [];
    fetchMessages(bookingId).then(
      ({ rows, total: serverTotal }) => {
        if (cancelled) return;
        // Drain anything realtime delivered while this was in flight.
        // appendMessage de-dupes by id, so a row present in BOTH the
        // snapshot and the buffer is merged exactly once.
        const merged = pendingRef.current.reduce(
          (acc, message) => appendMessage(acc, message),
          rows,
        );
        pendingRef.current = [];
        settledRef.current = true;
        setMessages(merged);
        setTotal(serverTotal);
        scheduleMarkRead();
      },
      () => {
        if (!cancelled) setLoadFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [bookingId, uid, loadNonce, scheduleMarkRead]);

  // Realtime: append inserts for this booking (both parties' sends arrive
  // here — appendMessage de-dupes against the post-send fetch).
  useEffect(() => {
    const unsubscribe = subscribeToBookingMessages(bookingId, (message) => {
      receiveMessage(message);
      if (message.sender_id !== uid) scheduleMarkRead();
    });
    return unsubscribe;
  }, [bookingId, uid, receiveMessage, scheduleMarkRead]);

  // Keep the newest message in view.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  /**
   * Send one message. Resolves as soon as rpc_send_message succeeds so the
   * composer clears immediately; the as-stored refetch (the server may have
   * masked the body) lands afterwards through the same buffered path.
   * Rejects on failure — the composer renders the error.
   */
  const handleSend = useCallback(
    async (body: string) => {
      const result = await sendMessage({
        p_booking_id: bookingId,
        p_body: body,
      });
      if (result.phone_masked) setMaskedNotice(true);
      void fetchMessageById(result.message_id)
        .then((stored) => {
          if (stored) receiveMessage(stored);
        })
        .catch(() => {});
    },
    [bookingId, receiveMessage],
  );

  const truncated =
    total != null && messages != null && total > messages.length;

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-base font-bold text-ink">{t('chat.title')}</h2>

      {messages === null && !loadFailed && (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      )}

      {loadFailed && (
        <div className="py-6 text-center">
          <p className="text-sm text-ink-light">{t('chat.loadFailed')}</p>
          <Button
            variant="secondary"
            className="mt-3"
            onClick={() => setLoadNonce((n) => n + 1)}
          >
            {t('common.retry')}
          </Button>
        </div>
      )}

      {messages !== null && (
        <>
          {truncated && (
            /* N14 floor: Amharic notice text never below text-sm */
            <p className="mb-2 rounded-lg bg-ink/5 px-3 py-2 text-center text-sm leading-relaxed text-ink-faint">
              {t('chat.showingRecent', { count: MESSAGES_LIMIT })}
            </p>
          )}
          {messages.length === 0 ? (
            <div className="py-6 text-center">
              <p className="font-semibold text-ink">{t('chat.emptyTitle')}</p>
              {open && (
                <p className="mt-1 text-sm text-ink-light">
                  {t('chat.emptyBody')}
                </p>
              )}
            </div>
          ) : (
            <div
              ref={listRef}
              className="max-h-96 space-y-2 overflow-y-auto pr-1"
            >
              {messages.map((message) => {
                const mine = message.sender_id === uid;
                return (
                  <div
                    key={message.id}
                    className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${
                        mine
                          ? 'rounded-br-md bg-primary text-white'
                          : 'rounded-bl-md bg-cream text-ink'
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words text-sm">
                        {message.body}
                      </p>
                      <p
                        className={`mt-0.5 text-right text-[10px] ${
                          mine ? 'text-white/70' : 'text-ink-faint'
                        }`}
                      >
                        {formatRelativeTime(message.created_at, locale)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {maskedNotice && (
        <p className="mt-3 rounded-lg bg-primary-50 px-3 py-2 text-sm leading-relaxed text-primary-800">
          {t('chat.maskedNotice')}
        </p>
      )}

      {open ? (
        <ChatComposer
          status={status}
          initialDraft={seededDraft}
          onSend={handleSend}
        />
      ) : (
        <p className="mt-3 rounded-lg bg-ink/5 px-3 py-2 text-center text-sm text-ink-light">
          {t('chat.closed')}
        </p>
      )}
    </section>
  );
}

/**
 * A12 — the draft lives HERE, not in ChatSection. Every keystroke re-rendered
 * the whole message list before this split; now it re-renders one textarea
 * and its two sibling lines. Still a controlled input (Amharic IME).
 */
function ChatComposer({
  status,
  initialDraft,
  onSend,
}: {
  status: BookingStatus;
  initialDraft: string;
  /** Resolves when the send succeeded; rejects with the RPC error. */
  onSend: (body: string) => Promise<void>;
}) {
  const { t } = useLocale();
  const [draft, setDraft] = useState(initialDraft);
  const [sending, setSending] = useState(false);
  const [sendErrorKey, setSendErrorKey] = useState<MessageKey | null>(null);

  const send = () => {
    const body = draft.trim();
    if (body === '' || sending) return;
    const invalid = validateMessageBody(body);
    if (invalid) {
      setSendErrorKey(invalid);
      return;
    }
    setSending(true);
    setSendErrorKey(null);
    onSend(body)
      .then(
        () => setDraft(''),
        (e: unknown) => setSendErrorKey(rpcErrorKey(getErrorMessage(e))),
      )
      .finally(() => setSending(false));
  };

  const warnPhone = shouldWarnPhone(draft, status);

  return (
    <div className="mt-3">
      {warnPhone && (
        <p className="mb-2 rounded-lg bg-primary-50 px-3 py-2 text-sm font-medium leading-relaxed text-primary-800">
          {t('chat.phoneWarning')}
        </p>
      )}
      {sendErrorKey && (
        <p className="mb-2 text-sm text-status-disputed">{t(sendErrorKey)}</p>
      )}
      <div className="flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t('chat.inputPlaceholder')}
          aria-label={t('chat.inputPlaceholder')}
          rows={1}
          maxLength={MESSAGE_MAX}
          className="min-h-touch w-full flex-1 resize-none rounded-xl border border-ink/15 bg-white px-4 py-2.5 text-base text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <Button onClick={send} disabled={sending || draft.trim() === ''}>
          {t('common.send')}
        </Button>
      </div>
    </div>
  );
}
