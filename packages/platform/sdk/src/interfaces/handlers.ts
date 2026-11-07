import type { ProviderCapabilityInvocationContext } from "@bernouy/cms-gateway/provider/server";
import type { CapabilityOperationHandle } from "@bernouy/ulvia-contracts/protocol";
import type { ContractDefinition, ContractOperations } from "ulvia-sdk/interfaces/contracts";
import type { OperationInput, OperationOutput, OperationSource } from "ulvia-sdk/interfaces/operations";

export type EffectiveOperations<Contract extends ContractDefinition> = Contract extends {
    readonly extends: infer Parent extends ContractDefinition;
}
    ? EffectiveOperations<Parent> & ContractOperations<Contract["operations"]>
    : ContractOperations<Contract["operations"]>;

/** Streaming binary input stays outside the JSON object, in context.binaryBody. */
type ProviderInput<Capability extends OperationSource> = {
    [Key in keyof OperationInput<Capability> as NonNullable<OperationInput<Capability>[Key]> extends Uint8Array
        ? never
        : Key]: OperationInput<Capability>[Key];
};

type BinaryInputKeys<Capability extends OperationSource> = {
    [Key in keyof OperationInput<Capability>]: NonNullable<OperationInput<Capability>[Key]> extends Uint8Array
        ? Key
        : never;
}[keyof OperationInput<Capability>];

export type ProviderOperationContext<Capability extends OperationSource> = ProviderCapabilityInvocationContext &
    ([BinaryInputKeys<Capability>] extends [never]
        ? {}
        : { readonly binaryBody: NonNullable<ProviderCapabilityInvocationContext["binaryBody"]> });

type HandlerOutput<Capability extends OperationSource> = Capability["behavior"] extends {
    readonly execution: "operation";
}
    ? CapabilityOperationHandle
    : OperationOutput<Capability> extends Uint8Array
      ? Uint8Array | Response
      : OperationOutput<Capability>;

export type ProviderOperationHandler<Capability extends OperationSource> = (
    input: ProviderInput<Capability>,
    context: ProviderOperationContext<Capability>,
) => HandlerOutput<Capability> | Promise<HandlerOutput<Capability>>;

export type ContractHandlers<Contract extends ContractDefinition> = {
    readonly [Id in keyof EffectiveOperations<Contract>]: ProviderOperationHandler<EffectiveOperations<Contract>[Id]>;
};
