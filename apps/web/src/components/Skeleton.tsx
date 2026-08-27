// N9 — hand-rolled loading skeletons (pwa-F7/pwa-F15: no animation/skeleton
// library, Tailwind pulse only). Each variant dimensionally mirrors the REAL
// card it stands in for — WorkerCard (full + compact rail), JobCard,
// PackageCard, CategoryGrid tile — so the content swap causes no layout shift
// (CLS ≤ 0.1 budget). Spinners are NOT replaced everywhere: auth gates and
// button-level submits keep the Spinner; skeletons are for content-shaped
// list loads only.
//
// Accessibility: one role="status" wrapper per variant (a single announcement,
// never one per bone); the bones themselves are aria-hidden. The pulse is
// gated behind motion-safe so prefers-reduced-motion gets a static block.

import type { ReactNode } from 'react';
import { useT } from '../lib/i18n';

/** One shimmer block. Purely decorative — always inside an aria-hidden tree. */
function Bone({ className = '' }: { className?: string }) {
  return <div className={`rounded-md bg-ink/10 ${className}`} />;
}

/** Shared wrapper: single status role + label, pulse on the whole group. */
function Status({ children }: { children: ReactNode }) {
  const t = useT();
  return (
    <div
      role="status"
      aria-label={t('common.loading')}
      className="motion-safe:animate-pulse"
    >
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

/** Mirrors the COMPACT WorkerCard (w-44 p-3, h-10 avatar) used in rails. */
function CompactWorkerBone() {
  return (
    <div className="w-44 shrink-0 rounded-2xl bg-white p-3 shadow-card">
      <div className="flex items-center gap-2">
        <Bone className="h-10 w-10 rounded-full" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Bone className="h-3.5 w-20" />
          <Bone className="h-3 w-12 rounded-full" />
        </div>
      </div>
      <Bone className="mt-2 h-3 w-32" />
      <div className="mt-1.5 flex items-center justify-between">
        <Bone className="h-3 w-10" />
        <Bone className="h-3 w-14" />
      </div>
    </div>
  );
}

/** Mirrors the full WorkerCard (p-4, h-12 avatar, 4 text lines + status). */
function WorkerBone() {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-card">
      <div className="flex items-start gap-3">
        <Bone className="h-12 w-12 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Bone className="h-4 w-28" />
            <Bone className="h-4 w-4 rounded-full" />
          </div>
          <Bone className="h-3 w-40 max-w-full" />
          <Bone className="h-3 w-24" />
          <Bone className="h-3 w-36 max-w-full" />
        </div>
        <Bone className="h-3 w-16" />
      </div>
    </div>
  );
}

/** Mirrors JobCard (p-4: micro-label row, title + status pill, footer row). */
function JobBone() {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-card">
      <div className="mb-1 flex items-center gap-1.5">
        <Bone className="h-4 w-4" />
        <Bone className="h-3 w-20" />
      </div>
      <div className="flex items-start justify-between gap-2">
        <Bone className="h-4 w-2/3" />
        <Bone className="h-5 w-14 rounded-full" />
      </div>
      {/* two-line description block — most feed rows render it; omitting it
          made the load->content swap grow every card (CLS) */}
      <div className="mt-2 space-y-1.5">
        <Bone className="h-3.5 w-full" />
        <Bone className="h-3.5 w-4/5" />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <Bone className="h-3 w-28" />
        <Bone className="h-4 w-16" />
      </div>
    </div>
  );
}

/** Mirrors PackageCard (p-4: name+price, duration, checklist lines, CTA). */
function PackageBone() {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <Bone className="h-4 w-32" />
        <Bone className="h-4 w-16" />
      </div>
      <Bone className="mt-1.5 h-3 w-24" />
      <div className="mt-3 space-y-1.5">
        <Bone className="h-3.5 w-4/5" />
        <Bone className="h-3.5 w-3/5" />
      </div>
      <Bone className="mt-3 h-touch w-full rounded-xl" />
    </div>
  );
}

/** Horizontal edge-bleed rail of compact worker cards (Home rails). */
export function SkeletonWorkerRail({ count = 3 }: { count?: number }) {
  return (
    <Status>
      <div className="-mx-4 flex gap-3 overflow-hidden px-4 pb-1">
        {Array.from({ length: count }, (_, i) => (
          <CompactWorkerBone key={i} />
        ))}
      </div>
    </Status>
  );
}

/** Vertical list of full worker cards (Browse search, Category lists). */
export function SkeletonWorkerList({ count = 3 }: { count?: number }) {
  return (
    <Status>
      <div className="space-y-2">
        {Array.from({ length: count }, (_, i) => (
          <WorkerBone key={i} />
        ))}
      </div>
    </Status>
  );
}

/** Vertical list of job cards (Home open-jobs teaser, feeds). */
export function SkeletonJobList({ count = 3 }: { count?: number }) {
  return (
    <Status>
      <div className="space-y-2">
        {Array.from({ length: count }, (_, i) => (
          <JobBone key={i} />
        ))}
      </div>
    </Status>
  );
}

/** Vertical list of package cards (Category packages section). */
export function SkeletonPackageList({ count = 2 }: { count?: number }) {
  return (
    <Status>
      <div className="space-y-2">
        {Array.from({ length: count }, (_, i) => (
          <PackageBone key={i} />
        ))}
      </div>
    </Status>
  );
}

/** Mirrors the 4-column CategoryGrid (8 launch categories by default). */
export function SkeletonCategoryGrid({ count = 8 }: { count?: number }) {
  return (
    <Status>
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            className="flex min-h-touch flex-col items-center gap-1 rounded-2xl bg-white p-2 pt-3 shadow-sm"
          >
            <Bone className="h-7 w-7 rounded-full" />
            <Bone className="h-2.5 w-12" />
          </div>
        ))}
      </div>
    </Status>
  );
}
