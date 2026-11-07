import { z } from "zod";
import type { CapabilityFailure } from "@bernouy/ulvia-sdk";
import { CmsSecretConflict, CmsSecretNotAuthorized, CmsSecretNotFound } from "cms-secrets/core/errors";
import type { secretErrorSchema } from "cms-secrets/schemas/errors";

type ErrorPayload = z.infer<typeof secretErrorSchema>;
type Errors = Readonly<Record<string, { readonly retryable: boolean; readonly output: typeof secretErrorSchema }>> & {
    readonly CORE_UNAVAILABLE: unknown;
};

/** Keep domain classification beside the feature, and transport status/localization in the surface. */
export async function secretCall<Result, Declaration extends Errors>(
    errors: Declaration,
    fail: (code: keyof NoInfer<Declaration> & string, output: ErrorPayload, options: ErrorOptions) => CapabilityFailure,
    operation: () => Promise<Result>,
    conflictCode: "ALREADY_EXISTS" | "VERSION_CONFLICT" = "VERSION_CONFLICT",
): Promise<Result> {
    try {
        return await operation();
    } catch (cause) {
        const candidate =
            cause instanceof CmsSecretNotAuthorized
                ? "NOT_AUTHORIZED"
                : cause instanceof CmsSecretNotFound
                  ? "NOT_FOUND"
                  : cause instanceof CmsSecretConflict
                    ? conflictCode
                    : cause instanceof TypeError || cause instanceof z.ZodError
                      ? "INVALID_INPUT"
                      : "CORE_UNAVAILABLE";
        const code = Object.hasOwn(errors, candidate) ? candidate : "CORE_UNAVAILABLE";
        throw fail(
            code as keyof Declaration & string,
            { message: "The Secrets service could not complete the request." },
            { cause },
        );
    }
}
