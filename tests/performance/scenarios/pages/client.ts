import { scenarioClient } from "../../harness/clients/session";
import { requireRecord } from "../queries/types";
import type { CapabilityInventory } from "../../capabilities/types";
import type { QueryEnvironment } from "../queries/execute";

export function pageClient(inventory: CapabilityInventory, environment: QueryEnvironment) {
    const client = scenarioClient(inventory, environment.main);
    return async (
        capability: string,
        binding: string,
        input: Readonly<Record<string, unknown>>,
        assert: (output: Readonly<Record<string, unknown>>) => void = () => {},
    ) => {
        const result = await client("ulvia/cms.content", capability, binding, input, (output) =>
            assert(requireRecord(output)),
        );
        return {
            observation: result.observation,
            output: result.output === undefined ? undefined : requireRecord(result.output),
        };
    };
}

export type PageClient = ReturnType<typeof pageClient>;

export async function fixturePage(client: PageClient, capability: string, input: Readonly<Record<string, unknown>>) {
    const result = await client(capability, "http", input);
    if (!result.observation.validated || !result.output) {
        throw new Error("Page fixture could not produce valid state");
    }
    return result.output;
}
