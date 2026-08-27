// Acceptance-gate coverage (SPEC): "Phones never rendered unmasked
// pre-booking (test)". If someone weakens MaskedPhone, this fails.

import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LocaleProvider } from '../../lib/i18n';
import { MaskedPhone } from '../MaskedPhone';

const FULL = '+251911234567';
const MASKED = '+2519****567';

function renderMasked(props: Parameters<typeof MaskedPhone>[0]) {
  return render(
    <LocaleProvider>
      <MaskedPhone {...props} />
    </LocaleProvider>,
  );
}

describe('MaskedPhone', () => {
  it('never renders the full number pre-booking, even if it was passed', () => {
    const { container } = renderMasked({
      masked: MASKED,
      full: FULL, // hostile/buggy caller — must still not leak
      bookingConfirmed: false,
    });
    expect(container.textContent).not.toContain(FULL);
    expect(container.textContent).not.toContain('11234');
    expect(screen.getByText(MASKED)).toBeInTheDocument();
    // No reveal affordance pre-booking
    expect(container.querySelector('button')).toBeNull();
    // No tel: link either
    expect(container.querySelector('a')).toBeNull();
  });

  it('shows the hidden-until-booking hint pre-booking', () => {
    renderMasked({ masked: MASKED, bookingConfirmed: false });
    expect(
      screen.getByText('ስልክ ቁጥር ማስያዣ እስኪረጋገጥ ድረስ ይደበቃል'),
    ).toBeInTheDocument();
  });

  it('offers reveal only when the booking is confirmed AND full is present', () => {
    const { container } = renderMasked({
      masked: MASKED,
      full: FULL,
      bookingConfirmed: true,
    });
    // Still masked until the user taps reveal
    expect(container.textContent).not.toContain(FULL);
    const reveal = screen.getByRole('button');
    fireEvent.click(reveal);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', `tel:${FULL}`);
    expect(link.textContent).toBe(FULL);
  });

  it('confirmed booking without a full number renders masked with no reveal', () => {
    const { container } = renderMasked({
      masked: MASKED,
      bookingConfirmed: true,
    });
    expect(screen.getByText(MASKED)).toBeInTheDocument();
    expect(container.querySelector('button')).toBeNull();
  });
});
