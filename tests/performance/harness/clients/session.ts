import { observeHttp } from "./http";
import { observeMcp } from "./mcp";
import type { CapabilityInventory } from "../../capabilities/types";
import type { ClientCall, McpTool } from "./types";

export type ScenarioSession = Readonly<{ origin: string; cookie: string; token: string; tools: readonly McpTool[] }>;

/** DTOs and credentials stay in closures. Only observations enter the measurement collector. */
export function scenarioClient(inventory: CapabilityInventory, session: ScenarioSession) {
    return async (
        contract: string,
        capability: string,
        binding: string,
        input: Readonly<Record<string, unknown>>,
        assert: (output: unknown) => void | Promise<void> = () => {},
        options: Readonly<{
            httpCredentials?: ClientCall["credentials"];
            captureHeaders?: ClientCall["captureHeaders"];
            complete?: ClientCall["complete"];
            signal?: AbortSignal;
        }> = {},
    ) => {
        const target = inventory.targets.find(
            (entry) => !entry.retained && entry.release.contractId === contract && entry.definition.id === capability,
        );
        if (!target) {
            throw new Error("Scenario fixture target is not executable");
        }
        const transport = target.definition.bindings.find((entry) => entry.id === binding)?.transport;
        if (!transport) {
            throw new Error("Scenario fixture binding is not executable");
        }
        let output: unknown;
        const call = {
            origin: session.origin,
            target,
            binding,
            input,
            credentials:
                transport === "mcp"
                    ? { token: session.token }
                    : (options.httpCredentials ?? { cookie: session.cookie }),
            ...(options.captureHeaders ? { captureHeaders: options.captureHeaders } : {}),
            ...(options.complete ? { complete: options.complete } : {}),
            ...(options.signal ? { signal: options.signal } : {}),
            async assert(value: unknown) {
                output = value;
                await assert(value);
            },
        };
        const observation = transport === "mcp" ? await observeMcp(call, session.tools) : await observeHttp(call);
        return { observation, output };
    };
}

export type ScenarioClient = ReturnType<typeof scenarioClient>;
