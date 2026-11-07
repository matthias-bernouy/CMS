import type { z } from "zod";
import type { CapabilitySource } from "ulvia-sdk/interfaces/capabilities";

export class CapabilityFailure extends Error {
    constructor(
        readonly capability: CapabilitySource,
        readonly code: string,
        readonly output?: unknown,
        options?: ErrorOptions,
    ) {
        super(code, options);
        this.name = "CapabilityFailure";
    }
}

export type FailureArguments<
    Capability extends CapabilitySource,
    Code extends keyof Capability["errors"],
> = Capability["errors"][Code] extends { readonly output: infer Schema extends z.ZodType }
    ? [output: z.input<Schema>, options?: ErrorOptions]
    : [options?: ErrorOptions];

/** Business errors carry their declared code and payload; the transport chooses the HTTP status. */
export function capabilityError<Capability extends CapabilitySource, Code extends keyof Capability["errors"] & string>(
    capability: Capability,
    code: Code,
    ...args: FailureArguments<NoInfer<Capability>, NoInfer<Code>>
): CapabilityFailure {
    if (!Object.hasOwn(capability.errors, code)) {
        throw new TypeError(`Undeclared capability error: ${code}`);
    }
    const schema = capability.errors[code]!.output;
    const options = (schema ? args[1] : args[0]) as ErrorOptions | undefined;
    if (
        !schema &&
        (args.length > 1 ||
            (options !== undefined &&
                (!options || typeof options !== "object" || Object.keys(options).some((key) => key !== "cause"))))
    ) {
        throw new TypeError("This capability error has no payload");
    }
    const output = schema ? schema.parse(args[0]) : undefined;
    return new CapabilityFailure(capability, code, output === undefined ? undefined : structuredClone(output), options);
}

export function isCapabilityFailure(value: unknown): value is CapabilityFailure {
    return value instanceof CapabilityFailure;
}

/** Bind typed failures to the owning capability without referring to its variable during initialization. */
export function capabilityFailure<Capability extends CapabilitySource>(
    capability: Capability,
): CapabilityFail<Capability> {
    return (code, ...args) => capabilityError(capability, code, ...args);
}

export type CapabilityFail<Capability extends CapabilitySource> = <Code extends keyof Capability["errors"] & string>(
    code: Code,
    ...args: FailureArguments<Capability, Code>
) => CapabilityFailure;
