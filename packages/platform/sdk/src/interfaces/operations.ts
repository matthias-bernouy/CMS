import type { z } from "zod";
import type {
    CapabilityAccess,
    CapabilityBehavior,
    CapabilityBinding,
    CapabilityDeprecation,
    CapabilityResponseEffect,
    CapabilityMockDefinition,
} from "@bernouy/ulvia-contracts";

export interface OperationError {
    readonly description?: string;
    readonly retryable: boolean;
    readonly output?: z.ZodType;
}

export type OperationErrors = Readonly<Record<string, OperationError>>;

type ErrorOutcome<Errors extends OperationErrors> = {
    [Code in keyof Errors & string]: { readonly kind: "error"; readonly code: Code } & (Errors[Code] extends {
        readonly output: infer Schema extends z.ZodType;
    }
        ? { readonly output: MockValue<z.input<Schema>> }
        : { readonly output?: never });
}[keyof Errors & string];

export type MockValue<Value> = Value extends Uint8Array
    ? { readonly assetId: string }
    : Value extends readonly unknown[]
      ? { [Index in keyof Value]: MockValue<Value[Index]> }
      : Value extends object
        ? { [Key in keyof Value]: MockValue<Value[Key]> }
        : Value;

export interface OperationMock<Input extends z.ZodObject, Output extends z.ZodType, Errors extends OperationErrors> {
    readonly id: string;
    readonly description?: string;
    readonly input: MockValue<z.input<Input>>;
    readonly outcome: { readonly kind: "success"; readonly output: MockValue<z.input<Output>> } | ErrorOutcome<Errors>;
}

/** Public contract exposure authored once alongside the operation's data schemas. */
export interface OperationExposure {
    readonly id: string;
    readonly access: CapabilityAccess;
    readonly behavior: CapabilityBehavior;
    readonly bindings: readonly CapabilityBinding[];
    readonly deprecation?: CapabilityDeprecation;
    readonly responseEffects?: readonly CapabilityResponseEffect[];
}

export interface OperationDefinition<
    Input extends z.ZodObject = z.ZodObject,
    Output extends z.ZodType = z.ZodType,
    Errors extends OperationErrors = OperationErrors,
> extends OperationExposure {
    readonly description?: string;
    readonly input: Input;
    readonly output: Output;
    readonly errors: Errors;
    readonly docs?: readonly string[];
    readonly mocks?: readonly OperationMock<Input, Output, Errors>[];
}

export interface OperationSource extends Omit<OperationDefinition, "mocks"> {
    readonly mocks?: readonly CapabilityMockDefinition[];
}

export type OperationInput<Operation extends OperationSource> = z.input<Operation["input"]>;
export type OperationOutput<Operation extends OperationSource> = z.output<Operation["output"]>;

/** Authentication and dependency injection belong to the host-supplied context. */
export type OperationHandler<Operation extends OperationSource, Context = unknown> = (
    input: OperationInput<Operation>,
    context: Context,
) => OperationOutput<Operation> | Promise<OperationOutput<Operation>>;
