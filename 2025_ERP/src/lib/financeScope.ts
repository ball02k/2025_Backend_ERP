let currentProjectId: number | undefined;

export function setFinanceProjectId(id?: number) {
  currentProjectId = Number.isFinite(Number(id)) ? Number(id) : undefined;
}

export function getFinanceProjectId(): number | undefined {
  return currentProjectId;
}

