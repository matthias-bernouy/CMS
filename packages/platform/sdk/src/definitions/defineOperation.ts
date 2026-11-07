import type { z } from "zod";
import type { CapabilityAccess, CapabilityBehavior, CapabilityBinding } from "@bernouy/ulvia-contracts";
import type { OperationDefinition, OperationErrors } from "ulvia-sdk/interfaces/operations";

export function defineOperation<
    const Input extends z.ZodObject,
    const Output extends z.ZodType,
    const Errors extends OperationErrors,
    const Id extends string,
    const Access extends CapabilityAccess,
    const Behavior extends CapabilityBehavior,
    const Bindings extends readonly CapabilityBinding[],
>(
    definition: Omit<
        OperationDefinition<Input, Output, Errors>,
        "id" | "access" | "behavior" | "bindings" | "mocks"
    > & {
        readonly id: Id;
        readonly access: Access;
        readonly behavior: Behavior;
        readonly bindings: Bindings;
        readonly mocks?: OperationDefinition<NoInfer<Input>, NoInfer<Output>, NoInfer<Errors>>["mocks"];
    },
): OperationDefinition<Input, Output, Errors> &
    Readonly<{ id: Id; access: Access; behavior: Behavior; bindings: Bindings }> {
    return Object.freeze({ ...definition });
}
