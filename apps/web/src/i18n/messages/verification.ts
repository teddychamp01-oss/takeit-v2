// Namespace: verification — identity verification (manual ID + Fayda) and
// guarantor vouching. Amharic (am) is the DEFAULT locale (SPEC C5).
//
// The consent text is a legal-facing string (Proc. 1321/2024): purpose,
// private storage, ops/admin-only access, 30-day deletion after decision.
// Keep the am and en versions saying the SAME thing when editing.

const am = {
  title: 'ማንነት ማረጋገጫ',
  getVerified: 'ማንነትዎን ያረጋግጡ',
  currentLevel: 'የአሁን የማረጋገጫ ደረጃ',

  ladderTitle: 'የማረጋገጫ ደረጃዎች',
  ladderCurrentTag: 'አሁን ያሉበት',
  ladderNoneDesc: 'መለያዎ ተፈጥሯል፤ ማንነትዎ ገና አልተረጋገጠም።',
  ladderBasicDesc: 'ስልክዎ ወይም የቴሌግራም መለያዎ ተረጋግጧል።',
  ladderIdDesc: 'መታወቂያዎ በሠራተኞቻችን ታይቶ ጸድቋል።',
  ladderFaydaDesc: 'ማንነትዎ በብሔራዊ የፋይዳ መታወቂያ (eSignet) ተረጋግጧል።',
  ladderProDesc: 'የሙያ ብቃት ማስረጃዎ ቀርቦ ጸድቋል።',
  ladderGuarantorDesc: 'ዋሶች በማንኛውም ደረጃ ላይ ተጨማሪ እምነት ይጨምራሉ።',

  timelineTitle: 'የማረጋገጫ ታሪክ',
  timelineEmpty: 'እስካሁን ምንም የማረጋገጫ ጥያቄ አላስገቡም።',
  statusPending: 'በመጠባበቅ ላይ',
  statusApproved: 'ጸድቋል',
  statusRejected: 'ተቀባይነት አላገኘም',
  methodManual: 'በመታወቂያ (በእጅ ማረጋገጫ)',
  methodFayda: 'በፋይዳ (eSignet)',
  submittedLabel: 'የገባው',
  decidedLabel: 'የተወሰነው',
  rejectionNotesLabel: 'ምክንያት',

  manualTitle: 'በመታወቂያ ያረጋግጡ',
  manualIntro:
    'የመታወቂያዎን ፊትና ጀርባ ገጽ እንዲሁም የራስዎን ፎቶ ያንሱ። ፎቶዎቹ ግልጽ እና የሚነበቡ ይሁኑ።',
  idFrontLabel: 'የመታወቂያ ፊት ገጽ',
  idBackLabel: 'የመታወቂያ ጀርባ ገጽ',
  selfieLabel: 'የራስ ፎቶ (ሰልፊ)',
  choosePhoto: 'ፎቶ ምረጥ',
  changePhoto: 'ፎቶ ቀይር',
  photoSelected: 'ፎቶ ተመርጧል',
  tapToAddPhoto: 'ፎቶ ለመጨመር ይንኩ',
  fileTypeError: 'እባክዎ የፎቶ ፋይል ይምረጡ።',
  fileTooLarge: 'ፎቶው በጣም ትልቅ ነው (እስከ 10MB)።',
  processError: 'ፎቶውን ማዘጋጀት አልተቻለም። እባክዎ ሌላ ፎቶ ይሞክሩ።',

  consentTitle: 'ፈቃድ',
  consentText:
    'የመታወቂያዎ ፎቶዎች ማንነትዎን ለማረጋገጥ ብቻ ይውላሉ። በግል ማከማቻ ውስጥ ተጠብቀው የሚታዩት ለማረጋገጫ ሠራተኞቻችን ብቻ ነው፤ ውሳኔ ከተሰጠ በኋላ በ30 ቀናት ውስጥ ይሰረዛሉ። «አስገባ»ን በመጫን በግል መረጃ ጥበቃ አዋጅ ቁጥር 1321/2024 መሠረት ይህ መረጃ እንዲቀናበር ፈቃድዎን ይሰጣሉ።',
  consentCheckbox: 'አንብቤ ተስማምቻለሁ',
  consentRequired: 'ለመቀጠል ፈቃድዎ ያስፈልጋል።',
  allPhotosRequired: 'ሦስቱም ፎቶዎች ያስፈልጋሉ።',
  submitVerification: 'ለማረጋገጫ አስገባ',
  uploading: 'በመላክ ላይ…',
  submitSuccess: 'ጥያቄዎ ገብቷል፤ በመጠባበቅ ላይ ነው። ውሳኔ ሲሰጥ እናሳውቅዎታለን።',
  submitError: 'ማስገባት አልተሳካም። እባክዎ እንደገና ይሞክሩ።',
  pendingExists: 'በመጠባበቅ ላይ ያለ የማረጋገጫ ጥያቄ አለዎት። ውሳኔ እስኪሰጥ ይጠብቁ።',
  rejectedInfo: 'የቀድሞው ጥያቄዎ ተቀባይነት አላገኘም። እንደገና ማስገባት ይችላሉ።',

  faydaTitle: 'በፋይዳ (eSignet) ያረጋግጡ',
  faydaBody: 'ብሔራዊ መታወቂያዎን (ፋይዳ) በመጠቀም በፍጥነት ያረጋግጡ።',
  faydaCta: 'በፋይዳ ቀጥል',
  faydaUnavailable: 'የፋይዳ ማረጋገጫ በዚህ አካባቢ ገና አልተዋቀረም።',

  guarantorsTitle: 'ዋሶች',
  guarantorsIntro:
    'የእድር፣ የእቁብ፣ የአሠሪ ወይም የተረጋገጠ ባለሙያ ዋስትና በደንበኞች ዘንድ እምነትዎን ያሳድጋል።',
  guarantorAdd: 'ዋስ ጨምር',
  guarantorsEmpty: 'እስካሁን ዋስ አልጨመሩም።',
  guarantorNeedsWorker: 'ዋስ ለመጨመር መጀመሪያ የባለሙያ መገለጫዎን ይፍጠሩ።',
  guarantorTypeLabel: 'የዋስ ዓይነት',
  typeIdir: 'እድር',
  typeEqub: 'እቁብ',
  typeEmployer: 'አሠሪ',
  typeVerifiedWorker: 'የተረጋገጠ ባለሙያ',
  guarantorNameLabel: 'የዋስ ስም',
  nameRequired: 'የዋስ ስም ያስፈልጋል።',
  nameTooLong: 'ስሙ በጣም ረዝሟል (እስከ 120 ፊደላት)።',
  guarantorContactLabel: 'የዋስ ስልክ ቁጥር',
  contactHint: 'ቁጥሩ ተሸፍኖ ይቀመጣል፤ ሙሉውን የሚያገኙት ሠራተኞቻችን ብቻ ናቸው።',
  contactInvalid: 'ትክክለኛ የኢትዮጵያ ስልክ ቁጥር ያስገቡ (ወይም ባዶ ይተዉት)።',
  guarantorStatementLabel: 'የዋስትና መግለጫ',
  statementHint: 'ዋሱ ስለ እርስዎ ምን እንደሚመሰክር በአጭሩ ይጻፉ።',
  statementTooLong: 'መግለጫው በጣም ረዝሟል (እስከ 2000 ፊደላት)።',
  guarantorSaveError: 'ዋሱን ማስቀመጥ አልተሳካም። እባክዎ እንደገና ይሞክሩ።',
  gStatusPending: 'በመጣራት ላይ',
  gStatusVerified: 'ተረጋግጧል',
  gStatusRejected: 'ተቀባይነት አላገኘም',
} as const;

