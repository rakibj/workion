export const PROJECT_STATUSES = [
  'planning',
  'in_progress',
  'in_review',
  'approved',
  'delivered',
  'archived',
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
