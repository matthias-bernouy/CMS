import { officialCapabilityInventory } from "../../capabilities/inventory";
import { scenarioClient } from "../../harness/clients/session";
import { startProfiler } from "../../harness/docker/profiler";
import { repositoryApi } from "../../../integration/instance/repository/client";
import { configureRepository } from "../../../integration/instance/repository/initializationClient";
import { connectBrowser } from "../../../integration/instance/oauth";
import { assertCondition, requireRecord } from "../queries/types";
import { bootstrapDataset, datasetPublisher } from "./datasets";
import type { Dataset } from "./datasets";
import type { QueryEnvironment } from "../queries/execute";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { expectedAfterRestarts } from "./state";
import { restoreAdministration } from "../../fixtures/administration/restore";

export async function initializationFixture(environment: QueryEnvironment) {
    const inventory = await officialCapabilityInventory();
    const implementation = inventory.targets.find(
        (target) => !target.retained && target.release.contractId === "ulvia/cms.content",
    )!.release;
    const pat = await repositoryApi(environment.registry.origin).pat(environment.registry.cookie);
    const publish = await datasetPublisher(environment.registry.origin, pat.token);
    const datasets: Record<string, Dataset> = { empty: { root: null, paths: [], collections: 0 } };
    let administration: Promise<Record<string, Dataset>> | undefined;
    const dataset = async (name: string): Promise<Dataset> => {
        if (datasets[name]) {
            return datasets[name]!;
        }
        if (name.startsWith("mossa")) {
            administration ??= restoreAdministration(environment.stack.providerName).then(async (entries) => {
                await environment.stack.restartProvider();
                Object.assign(datasets, entries);
                return entries;
            });
            const entries = await administration;
            assertCondition(entries[name]);
            return entries[name]!;
        }
        if (name === "history") {
            for (let index = 0; index < 16; index++) {
                const entry = await publish(await bootstrapDataset(implementation, "history", 1, [], `1.${index}.0`));
                if (index === 0) {
                    datasets.history = entry;
                }
            }
        } else if (name === "includes") {
            const children = [];
            for (let index = 0; index < 8; index++) {
                children.push(await publish(await bootstrapDataset(implementation, `include-${index}`, 8)));
            }
            datasets.includes = await publish(await bootstrapDataset(implementation, "includes", 1, children));
        } else {
            const pages = name === "100-pages" ? 100 : name === "25-pages" ? 25 : 1;
            datasets[name] = await publish(
                await bootstrapDataset(implementation, name, pages, [], "1.0.0", name === "assets" ? 512 * 1024 : 0),
            );
        }
        return datasets[name]!;
    };
    assertCondition(environment.stack.createPendingSite);
    const site = await environment.stack.createPendingSite("performance-initialization");
    await configureRepository(site.url, site.administrator, environment.registry.origin);
    const session = await repositoryApi(site.url).session(site.administrator.email, site.administrator.password);
    const connection = await connectBrowser(site.url, site.administrator);
    const main = {
        origin: site.url,
        cookie: session.cookie,
        token: connection.token.access_token,
        subjectId: session.accountId,
        tools: connection.tools,
    };
    await connection.browser.close();
    const client = scenarioClient(inventory, main);
    const call = async (
        capability: string,
        input: Readonly<Record<string, unknown>> = {},
        contract = "ulvia/cms.installations",
    ) => {
        const result = await client(contract, capability, "http", input);
        if (!result.observation.validated) {
            console.log(
                `initialization fixture call failed: ${capability}: ${result.observation.failure ?? "invalid"}`,
            );
        }
        assertCondition(result.observation.validated);
        return requireRecord(result.output);
    };
    const snapshot = async () => {
        const status = await call("initialization.status");
        const collections = await call("list-collection-installations");
        const pages = await call("pages.list", { limit: 1 }, "ulvia/cms.content");
        const settings = await call("site.get", {}, "ulvia/cms.content");
        assertCondition(
            status.status === "pending" &&
                Array.isArray(pages.items) &&
                pages.items.length === 0 &&
                Array.isArray(collections.items) &&
                collections.items.length === 0,
        );
        return { status, collections, pages, settings };
    };
    const beforeRestart = await snapshot();
    await environment.stack.restartProvider();
    // No initialization.plan call occurs in this calibration: prove the runtime-only revision increment.
    assertCondition(canonicalizeIJson(await snapshot()) === canonicalizeIJson(expectedAfterRestarts(beforeRestart, 1)));
    await startProfiler(environment.stack.id);
    return {
        site,
        main,
        client,
        call,
        snapshot,
        dataset,
    };
}

export type InitializationFixture = Awaited<ReturnType<typeof initializationFixture>>;
