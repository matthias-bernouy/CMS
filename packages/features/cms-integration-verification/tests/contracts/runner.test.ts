import { describe, expect, test } from "bun:test";
import {
    parsePinnedVerificationRunnerIdentity,
    parseVerificationRunnerRequirement,
    runnerSatisfiesRequirement,
} from "../../src/exports/index";
import { IMAGE_A } from "./fixtures";

describe("verification runner identities", () => {
    test("requires an exact runner version and digest-pinned image", () => {
        const runner = parsePinnedVerificationRunnerIdentity({
            name: "cms-postgres",
            version: "1.2.3",
            imageDigest: IMAGE_A,
        });

        expect(runner.imageDigest).toBe(IMAGE_A);
        expect(() => parsePinnedVerificationRunnerIdentity({ ...runner, version: "^1.2.0" })).toThrow(/exact SemVer/);
        expect(() => parsePinnedVerificationRunnerIdentity({ ...runner, imageDigest: "postgres:16" })).toThrow(
            /pinned sha256 image digest/,
        );
    });

    test("matches only the named runner within the supported SemVer range", () => {
        const requirement = parseVerificationRunnerRequirement({ name: "cms-postgres", versionRange: "^1.2.0" });
        const runner = parsePinnedVerificationRunnerIdentity({
            name: "cms-postgres",
            version: "1.9.0",
            imageDigest: IMAGE_A,
        });

        expect(runnerSatisfiesRequirement(runner, requirement)).toBeTrue();
        expect(runnerSatisfiesRequirement({ ...runner, version: "2.0.0" }, requirement)).toBeFalse();
        expect(runnerSatisfiesRequirement({ ...runner, name: "cms-deno" }, requirement)).toBeFalse();
    });
});
