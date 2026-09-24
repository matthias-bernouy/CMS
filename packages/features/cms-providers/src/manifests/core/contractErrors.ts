import { ReleaseValidationError } from "@bernouy/cms-contracts";
import { ProviderManifestValidationError, type ProviderManifestValidationCode } from "./errors";

export function translateContractError(error: unknown, prefix = ""): never {
    if (error instanceof ProviderManifestValidationError) {
        throw error;
    }
    if (!(error instanceof ReleaseValidationError)) {
        throw error;
    }
    const code: ProviderManifestValidationCode =
        error.code === "invalid_schema"
            ? "invalid_schema"
            : error.code === "body_limit_exceeded" ||
                error.code === "duplicate_json_property" ||
                error.code === "invalid_json" ||
                error.code === "invalid_utf8" ||
                error.code === "json_depth_limit_exceeded"
              ? error.code
              : "invalid_manifest";
    const messagePrefix = `${error.path}: `;
    const message = error.message.startsWith(messagePrefix) ? error.message.slice(messagePrefix.length) : error.message;
    const path = prefix ? `${prefix}${error.path === "$" ? "" : error.path.slice(1)}` : error.path;
    throw new ProviderManifestValidationError(code, message, path);
}
