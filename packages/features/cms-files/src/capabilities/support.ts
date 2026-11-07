import type { z } from "zod";
import type { CapabilityFailure } from "@bernouy/ulvia-sdk";
import { CmsFilesError } from "cms-files/core/credentials";
import type { fileErrorSchema } from "cms-files/schemas/errors";

type ErrorPayload = z.infer<typeof fileErrorSchema>;
type Errors = Readonly<Record<string, { readonly retryable: boolean; readonly output: typeof fileErrorSchema }>> & {
    readonly CORE_UNAVAILABLE: unknown;
};

/** Classify domain failures without exposing private causes or selecting transport statuses. */
export async function fileCall<Result, Declaration extends Errors>(
    errors: Declaration,
    fail: (code: keyof NoInfer<Declaration> & string, output: ErrorPayload, options: ErrorOptions) => CapabilityFailure,
    operation: () => Promise<Result>,
): Promise<Result> {
    try {
        return await operation();
    } catch (cause) {
        const candidate = cause instanceof CmsFilesError ? cause.code : "CORE_UNAVAILABLE";
        const code = Object.hasOwn(errors, candidate) ? candidate : "CORE_UNAVAILABLE";
        throw fail(
            code as keyof Declaration & string,
            { message: "The Files service could not complete the request." },
            { cause },
        );
    }
}
