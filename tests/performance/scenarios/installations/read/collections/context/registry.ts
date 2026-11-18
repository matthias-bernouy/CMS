import { repositoryApi } from "../../../../../../integration/instance/repository/client";
import { scenarioClient } from "../../../../../harness/clients/session";
import { registryCalls, registrySession } from "../../../../repository/client";
import { prepareRepositoryCreation } from "../../../repository";
import { assertCondition } from "../../../../queries/types";
import { collectionFixtureStage } from "./stage";
import type { CapabilityInventory } from "../../../../../capabilities/types";
import type { QueryEnvironment } from "../../../../queries/execute";
import type { freshTenants } from "../../../fresh";
import type { CollectionCorpusRegistry } from "./types";

/** A dedicated real Registry prevents unrelated families from changing expected catalogue contents. */
export async function createCollectionRegistry(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    fresh: ReturnType<typeof freshTenants>,
): Promise<CollectionCorpusRegistry> {
    const site = await fresh(environment, "http", false);
    const creation = await prepareRepositoryCreation(site, environment, "http");
    try {
        assertCondition(
            (await collectionFixtureStage("registry-create", () => creation.send())).validated,
            "collection-read-registry-creation",
        );
        await collectionFixtureStage("registry-postconditions", async () => {
            await creation.verify?.();
        });
        const actor = await collectionFixtureStage("registry-publisher", () =>
            repositoryApi(site.session.origin).signup(
                `performance-read-${crypto.randomUUID()}@performance.test`,
                `Fixture-${crypto.randomUUID()}!`,
            ),
        );
        const calls = registryCalls(scenarioClient(inventory, registrySession(site.session.origin, actor.cookie)));
        let claimed = 0;
        const resources: CollectionCorpusRegistry["resources"] = [];
        return {
            calls,
            origin: site.session.origin,
            resources,
            async claim() {
                assertCondition(claimed < 3, "collection-read-publisher-namespace-bound");
                claimed++;
                const namespace = `performance-read-${crypto.randomUUID().replaceAll("-", "")}`;
                const value = await calls.fixture("namespace-claim", { namespace });
                assertCondition(
                    value.namespace === namespace && Number.isSafeInteger(value.revision),
                    "collection-read-namespace-claim",
                );
                return { namespace, revision: Number(value.revision) };
            },
            async publish(resource, namespaceRevision) {
                assertCondition(
                    resources.length < 400 &&
                        !resources.some((row) => row.id === resource.id && row.version === resource.version),
                    "collection-read-registry-publication-bound",
                );
                const scope = { namespace: resource.namespace, namespaceRevision };
                const upload = await calls.fixture("publication-begin", { ...scope, manifest: resource.manifest });
                const input = { ...scope, uploadId: upload.uploadId };
                for (const asset of resource.assets) {
                    await calls.checked("publication-asset", {
                        ...input,
                        assetId: asset.id,
                        bytes: asset.bytes,
                        contentDigest: asset.digest,
                    });
                }
                const receipt = await calls.fixture("publication-commit", input);
                assertCondition(
                    receipt.kind === "collection" && receipt.added === true && receipt.digest === resource.digest,
                    "collection-read-publication-receipt",
                );
                resources.push(resource);
            },
            close: async () => {
                await creation.close?.();
            },
        };
    } catch (error) {
        await creation.close?.();
        throw error;
    }
}
