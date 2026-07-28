import type { CompatibilityReportV2, ReportOrigin, ReportProvenance } from "@bernouy/cms-integration-verification";
import type {
    IntegrationCompatibilityEvaluation,
    IntegrationCompatibilityEvaluationInput,
    IntegrationCompatibilityEvaluatorOptions,
} from "../../../interfaces/compatibility";
import { immutableClone } from "../../catalog/immutability";
import { assertCompatibilityText } from "./input";
import { evaluateCompatibilityInput } from "./report";
import { buildCompatibilityReportV2 } from "./reportBuilder";

export class IntegrationCompatibilityEvaluator {
    constructor(private readonly options: IntegrationCompatibilityEvaluatorOptions) {
        assertCompatibilityText(options.identity.name, "evaluator name");
        assertCompatibilityText(options.identity.version, "evaluator version");
    }

    evaluate(input: IntegrationCompatibilityEvaluationInput): IntegrationCompatibilityEvaluation {
        return immutableClone(evaluateCompatibilityInput(input));
    }

    async buildRoot(
        input: IntegrationCompatibilityEvaluationInput,
        origin: ReportOrigin,
        provenance: ReportProvenance,
    ) {
        return await buildCompatibilityReportV2({
            evaluation: this.evaluate(input),
            evaluator: this.options.identity,
            history: {
                ...this.reportMetadata(),
                revisionType: "root",
                origin,
            },
            provenance,
        });
    }

    async buildRevision(
        input: IntegrationCompatibilityEvaluationInput,
        current: CompatibilityReportV2,
        provenance: ReportProvenance,
    ) {
        assertCompatibilityText(provenance.actor, "revision actor");
        assertCompatibilityText(provenance.reason, "revision reason");
        return await buildCompatibilityReportV2({
            evaluation: this.evaluate(input),
            evaluator: this.options.identity,
            history: {
                ...this.reportMetadata(),
                revisionType: "revision",
                origin: current.origin,
                supersedes: current.reportId,
            },
            provenance,
        });
    }

    private reportMetadata() {
        const reportId = this.options.createReportId();
        const createdAt = this.options.now();
        assertCompatibilityText(reportId, "report ID");
        assertCompatibilityText(createdAt, "report creation time");
        return { reportId, createdAt };
    }
}
