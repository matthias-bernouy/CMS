import { parseStrictJson } from "@bernouy/ulvia-contracts/protocol";
import type { UlviaSchema } from "@bernouy/ulvia-contracts/schema";
import { resolveSchema, containsResolvedSchema, parseSchemaDescriptor } from "@bernouy/ulvia-contracts/resolution";
import { validateSchemaValue } from "@bernouy/ulvia-contracts/schema";
import type { SchemaResolutionOptions } from "@bernouy/ulvia-contracts/resolution";
import { compileCapability } from "ulvia-sdk/compiler/contracts/capabilities";
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
    readonly schemaResolution?: SchemaResolutionOptions;
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
    if (capability.schemaResolver && !execution.schemaResolution) {
        throw new SdkDefinitionError("Schema resolvers require a durable version authority");
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
    const materialize = async (schema: UlviaSchema, value: unknown) => {
        if (!containsResolvedSchema(schema)) {
            return schema;
        }
        if (!execution.schemaResolution) {
            throw new SdkDefinitionError("Dynamic schemas require an explicit local resolution authority");
        }
        return (await resolveSchema(schema, value, { ...execution.schemaResolution, input: execution.input })).schema;
    };
    const resolvedInput = await materialize(inputSchema, execution.input);
    if (containsResolvedSchema(inputSchema)) {
        validateSchemaValue(resolvedInput, execution.input);
    }
    const input = capability.input.parse(execution.input);
    if (capability.schemaResolver) {
        validateSchemaValue(
            compileSchema(capability.schemaResolver.selector),
            parseStrictJson((input as { selectorJson: string }).selectorJson, 16384, 16),
        );
    }
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
    const value = output instanceof ProviderCapabilityResponse ? output.output : output;
    const resolvedOutput = await materialize(outputSchema, value);
    if (containsResolvedSchema(outputSchema)) {
        validateSchemaValue(resolvedOutput, value);
    }
    if (capability.schemaResolver) {
        if (!execution.schemaResolution) {
            throw new SdkDefinitionError("Schema resolver execution requires a durable version authority");
        }
        const descriptor = parseSchemaDescriptor(value);
        if (
            (input as { version?: string }).version !== undefined &&
            descriptor.version !== (input as { version: string }).version
        ) {
            throw new SdkDefinitionError("Schema resolver returned another resource version");
        }
        await execution.schemaResolution.seal(compileCapability(capability), descriptor);
    }
    return capability.output.parse(value);
}
