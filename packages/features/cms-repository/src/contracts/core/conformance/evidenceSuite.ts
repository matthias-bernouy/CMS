import type { ConformanceEvidence } from "cms-repository/contracts/interfaces/ConformanceEvidence";
import { canonicalizeIJson } from "cms-repository/contracts/core/protocol/canonical";
import { parseStrictJson } from "cms-repository/contracts/core/protocol/json";
import { fail } from "./evidenceValues";

export async function verifyEvidenceSuiteReference(evidence: ConformanceEvidence): Promise<void> {
    const value = parseStrictJson(evidence.suite.canonicalJson, 4 * 1024 * 1024, 32) as Record<string, unknown>;
    if (canonicalizeIJson(value, 32) !== evidence.suite.canonicalJson) {
        fail("Conformance suite evidence is not canonical");
    }
    if (
        value.kind !== "contract-conformance-suite" ||
        value.contractId !== evidence.contract.id ||
        value.contractVersion !== evidence.contract.version ||
        value.contractDigest !== evidence.contract.digest ||
        value.version !== evidence.suite.version
    ) {
        fail("Conformance suite evidence coordinates do not match the run");
    }
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(evidence.suite.canonicalJson));
    if (`sha256:${Buffer.from(hash).toString("hex")}` !== evidence.suite.digest) {
        fail("Conformance suite evidence digest does not match its bytes");
    }
}
