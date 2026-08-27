// Namespace: jobs — post-a-job + my jobs. Minimal seed; jobs feature agent extends.

const am = {
  myJobsTitle: 'ሥራዎቼ',
  postTitle: 'ሥራ ለጥፍ',
  detailTitle: 'የሥራ ዝርዝር',
} as const;

const en: Record<keyof typeof am, string> = {
  myJobsTitle: 'My jobs',
  postTitle: 'Post a job',
  detailTitle: 'Job details',
};

export const jobs = { am, en };
