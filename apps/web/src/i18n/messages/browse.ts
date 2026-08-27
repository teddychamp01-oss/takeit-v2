// Namespace: browse — worker discovery (browse, category, worker detail).
// Owned by the home+browse agent. en is typed against am, so the two locales
// cannot drift apart.

const am = {
  title: 'አስስ',
  searchPlaceholder: 'ባለሙያ ይፈልጉ…',
  noResults: 'ምንም አልተገኘም',
  workerTitle: 'የባለሙያ መገለጫ',
  allCategories: 'ሁሉም ምድቦች',
  searchHint: 'ቢያንስ 2 ፊደላት ይጻፉ',
  workersSection: 'ባለሙያዎች',
  signInToSearch: 'ባለሙያዎችን በስም ለመፈለግ ይግቡ።',
  signInCta: 'ግባ',
  showingWorkers: '{shown} ከ{total} ባለሙያዎች እየታዩ ነው',
  packagesSection: 'የአገልግሎት ጥቅሎች',
  packageIncludes: 'የሚያካትተው',
  packageDuration: '{min} ደቂቃ ገደማ',
  neighborhoodLabel: 'ሰፈር',
  neighborhoodAll: 'ሁሉም ሰፈሮች',
  nearMe: 'በአቅራቢያዬ',
  locationAsking: 'አካባቢዎን በማግኘት ላይ…',
  locationDenied: 'አካባቢ ማግኘት አልተቻለም — በሰፈር ማጣራት ይችላሉ።',
  nearYouSection: 'በአቅራቢያዎ',
  fartherSection: 'ራቅ ያሉ ወይም አካባቢ ያላስገቡ',
  nearbyTruncated: 'በጣም ቅርብ የሆኑት 100 ባለሙያዎች ብቻ ታይተዋል።',
  nearbyEmpty: 'በአቅራቢያዎ ባለሙያ አልተገኘም — ሁሉም ባለሙያዎች ከታች ይታያሉ።',
  noWorkersInCategory: 'በዚህ ምድብ ገና ባለሙያ የለም።',
  noWorkersInNeighborhood: 'በዚህ ሰፈር ባለሙያ አልተገኘም።',
  clearFilter: 'ማጣሪያውን አጽዳ',
  requiresVerification: 'በዚህ ምድብ የሚሰሩት ከፍተኛ ማረጋገጫ ያላቸው ባለሙያዎች ብቻ ናቸው።',
  categoryNotFound: 'ምድቡ አልተገኘም።',
  workerNotFound: 'ባለሙያው አልተገኘም።',
  signInToView: 'የባለሙያውን ሙሉ መገለጫ ለማየት ይግቡ።',
  aboutSection: 'ስለ ባለሙያው',
  skillsSection: 'ችሎታዎች',
  // Stat trio on the worker detail page (rating label reuses common.rating).
  statsSection: 'ቁልፍ አሃዞች',
  statJobsCompleted: 'የተጠናቀቁ ሥራዎች',
  statVerification: 'ማረጋገጫ',
  jobsCompletedLong: '{count} የተጠናቀቁ ሥራዎች',
  guarantorsCount: '{count} ዋሶች አሉት',
  travelRadius: 'እስከ {km} ኪ.ሜ ድረስ ይጓዛል',
  phoneLabel: 'ስልክ',
  reviewsSection: 'ግምገማዎች',
  // N5/trust-F8: the structural fake-review defense, TOLD to people. The
  // schema already enforces it (booking FK + double-blind, no edit/delete
  // path) — this line only states what is true.
  reviewsProvenance:
    'ሁሉም ግምገማዎች ከተጠናቀቁ ሥራዎች ብቻ ናቸው፤ አይስተካከሉም አይሰረዙም።',
  noReviews: 'እስካሁን የታየ ግምገማ የለም።',
  showingReviews: '{shown} ከ{total} ግምገማዎች እየታዩ ነው',
  ratingBreakdown: 'የደረጃ ስርጭት',
  starCount: '{star} ኮከብ',
  reviewerGeneric: 'ደንበኛ',
  requestBooking: 'ቀጠሮ ይያዙ',
  saveWorker: 'ባለሙያውን አስቀምጥ',
  savedWorker: 'ተቀምጧል',
  // "starting at" price on compact worker cards — the "+" reads the same in
  // both scripts, so the two values match by design.
  priceFromShort: '{price}+',
  // N5/trust-F7 — badge tap-through sheet ("what we checked"). Every line
  // maps 1:1 to a REAL flow in this repo (C2: attributes only, documents are
  // never shown):
  //   basic          → Telegram/phone sign-in (auth flow)
  //   id_verified    → manual_id: ID front/back + selfie uploaded to the
  //                    PRIVATE bucket, decided by ops (decideVerification)
  //   fayda_verified → fayda_ekyc via national Fayda ID (behind flag)
  //   pro_certified  → certification reviewed by ops (ladderProDesc flow)
  badgeSheetTitle: 'ምን ተረጋግጧል?',
  badgeSheetCheckedTitle: 'የተረጋገጠው',
  badgeSheetNotCheckedTitle: 'ያልተረጋገጠው',
  badgeSheetBasicChecked: 'ስልክ ቁጥር ወይም የቴሌግራም መለያ ተረጋግጧል።',
  badgeSheetBasicNotId: 'መታወቂያ በTake It ገና አልታየም።',
  badgeSheetIdChecked1: 'የመታወቂያ ፊትና ጀርባ ፎቶ ከሰልፊ ጋር ቀርቧል።',
  badgeSheetIdChecked2: 'በTake It ኦፕስ ቡድን ታይቶ ጸድቋል።',
  badgeSheetFaydaChecked: 'ማንነት በብሔራዊ የፋይዳ መታወቂያ (eKYC) ተረጋግጧል።',
  badgeSheetProChecked: 'የሙያ ብቃት ማስረጃ ቀርቦ በTake It ጸድቋል።',
  badgeSheetNotQuality:
    'ማረጋገጫ የሥራ ጥራትን አያረጋግጥም፤ ጥራት ከተጠናቀቁ ሥራዎች በሚመጡ ግምገማዎች ይታያል።',
  badgeSheetMeetFirst: 'Take It ባለሙያውን አስቀድመው በአካል እንዲያገኙ ይመክራል።',
  badgeSheetDocsPrivate:
    'ሰነዶች የሚታዩት በTake It ቡድን ብቻ ነው፤ በመተግበሪያው ውስጥ አይታዩም።',
} as const;

