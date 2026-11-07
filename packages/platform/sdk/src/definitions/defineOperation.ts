import type { z } from "zod";
import type { OperationDefinition, OperationErrors } from "ulvia-sdk/interfaces/operations";

export function defineOperation<
    const Input extends z.ZodObject,
    const Output extends z.ZodType,
    const Errors extends OperationErrors,
>(
    definition: Omit<OperationDefinition<Input, Output, Errors>, "mocks"> & {
        readonly mocks?: OperationDefinition<NoInfer<Input>, NoInfer<Output>, NoInfer<Errors>>["mocks"];
    },
): OperationDefinition<Input, Output, Errors> {
    return Object.freeze({ ...definition });
}
