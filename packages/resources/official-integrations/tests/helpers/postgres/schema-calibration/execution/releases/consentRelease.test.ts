import { expect, test } from "bun:test";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { verifyConsentRelease } from "./consentRelease";

const enabled =
    process.env.ALLOW_POSTGRES_CONTRACT_SCHEMA_RESET === "cmscore-postgres-contracts" && !!process.env.DATABASE_URL;
const postgresTest = enabled ? test : test.skip;

postgresTest("Consent 1.0.0 has a deterministic declared PostgreSQL contract", async () => {
    const report = await verifyConsentRelease({
        env: process.env,
        officialRoot: OFFICIAL_INTEGRATIONS_ROOT,
    });
    expect(report).toMatchObject({
        schema: "cms.integration.consent-release-verification.v1",
        postgresVersion: "160014",
        freshDeterministic: true,
        rerunDeterministic: true,
        declaredSchemaMatchesObserved: true,
    });
    expect(report.packageDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(report.observedSchemaDigest).toMatch(/^[a-f0-9]{64}$/);
});
