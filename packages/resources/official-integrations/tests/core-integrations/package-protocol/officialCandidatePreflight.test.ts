import { describe, expect, test } from "bun:test";
import { prepareFsIntegrationRegistryCandidate } from "@bernouy/cms-integration-registry/fs";
import {
    buildOfficialIntegrationPackages,
    loadOfficialIntegrationVerificationBackfill,
    selectOfficialVerificationBackfillPackages,
} from "@bernouy/cms-official-integrations/publication";

const EXPECTED_POST_BOOTSTRAP_RELEASES = [
    "commerce@1.1.0",
    "consent@1.0.0",
    "documentation-blocs@1.0.0",
    "photo-albums@1.1.0",
    "photo-albums@1.2.0",
    "photo-albums@2.0.0",
    "workspace-blocs@1.0.0",
];
const DEDICATED_RELEASE_PREFLIGHTS = new Set(["commerce@1.1.0"]);

describe("official post-bootstrap release preflight", () => {
    test("tracks every release and runs normal candidate preparation where applicable", async () => {
        const packages = await buildOfficialIntegrationPackages();
        const backfill = await loadOfficialIntegrationVerificationBackfill();
        const historical = selectOfficialVerificationBackfillPackages(packages, backfill.index);
        const historicalIdentities = new Set(historical.map(releaseIdentity));
        const postBootstrap = packages.filter((release) => !historicalIdentities.has(releaseIdentity(release)));

        expect(postBootstrap.map(releaseIdentity)).toEqual(EXPECTED_POST_BOOTSTRAP_RELEASES);
        for (const release of postBootstrap) {
            // Commerce 1.1.0 deliberately preserves the reviewed 1.0.0 SQL byte-for-byte.
            // Its dedicated release test owns that compatibility proof while normal
            // candidate preparation continues to reject inherited anonymous constraints.
            if (DEDICATED_RELEASE_PREFLIGHTS.has(releaseIdentity(release))) {
                continue;
            }
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
