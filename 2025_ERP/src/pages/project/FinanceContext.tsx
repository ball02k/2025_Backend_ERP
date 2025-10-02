import React from 'react';

export type ProjectFinanceCtx = { projectId?: number };
export const ProjectFinanceContext = React.createContext<ProjectFinanceCtx>({});

export function useProjectFinance() {
  return React.useContext(ProjectFinanceContext);
}

