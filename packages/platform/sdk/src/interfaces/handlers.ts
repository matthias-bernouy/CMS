import type { ProviderCapabilityInvocationContext } from "@bernouy/cms-gateway/provider/server";
import type { CapabilityOperationHandle } from "@bernouy/ulvia-contracts/protocol";
import type { ContractDefinition, CapabilitySource } from "ulvia-sdk/interfaces/contracts";
import type { OperationInput, OperationOutput } from "ulvia-sdk/interfaces/operations";

export type EffectiveCapabilities<Contract extends ContractDefinition> = Contract extends {
    readonly extends: infer Parent extends ContractDefinition;
}
    ? EffectiveCapabilities<Parent> & Contract["capabilities"]
    : Contract["capabilities"];

/** Streaming binary input stays outside the JSON object, in context.binaryBody. */
type ProviderInput<Capability extends CapabilitySource> = {
    [Key in keyof OperationInput<Capability["operation"]> as NonNullable<
        OperationInput<Capability["operation"]>[Key]
    > extends Uint8Array
        ? never
        : Key]: OperationInput<Capability["operation"]>[Key];
};

type BinaryInputKeys<Capability extends CapabilitySource> = {
    [Key in keyof OperationInput<Capability["operation"]>]: NonNullable<
        OperationInput<Capability["operation"]>[Key]
    > extends Uint8Array
        ? Key
        : never;
}[keyof OperationInput<Capability["operation"]>];

export type ProviderOperationContext<Capability extends CapabilitySource> = ProviderCapabilityInvocationContext &
    ([BinaryInputKeys<Capability>] extends [never]
        ? {}
        : { readonly binaryBody: NonNullable<ProviderCapabilityInvocationContext["binaryBody"]> });

type HandlerOutput<Capability extends CapabilitySource> = Capability["behavior"] extends {
    readonly execution: "operation";
}
    ? CapabilityOperationHandle
    : OperationOutput<Capability["operation"]> extends Uint8Array
      ? Uint8Array | Response
      : OperationOutput<Capability["operation"]>;

export type ProviderOperationHandler<Capability extends CapabilitySource> = (
    input: ProviderInput<Capability>,
    context: ProviderOperationContext<Capability>,
) => HandlerOutput<Capability> | Promise<HandlerOutput<Capability>>;

export type ContractHandlers<Contract extends ContractDefinition> = {
    readonly [Id in keyof EffectiveCapabilities<Contract>]: ProviderOperationHandler<
        EffectiveCapabilities<Contract>[Id]
    >;
};
