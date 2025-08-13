export const PROJECT_STATUSES = ["DRAFT","ACTIVE","ON_HOLD","COMPLETED","CANCELLED"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const CONTRACT_TYPES = ["JCT","NEC4","OTHER"] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export const WORK_STAGES = ["RIBA_0","RIBA_1","RIBA_2","RIBA_3","RIBA_4","RIBA_5","RIBA_6","RIBA_7"] as const;
export type WorkStage = (typeof WORK_STAGES)[number];
