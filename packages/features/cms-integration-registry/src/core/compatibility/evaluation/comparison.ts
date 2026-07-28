import type { IntegrationCompatibilityEvaluationInput } from "../../../interfaces/compatibility";
import { collectCompatibilityEvidence, type CompatibilityChangeSink } from "../changes";
import { compareIntegrationDefinitions } from "../definition";
import { normalizedChangedPaths } from "./input";

export function compareCompatibilityPackages(
    baseline: IntegrationCompatibilityEvaluationInput["candidate"],
    candidate: IntegrationCompatibilityEvaluationInput["candidate"],
    changedPaths: readonly string[] | undefined,
) {
    const paths = normalizedChangedPaths(changedPaths);
    return collectCompatibilityEvidence((add) => {
        addSchemaDeclarationEvidence(candidate, add);
        compareIntegrationDefinitions(baseline, candidate, paths, add);
    });
}

export function candidateValidityEvidence(candidate: IntegrationCompatibilityEvaluationInput["candidate"]) {
    return collectCompatibilityEvidence((add) => addSchemaDeclarationEvidence(candidate, add));
}

function addSchemaDeclarationEvidence(
    candidate: IntegrationCompatibilityEvaluationInput["candidate"],
    add: CompatibilityChangeSink,
): void {
    for (const evidence of candidate.schemaDeclarationEvidence ?? []) {
        const contradiction = evidence.verdict === "contradiction";
        const connector = `${evidence.connector.provider}:${evidence.connector.root ?? "."}`;
        add(
            contradiction ? "invalid" : "compatible",
            "schema",
            contradiction ? "schema-declaration-contradiction" : "schema-declaration-consistent",
            `connectors.${connector}.schema.evidence.${evidence.evidenceId}`,
            evidence.message ??
                (contradiction
                    ? "Trusted schema evidence contradicts the declared contract"
                    : "Trusted schema evidence matches the declared contract"),
        );
    }
}
