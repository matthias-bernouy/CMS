import type { FeatureErrorMapper } from "@bernouy/ulvia-sdk";
import { AccessError } from "cms-auth/application/core/access/errors";
import { PersonalAccessTokenLimitError } from "cms-auth/tokens/personal-access/core/limits";
const management = new Set([
    "set-administrator",
    "delete-user",
    "create-personal-access-token",
    "list-personal-access-tokens",
    "revoke-personal-access-token",
]);
const accounts = new Set([
    "signup",
    "request-email-verification",
    "confirm-email-verification",
    "request-password-reset",
    "confirm-password-reset",
]);
export const mapAccessError: FeatureErrorMapper = (cause, capability) => {
    const status = cause && typeof cause === "object" && "status" in cause ? Number(cause.status) : 0;
    const candidate =
        cause instanceof AccessError
            ? cause.code
            : capability.id === "create-personal-access-token" && cause instanceof PersonalAccessTokenLimitError
              ? "TOKEN_LIMIT"
              : management.has(capability.id)
                ? status === 409
                    ? "REVISION_CONFLICT"
                    : "INVALID_INPUT"
                : accounts.has(capability.id) && status === 400
                  ? "INVALID_INPUT"
                  : "CORE_UNAVAILABLE";
    const code = Object.hasOwn(capability.errors, candidate) ? candidate : "CORE_UNAVAILABLE";
    if (!Object.hasOwn(capability.errors, code)) {
        return undefined;
    }
    return { code, output: { message: "The Access service could not complete the request." } };
};
