import { describe, expect, test } from "bun:test";
import {
    INTEGRATION_UPGRADE_FIXTURES_SDK_V1_SPECIFIER,
    INTEGRATION_VERIFICATION_SDK_V1_SPECIFIER,
    computeIntegrationVerificationDigest,
    validateIntegrationVerificationEnvelope,
    validateIntegrationVerificationSuiteSources,
} from "../../../../src/exports/index";
import { verificationEnvelope } from "../../fixtures";

describe("portable upgrade fixture bundle", () => {
    test("accepts both closed verification SDKs and binds the source closure", async () => {
        const envelope = await upgradeEnvelope();

        await expect(validateIntegrationVerificationSuiteSources(envelope)).resolves.toEqual(envelope);
        const changed = {
            ...envelope,
            files: {
                ...envelope.files,
                "upgrade/helper.ts": { encoding: "utf8" as const, content: "export const value = 2;" },
            },
        };
        await expect(computeIntegrationVerificationDigest(changed)).resolves.not.toBe(
            await computeIntegrationVerificationDigest(envelope),
        );
    });

    test("rejects missing entrypoints and ambient runtime access", async () => {
        const envelope = await upgradeEnvelope();
        expect(() =>
            validateIntegrationVerificationEnvelope({
                ...envelope,
                manifest: {
                    ...envelope.manifest,
                    upgradeFixture: {
                        entrypoint: "upgrade/missing.ts",
                        scenarios: [{ name: "existing data", from: "^1.0.0" }],
                    },
                },
            }),
        ).toThrow(/does not reference a bundle file/u);
        await expect(
            computeIntegrationVerificationDigest({
                ...envelope,
                files: {
                    ...envelope.files,
                    "upgrade/upgrade-fixtures.ts": {
                        encoding: "utf8",
                        content: "export default fetch('https://example.invalid');",
                    },
                },
            }),
        ).rejects.toThrow(/forbidden runtime global/u);
    });
});

async function upgradeEnvelope() {
    const envelope = await verificationEnvelope();
    return validateIntegrationVerificationEnvelope({
        ...envelope,
        manifest: {
            ...envelope.manifest,
            upgradeFixture: {
                entrypoint: "upgrade/upgrade-fixtures.ts",
                scenarios: [{ name: "existing data", from: "^1.0.0" }],
            },
        },
        files: {
            ...envelope.files,
            "upgrade/upgrade-fixtures.ts": {
                encoding: "utf8",
                content:
                    `import { expect } from ${JSON.stringify(INTEGRATION_VERIFICATION_SDK_V1_SPECIFIER)};` +
                    `import { defineUpgradeScenarios } from ${JSON.stringify(INTEGRATION_UPGRADE_FIXTURES_SDK_V1_SPECIFIER)};` +
                    `import { value } from "./helper.ts";` +
                    "expect(value).toBe(1); export default defineUpgradeScenarios({ schema: 'ulvia.upgrade-fixtures.v1', scenarios: [] });",
            },
            "upgrade/helper.ts": { encoding: "utf8", content: "export const value = 1;" },
        },
    });
}
