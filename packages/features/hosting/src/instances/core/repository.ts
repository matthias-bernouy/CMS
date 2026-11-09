import type { SiteRepositoryConfiguration } from "hosting/instances/interfaces/types";

/** Fresh instance state always records the selected source, including an unconfigured initial default. */
export function assertInstanceRepository(value: unknown): asserts value is SiteRepositoryConfiguration {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Invalid persisted instance Repository configuration");
    }
    const configuration = value as Record<string, unknown>;
    if (
        Object.keys(configuration).sort().join(",") !== "configured,url" ||
        typeof configuration.configured !== "boolean" ||
        typeof configuration.url !== "string" ||
        configuration.url.length > 2048
    ) {
        throw new TypeError("Invalid persisted instance Repository configuration");
    }
    try {
        const url = new URL(configuration.url);
        if (!/^https?:$/u.test(url.protocol) || url.origin !== configuration.url) {
            throw new Error("Noncanonical origin");
        }
    } catch {
        throw new TypeError("Invalid persisted instance Repository configuration");
    }
}
