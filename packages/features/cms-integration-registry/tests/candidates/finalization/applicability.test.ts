import { afterEach, expect, test } from "bun:test";
import {
    identifyPlatformVerificationSuiteDefinition,
    POSTGRES_PLATFORM_VERIFICATION_SUITES_V1,
} from "@bernouy/cms-integration-verification";
import { cleanupRegistryFixtures, publicationPackage, registryFixture } from "../../publication/fixtures";
import { planningPolicy, verificationCandidate } from "../planning/fixtures";
import { completePassedCandidate, releaseFinalizer, releaseStores } from "./fixtures";

afterEach(cleanupRegistryFixtures);

test("keeps explicit non-applicable platform suites successful in final release evidence", async () => {
    const fixture = registryFixture();
    const base = await planningPolicy();
    const runner = base.approvedRunners[0]!;
    const policy = {
        ...base,
        platformRequiredSuites: await Promise.all(
            POSTGRES_PLATFORM_VERIFICATION_SUITES_V1.map(async (definition) => ({
                suiteId: definition.suiteId,
                suiteDigest: (await identifyPlatformVerificationSuiteDefinition(definition)).digest,
                runner,
                applicability: definition.applicability,
            })),
        ),
    };
    const candidate = await verificationCandidate(await publicationPackage("demo", "1.0.0"));
    const setup = await completePassedCandidate(fixture, "candidate-applicability", candidate, policy);

    const finalization = await releaseFinalizer(fixture, setup.store, setup.policy).finalize("candidate-applicability");
    expect(finalization).toMatchObject({ status: "published" });
    const history = await releaseStores(fixture).verificationReports.get("demo", "1.0.0");
    expect(history?.current.outcome).toBe("passed");
    expect(history?.current.results.filter((suite) => suite.outcome === "not-applicable")).toHaveLength(8);
    expect(history?.current.results.find((suite) => suite.outcome === "not-applicable")?.applicable).toBeFalse();
});
