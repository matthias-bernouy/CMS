import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import type {
    AdmissionBehavioralRlsPlanBindingV1,
    BehavioralRlsAuthorInputV1,
    BehavioralRlsPlanV1,
    IdentifiedBehavioralRlsPlanV1,
    IntegrationVerificationEnvelopeV1,
} from "../../../../interfaces/verification";
import { BEHAVIORAL_RLS_AUTHOR_INPUT_SCHEMA, BEHAVIORAL_RLS_PLAN_SCHEMA } from "../../../../interfaces/verification";
import { IntegrationVerificationContractError } from "../../../validation/errors";
import { assertContractIJson, invalid, strictRecord } from "../../../validation/structure";
import { exactVersion, packageKind, sha256Digest } from "../../../validation/values";
import { identifyCanonicalVerificationContract, parseVerificationControlDocument } from "../../shared";
import { BEHAVIORAL_RLS_PLAN_LIMITS, parseBehavioralRlsProbes } from "./probes";

export { BEHAVIORAL_RLS_PLAN_LIMITS } from "./probes";
export const BEHAVIORAL_RLS_PLATFORM_SUITE_ID = "platform-postgres-rls-behavior" as const;

export function parseBehavioralRlsAuthorInput(input: string | Uint8Array): BehavioralRlsAuthorInputV1 {
    return validateBehavioralRlsAuthorInput(parseVerificationControlDocument(input));
}

export function validateBehavioralRlsAuthorInput(value: unknown): BehavioralRlsAuthorInputV1 {
    assertContractIJson(value);
    const input = strictRecord(value, "behavioralRls", ["schema", "probes"]);
    if (input.schema !== BEHAVIORAL_RLS_AUTHOR_INPUT_SCHEMA) {
        throw invalid("behavioralRls.schema", `must be ${BEHAVIORAL_RLS_AUTHOR_INPUT_SCHEMA}`);
    }
    return {
        schema: BEHAVIORAL_RLS_AUTHOR_INPUT_SCHEMA,
        probes: parseBehavioralRlsProbes(input.probes, "behavioralRls.probes"),
    };
}

export async function buildBehavioralRlsPlan(
    input: Readonly<{
        verification: IntegrationVerificationEnvelopeV1;
        target: BehavioralRlsPlanV1["target"];
        policyDigest: string;
    }>,
): Promise<IdentifiedBehavioralRlsPlanV1> {
    const path = input.verification.manifest.behavioralRls;
    const authorInput = path
        ? parseBehavioralRlsAuthorInput(input.verification.files[path]!.content)
        : { schema: BEHAVIORAL_RLS_AUTHOR_INPUT_SCHEMA, probes: [] as const };
    return await identifyBehavioralRlsPlan({
        schema: BEHAVIORAL_RLS_PLAN_SCHEMA,
        target: input.target,
        policyDigest: input.policyDigest,
        probes: authorInput.probes,
    });
}

export function validateBehavioralRlsPlan(value: unknown): BehavioralRlsPlanV1 {
    assertContractIJson(value);
    const input = strictRecord(value, "behavioralRlsPlan", ["schema", "target", "policyDigest", "probes"]);
    if (input.schema !== BEHAVIORAL_RLS_PLAN_SCHEMA) {
        throw invalid("behavioralRlsPlan.schema", `must be ${BEHAVIORAL_RLS_PLAN_SCHEMA}`);
    }
    const target = strictRecord(input.target, "behavioralRlsPlan.target", [
        "kind",
        "version",
        "candidateDigest",
        "packageDigest",
        "verificationDigest",
    ]);
    const plan: BehavioralRlsPlanV1 = {
        schema: BEHAVIORAL_RLS_PLAN_SCHEMA,
        target: {
            kind: packageKind(target.kind, "behavioralRlsPlan.target.kind"),
            version: exactVersion(target.version, "behavioralRlsPlan.target.version"),
            candidateDigest: sha256Digest(target.candidateDigest, "behavioralRlsPlan.target.candidateDigest"),
            packageDigest: sha256Digest(target.packageDigest, "behavioralRlsPlan.target.packageDigest"),
            verificationDigest: sha256Digest(target.verificationDigest, "behavioralRlsPlan.target.verificationDigest"),
        },
        policyDigest: sha256Digest(input.policyDigest, "behavioralRlsPlan.policyDigest"),
        probes: parseBehavioralRlsProbes(input.probes, "behavioralRlsPlan.probes"),
    };
    if (canonicalJsonBytes(plan).byteLength > BEHAVIORAL_RLS_PLAN_LIMITS.canonicalBytes) {
        throw new IntegrationVerificationContractError(
            "limit_exceeded",
            `behavioralRlsPlan must not exceed ${BEHAVIORAL_RLS_PLAN_LIMITS.canonicalBytes} canonical bytes`,
            "behavioralRlsPlan",
        );
    }
    return plan;
}

export async function identifyBehavioralRlsPlan(value: unknown): Promise<IdentifiedBehavioralRlsPlanV1> {
    const plan = validateBehavioralRlsPlan(value);
    const identified = await identifyCanonicalVerificationContract(plan);
    return { plan, canonicalBytes: identified.canonicalBytes, digest: identified.digest };
}

export async function validateBehavioralRlsPlanBinding(
    value: unknown,
    expected: AdmissionBehavioralRlsPlanBindingV1 | undefined,
): Promise<AdmissionBehavioralRlsPlanBindingV1 | undefined> {
    if (value === undefined && expected === undefined) {
        return undefined;
    }
    if (value === undefined || expected === undefined) {
        throw invalid("behavioralRlsPlan", "must match the admission plan presence exactly");
    }
    const input = strictRecord(value, "behavioralRlsPlan", ["digest", "plan"]);
    const digest = sha256Digest(input.digest, "behavioralRlsPlan.digest");
    const identified = await identifyBehavioralRlsPlan(input.plan);
    if (digest !== identified.digest || digest !== expected.digest) {
        throw invalid("behavioralRlsPlan.digest", "must identify the exact admission plan");
    }
    return { digest, plan: identified.plan };
}
