import type { SourceEndpoint, SourceEndpointAccessMode } from "../interfaces/Source";
import { SOURCE_ENDPOINT_ACCESS_MODES } from "../interfaces/Source";

export const DEFAULT_SOURCE_ENDPOINT_ACCESS_MODE: SourceEndpointAccessMode = "admin";

const ACCESS_RANK: Record<SourceEndpointAccessMode, number> = {
    public: 0,
    auth: 1,
    admin: 2,
    system: 3,
};

export function isSourceEndpointAccessMode(value: unknown): value is SourceEndpointAccessMode {
    return typeof value === "string" && (SOURCE_ENDPOINT_ACCESS_MODES as readonly string[]).includes(value);
}

export function sourceEndpointAccessMode(endpoint: Pick<SourceEndpoint, "access">): SourceEndpointAccessMode {
    return endpoint.access?.mode ?? DEFAULT_SOURCE_ENDPOINT_ACCESS_MODE;
}

export function sourceEndpointAccessAllows(
    endpointMode: SourceEndpointAccessMode,
    callerMode: SourceEndpointAccessMode,
): boolean {
    if (endpointMode === "system") {
        return callerMode === "system";
    }
    return ACCESS_RANK[callerMode] >= ACCESS_RANK[endpointMode];
}
