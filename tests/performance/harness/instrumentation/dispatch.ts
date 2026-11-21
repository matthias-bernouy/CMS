import { randomUUID } from "node:crypto";
import { record, scope } from "./records";

type Context = Readonly<{
    requestId: string;
    rootRequestId?: string;
    contractVersion: string;
    trace?: { traceId?: string; parentSpanId?: string };
    invocation?: { contractId: string; instanceId: string; bindingId?: string };
}>;
type Contract = Readonly<{
    release: { contractId: string; version: string };
    digest: string;
    capabilities: readonly {
        owner?: { contractId: string; version: string };
        definition: { id: string; bindings: readonly { id: string }[] };
    }[];
}>;
type Dispatcher = {
    seal(contracts: readonly Contract[]): void;
    invoke(
        contract: string,
        capability: string,
        input: Readonly<Record<string, unknown>>,
        context: Context,
    ): Promise<unknown>;
};

export function instrumentDispatcher(prototype: Dispatcher): void {
    const mounted = new WeakMap<object, Map<string, string | null>>();
    const seen = new Set<string>();
    const epoch = randomUUID();
    const seal = prototype.seal;
    prototype.seal = function (contracts) {
        const claims = new Map<string, string | null>();
        for (const contract of contracts) {
            for (const capability of contract.capabilities) {
                const target = `${contract.release.contractId}@${contract.release.version}#${contract.digest}:${capability.definition.id}`;
                for (const reference of [contract.release, capability.owner ?? contract.release]) {
                    const key = `${contract.release.contractId}\0${reference.contractId}@${reference.version}:${capability.definition.id}`;
                    const previous = claims.get(key);
                    claims.set(key, previous === undefined || previous === target ? target : null);
                }
            }
        }
        const value = seal.call(this, contracts);
        mounted.set(this, claims);
        record({
            kind: "mount",
            epoch,
            contracts: contracts.map((contract) => ({
                ...contract.release,
                digest: contract.digest,
                capabilities: contract.capabilities.map(({ definition }) => ({
                    id: definition.id,
                    bindings: definition.bindings.map(({ id }) => id),
                })),
            })),
        });
        return value;
    };
    const invoke = prototype.invoke;
    prototype.invoke = function (contract, capability, input, context) {
        const requested = context.invocation?.contractId ?? contract;
        const key = `${contract}\0${requested}@${context.contractVersion}:${capability}`;
        const target =
            mounted.get(this)?.get(key) ?? `${requested}@${context.contractVersion}#unresolved:${capability}`;
        const identity = `${context.invocation?.instanceId ?? "host"}:${target}`;
        const firstInProcess = !seen.has(identity);
        seen.add(identity);
        const publicScope = scope.getStore();
        const correlated =
            publicScope?.publicBinding === requested &&
            ((requested === "ulvia/provider.tls" && context.invocation?.instanceId === "hosting:tls") ||
                (requested === "ulvia/cluster.logs" && context.invocation?.instanceId === "instance:cluster-logs"));
        const traceId = correlated
            ? publicScope.traceId
            : (context.trace?.traceId ?? context.rootRequestId ?? context.requestId);
        const spanId = context.requestId;
        return scope.run({ traceId, spanId }, async () => {
            const started = performance.now();
            let success = false;
            try {
                const result = await invoke.call(this, contract, capability, input, context);
                success = true;
                return result;
            } finally {
                record({
                    kind: "capability",
                    contractId: requested,
                    capabilityId: capability,
                    parentSpanId: context.trace?.parentSpanId,
                    target,
                    binding: context.invocation?.bindingId ?? "http",
                    success,
                    durationMs: performance.now() - started,
                    firstInProcess,
                    epoch,
                });
            }
        });
    };
    record({ kind: "instrumentation", component: "dispatcher", epoch });
}
