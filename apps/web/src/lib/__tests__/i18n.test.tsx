import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LocaleProvider, useLocale } from '../i18n';
import type { MessageKey } from '../../i18n';

function Probe() {
  const { locale, setLocale, t } = useLocale();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="home">{t('nav.home')}</span>
      <span data-testid="missing">{t('common.__does_not_exist__' as MessageKey)}</span>
      <span data-testid="vars">{t('common.jobsCountShort', { count: 12 })}</span>
      <button onClick={() => setLocale('en')}>to-en</button>
      <button onClick={() => setLocale('am')}>to-am</button>
    </div>
  );
}

describe('LocaleProvider / useT', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('defaults to Amharic on a fresh device', () => {
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByTestId('locale').textContent).toBe('am');
    expect(screen.getByTestId('home').textContent).toBe('መነሻ');
  });

  it('returns the key string VISIBLY for a missing key — never crashes', () => {
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByTestId('missing').textContent).toBe(
      'common.__does_not_exist__',
    );
  });

  it('interpolates {vars}', () => {
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByTestId('vars').textContent).toBe('12 ሥራዎች');
  });

  it('switches locale and persists the preference', () => {
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );
    fireEvent.click(screen.getByText('to-en'));
    expect(screen.getByTestId('locale').textContent).toBe('en');
    expect(screen.getByTestId('home').textContent).toBe('Home');
    expect(window.localStorage.getItem('takeit.locale')).toBe('en');
  });

  it('restores the persisted preference on a new mount', () => {
    window.localStorage.setItem('takeit.locale', 'en');
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByTestId('locale').textContent).toBe('en');
  });

  it('ignores garbage in storage and falls back to Amharic', () => {
    window.localStorage.setItem('takeit.locale', 'fr');
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByTestId('locale').textContent).toBe('am');
  });

  it('sets document.documentElement.lang', () => {
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );
    expect(document.documentElement.lang).toBe('am');
    fireEvent.click(screen.getByText('to-en'));
    expect(document.documentElement.lang).toBe('en');
  });
});
