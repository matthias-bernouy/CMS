import { randomUUID } from "node:crypto";
import { repositoryApi } from "../../../integration/instance/repository/client";
import { connectBrowser } from "../../../integration/instance/oauth";
import { scenarioClient } from "../../harness/clients/session";
import { mcpTokenRefresh } from "../../harness/clients/refresh";
import { ClientFailure } from "../../harness/clients/failure";
import { assertCondition, requireRecord } from "../queries/types";
import type { CapabilityInventory } from "../../capabilities/types";
import type { QueryEnvironment } from "../queries/execute";
import type { ScenarioClient } from "../../harness/clients/session";

export function hostedInput(origin: string) {
    const suffix = randomUUID();
    const url = new URL(origin);
    url.hostname = `performance-${suffix}.localhost`;
    return {
        requestId: suffix,
        label: `Performance ${suffix}`,
        origin: url.origin,
        administrator: { email: `${suffix}@performance.test`, password: `Fixture-${randomUUID()}!` },
    };
}

export async function hostingContext(inventory: CapabilityInventory, environment: QueryEnvironment) {
    const control = environment.stack.control;
    assertCondition(control);
    const actor = await repositoryApi(control.origin).session(
        control.administrator.email,
        control.administrator.password,
    );
    const connection = await connectBrowser(control.origin, control.administrator);
    await connection.browser.close();
    const refresh = mcpTokenRefresh({ origin: control.origin, clientId: connection.clientId, token: connection.token });
    const client = scenarioClient(inventory, {
        origin: control.origin,
        cookie: actor.cookie,
        get token() {
            return connection.token.access_token;
        },
        tools: connection.tools,
    });
    const call = (
        capability: string,
        binding: string,
        input: Readonly<Record<string, unknown>>,
        assert?: Parameters<ScenarioClient>[4],
        options?: Parameters<ScenarioClient>[5],
    ) => client("ulvia/cms.hosting", capability, binding, input, assert, options);
    const checked = async (capability: string, input: Readonly<Record<string, unknown>>) => {
        const result = await call(capability, "http", input);
        if (!result.observation.validated) {
            throw new ClientFailure(`fixture-hosting-${capability}-${result.observation.failure ?? "invalid"}`);
        }
        return requireRecord(result.output);
    };
    const create = async () => {
        const input = hostedInput(control.origin);
        const output = await checked("instances.create", input);
        const instance = requireRecord(output.instance);
        assertCondition(instance.status === "ready" && typeof instance.id === "string");
        return { input, output, instance };
    };
    let anchor: ReturnType<typeof create> | undefined;
    const seeds = new Map<string, Promise<void>>();
    return {
        environment,
        control,
        call,
        checked,
        create,
        seeds,
        anchor: () => (anchor ??= create()),
        async prepare(binding: string) {
            if (binding === "mcp") {
                await refresh(10 * 60_000);
            }
        },
        async foreign(capability: string, input: Readonly<Record<string, unknown>>) {
            const refused = await call(capability, "http", input, undefined, {
                httpCredentials: { cookie: environment.main.cookie },
            });
            assertCondition(!refused.observation.validated && [401, 403].includes(refused.observation.status));
        },
        async refused(capability: string, input: Readonly<Record<string, unknown>>, status: number) {
            const result = await call(capability, "http", input);
            assertCondition(!result.observation.validated && result.observation.status === status);
        },
    };
}

export type HostingContext = Awaited<ReturnType<typeof hostingContext>>;

export function hostingContexts(inventory: CapabilityInventory) {
    const contexts = new WeakMap<QueryEnvironment, Promise<HostingContext>>();
    return (environment: QueryEnvironment) => {
        let context = contexts.get(environment);
        if (!context) {
            context = hostingContext(inventory, environment);
            contexts.set(environment, context);
        }
        return context;
    };
}
