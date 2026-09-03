import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import type {
    IdentifiedReleaseVerificationPlanV1,
    IntegrationVerificationEnvelopeV1,
    ReleaseVerificationPlanBaselineV1,
    ReleaseVerificationPlanFixtureV1,
    ReleaseVerificationPlanV1,
} from "../../../interfaces/verification";
import { RELEASE_VERIFICATION_PLAN_SCHEMA } from "../../../interfaces/verification";
import { IntegrationVerificationContractError } from "../../validation/errors";
import { assertContractIJson, assertUnique, boundedArray, strictRecord } from "../../validation/structure";
import {
    exactVersion,
    requiredBoolean,
    requiredText,
    sha256Digest,
    supportedVersionRange,
} from "../../validation/values";
import { planReleaseVerification } from "./releasePlan";

export function validateReleaseVerificationPlan(value: unknown): ReleaseVerificationPlanV1 {
    assertContractIJson(value);
    const input = strictRecord(value, "releaseVerificationPlan", [
        "schema",
        "baselines",
        "fixtures",
        "hasMigrations",
        "scenarios",
        "nominalScenarioCount",
        "resilienceScenarioCount",
        "distinctMigrationStateCount",
    ]);
    if (input.schema !== RELEASE_VERIFICATION_PLAN_SCHEMA) {
        throw new IntegrationVerificationContractError(
            "invalid_schema",
            `releaseVerificationPlan.schema must be ${RELEASE_VERIFICATION_PLAN_SCHEMA}`,
            "releaseVerificationPlan.schema",
        );
    }
    const baselines = boundedArray(input.baselines, "releaseVerificationPlan.baselines", parseBaseline);
    const fixtures = boundedArray(input.fixtures, "releaseVerificationPlan.fixtures", parseFixture, { maximum: 32 });
    assertUnique(
        baselines.map(({ version, packageDigest }) => `${version}\0${packageDigest}`),
        "releaseVerificationPlan.baselines",
    );
    assertUnique(
        fixtures.map(({ name }) => name),
        "releaseVerificationPlan.fixtures.name",
    );
    const expected = planReleaseVerification({
        baselines,
        fixtures: fixtures.length ? fixtures : undefined,
        hasMigrations: requiredBoolean(input.hasMigrations, "releaseVerificationPlan.hasMigrations"),
    });
    if (!sameBytes(canonicalJsonBytes(value), canonicalJsonBytes(expected))) {
        throw new IntegrationVerificationContractError(
            "invalid_contract",
            "releaseVerificationPlan is not the canonical plan for its declared inputs",
            "releaseVerificationPlan",
        );
    }
    return expected;
}

export async function identifyReleaseVerificationPlan(value: unknown): Promise<IdentifiedReleaseVerificationPlanV1> {
    const plan = validateReleaseVerificationPlan(value);
    const canonicalBytes = canonicalJsonBytes(plan);
    return { plan, canonicalBytes, digest: await sha256Hex(canonicalBytes) };
}

export function assertReleaseVerificationPlanMatchesVerification(
    plan: ReleaseVerificationPlanV1,
    verification: IntegrationVerificationEnvelopeV1,
): void {
    const declared = [...(verification.manifest.upgradeFixture?.scenarios ?? [])]
        .map(({ name, from }) => ({ name, from }))
        .toSorted((left, right) => left.name.localeCompare(right.name));
    if (!sameBytes(canonicalJsonBytes(plan.fixtures), canonicalJsonBytes(declared))) {
        throw new IntegrationVerificationContractError(
            "invalid_reference",
            "releaseVerificationPlan fixtures do not match the exact verification bundle",
            "releaseVerificationPlan.fixtures",
        );
    }
}

function parseBaseline(value: unknown, field: string): ReleaseVerificationPlanBaselineV1 {
    const input = strictRecord(value, field, ["version", "packageDigest", "resilienceKey"]);
    return {
        version: exactVersion(input.version, `${field}.version`),
        packageDigest: sha256Digest(input.packageDigest, `${field}.packageDigest`),
        resilienceKey: sha256Digest(input.resilienceKey, `${field}.resilienceKey`),
    };
}

function parseFixture(value: unknown, field: string): ReleaseVerificationPlanFixtureV1 {
    const input = strictRecord(value, field, ["name", "from"]);
    return {
        name: requiredText(input.name, `${field}.name`, 160),
        from: supportedVersionRange(input.from, `${field}.from`),
    };
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
    return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}
