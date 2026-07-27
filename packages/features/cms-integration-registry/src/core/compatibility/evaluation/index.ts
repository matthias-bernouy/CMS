import type {
    IntegrationCompatibilityAdmissionDecision,
    IntegrationCompatibilityAdmissionReport,
    IntegrationCompatibilityEvaluation,
    IntegrationCompatibilityEvaluationInput,
    IntegrationCompatibilityEvaluatorOptions,
    IntegrationCompatibilityReportProvenance,
    IntegrationCompatibilityReportRevision,
} from "../../../interfaces/compatibility";
import { immutableClone } from "../../catalog/immutability";
import { assertCompatibilityText } from "./input";
import { evaluateCompatibilityInput } from "./report";

export class IntegrationCompatibilityAdmissionError extends Error {
    readonly status = 422;
    readonly code = "integration_compatibility_rejected";

    constructor(readonly report: IntegrationCompatibilityAdmissionReport) {
        super(
            report.outcome === "invalid"
                ? `Integration ${report.kind}@${report.version} has contradictory declaration evidence`
                : `Integration ${report.kind}@${report.version} requires a ${report.requiredReleaseLevel} release instead of ${report.releaseLevel}`,
        );
        this.name = "IntegrationCompatibilityAdmissionError";
    }
}

export class IntegrationCompatibilityEvaluator {
    constructor(private readonly options: IntegrationCompatibilityEvaluatorOptions) {
        assertCompatibilityText(options.identity.name, "evaluator name");
        assertCompatibilityText(options.identity.version, "evaluator version");
    }

    evaluate(input: IntegrationCompatibilityEvaluationInput): IntegrationCompatibilityEvaluation {
        return immutableClone(evaluateCompatibilityInput(input));
    }

    evaluateAdmission(input: IntegrationCompatibilityEvaluationInput): IntegrationCompatibilityAdmissionDecision {
        const evaluation = this.evaluate(input);
        const { contractAdmissible, ...fields } = evaluation;
        const report = immutableClone({
            reportType: "admission" as const,
            ...this.reportMetadata(),
            ...fields,
            admissible: contractAdmissible,
        });
        return report.admissible
            ? { accepted: true, report }
            : { accepted: false, status: 422, code: "integration_compatibility_rejected", report };
    }

    evaluateRevision(
        input: IntegrationCompatibilityEvaluationInput,
        supersedes: string,
        provenance: IntegrationCompatibilityReportProvenance,
    ): IntegrationCompatibilityReportRevision {
        assertCompatibilityText(supersedes, "superseded report ID");
        assertCompatibilityText(provenance.actor, "revision actor");
        assertCompatibilityText(provenance.reason, "revision reason");
        const evaluation = this.evaluate(input);
        const { contractAdmissible, ...fields } = evaluation;
        return immutableClone({
            reportType: "revision" as const,
            ...this.reportMetadata(),
            ...fields,
            admissible: contractAdmissible,
            supersedes,
            provenance,
        });
    }

    private reportMetadata() {
        const id = this.options.createReportId();
        const createdAt = this.options.now();
        assertCompatibilityText(id, "report ID");
        assertCompatibilityText(createdAt, "report creation time");
        return { id, evaluator: this.options.identity, createdAt };
    }
}

export function assertIntegrationCompatibilityAdmission(
    decision: IntegrationCompatibilityAdmissionDecision,
): IntegrationCompatibilityAdmissionReport {
    if (!decision.accepted) {
        throw new IntegrationCompatibilityAdmissionError(decision.report);
    }
    return decision.report;
}
