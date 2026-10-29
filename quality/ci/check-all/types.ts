export type CheckDefinition = { id: string; label: string; args: string[] };
export type CheckExecution = { exitCode: number; stdout: string; stderr: string };
export type CheckResult = CheckDefinition & CheckExecution;
export type CheckExecutor = (check: CheckDefinition) => Promise<CheckExecution>;
export type ReportOptions = { changedPaths: readonly string[]; verbose?: boolean };
