import { ClientFailure } from "../../harness/clients/failure";
import type { ScenarioClient } from "../../harness/clients/session";

export function authoringCalls(client: ScenarioClient) {
    const call = (
        capability: string,
        binding: string,
        input: Readonly<Record<string, unknown>>,
        assert?: Parameters<ScenarioClient>[4],
        options?: Parameters<ScenarioClient>[5],
    ) => client("ulvia/cms.authoring", capability, binding, input, assert, options);
    const fixture = async (capability: string, input: Readonly<Record<string, unknown>>) => {
        const result = await call(capability, "http", input);
        if (!result.observation.validated) {
            throw new ClientFailure(`fixture-${capability}-${result.observation.failure ?? "invalid-result"}`);
        }
        return result.output;
    };
    return { call, fixture };
}
