import { assertInitializationReview } from "../../../../initialization/review";
import { initializationCompletion } from "../../../../initialization/actions/completion";
import { assertCondition, requireRecord } from "../../../../queries/types";
import { connectBrowser } from "../../../../../../integration/instance/oauth";
import { scenarioClient } from "../../../../../harness/clients/session";
import { mcpTokenRefresh } from "../../../../../harness/clients/refresh";
import { collectionFixtureStage } from "./stage";
import type { CapabilityInventory } from "../../../../../capabilities/types";
import type { FreshTenant } from "../../../fresh";

/** Initialize from the known parent first, then switch only collection discovery to the owned empty Registry. */
export async function prepareCollectionTenant(
    inventory: CapabilityInventory,
    tenant: FreshTenant,
    registryOrigin: string,
) {
    const dataset = { root: null, paths: [], collections: 0 };
    const review = await collectionFixtureStage("tenant-plan", async () =>
        assertInitializationReview(
            await tenant.fixture("initialization.plan", { root: null }),
            { site: tenant.site, main: tenant.session },
            dataset,
        ),
    );
    const completed = await collectionFixtureStage("tenant-initialize", () =>
        tenant.client(
            "ulvia/cms.installations",
            "initialization.apply",
            "http",
            { root: null, planDigest: review.digest },
            (output) => {
                assertCondition(
                    output && typeof output === "object" && "status" in output && output.status === "completed",
                    "collection-read-empty-initialization",
                );
            },
            {
                complete: initializationCompletion(tenant, () => review.digest, dataset),
                idempotencyKey: crypto.randomUUID(),
            },
        ),
    );
    assertCondition(completed.observation.validated, "collection-read-initialized");
    const before = await collectionFixtureStage("tenant-settings-before", () =>
        tenant.fixture("initialization.repository.get"),
    );
    await collectionFixtureStage("tenant-configure", () =>
        tenant.fixture("initialization.repository.configure", {
            expectedRevision: before.revision,
            url: registryOrigin,
        }),
    );
    const saved = await collectionFixtureStage("tenant-settings-after", () =>
        tenant.fixture("initialization.repository.get"),
    );
    assertCondition(saved.url === registryOrigin && saved.configured === true, "collection-read-registry-origin");
    const snapshot = await collectionFixtureStage("tenant-installed", () =>
        tenant.fixture("list-collection-installations"),
    );
    assertCondition(
        Array.isArray(snapshot.items) && snapshot.items.length === 0 && Number.isSafeInteger(snapshot.revision),
        "collection-read-empty-installed-state",
    );
    const catalogue = await collectionFixtureStage("tenant-catalogue", () =>
        tenant.fixture("list-available-collections"),
    );
    assertCondition(
        Array.isArray(catalogue.repositories) &&
            catalogue.repositories.length === 1 &&
            typeof catalogue.repositories[0] === "string",
        "collection-read-single-source",
    );
    const connection = await collectionFixtureStage("tenant-mcp-connect", () =>
        connectBrowser(tenant.site.url, tenant.site.administrator),
    );
    await collectionFixtureStage("tenant-mcp-browser-close", () => connection.browser.close());
    const refresh = mcpTokenRefresh({
        origin: tenant.site.url,
        clientId: connection.clientId,
        token: connection.token,
    });
    const session = {
        ...tenant.session,
        get token() {
            return connection.token.access_token;
        },
        tools: connection.tools,
    };
    const client = scenarioClient(inventory, session);
    const bound: FreshTenant = {
        ...tenant,
        session,
        client,
        fixture: async (capability, input = {}, contract = "ulvia/cms.installations") => {
            const result = await client(contract, capability, "http", input);
            assertCondition(
                result.observation.validated,
                `collection-read-fixture-${capability}-${result.observation.failure ?? `http-status-${result.observation.status}`}`,
            );
            return requireRecord(result.output);
        },
        prepare: () => refresh(10 * 60_000),
    };
    return { revision: Number(snapshot.revision), repositoryId: catalogue.repositories[0], tenant: bound };
}
