import type { IntegrationVersionReleaseLevel } from "@bernouy/cms-integrations";
import type {
    IntegrationCompatibilityEvidence,
    IntegrationCompatibilityEvidenceClassification,
    IntegrationCompatibilityOutcome,
} from "../../interfaces/compatibility";

export type CompatibilityChangeSink = (
    classification: IntegrationCompatibilityEvidenceClassification,
    surface: IntegrationCompatibilityEvidence["surface"],
    code: string,
    path: string,
    message: string,
) => void;

export function collectCompatibilityEvidence(
    compare: (add: CompatibilityChangeSink) => void,
): readonly IntegrationCompatibilityEvidence[] {
    const evidence: IntegrationCompatibilityEvidence[] = [];
    compare((classification, surface, code, path, message) => {
        evidence.push({ classification, surface, code, path, message });
    });
    evidence.sort(compareEvidence);
    return evidence.filter((entry, index) => index === 0 || !sameEvidence(entry, evidence[index - 1]!));
}

export function compatibilityOutcome(
    evidence: readonly IntegrationCompatibilityEvidence[],
): IntegrationCompatibilityOutcome {
    if (evidence.some((entry) => entry.classification === "invalid")) {
        return "invalid";
    }
    if (evidence.some((entry) => entry.classification === "unknown")) {
        return "unknown";
    }
    if (evidence.some((entry) => entry.classification === "breaking")) {
        return "breaking";
    }
    return "compatible";
}

export function compatibilityRequiredReleaseLevel(
    evidence: readonly IntegrationCompatibilityEvidence[],
): IntegrationVersionReleaseLevel {
    if (
        evidence.some(
            (entry) =>
                entry.classification === "breaking" ||
                entry.classification === "unknown" ||
                entry.classification === "invalid",
        )
    ) {
        return "major";
    }
    if (evidence.some((entry) => entry.classification === "additive")) {
        return "minor";
    }
    return "patch";
}

export function releaseLevelSatisfies(
    actual: IntegrationVersionReleaseLevel,
    required: IntegrationVersionReleaseLevel,
): boolean {
    const rank: Record<IntegrationVersionReleaseLevel, number> = { patch: 0, minor: 1, major: 2 };
    return rank[actual] >= rank[required];
}

function compareEvidence(left: IntegrationCompatibilityEvidence, right: IntegrationCompatibilityEvidence): number {
    return (
        left.surface.localeCompare(right.surface) ||
        left.path.localeCompare(right.path) ||
        left.code.localeCompare(right.code) ||
        left.classification.localeCompare(right.classification) ||
        left.message.localeCompare(right.message)
    );
}

function sameEvidence(left: IntegrationCompatibilityEvidence, right: IntegrationCompatibilityEvidence): boolean {
    return (
        left.classification === right.classification &&
        left.surface === right.surface &&
        left.code === right.code &&
        left.path === right.path &&
        left.message === right.message
    );
}
