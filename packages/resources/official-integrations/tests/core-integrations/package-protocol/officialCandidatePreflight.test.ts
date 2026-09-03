import { describe, expect, test } from "bun:test";
import { prepareFsIntegrationRegistryCandidate } from "@bernouy/cms-integration-registry/fs";
import {
    buildOfficialIntegrationPackages,
    loadOfficialIntegrationVerificationBackfill,
    selectOfficialVerificationBackfillPackages,
} from "@bernouy/cms-official-integrations/publication";

const EXPECTED_POST_BOOTSTRAP_RELEASES = [
    "ban@2.0.0",
    "basic-blocs@2.0.0",
    "commerce@2.0.0",
    "commerce-mondial-relay-delivery@2.0.0",
    "commerce-mondial-relay-fulfillment@2.0.0",
    "commerce-negotiation@2.0.0",
    "commerce-stripe-payments@3.0.0",
    "consent@1.0.0",
    "consent@3.0.0",
    "documentation-blocs@1.0.0",
    "documentation-blocs@2.0.0",
    "emailer@2.0.0",
    "forms@1.0.0",
    "forms@2.0.0",
    "mondial-relay@2.0.0",
    "newsletter@2.0.0",
    "photo-albums@1.1.0",
    "photo-albums@1.2.0",
    "photo-albums@2.0.0",
    "restaurant@1.0.0",
    "restaurant@2.0.0",
    "sales-configurator@2.0.0",
    "stripe-connect@2.1.0",
    "user-account@2.0.0",
    "workspace-blocs@1.0.0",
    "workspace-blocs@2.0.0",
];
const DEDICATED_RELEASE_PREFLIGHTS = new Set([
    "commerce@2.0.0",
    "commerce-negotiation@2.0.0",
    "emailer@2.0.0",
    "mondial-relay@2.0.0",
    "stripe-connect@2.1.0",
]);
const PREFLIGHT_TEST_TIMEOUT = 15_000;

describe("official post-bootstrap release preflight", () => {
    test(
        "tracks every release and runs normal candidate preparation where applicable",
        async () => {
            const packages = await buildOfficialIntegrationPackages();
            const backfill = await loadOfficialIntegrationVerificationBackfill();
            const historical = selectOfficialVerificationBackfillPackages(packages, backfill.index);
            const historicalIdentities = new Set(historical.map(releaseIdentity));
            const postBootstrap = packages.filter((release) => !historicalIdentities.has(releaseIdentity(release)));

            expect(postBootstrap.map(releaseIdentity)).toEqual(EXPECTED_POST_BOOTSTRAP_RELEASES);
            for (const release of postBootstrap) {
                // These 2.0.0 packages deliberately preserve reviewed SQL with inherited anonymous constraints.
                // Their dedicated release tests own that compatibility proof while normal candidate
                // preparation continues to reject inherited anonymous constraints.
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
        },
        PREFLIGHT_TEST_TIMEOUT,
    );
});

function releaseIdentity(release: Readonly<{ kind: string; version: string }>): string {
    return `${release.kind}@${release.version}`;
}
