# Frontend conventions

## Amharic typography (N14 — africa-G.4, pwa-F8/F9)

Written 2026-08-27 with the research-upgrade pass. Each rule exists because
Ge'ez fidel is not Latin: it has **no upper/lower case**, the system font
(Noto Sans Ethiopic, AOSP-verified) ships **weights 400–700 only**, and
letter-spacing breaks the script's rhythm.

1. **Never letter-space or uppercase fidel.** Decorative
   `uppercase tracking-wide` micro-labels (category eyebrows, stat captions,
   `<dt>` labels) must be gated to the Latin locale via
   `microCaps(locale)` from `apps/web/src/lib/typography.ts` — it returns the
   classes for `en` and nothing for `am`. Do not hand-write
   `uppercase`/`tracking-*` on any element that can carry localized text.
   (Digits — masked phone numbers, prices — may keep `tracking-wide`.)

2. **Body-text floor: `text-sm` + `leading-relaxed`.** Any multi-line text
   that can carry Amharic (chat bubbles and notices, job/package
   descriptions, explainer paragraphs, capped-list notices) is never below
   `text-sm`, with `leading-relaxed` (≈1.6 line-height — pwa-F9; the px floor
   itself is an ESTIMATE, W3C elreq was egress-blocked; the owner's phone is
   the real gate). Single-line labels/chips/timestamps may stay `text-xs`.

3. **Font weights 400–700 only on localized text.** No `font-light` /
   `font-extrabold` / `font-black` where Amharic can render — the engine
   would synthesize (fake-bold) the missing weight. Latin-only literals
   (the "Take It" wordmark, "DEV") and bare numerals are exempt.

4. **Zero webfonts.** Amharic renders from the system Noto Sans Ethiopic;
   no third-party font host on the driver's — worker's — cold-load path.
   Self-hosted woff2 only if the owner sees bad rendering on device (P16).

5. **Never truncate meaning.** Amharic strings run long (uc-G17); prefer
   wrapping (`leading-relaxed`) over `truncate` for sentence-length content;
   `truncate`/`line-clamp` is acceptable for titles and previews only.

## Dates (N15 — africa-G.3)

User-facing calendar dates go through `formatDateNeeded` (jobs) /
`formatDualDate` (`apps/web/src/lib/format.ts`): locale `am` renders
**Ethiopic first, Gregorian in parentheses** — "21 ነሐሴ 2018 (27 ኦገስት 2026)";
`en` stays Gregorian. Storage stays timestamptz/ISO; this is render-only.
The helper verifies `resolvedOptions().calendar === 'ethiopic'` and degrades
to Gregorian rather than mislabel a date. NOT VERIFIED on the target Android
WebView — owner-device check is the item's gate. Relative times
(`formatRelativeTime`) are calendar-free and unaffected.
