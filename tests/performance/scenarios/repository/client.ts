import { ClientFailure } from "../../harness/clients/failure";
import { scenarioClient } from "../../harness/clients/session";
import { requireRecord } from "../queries/types";
import type { ScenarioClient, ScenarioSession } from "../../harness/clients/session";
import type { CapabilityInventory } from "../../capabilities/types";
import type { QueryEnvironment } from "../queries/execute";

export function registryClient(inventory: CapabilityInventory, environment: QueryEnvironment) {
    return scenarioClient(inventory, { ...environment.registry, token: "", tools: [] });
}

export function registryCalls(client: ScenarioClient) {
    const call = (
        capability: string,
        binding: string,
        input: Readonly<Record<string, unknown>>,
        assert?: Parameters<ScenarioClient>[4],
        options?: Parameters<ScenarioClient>[5],
    ) => client("ulvia/repository", capability, binding, input, assert, options);
    const checked = async (capability: string, input: Readonly<Record<string, unknown>>) => {
        const result = await call(capability, "http", input);
        if (!result.observation.validated) {
            throw new ClientFailure(`fixture-${capability}-${result.observation.failure ?? "invalid-result"}`);
        }
        return result.output;
    };
    const fixture = async (capability: string, input: Readonly<Record<string, unknown>>) =>
        requireRecord(await checked(capability, input));
    return { call, fixture, checked };
}

export function registrySession(origin: string, cookie: string): ScenarioSession {
    return { origin, cookie, token: "", tools: [] };
}
