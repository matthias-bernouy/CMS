import type { FeatureErrorMapper } from "@bernouy/ulvia-sdk";
import { ResourceArchiveError } from "resources/artifacts/archive/errors";
import { z } from "zod";

export const resourceErrorMessages = {
    NOT_FOUND: "Resource initialization is unavailable for this scope.",
    FORBIDDEN: "A current site administrator must authorize initialization.",
    INVALID_INPUT: "The resource archive, review or initialization input is invalid.",
    REVISION_CONFLICT: "Initialization changed. Review the starting point again before applying.",
    INITIALIZATION_BUSY: "Resource initialization is already being prepared or applied.",
    CORE_UNAVAILABLE: "Resource initialization is temporarily unavailable. Try again later.",
} as const;
export class ResourceSetupError extends Error {
    constructor(readonly code: keyof typeof resourceErrorMessages) {
        super(resourceErrorMessages[code]);
    }
}
export const mapResourceError: FeatureErrorMapper = (cause) => {
    const status = cause && typeof cause === "object" && "status" in cause ? Number(cause.status) : 0;
    const code =
        cause instanceof ResourceSetupError
            ? cause.code
            : status === 403
              ? "FORBIDDEN"
              : status === 404
                ? "NOT_FOUND"
                : status === 409
                  ? "REVISION_CONFLICT"
                  : status === 423
                    ? "INITIALIZATION_BUSY"
                    : cause instanceof ResourceArchiveError ||
                        cause instanceof z.ZodError ||
                        cause instanceof TypeError ||
                        cause instanceof RangeError ||
                        status === 400 ||
                        status === 422
                      ? "INVALID_INPUT"
                      : "CORE_UNAVAILABLE";
    return { code, output: { message: resourceErrorMessages[code] } };
};
