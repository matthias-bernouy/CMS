import { ReleaseValidationError } from "../protocol/errors";
import { expectString } from "../protocol/values";

const IDENTIFIER_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z][a-z0-9]*)*$/;
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;
const SEMVER_PATTERN =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function parseIdentifier(value: unknown, path: string, maximum = 128): string {
    const identifier = expectString(value, path, "invalid_contract", maximum);
    if (!IDENTIFIER_PATTERN.test(identifier)) {
        throw new ReleaseValidationError("invalid_contract", "must be a lowercase dotted identifier", path);
    }
    return identifier;
}

export function parseErrorCode(value: unknown, path: string): string {
    const code = expectString(value, path, "invalid_contract", 64);
    if (!ERROR_CODE_PATTERN.test(code)) {
        throw new ReleaseValidationError("invalid_contract", "must be an uppercase error code", path);
    }
    return code;
}

export function parseSemVer(value: unknown, path: string): string {
    const version = expectString(value, path, "invalid_contract", 128);
    if (!SEMVER_PATTERN.test(version)) {
        throw new ReleaseValidationError("invalid_contract", "must be canonical SemVer", path);
    }
    return version;
}
