// Namespace: safety — static Safety screen (N13) under /me/safety.
// Amharic (am) is the DEFAULT locale (SPEC C5); `en` is typed against `am`
// so the two cannot drift.
//
// Content rules (plan N13, us-D2 Care.com pattern):
//   * honest limits — verification is NOT a substitute for meeting in person
//   * customer tips and worker tips are mirror images (both sides face a
//     stranger's home / a stranger at the door)
//   * the report path describes ONLY what exists today: the booking page's
//     "Report a problem" (dispute flow) + the Telegram support link. No
//     emergency-numbers row — the numbers are not ops-verified (plan gate).

const am = {
  title: 'ደህንነት',
  meRowHint: 'ከሥራ በፊት፣ በሥራ ጊዜና ችግር ሲያጋጥም',

  intro:
    'ማረጋገጫ ይረዳል — ግን በአካል መተዋወቅን አይተካም። ማንኛውም ሥራ ከመጀመሩ በፊት እነዚህን ምክሮች ይከተሉ።',

  customerHeading: 'ለደንበኞች',
  customerTip1: 'ሥራው ከመጀመሩ በፊት ባለሙያውን በአካል ይተዋወቁ፤ የሚመጣው ሰው እሱ መሆኑን ያረጋግጡ።',
  customerTip2: 'የማረጋገጫ ምልክቱን ይመልከቱ — ምን እንደተፈተሸ በባለሙያው መገለጫ ላይ ይታያል።',
  customerTip3: 'ውይይትዎን በTake It ውስጥ ያቆዩ — ችግር ቢፈጠር የተመዘገበ ማስረጃዎ ነው።',
  customerTip4: 'ሥራውንና ዋጋውን ሥራው ከመጀመሩ በፊት በግልጽ ይስማሙ።',
  customerTip5: 'ሥራው ከመጠናቀቁ በፊት ቅድመ ክፍያ አይክፈሉ፤ የሚጠራጠሩትን ነገር ያሳውቁን።',

  workerHeading: 'ለባለሙያዎች',
  workerTip1: 'ወደ አዲስ ደንበኛ ቤት ከመሄድዎ በፊት ስለ ሥራው ዝርዝር በግልጽ ይጠይቁ።',
  workerTip2: 'የት እና መቼ እንደሚሠሩ ለሚያምኑት ሰው ይንገሩ።',
  workerTip3: 'ውይይትዎን በTake It ውስጥ ያቆዩ — ስምምነትዎ ተመዝግቦ ይቀመጣል።',
  workerTip4: 'የተስማሙበትን ሥራ ብቻ ይሥሩ — ተጨማሪ ሥራ አዲስ ማስያዣ ነው።',
  workerTip5: 'ደህንነትዎ አደጋ ላይ ነው ብለው ከተሰማዎት ሥራውን ማቆም መብትዎ ነው — ወዲያውኑ ያሳውቁን።',

  reportHeading: 'ችግር ሲያጋጥም',
  reportBody:
    'በሥራ ላይ ችግር ካጋጠመዎት የማስያዣውን ገጽ ይክፈቱና «ችግር ሪፖርት ያድርጉ»ን ይንኩ — ጉዳዩ በቀጥታ ለTake It ቡድን ይደርሳል። በማንኛውም ጊዜ በቴሌግራም ሊያገኙን ይችላሉ።',
} as const;

const en: Record<keyof typeof am, string> = {
  title: 'Safety',
  meRowHint: 'Before a job, during a job, and when something goes wrong',

  intro:
    'Verification helps — but it is not a substitute for meeting in person. Follow these tips before any job starts.',

  customerHeading: 'For customers',
  customerTip1:
    'Meet the worker in person before the job starts and check they are the person who arrives.',
  customerTip2:
    'Check the verification badge — the worker’s profile shows exactly what was checked.',
  customerTip3:
    'Keep your conversation inside Take It — if anything goes wrong, it is your recorded evidence.',
  customerTip4: 'Agree the work and the price clearly before the job starts.',
  customerTip5:
    'Never pay in advance before the work is done, and report anything suspicious to us.',

  workerHeading: 'For workers',
  workerTip1:
    'Before going to a new customer’s home, ask clearly about the details of the job.',
  workerTip2: 'Tell someone you trust where and when you are working.',
  workerTip3:
    'Keep your conversation inside Take It — your agreement stays on record.',
  workerTip4:
    'Do only the work you agreed on — anything extra is a new booking.',
  workerTip5:
    'If you feel unsafe, you have the right to stop the job — tell us right away.',

  reportHeading: 'If something goes wrong',
  reportBody:
    'If a problem happens during a job, open the booking page and tap “Report a problem” — it goes straight to the Take It team. You can also reach us on Telegram at any time.',
};

export const safety = { am, en };
