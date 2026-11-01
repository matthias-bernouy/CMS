import type { VersionBump } from "../semver";

export interface CapabilityChange {
    readonly code: "binding_changed" | "capability_changed" | "schema_changed";
    readonly message: string;
    readonly path: string;
    readonly requiredBump: VersionBump;
}

export function major(code: CapabilityChange["code"], path: string, message: string): CapabilityChange {
    return { code, path, message, requiredBump: "major" };
}
