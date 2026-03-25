export interface ProjectCsvRow {
  name: string;
  type: string;
  sNo?: string;
  budgetCode: string;
  fiscalYear: string;
  source: string;  

  allocatedBudget: string | number;
  internalBudget?: string | number;
  centralBudget?: string | number;
  provinceBudget?: string | number;

  status?: string;
}
