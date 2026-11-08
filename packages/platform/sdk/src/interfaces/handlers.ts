import type { ProviderCapabilityResponse, ProviderResourceResponse } from "@bernouy/cms-gateway/provider/responses";
import type { ProviderCapabilityInvocationContext } from "@bernouy/cms-gateway/provider/server";
import type { CapabilityOperationHandle } from "@bernouy/ulvia-contracts/protocol";
import type { FeatureDefinition, FeatureCapabilities } from "ulvia-sdk/interfaces/features";
import type { CapabilityInput, CapabilityOutput, CapabilitySource } from "ulvia-sdk/interfaces/capabilities";

export type EffectiveCapabilities<Feature extends FeatureDefinition> = Feature extends {
    readonly extends: infer Parent extends FeatureDefinition;
}
    ? EffectiveCapabilities<Parent> & FeatureCapabilities<Feature["capabilities"]>
    : FeatureCapabilities<Feature["capabilities"]>;

type IsBinary<Value> = [NonNullable<Value>] extends [never]
    ? false
    : NonNullable<Value> extends Uint8Array
      ? true
      : false;

/** Streaming binary input stays outside the JSON object, in context.binaryBody. */
type ProviderInput<Capability extends CapabilitySource> = {
    [Key in keyof CapabilityInput<Capability> as IsBinary<CapabilityInput<Capability>[Key]> extends true
        ? never
        : Key]: CapabilityInput<Capability>[Key];
};

type BinaryInputKeys<Capability extends CapabilitySource> = {
    [Key in keyof CapabilityInput<Capability>]-?: IsBinary<CapabilityInput<Capability>[Key]> extends true ? Key : never;
}[keyof CapabilityInput<Capability>];

export type ProviderCapabilityContext<Capability extends CapabilitySource> = ProviderCapabilityInvocationContext &
    ([BinaryInputKeys<Capability>] extends [never]
        ? {}
        : { readonly binaryBody: NonNullable<ProviderCapabilityInvocationContext["binaryBody"]> });

type HandlerOutput<Capability extends CapabilitySource> = Capability["behavior"] extends {
    readonly execution: "operation";
}
    ? CapabilityOperationHandle
    : CapabilityOutput<Capability> extends Uint8Array
      ? Uint8Array | Response | ProviderResourceResponse
      : CapabilityOutput<Capability> | ProviderCapabilityResponse<CapabilityOutput<Capability>>;

/** Default operation execution produces its terminal DTO; complete alternative handlers still return handles. */
export type CapabilityExecutionResult<Capability extends CapabilitySource> = Capability["behavior"] extends {
    readonly execution: "operation";
}
    ? CapabilityOutput<Capability>
    : HandlerOutput<Capability>;

export type ProviderCapabilityHandler<Capability extends CapabilitySource> = (
    input: ProviderInput<Capability>,
    context: ProviderCapabilityContext<Capability>,
) => HandlerOutput<Capability> | Promise<HandlerOutput<Capability>>;

export type ContractHandlers<Feature extends FeatureDefinition> = {
    readonly [Id in keyof EffectiveCapabilities<Feature>]: ProviderCapabilityHandler<
        EffectiveCapabilities<Feature>[Id]
    >;
};
