import { matchesStringFormat } from "@bernouy/ulvia-contracts/validation";
import { isResourceId, isResourceNamespace } from "@bernouy/ulvia-contracts/protocol";
import { ProviderManifestValidationError } from "../protocol/errors";
import { expectString } from "../protocol/values";

const IDENTIFIER_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z][a-z0-9]*)*$/;

export function parseIdentifier(value: unknown, path: string, maximum = 128): string {
    const identifier = expectString(value, path, maximum);
    if (!IDENTIFIER_PATTERN.test(identifier)) {
        throw new ProviderManifestValidationError("invalid_manifest", "must be a lowercase dotted identifier", path);
    }
    return identifier;
}

export function parseDateTime(value: unknown, path: string): string {
    const dateTime = expectString(value, path, 64);
    if (!matchesStringFormat(dateTime, "date-time")) {
        throw new ProviderManifestValidationError("invalid_manifest", "must be a valid date-time", path);
    }
    return dateTime;
}

export function parseResourceIdentifier(value: unknown, path: string): string {
    if (!isResourceId(value)) {
        throw new ProviderManifestValidationError(
            "invalid_manifest",
            "must be a namespace/name resource identity",
            path,
        );
    }
    return value;
}

export function parsePublisherIdentifier(value: unknown, path: string): string {
    const publisher = expectString(value, path, 96);
    if (!isResourceNamespace(publisher)) {
        throw new ProviderManifestValidationError(
            "invalid_manifest",
            "must be a bounded lowercase publisher namespace",
            path,
        );
    }
    return publisher;
}
