import { randomUUID } from "node:crypto";
import { repositoryApi } from "../../../../integration/instance/repository/client";
import {
    configureRepository,
    initializationApi,
} from "../../../../integration/instance/repository/initializationClient";
import { connectBrowser } from "../../../../integration/instance/oauth";
import { scenarioClient } from "../../../harness/clients/session";
import { ClientFailure } from "../../../harness/clients/failure";
import { mcpTokenRefresh } from "../../../harness/clients/refresh";
import { registryCalls, registrySession } from "../../repository/client";
import { publicationCollection } from "../../repository/resources/collection";
import { assertCondition, requireRecord } from "../../queries/types";
import { settingsSources } from "./source";
import { fixturePool } from "./pool";
import { profileNewDatabases } from "../../../harness/docker/profiler";
import type { CapabilityInventory } from "../../../capabilities/types";
import type { QueryEnvironment } from "../../queries/execute";

async function publishSettings(inventory: CapabilityInventory, environment: QueryEnvironment) {
    const namespace = `performance-${randomUUID().replaceAll("-", "")}`;
    const account = await repositoryApi(environment.registry.origin).signup(
        `${namespace}@performance.test`,
        `Fixture-${randomUUID()}!`,
    );
    const calls = registryCalls(
        scenarioClient(inventory, registrySession(environment.registry.origin, account.cookie)),
    );
    const owned = await calls.fixture("namespace-claim", { namespace });
    const implementation = inventory.targets.find(
        (target) => !target.retained && target.release.contractId === "ulvia/cms.content",
    )!.release;
    const resource = await publicationCollection(namespace, implementation, settingsSources());
    const scope = { namespace, namespaceRevision: owned.revision };
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
    // Source-retaining synchronous publication builds and verifies supplied bytes too.
    const result = await calls.fixture("publication-commit", input);
    assertCondition(result.digest === resource.digest);
    return resource;
}

async function settingsTenant(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    index: number,
    resource: Awaited<ReturnType<typeof publishSettings>>,
) {
    assertCondition(environment.stack.createPendingSite);
    const site = await environment.stack.createPendingSite(`perf-settings-${index}`);
    await configureRepository(site.url, site.administrator, environment.registry.origin);
    const actor = await repositoryApi(site.url).session(site.administrator.email, site.administrator.password);
    const setup = initializationApi(site.url, actor.cookie);
    const review = await setup.plan(null);
    await setup.apply(null, review.digest);
    let connection: Awaited<ReturnType<typeof connectBrowser>> | undefined;
    let refresh: ReturnType<typeof mcpTokenRefresh> | undefined;
    const session = {
        origin: site.url,
        cookie: actor.cookie,
        subjectId: actor.accountId,
        get token() {
            return connection?.token.access_token ?? "";
        },
        get tools() {
            return connection?.tools ?? [];
        },
    };
    const client = scenarioClient(inventory, session);
    const fixture = async (
        capability: string,
        input: Readonly<Record<string, unknown>> = {},
        contract = "ulvia/cms.content",
    ) => {
        const result = await client(contract, capability, "http", input);
        if (!result.observation.validated) {
            throw new ClientFailure(`settings-fixture-${capability}-${result.observation.failure ?? "invalid"}`);
        }
        return requireRecord(result.output);
    };
    let selected: Readonly<Record<string, unknown>> | undefined;
    let cursor: string | undefined;
    const cursors = new Set<string>();
    for (let page = 0; page < 128; page++) {
        const catalogue = await fixture(
            "list-collection-catalogue",
            { limit: 25, ...(cursor ? { cursor } : {}) },
            "ulvia/cms.installations",
        );
        assertCondition(Array.isArray(catalogue.releases));
        selected = catalogue.releases.find(
            (entry) => entry.collectionId === resource.id && entry.digest === resource.digest,
        );
        if (selected || !catalogue.nextCursor) {
            break;
        }
        assertCondition(typeof catalogue.nextCursor === "string" && !cursors.has(catalogue.nextCursor));
        cursor = catalogue.nextCursor;
        cursors.add(cursor);
    }
    assertCondition(selected);
    const installed = await fixture("list-collection-installations", {}, "ulvia/cms.installations");
    await fixture(
        "install-collection",
        {
            expectedRevision: installed.revision,
            targets: [
                {
                    repositoryId: selected.repositoryId,
                    publisherId: resource.namespace,
                    collectionId: resource.id,
                    version: resource.version,
                    digest: resource.digest,
                    approvedBrowserRiskDigest: selected.browserRiskDigest,
                },
            ],
        },
        "ulvia/cms.installations",
    );
    await profileNewDatabases(environment.stack.id);
    return {
        site,
        client,
        fixture,
        resource,
        session,
        async prepare(binding: string) {
            if (binding !== "mcp") {
                return;
            }
            if (!connection) {
                connection = await connectBrowser(site.url, site.administrator);
                await connection.browser.close();
                refresh = mcpTokenRefresh({ origin: site.url, clientId: connection.clientId, token: connection.token });
            }
            await refresh!(10 * 60_000);
        },
    };
}

export function settingsTenants(inventory: CapabilityInventory) {
    const pools = new WeakMap<
        QueryEnvironment,
        ReturnType<typeof fixturePool<Awaited<ReturnType<typeof settingsTenant>>>>
    >();
    return async (environment: QueryEnvironment) => {
        let pool = pools.get(environment);
        if (!pool) {
            const resource = publishSettings(inventory, environment);
            // Ten measured samples plus three retained warm-up samples.
            pool = fixturePool(13, async (index) => settingsTenant(inventory, environment, index, await resource));
            pools.set(environment, pool);
        }
        return pool.acquire();
    };
}
