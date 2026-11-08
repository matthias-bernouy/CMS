import type { ProviderCapabilityInvocationContext, ProviderRoute } from "@bernouy/cms-gateway/provider/server";
import type { ProviderOperationRegistration } from "ulvia-sdk/interfaces/runtime";
import type { RuntimeCapabilityPlan } from "ulvia-sdk/compiler/plan";
import { deepFreeze } from "@bernouy/ulvia-contracts/protocol";

type OperationEntry<Dependencies> = {
    readonly entry: RuntimeCapabilityPlan<Dependencies>;
    readonly worker?: (
        input: Readonly<Record<string, unknown>>,
        context: ProviderCapabilityInvocationContext,
    ) => Promise<unknown>;
};

/** Register requested coordinates, including admitted aliases, without parallel worker/capability lists. */
export function operationRegistrations<Dependencies>(
    handlers: readonly OperationEntry<Dependencies>[],
    routes: readonly ProviderRoute[],
): readonly ProviderOperationRegistration[] {
    const groups = new Map<
        string,
        {
            contractId: string;
            capabilityId: string;
            rows: { version: string; digest: string; handler: OperationEntry<Dependencies> }[];
        }
    >();
    for (const handler of handlers) {
        if (!handler.worker) {
            continue;
        }
        const entry = handler.entry;
        for (const request of entry.requests) {
            if (
                !routes.some(
                    (route) =>
                        (route.dispatchContractId ?? route.contractId) === entry.contractId &&
                        route.contractId === request.contractId &&
                        route.contractVersion === request.version &&
                        route.capability.id === entry.capability.id,
                )
            ) {
                continue;
            }
            const key = `${request.contractId}\0${entry.capability.id}`;
            const group = groups.get(key) ?? {
                contractId: request.contractId,
                capabilityId: entry.capability.id,
                rows: [],
            };
            if (group.rows.some((row) => row.version === request.version)) {
                throw new TypeError("Ambiguous default operation implementation");
            }
            group.rows.push({ version: request.version, digest: request.digest, handler });
            groups.set(key, group);
        }
    }
    return [...groups.values()].map((group) =>
        Object.freeze({
            contractId: group.contractId,
            capabilityId: group.capabilityId,
            versions: Object.freeze(
                group.rows.map((row) =>
                    deepFreeze({
                        version: row.version,
                        digest: row.digest,
                        capability: structuredClone(row.handler.entry.capability),
                    }),
                ),
            ),
            execute: async (input: Readonly<Record<string, unknown>>, context: ProviderCapabilityInvocationContext) => {
                const rows = group.rows.filter(
                    (row) =>
                        context.invocation?.contractId === group.contractId && row.version === context.contractVersion,
                );
                if (rows.length !== 1) {
                    throw new TypeError("Stored operation does not resolve to one exact implemented release");
                }
                return rows[0]!.handler.worker!(input, context);
            },
        }),
    );
}
