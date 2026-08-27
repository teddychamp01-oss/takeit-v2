// Sticky bottom navigation: Home, Browse, Post(+ raised center), Inbox, Me.
// Inline SVG icons only — no icon library (low-end-first, SPEC C6).

import { NavLink } from 'react-router-dom';
import { useT } from '../lib/i18n';
import type { ReactNode } from 'react';

function IconHome() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 10.5L12 3l9 7.5" />
      <path d="M5.5 9.5V20a1 1 0 001 1H10v-5.5h4V21h3.5a1 1 0 001-1V9.5" />
    </svg>
  );
}

function IconBrowse() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20.5 20.5l-4.9-4.9" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconInbox() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 14a2 2 0 01-2 2H8l-5 4V6a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c1.2-3.4 4-5 7.5-5s6.3 1.6 7.5 5" />
    </svg>
  );
}

function NavItem({
  to,
  label,
  icon,
  end,
}: {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex min-h-touch flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-medium ${
          isActive ? 'text-primary-600' : 'text-ink-faint'
        }`
      }
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}

export function BottomNav() {
  const t = useT();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ink/5 bg-white/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-lg items-stretch">
        <NavItem to="/" end label={t('nav.home')} icon={<IconHome />} />
        <NavItem to="/browse" label={t('nav.browse')} icon={<IconBrowse />} />
        <NavLink
          to="/post"
          className="flex flex-1 flex-col items-center justify-end pb-1.5 text-[11px] font-medium text-ink-faint"
        >
          <span className="-mt-5 mb-0.5 flex h-touch w-touch items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-primary/30">
            <IconPlus />
          </span>
          <span>{t('nav.post')}</span>
        </NavLink>
        <NavItem to="/inbox" label={t('nav.inbox')} icon={<IconInbox />} />
        <NavItem to="/me" end label={t('nav.me')} icon={<IconUser />} />
      </div>
    </nav>
  );
}
