import type { z } from "zod";
import type {
    CapabilityAccess,
    CapabilityBehavior,
    CapabilityBinding,
    CapabilityDeprecation,
    CapabilityResponseEffect,
    CapabilityMockDefinition,
} from "@bernouy/ulvia-contracts";

export interface CapabilityError {
    readonly description?: string;
    readonly retryable: boolean;
    readonly output?: z.ZodType;
}

export type CapabilityErrors = Readonly<Record<string, CapabilityError>>;

type ErrorOutcome<Errors extends CapabilityErrors> = {
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

export interface CapabilityMock<Input extends z.ZodObject, Output extends z.ZodType, Errors extends CapabilityErrors> {
    readonly id: string;
    readonly description?: string;
    readonly input: MockValue<z.input<Input>>;
    readonly outcome: { readonly kind: "success"; readonly output: MockValue<z.input<Output>> } | ErrorOutcome<Errors>;
}

/** Public contract exposure authored once alongside the capability's data schemas. */
export interface CapabilityExposure {
    readonly id: string;
    readonly access: CapabilityAccess;
    readonly behavior: CapabilityBehavior;
    readonly bindings: readonly CapabilityBinding[];
    readonly deprecation?: CapabilityDeprecation;
    readonly responseEffects?: readonly CapabilityResponseEffect[];
}

export interface CapabilityDefinition<
    Input extends z.ZodObject = z.ZodObject,
    Output extends z.ZodType = z.ZodType,
    Errors extends CapabilityErrors = CapabilityErrors,
> extends CapabilityExposure {
    readonly description?: string;
    readonly input: Input;
    readonly output: Output;
    readonly errors: Errors;
    readonly docs?: readonly string[];
    readonly mocks?: readonly CapabilityMock<Input, Output, Errors>[];
}

export interface CapabilitySource extends Omit<CapabilityDefinition, "mocks"> {
    readonly mocks?: readonly CapabilityMockDefinition[];
}

export type CapabilityInput<Capability extends CapabilitySource> = z.input<Capability["input"]>;
export type CapabilityOutput<Capability extends CapabilitySource> = z.output<Capability["output"]>;

/** Authentication and dependency injection belong to the host-supplied context. */
export type CapabilityHandler<Capability extends CapabilitySource, Context = unknown> = (
    input: CapabilityInput<Capability>,
    context: Context,
) => CapabilityOutput<Capability> | Promise<CapabilityOutput<Capability>>;
