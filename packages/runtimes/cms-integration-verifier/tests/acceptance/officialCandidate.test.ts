import { describe, expect, test } from "bun:test";
import { disposablePostgresAvailable } from "../service/postgresFixture";
import { assertExactClaim } from "./claimAssertions";
import { PRODUCTION_RUNNER } from "./fixtureResources";
import {
    assertPublishedRelease,
    managementJson,
    packagePath,
    publicJson,
    publicResponse,
    releasePath,
    uploadCandidate,
} from "./repositoryAssertions";
import { assertExactSubmission } from "./resultAssertions";
import { startOfficialCandidateAcceptance } from "./support";

const postgresTest = disposablePostgresAvailable ? test : test.skip;

describe("official candidate release acceptance", () => {
    postgresTest(
        "admits the real additive Photo Albums release through HTTP, PostgreSQL, and full-stack verification",
        async () => {
            const fixture = await startOfficialCandidateAcceptance();
            try {
                const source = fixture.catalog.current().locateExactVersion("photo-albums", "1.0.0");
                if (!source) {
                    throw new Error("Bootstrapped Photo Albums baseline package is missing");
                }
                const basicBlocs = fixture.catalog.current().locateExactVersion("basic-blocs", "1.0.0");
                if (!basicBlocs) {
                    throw new Error("Bootstrapped Basic Blocs dependency package is missing");
                }
                const initialIndex = await publicJson(
                    fixture.publicOrigin,
                    "/api/integrations/index?kind=photo-albums",
                );
                expect(initialIndex).toMatchObject({ stable: "1.0.0", latest: "1.0.0" });
                expect(initialIndex.versions.map(({ version }: { version: string }) => version)).toEqual(["1.0.0"]);
                expect(await publicResponse(fixture.publicOrigin, releasePath())).toHaveProperty("status", 404);
                expect(await publicResponse(fixture.publicOrigin, packagePath())).toHaveProperty("status", 404);

                const queued = await uploadCandidate(fixture.managementOrigin, fixture.candidate.canonicalBytes);
                expect(queued).toMatchObject({
                    status: "queued",
                    kind: "photo-albums",
                    version: "1.1.0",
                    packageDigest: fixture.candidate.packageDigest,
                    verificationDigest: fixture.candidate.verificationDigest,
                });

                const planned = await managementJson(
                    fixture.managementOrigin,
                    `/api/integrations/candidates/report?candidateId=${queued.candidateId}`,
                );
                expect(planned.report.compatibility).toMatchObject({
                    outcome: "compatible",
                    contractAdmissible: true,
                    releaseLevel: "minor",
                    requiredReleaseLevel: "minor",
                    baselines: [{ kind: "photo-albums", version: "1.0.0", packageDigest: source.package.digest }],
                });
                expect(
                    planned.report.compatibility.findings.some(
                        ({ code }: { code: string }) => code === "legacy-schema-baseline-missing",
                    ),
                ).toBeFalse();
                expect(planned.report.verification.runner).toEqual(PRODUCTION_RUNNER);
                expect(await publicResponse(fixture.publicOrigin, releasePath())).toHaveProperty("status", 404);
                expect(await publicResponse(fixture.publicOrigin, packagePath())).toHaveProperty("status", 404);

                const execution = await fixture.supervisor.runNext();
                expect(execution).toMatchObject({
                    outcome: "submitted",
                    candidateId: queued.candidateId,
                    status: "published",
                });
                await assertExactClaim(
                    fixture.trace.claimed,
                    source.package.digest,
                    fixture.candidate.packageDigest,
                    basicBlocs.package.digest,
                );
                await assertExactSubmission(fixture.trace, queued.candidateId, basicBlocs.package.digest);

                await assertPublishedRelease(fixture);
            } finally {
                await fixture.cleanup();
            }
        },
        1_800_000,
    );
});
