import { scenarioClient } from "../../../harness/clients/session";
import { preparePairing } from "../../providers/pairing";
import { assertCondition } from "../../queries/types";
import { installationReadOracle, providerReadAfterDisable, providerReadMissingStatus } from "./oracle";
import type { ProviderContext } from "../../providers/context";
import type { CapabilityInventory } from "../../../capabilities/types";
import type { QueryEnvironment } from "../../queries/execute";
import type { PreparedSample } from "../../../harness/execution/samples";

/** Status mutation changes a real approved installation and retains its private credential boundary. */
export async function prepareProviderInvalidation(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    context: ProviderContext,
    capability: string,
): Promise<PreparedSample> {
    let mutation: PreparedSample | undefined;
    try {
        mutation = await preparePairing(context, "set-provider-status", "http");
        const entry = await context.find();
        assertCondition(entry, "installation-provider-reader-entry");
        const input = { installationId: entry.id };
        const before = await context.checked(capability, input);
        assertCondition((await mutation.send()).validated, "installation-provider-status-mutation");
        const expected = providerReadAfterDisable(before, capability);
        const assert = installationReadOracle(expected);
        const other = scenarioClient(inventory, environment.main);
        return {
            async send() {
                return (await context.call(capability, input, assert)).observation;
            },
            async verify() {
                await mutation!.verify?.();
                await context.foreign(capability, input);
                const elsewhere = await other("ulvia/cms.installations", capability, "http", input);
                assertCondition(
                    !elsewhere.observation.validated &&
                        elsewhere.observation.status === providerReadMissingStatus(capability),
                    `installation-provider-reader-cross-instance-http-${elsewhere.observation.status}`,
                );
                assert(await context.checked(capability, input));
            },
            close: mutation.close,
        };
    } catch (error) {
        await (mutation?.close ?? context.close)();
        throw error;
    }
}
