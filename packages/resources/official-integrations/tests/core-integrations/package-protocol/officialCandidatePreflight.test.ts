import { describe, expect, test } from "bun:test";
import { prepareFsIntegrationRegistryCandidate } from "@bernouy/cms-integration-registry/fs";
import {
    buildOfficialIntegrationPackages,
    loadOfficialIntegrationVerificationBackfill,
    selectOfficialVerificationBackfillPackages,
} from "@bernouy/cms-official-integrations/publication";

const EXPECTED_POST_BOOTSTRAP_RELEASES = [
    "consent@1.0.0",
    "documentation-blocs@1.0.0",
    "photo-albums@1.1.0",
    "workspace-blocs@1.0.0",
];

describe("official post-bootstrap release preflight", () => {
    test("runs every release outside the historical bootstrap through normal candidate preparation", async () => {
        const packages = await buildOfficialIntegrationPackages();
        const backfill = await loadOfficialIntegrationVerificationBackfill();
        const historical = selectOfficialVerificationBackfillPackages(packages, backfill.index);
        const historicalIdentities = new Set(historical.map(releaseIdentity));
        const postBootstrap = packages.filter((release) => !historicalIdentities.has(releaseIdentity(release)));

        expect(postBootstrap.map(releaseIdentity)).toEqual(EXPECTED_POST_BOOTSTRAP_RELEASES);
        for (const release of postBootstrap) {
            const prepared = await prepareFsIntegrationRegistryCandidate(release.package);
            expect({
                kind: prepared.definition.kind,
                version: prepared.definition.version,
                digest: prepared.package.digest,
            }).toEqual({
                kind: release.kind,
                version: release.version,
                digest: release.digest,
            });
        }
    });
});

function releaseIdentity(release: Readonly<{ kind: string; version: string }>): string {
    return `${release.kind}@${release.version}`;
}
