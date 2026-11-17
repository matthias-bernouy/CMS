import { record } from "./records";

type Invocation = Readonly<{
    contractId: string;
    capabilityId: string;
    bindingId?: string;
    bindingTransport?: string;
    trace?: { traceId?: string };
}>;
type Gateway = { invoke(value: Invocation): Promise<{ kind: string }> };

/** Provider HTTP transport does not identify the originating MCP representation; observe both boundaries. */
export function instrumentBinding(prototype: Gateway, currentTrace: () => string | undefined): void {
    const invoke = prototype.invoke;
    prototype.invoke = async function (value) {
        const traceId = value.trace?.traceId ?? currentTrace();
        let success = false;
        try {
            const result = await invoke.call(this, value);
            success = ["success", "binary", "not-modified"].includes(result.kind);
            return result;
        } finally {
            record({
                kind: "binding",
                traceId,
                contractId: value.contractId,
                capabilityId: value.capabilityId,
                binding: value.bindingId,
                transport: value.bindingTransport,
                success,
            });
        }
    };
    record({ kind: "instrumentation", component: "binding" });
}
