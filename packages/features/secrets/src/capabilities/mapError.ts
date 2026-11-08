import type { FeatureErrorMapper } from "@bernouy/ulvia-sdk";
import { z } from "zod";
import { CmsSecretConflict, CmsSecretNotAuthorized, CmsSecretNotFound } from "secrets/core/errors";
export const mapSecretsError: FeatureErrorMapper = (cause, capability) => {
    const candidate =
        cause instanceof CmsSecretNotAuthorized
            ? "NOT_AUTHORIZED"
            : cause instanceof CmsSecretNotFound
              ? "NOT_FOUND"
              : cause instanceof CmsSecretConflict
                ? capability.id === "secrets.create"
                    ? "ALREADY_EXISTS"
                    : "VERSION_CONFLICT"
                : cause instanceof TypeError || cause instanceof z.ZodError
                  ? "INVALID_INPUT"
                  : "CORE_UNAVAILABLE";
    const code = Object.hasOwn(capability.errors, candidate) ? candidate : "CORE_UNAVAILABLE";
    return { code, output: { message: "The Secrets service could not complete the request." } };
};
