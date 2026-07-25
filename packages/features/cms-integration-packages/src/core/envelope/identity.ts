import { parse } from "semver";
import { IntegrationPackageValidationError } from "./errors";

export function assertIntegrationPackageKind(value: unknown): string {
    if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value)) {
        throw new IntegrationPackageValidationError(
            "invalid_envelope",
            "kind must be a non-empty path-safe identifier",
            "kind",
        );
    }
    return value;
}

export function assertIntegrationPackageVersion(value: unknown): string {
    if (typeof value !== "string") {
        throw invalidVersion();
    }
    const parsed = parse(value);
    const canonical = parsed
        ? `${parsed.version}${parsed.build.length ? `+${parsed.build.join(".")}` : ""}`
        : undefined;
    if (!parsed || canonical !== value) {
        throw invalidVersion();
    }
    return value;
}

function invalidVersion(): IntegrationPackageValidationError {
    return new IntegrationPackageValidationError(
        "invalid_version",
        "version must be an exact SemVer 2.0 version",
        "version",
    );
}