const en: Record<keyof typeof am, string> = {
  title: 'Browse',
  searchPlaceholder: 'Search for a worker…',
  noResults: 'No results found',
  workerTitle: 'Worker profile',
  allCategories: 'All categories',
  searchHint: 'Type at least 2 letters',
  workersSection: 'Workers',
  signInToSearch: 'Sign in to search workers by name.',
  signInCta: 'Sign in',
  showingWorkers: 'Showing {shown} of {total} workers',
  packagesSection: 'Service packages',
  packageIncludes: 'Includes',
  packageDuration: 'about {min} min',
  neighborhoodLabel: 'Neighborhood',
  neighborhoodAll: 'All neighborhoods',
  nearMe: 'Near me',
  locationAsking: 'Finding your location…',
  locationDenied: 'Could not get your location — you can filter by neighborhood.',
  nearYouSection: 'Near you',
  fartherSection: 'Farther away or no location set',
  nearbyTruncated: 'Showing only the nearest 100 workers.',
  nearbyEmpty: 'No workers found near you — all workers are shown below.',
  noWorkersInCategory: 'No workers in this category yet.',
  noWorkersInNeighborhood: 'No workers found in this neighborhood.',
  clearFilter: 'Clear filter',
  requiresVerification:
    'Only workers with a higher verification level can serve this category.',
  categoryNotFound: 'Category not found.',
  workerNotFound: 'Worker not found.',
  signInToView: 'Sign in to see this worker’s full profile.',
  aboutSection: 'About',
  skillsSection: 'Skills',
  statsSection: 'Key stats',
  statJobsCompleted: 'Jobs completed',
  statVerification: 'Verification',
  jobsCompletedLong: '{count} jobs completed',
  guarantorsCount: '{count} guarantors',
  travelRadius: 'Travels up to {km} km',
  phoneLabel: 'Phone',
  reviewsSection: 'Reviews',
  reviewsProvenance:
    'All reviews are from completed bookings and cannot be edited or deleted.',
  noReviews: 'No published reviews yet.',
  showingReviews: 'Showing {shown} of {total} reviews',
  ratingBreakdown: 'Rating breakdown',
  starCount: '{star} star',
  reviewerGeneric: 'Customer',
  requestBooking: 'Request booking',
  saveWorker: 'Save worker',
  savedWorker: 'Saved',
  priceFromShort: '{price}+',
  badgeSheetTitle: 'What we checked',
  badgeSheetCheckedTitle: 'What was checked',
  badgeSheetNotCheckedTitle: 'What was not checked',
  badgeSheetBasicChecked: 'Phone number or Telegram account confirmed.',
  badgeSheetBasicNotId: 'No ID document has been reviewed by Take It yet.',
  badgeSheetIdChecked1:
    'Photos of the ID (front and back) were submitted with a selfie.',
  badgeSheetIdChecked2: 'Reviewed and approved by the Take It ops team.',
  badgeSheetFaydaChecked:
    'Identity confirmed through the national Fayda ID (eKYC).',
  badgeSheetProChecked:
    'A professional certificate was submitted and approved by Take It.',
  badgeSheetNotQuality:
    'Verification does not check work quality — quality shows in reviews from completed bookings.',
  badgeSheetMeetFirst: 'Take It also recommends meeting the worker first.',
  badgeSheetDocsPrivate:
    'Documents are seen only by the Take It team and are never shown in the app.',
};

export const browse = { am, en };
