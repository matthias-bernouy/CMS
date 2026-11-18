import { auditExecution, auditPlan, coverageMatrix } from "../capabilities/coverage";
import { auditBudgets } from "../capabilities/budgets";
import { compareReports } from "../reporting/compare";
import { selectedObligations, selectionFindings } from "../reporting/scope";
import { readRun, writeRun } from "../reporting/history";
import type { CapabilityInventory, Finding, ScenarioDefinition, ScenarioResult } from "../capabilities/types";
import type { RunMetadata, RunReport } from "../reporting/types";

export async function assessmentReport(
    root: string,
    metadata: RunMetadata,
    inventory: CapabilityInventory,
    scenarios: readonly ScenarioDefinition[],
    results: readonly ScenarioResult[],
    findings: readonly Finding[],
    referenceId?: string,
) {
    const required = selectedObligations(metadata, scenarios);
    const coverage = coverageMatrix(inventory, scenarios, results, required);
    const checks = [
        ...findings,
        ...selectionFindings(metadata, scenarios),
        ...auditPlan(inventory, scenarios, required),
        ...auditExecution(scenarios, results, coverage),
        ...auditBudgets(scenarios, results),
    ];
    const draft: RunReport = {
        format: 1,
        metadata,
        inventory,
        scenarios,
        results,
        coverage,
        findings: checks,
        status: "failed",
    };
    let reference: RunReport | null = null;
    if (referenceId) {
        try {
            reference = await readRun(root, referenceId);
        } catch {
            checks.push({
                code: "invalid-reference",
                message: "The supplied reference could not be verified; the failed assessment is retained",
            });
        }
    }
    const comparison = referenceId
        ? compareReports(draft, reference)
        : {
              reference: null,
              candidate: metadata.id,
              comparable: false,
              findings: [],
              changes: [],
          };
    const report: RunReport = {
        ...draft,
        findings: [...checks, ...comparison.findings],
        status: checks.length || comparison.findings.length ? "failed" : "passed",
    };
    const path = await writeRun(root, report, comparison);
    return { report, path };
}
