import { repositoryApi } from "../../../integration/instance/repository/client";
import { configureRepository } from "../../../integration/instance/repository/initializationClient";
import { connectBrowser } from "../../../integration/instance/oauth";
import { scenarioClient } from "../../harness/clients/session";
import { profileNewDatabases } from "../../harness/docker/profiler";
import { fixturePool } from "../content/settings/pool";
import { assertCondition, requireRecord } from "../queries/types";
import { ClientFailure } from "../../harness/clients/failure";
import { mcpTokenRefresh } from "../../harness/clients/refresh";
import { expectBodyRefusal } from "../../harness/clients/refusal";
import { discardDisabledTenantDatabase } from "../../harness/docker/cleanup/tenant";
import type { CapabilityInventory } from "../../capabilities/types";
import type { QueryEnvironment } from "../queries/execute";

/** Single-use workflows own fresh tenants; at most thirteen can be live across warm-up and timed samples. */
export function freshTenants(inventory: CapabilityInventory) {
    const states = new WeakMap<
        QueryEnvironment,
        {
            permits: ReturnType<typeof fixturePool<number>>;
            control: Promise<ReturnType<typeof scenarioClient>>;
        }
    >();
    return async (environment: QueryEnvironment, binding: string, repository = true) => {
        let manager = states.get(environment);
        if (!manager) {
            const control = environment.stack.control;
            assertCondition(control);
            manager = {
                permits: fixturePool(13, async (index) => index),
                control: repositoryApi(control.origin)
                    .session(control.administrator.email, control.administrator.password)
                    .then((actor) =>
                        scenarioClient(inventory, {
                            origin: control.origin,
                            cookie: actor.cookie,
                            token: "",
                            tools: [],
                        }),
                    ),
            };
            states.set(environment, manager);
        }
        const permit = await manager.permits.acquire();
        const operator = manager.control;
        let site: Awaited<ReturnType<NonNullable<QueryEnvironment["stack"]["createPendingSite"]>>> | undefined;
        const close = async () => {
            try {
                if (site) {
                    const disabled = await (await operator)("ulvia/cms.hosting", "instances.disable", "http", {
                        instanceId: site.instanceId,
                    });
                    if (!disabled.observation.validated || requireRecord(disabled.output).status !== "disabled") {
                        throw new ClientFailure("fresh-tenant-disable-failed");
                    }
                    await discardDisabledTenantDatabase(environment.stack, {
                        instanceId: site.instanceId,
                        origin: site.url,
                    });
                }
            } finally {
                permit.release();
            }
        };
        try {
            await operator;
            assertCondition(environment.stack.createPendingSite);
            site = await environment.stack.createPendingSite(
                `perf-flow-${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`,
            );
            if (repository) {
                await configureRepository(site.url, site.administrator, environment.registry.origin);
            }
            const actor = await repositoryApi(site.url).session(site.administrator.email, site.administrator.password);
            const connection = binding === "mcp" ? await connectBrowser(site.url, site.administrator) : undefined;
            if (connection) {
                await connection.browser.close();
            }
            const refresh = connection
                ? mcpTokenRefresh({ origin: site.url, clientId: connection.clientId, token: connection.token })
                : undefined;
            const session = {
                origin: site.url,
                cookie: actor.cookie,
                subjectId: actor.accountId,
                get token() {
                    return connection?.token.access_token ?? "";
                },
                tools: connection?.tools ?? [],
            };
            const client = scenarioClient(inventory, session);
            const fixture = async (
                capability: string,
                input: Readonly<Record<string, unknown>> = {},
                contract = "ulvia/cms.installations",
            ) => {
                const result = await client(contract, capability, "http", input);
                if (!result.observation.validated) {
                    throw new ClientFailure(`fresh-fixture-${capability}-${result.observation.failure ?? "invalid"}`);
                }
                return requireRecord(result.output);
            };
            await profileNewDatabases(environment.stack.id);
            const invalid = (
                capability: string,
                valid: Readonly<Record<string, unknown>>,
                refused: Readonly<Record<string, unknown>>,
            ) => expectBodyRefusal(inventory, session, "ulvia/cms.installations", capability, valid, refused);
            return { site, session, client, fixture, close, invalid, prepare: () => refresh?.(10 * 60_000) };
        } catch (error) {
            await close();
            throw error;
        }
    };
}

export type FreshTenant = Awaited<ReturnType<ReturnType<typeof freshTenants>>>;
