import { ProviderCapabilityResponse } from "@bernouy/cms-gateway/provider/responses";
import type { CapabilityOutput } from "ulvia-sdk/interfaces/capabilities";
import type { ProviderCapabilityHandler } from "ulvia-sdk/interfaces/handlers";
import type { ExecutableCapability, CapabilityServices } from "ulvia-sdk/interfaces/execution";
import { capabilityFailure } from "ulvia-sdk/definitions/errors";
import { compileSchema } from "ulvia-sdk/schema/compile";
import { SdkDefinitionError } from "ulvia-sdk/schema/errors";

import type { FeatureDefinition } from "ulvia-sdk/interfaces/features";
import type { EffectiveCapabilities } from "ulvia-sdk/interfaces/handlers";
import { executeWithErrorMapping, featureCapability } from "ulvia-sdk/definitions/execution/errorPolicy";

type Execution<Capability extends ExecutableCapability> = {
    readonly input: unknown;
    readonly services: CapabilityServices<Capability>;
    readonly context: Parameters<ProviderCapabilityHandler<Capability>>[1];
};
type ExecutableIds<Feature extends FeatureDefinition> = {
    [Id in keyof EffectiveCapabilities<Feature>]: EffectiveCapabilities<Feature>[Id] extends ExecutableCapability
        ? Id
        : never;
}[keyof EffectiveCapabilities<Feature>] &
    string;
type ExecutableAt<
    Feature extends FeatureDefinition,
    Id extends keyof EffectiveCapabilities<Feature>,
> = EffectiveCapabilities<Feature>[Id] & ExecutableCapability;

/** Local synchronous JSON execution. A feature supplies its declaring owner's error policy. */
export function executeCapability<const Feature extends FeatureDefinition, const Id extends ExecutableIds<Feature>>(
    feature: Feature,
    id: Id,
    execution: Execution<ExecutableAt<Feature, Id>>,
): Promise<CapabilityOutput<EffectiveCapabilities<Feature>[Id]>>;
export function executeCapability<const Capability extends ExecutableCapability>(
    capability: Capability,
    execution: Execution<Capability>,
): Promise<CapabilityOutput<Capability>>;
export async function executeCapability(
    source: ExecutableCapability | FeatureDefinition,
    idOrExecution: string | Execution<ExecutableCapability>,
    featureExecution?: Execution<ExecutableCapability>,
): Promise<unknown> {
    const selected =
        typeof idOrExecution === "string"
            ? featureCapability(source as FeatureDefinition, idOrExecution)
            : { capability: source as ExecutableCapability, mapper: undefined };
    const { capability, mapper } = selected;
    const execution = typeof idOrExecution === "string" ? featureExecution! : idOrExecution;
    if (!("execute" in capability) || typeof capability.execute !== "function") {
        throw new SdkDefinitionError("Local execution requires a capability executor");
    }
    const inputSchema = compileSchema(capability.input);
    const outputSchema = compileSchema(capability.output);
    if (
        capability.behavior.execution !== "sync" ||
        outputSchema.type === "binary" ||
        Boolean(capability.responseEffects?.length) ||
        execution.context.binaryBody ||
        (inputSchema.type === "object" &&
            Object.values(inputSchema.properties).some((schema) => schema.type === "binary"))
    ) {
        throw new SdkDefinitionError(
            "Local execution supports synchronous JSON capabilities; use the Provider adapter for streams, response effects and operation handles",
        );
    }
    const input = capability.input.parse(execution.input);
    const execute = capability.execute as (context: unknown) => unknown;
    const call = { ...execution, input, fail: capabilityFailure(capability) };
    const authorize = (capability as ExecutableCapability).authorize as ((context: unknown) => unknown) | undefined;
    if (authorize) {
        await executeWithErrorMapping(capability, mapper, () => authorize(call));
    }
    const output = await executeWithErrorMapping(capability, mapper, () => execute(call));
    if (output instanceof ProviderCapabilityResponse && output.responseEffect) {
        throw new SdkDefinitionError("Local execution cannot apply a response effect; use the Provider adapter");
    }
    return capability.output.parse(output instanceof ProviderCapabilityResponse ? output.output : output);
}
