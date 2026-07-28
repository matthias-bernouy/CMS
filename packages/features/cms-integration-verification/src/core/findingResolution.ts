import type {
    CompatibilityFinding,
    CompatibilityFindingResolutionResult,
    FindingResolutionPolicyRule,
    FindingResolutionProof,
    ResolvedCompatibilityFinding,
} from "../interfaces/finding";
import type { VerificationPolicyIdentity } from "../interfaces/runner";
import {
    findingResolutionProofAppliesToPolicy,
    parseCompatibilityFinding,
    parseFindingResolutionProof,
} from "./finding";
import { IntegrationVerificationContractError } from "./validation/errors";

export async function resolveCompatibilityFindings(
    input: Readonly<{
        findings: readonly CompatibilityFinding[];
        proofs: readonly FindingResolutionProof[];
        policy: VerificationPolicyIdentity;
        rules: readonly FindingResolutionPolicyRule[];
    }>,
): Promise<CompatibilityFindingResolutionResult> {
    const findings = await Promise.all(input.findings.map((finding) => parseCompatibilityFinding(finding)));
    const proofs = input.proofs.map((proof) => parseFindingResolutionProof(proof));
    const rules = validateRules(input.rules);
    assertUnique(
        findings.map((finding) => finding.findingId),
        "finding",
    );
    assertUnique(
        proofs.map((proof) => proof.findingId),
        "proof",
    );
    const findingIds = new Set(findings.map((finding) => finding.findingId));
    const orphan = proofs.find((proof) => !findingIds.has(proof.findingId));
    if (orphan) {
        invalid(`Proof references an absent finding: ${orphan.findingId}`);
    }
    const proofByFinding = new Map(proofs.map((proof) => [proof.findingId, proof]));
    const resolved = findings.map((finding) =>
        resolveFinding(finding, proofByFinding.get(finding.findingId), input.policy, rules),
    );
    return Object.freeze({
        findings: Object.freeze(resolved),
        contractAdmissible: resolved.every(
            ({ effectiveClassification }) =>
                effectiveClassification === "compatible" || effectiveClassification === "additive",
        ),
    });
}

function resolveFinding(
    finding: CompatibilityFinding,
    proof: FindingResolutionProof | undefined,
    policy: VerificationPolicyIdentity,
    rules: ReadonlyMap<string, FindingResolutionPolicyRule>,
): ResolvedCompatibilityFinding {
    if (!proof) {
        return Object.freeze({ finding, effectiveClassification: finding.classification });
    }
    if (finding.classification !== "unknown") {
        invalid(`Only unknown findings can receive a resolution proof: ${finding.findingId}`);
    }
    if (!findingResolutionProofAppliesToPolicy(proof, policy)) {
        invalid(`Proof policy is not applicable to the current policy: ${proof.findingId}`);
    }
    const rule = rules.get(ruleKey(finding.surface, finding.code));
    if (!rule) {
        invalid(`Finding is not externally resolvable by policy: ${finding.surface}:${finding.code}`);
    }
    if (!rule.proofTypes.includes(proof.proofType) || !rule.producers.includes(proof.producer)) {
        invalid(`Proof type or producer is not approved for finding: ${finding.findingId}`);
    }
    if (rule.runnerDigests) {
        if (!proof.runnerDigest || !rule.runnerDigests.includes(proof.runnerDigest)) {
            invalid(`Proof runner is not approved for finding: ${finding.findingId}`);
        }
    }
    return Object.freeze({
        finding,
        effectiveClassification:
            proof.outcome === "resolved-compatible"
                ? "compatible"
                : proof.outcome === "confirmed-breaking"
                  ? "breaking"
                  : "invalid",
        proof,
    });
}

function validateRules(
    rules: readonly FindingResolutionPolicyRule[],
): ReadonlyMap<string, FindingResolutionPolicyRule> {
    const result = new Map<string, FindingResolutionPolicyRule>();
    for (const rule of rules) {
        const key = ruleKey(rule.surface, rule.code);
        if (result.has(key) || rule.proofTypes.length === 0 || rule.producers.length === 0) {
            invalid(`Finding resolution rule is duplicated or empty: ${key}`);
        }
        assertUnique(rule.proofTypes, `${key} proof type`);
        assertUnique(rule.producers, `${key} producer`);
        if (rule.runnerDigests) {
            assertUnique(rule.runnerDigests, `${key} runner`);
        }
        result.set(
            key,
            Object.freeze({
                ...rule,
                proofTypes: Object.freeze([...rule.proofTypes]),
                producers: Object.freeze([...rule.producers]),
                ...(rule.runnerDigests ? { runnerDigests: Object.freeze([...rule.runnerDigests]) } : {}),
            }),
        );
    }
    return result;
}

function assertUnique(values: readonly string[], label: string): void {
    if (new Set(values).size !== values.length) {
        invalid(`Duplicate ${label} identity`);
    }
}

function ruleKey(surface: string, code: string): string {
    return `${surface}\0${code}`;
}

function invalid(message: string): never {
    throw new IntegrationVerificationContractError("invalid_reference", message, "findingResolution");
}
