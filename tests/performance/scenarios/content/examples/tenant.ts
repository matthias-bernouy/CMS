import { initializeEmpty } from "../../../../integration/instance/repository/initializationClient";
import { connectBrowser } from "../../../../integration/instance/oauth";
import { scenarioClient } from "../../../harness/clients/session";
import { mcpTokenRefresh } from "../../../harness/clients/refresh";
import { ClientFailure } from "../../../harness/clients/failure";
import { profileNewDatabases } from "../../../harness/docker/profiler";
import { requireRecord } from "../../queries/types";
import type { freshTenants } from "../../installations/fresh";
import type { CapabilityInventory } from "../../../capabilities/types";
import type { QueryEnvironment } from "../../queries/execute";

export async function exampleTenant(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    binding: string,
    fresh: ReturnType<typeof freshTenants>,
) {
    const state = await fresh(environment, "http");
    try {
        // Discover Content tools only after official initialization has installed their capabilities.
        await initializeEmpty(state.site.url, state.site.administrator, state.session.cookie);
        const connection =
            binding === "mcp" ? await connectBrowser(state.site.url, state.site.administrator) : undefined;
        if (connection) {
            await connection.browser.close();
        }
        const refresh = connection
            ? mcpTokenRefresh({ origin: state.site.url, clientId: connection.clientId, token: connection.token })
            : undefined;
        const session = {
            ...state.session,
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
                throw new ClientFailure(`example-fixture-${capability}-${result.observation.failure ?? "invalid"}`);
            }
            return requireRecord(result.output);
        };
        await profileNewDatabases(environment.stack.id);
        return { session, client, fixture, prepare: () => refresh?.(10 * 60_000), close: state.close };
    } catch (error) {
        await state.close();
        throw error;
    }
}

export type ExampleTenant = Awaited<ReturnType<typeof exampleTenant>>;
