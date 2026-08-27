// Namespace: reviews — double-blind reviews (hidden until both submit or
// 48h pass — SPEC schema note on the reviews table). doubleBlindExplain and
// waitingOther visualize that state for the reviewer.

const am = {
  title: 'ግምገማዎች',
  leaveReview: 'ግምገማ ይስጡ',
  ratingLabel: 'ደረጃ ይምረጡ',
  starAria: '{n} ኮከብ',
  commentLabel: 'አስተያየት (አማራጭ)',
  doubleBlindExplain:
    'ግምገማዎች ሁለታችሁም እስክታስገቡ ወይም 48 ሰዓት እስኪሞላ ድረስ ተደብቀው ይቆያሉ።',
  yourReview: 'የእርስዎ ግምገማ',
  theirReview: 'የ{name} ግምገማ',
  hiddenBadge: 'ተደብቋል',
  publishedBadge: 'ይፋ ሆኗል',
  waitingOther:
    '{name} ገና ግምገማ አላስገባም። ግምገማዎ ሁለቱም ሲገቡ ወይም 48 ሰዓት ሲሞላ ይፋ ይሆናል።',
  revealsAt: 'ግምገማው {time} ይፋ ይሆናል።',
  submitted: 'ግምገማዎ ተመዝግቧል። እናመሰግናለን!',
  submitFailed: 'ግምገማውን ማስገባት አልተሳካም። እባክዎ እንደገና ይሞክሩ።',
  loadFailed: 'ግምገማዎችን መጫን አልተሳካም።',
  errorRatingRange: 'ከ1 እስከ 5 ኮከብ ይምረጡ።',
  errorCommentTooLong: 'አስተያየቱ ከ1000 ፊደላት መብለጥ የለበትም።',
  errorNotCompleted: 'ግምገማ መስጠት የሚቻለው ሥራው ከተጠናቀቀ በኋላ ነው።',
  errorAlreadyReviewed: 'ለዚህ ማስያዣ ግምገማ አስቀድመው ሰጥተዋል።',
} as const;

const en: Record<keyof typeof am, string> = {
  title: 'Reviews',
  leaveReview: 'Leave a review',
  ratingLabel: 'Choose a rating',
  starAria: '{n} stars',
  commentLabel: 'Comment (optional)',
  doubleBlindExplain:
    'Reviews stay hidden until both of you submit, or until 48 hours pass.',
  yourReview: 'Your review',
  theirReview: "{name}'s review",
  hiddenBadge: 'Hidden',
  publishedBadge: 'Published',
  waitingOther:
    '{name} has not reviewed yet. Your review becomes visible once both are in, or after 48 hours.',
  revealsAt: 'The review becomes visible {time}.',
  submitted: 'Your review was recorded. Thank you!',
  submitFailed: 'Could not submit the review. Please try again.',
  loadFailed: 'Could not load reviews.',
  errorRatingRange: 'Choose 1 to 5 stars.',
  errorCommentTooLong: 'The comment must be at most 1000 characters.',
  errorNotCompleted: 'Reviews open after the job is completed.',
  errorAlreadyReviewed: 'You have already reviewed this booking.',
};

export const reviews = { am, en };
