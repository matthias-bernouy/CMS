import InvalidParam from "cms-control/errors/Http/InvalidParam";
import MissingParam from "cms-control/errors/Http/MissingParam";

export type ConnectorProviderUpdateDto = {
    provider: "supabase";
    enabled: boolean;
    projectRef: string;
    accessToken?: string;
};

export function parseConnectorProviderUpdateDto(body: Record<string, unknown>): ConnectorProviderUpdateDto {
    const provider = last(body.provider);
    if (provider === undefined || provider === null || provider === "") throw new MissingParam("provider");
    if (provider !== "supabase") throw new InvalidParam("provider", "must be supabase");

    if (!("enabled" in body)) throw new MissingParam("enabled");
    const enabled = asBoolean(body.enabled, "enabled");

    const projectRef = last(body.projectRef);
    if (projectRef === undefined || projectRef === null) throw new MissingParam("projectRef");
    if (typeof projectRef !== "string") throw new InvalidParam("projectRef", "must be a string");

    const accessToken = last(body.accessToken);
    if (accessToken !== undefined && typeof accessToken !== "string") {
        throw new InvalidParam("accessToken", "must be a string");
    }

    return {
        provider,
        enabled,
        projectRef: projectRef.trim(),
        ...(accessToken !== undefined ? { accessToken } : {}),
    };
}

function asBoolean(raw: unknown, name: string): boolean {
    const value = last(raw);
    if (typeof value === "boolean") return value;
    if (typeof value !== "string") throw new InvalidParam(name, "must be a boolean");
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "on", "yes"].includes(normalized)) return true;
    if (["0", "false", "off", "no", ""].includes(normalized)) return false;
    throw new InvalidParam(name, "must be a boolean");
}

function last(value: unknown): unknown {
    return Array.isArray(value) ? value.at(-1) : value;
}
