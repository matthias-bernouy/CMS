import type { ProviderOperationAdapter } from "@bernouy/ulvia-sdk/provider";
import type { ProviderOperationExecutor } from "../../../operations/ProviderOperationExecutor";

/** Attach the SDK's captured workers to the host's durable queue, leases and recovery. */
export function createProviderOperationAdapter(
    executor: Pick<ProviderOperationExecutor, "register" | "enqueue">,
): ProviderOperationAdapter {
    const register = executor.register.bind(executor);
    const enqueue = executor.enqueue.bind(executor);
    const adapter: ProviderOperationAdapter = {
        register(operation) {
            const execute = operation.execute;
            const errors = new Map(operation.versions.map((version) => [version.version, version.capability.errors]));
            register(
                operation.contractId,
                operation.capabilityId,
                (input, context) => execute(input, context),
                (version) => errors.get(version),
            );
        },
        enqueue({ release, capabilityId, input, context }) {
            return enqueue(release.contractId, capabilityId, input, context);
        },
    };
    return Object.freeze(adapter);
}
