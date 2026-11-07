import type { ProviderCapabilityHandler } from "ulvia-sdk/interfaces/handlers";
import type { ExecutableCapability, CapabilityServices } from "ulvia-sdk/interfaces/execution";
import { capabilityFailure } from "ulvia-sdk/definitions/errors";
import { compileSchema } from "ulvia-sdk/schema/compile";
import { SdkDefinitionError } from "ulvia-sdk/schema/errors";

/** Local synchronous JSON execution. The caller owns authorization; Provider invocations use admitted validation. */
export async function executeCapability<const Capability extends ExecutableCapability>(
    capability: Capability,
    execution: {
        readonly input: unknown;
        readonly services: CapabilityServices<Capability>;
        readonly context: Parameters<ProviderCapabilityHandler<Capability>>[1];
    },
): Promise<Awaited<ReturnType<ProviderCapabilityHandler<Capability>>>> {
    const inputSchema = compileSchema(capability.input);
    const outputSchema = compileSchema(capability.output);
    if (
        capability.behavior.execution !== "sync" ||
        outputSchema.type === "binary" ||
        execution.context.binaryBody ||
        (inputSchema.type === "object" &&
            Object.values(inputSchema.properties).some((schema) => schema.type === "binary"))
    ) {
        throw new SdkDefinitionError(
            "Local execution supports synchronous JSON capabilities; use the Provider adapter for streams and operation handles",
        );
    }
    const input = capability.input.parse(execution.input);
    const execute = capability.execute as (context: unknown) => unknown;
    const call = { ...execution, input, fail: capabilityFailure(capability) };
    const authorize = capability.authorize as ((context: unknown) => unknown) | undefined;
    await authorize?.(call);
    const output = await execute(call);
    return capability.output.parse(output) as Awaited<ReturnType<ProviderCapabilityHandler<Capability>>>;
}