const en: Record<keyof typeof am, string> = {
  title: 'Identity verification',
  getVerified: 'Get verified',
  currentLevel: 'Current verification level',

  ladderTitle: 'Verification levels',
  ladderCurrentTag: 'You are here',
  ladderNoneDesc: 'Your account is created; your identity is not verified yet.',
  ladderBasicDesc: 'Your phone or Telegram account is confirmed.',
  ladderIdDesc: 'Your ID was reviewed and approved by our staff.',
  ladderFaydaDesc:
    'Your identity is verified with the national Fayda ID (eSignet).',
  ladderProDesc: 'Your professional certification is submitted and approved.',
  ladderGuarantorDesc: 'Guarantors add extra trust at any level.',

  timelineTitle: 'Verification history',
  timelineEmpty: 'You have not submitted a verification request yet.',
  statusPending: 'Pending review',
  statusApproved: 'Approved',
  statusRejected: 'Rejected',
  methodManual: 'Manual ID review',
  methodFayda: 'Fayda (eSignet)',
  submittedLabel: 'Submitted',
  decidedLabel: 'Decided',
  rejectionNotesLabel: 'Reason',

  manualTitle: 'Verify with your ID',
  manualIntro:
    'Take a photo of the front and back of your ID card, plus a selfie. Make sure the photos are clear and readable.',
  idFrontLabel: 'ID front side',
  idBackLabel: 'ID back side',
  selfieLabel: 'Selfie photo',
  choosePhoto: 'Choose photo',
  changePhoto: 'Change photo',
  photoSelected: 'Photo selected',
  tapToAddPhoto: 'Tap to add a photo',
  fileTypeError: 'Please choose an image file.',
  fileTooLarge: 'The photo is too large (up to 10MB).',
  processError: 'Could not process the photo. Please try another one.',

  consentTitle: 'Consent',
  consentText:
    'Your ID photos are used only to verify your identity. They are kept in private storage, visible only to our verification staff, and deleted within 30 days after a decision. By tapping Submit you consent to this processing under the Personal Data Protection Proclamation No. 1321/2024.',
  consentCheckbox: 'I have read this and agree',
  consentRequired: 'Your consent is required to continue.',
  allPhotosRequired: 'All three photos are required.',
  submitVerification: 'Submit for verification',
  uploading: 'Uploading…',
  submitSuccess:
    'Your request has been submitted and is pending review. We will notify you when a decision is made.',
  submitError: 'Submission failed. Please try again.',
  pendingExists:
    'You already have a verification request pending review. Please wait for the decision.',
  rejectedInfo: 'Your previous request was rejected. You can submit again.',

  faydaTitle: 'Verify with Fayda (eSignet)',
  faydaBody: 'Verify quickly using your national Fayda ID.',
  faydaCta: 'Continue with Fayda',
  faydaUnavailable: 'Fayda verification is not configured in this environment yet.',

  guarantorsTitle: 'Guarantors',
  guarantorsIntro:
    'A voucher from an idir, equb, employer, or verified worker strengthens the trust customers place in you.',
  guarantorAdd: 'Add guarantor',
  guarantorsEmpty: 'You have not added a guarantor yet.',
  guarantorNeedsWorker: 'Create your worker profile first to add a guarantor.',
  guarantorTypeLabel: 'Guarantor type',
  typeIdir: 'Idir',
  typeEqub: 'Equb',
  typeEmployer: 'Employer',
  typeVerifiedWorker: 'Verified worker',
  guarantorNameLabel: 'Guarantor name',
  nameRequired: 'The guarantor name is required.',
  nameTooLong: 'The name is too long (up to 120 characters).',
  guarantorContactLabel: 'Guarantor phone number',
  contactHint:
    'The number is stored masked; only our staff can obtain the full contact.',
  contactInvalid: 'Enter a valid Ethiopian phone number (or leave it empty).',
  guarantorStatementLabel: 'Vouching statement',
  statementHint: 'Briefly write what the guarantor attests about you.',
  statementTooLong: 'The statement is too long (up to 2000 characters).',
  guarantorSaveError: 'Saving the guarantor failed. Please try again.',
  gStatusPending: 'Being verified',
  gStatusVerified: 'Verified',
  gStatusRejected: 'Rejected',
};

export const verification = { am, en };
