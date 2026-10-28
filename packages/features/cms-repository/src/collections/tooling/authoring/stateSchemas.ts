import type { ReleaseCatalogue } from "cms-repository/exports/contracts/catalogue";
import { DEFAULT_RELEASE_LIMITS } from "cms-repository/exports/contracts/index";

/** Authoring-only references are materialized from exact admitted outputs, never published. */
export async function materializeStateSchemas(states: unknown, contracts?: ReleaseCatalogue): Promise<unknown> {
    let nodes = 0;
    const expand = async (value: unknown, depth: number): Promise<unknown> => {
        if (++nodes > DEFAULT_RELEASE_LIMITS.maxSchemaNodes || depth > DEFAULT_RELEASE_LIMITS.maxSchemaDepth) {
            throw new Error("State schema source exceeds expansion limits");
        }
        if (!value || typeof value !== "object") {
            return value;
        }
        if (Array.isArray(value)) {
            return Promise.all(value.map((item) => expand(item, depth + 1)));
        }
        const record = value as Record<string, unknown>;
        if (Object.hasOwn(record, "$capabilityOutput")) {
            const ref = record.$capabilityOutput as Record<string, unknown> | null;
            if (
                Object.keys(record).length !== 1 ||
                !ref ||
                typeof ref !== "object" ||
                Array.isArray(ref) ||
                Object.keys(ref).sort().join() !== "capabilityId,contractId,digest,version" ||
                Object.values(ref).some((part) => typeof part !== "string" || !part || part.length > 128)
            ) {
                throw new Error("Invalid capability output schema reference");
            }
            const release = await contracts?.get(String(ref.contractId), String(ref.version));
            if (!release || release.admission.digest !== ref.digest) {
                throw new Error("State schema requires an exact admitted contract pin");
            }
            const capability = release.admission.release.capabilities.find(({ id }) => id === ref.capabilityId);
            if (!capability) {
                throw new Error("State schema capability output is missing");
            }
            return structuredClone(capability.output);
        }
        return Object.fromEntries(
            await Promise.all(
                Object.entries(record).map(async ([key, entry]) => [key, await expand(entry, depth + 1)]),
            ),
        );
    };
    return expand(states, 0);
}
