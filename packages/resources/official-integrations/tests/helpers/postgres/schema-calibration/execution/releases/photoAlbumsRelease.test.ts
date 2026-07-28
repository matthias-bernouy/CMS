import { expect, test } from "bun:test";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { verifyPhotoAlbumsAdditiveRelease } from "./photoAlbumsRelease";

const enabled =
    process.env.ALLOW_POSTGRES_CONTRACT_SCHEMA_RESET === "cmscore-postgres-contracts" && !!process.env.DATABASE_URL;
const postgresTest = enabled ? test : test.skip;

postgresTest("Photo Albums 1.1.0 is equivalent from fresh install and migration", async () => {
    const report = await verifyPhotoAlbumsAdditiveRelease({
        env: process.env,
        officialRoot: OFFICIAL_INTEGRATIONS_ROOT,
    });
    expect(report).toMatchObject({
        postgresVersion: "160014",
        migrationIds: ["add-photo-credit"],
        repeatableIds: ["function-privileges", "table-privileges"],
        freshDeterministic: true,
        freshRerunDeterministic: true,
        migratedEquivalent: true,
        migrationRerunDeterministic: true,
        declaredSchemaMatchesObserved: true,
        rowLevelSecurityVerified: true,
    });
});
