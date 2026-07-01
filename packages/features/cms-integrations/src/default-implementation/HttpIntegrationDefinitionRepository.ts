import { parseIntegrationDefinition } from "../core/parsing/definition";
import type { IntegrationDefinition } from "../interfaces/Integration";
import type {
    IntegrationDefinitionIndex,
    IntegrationDefinitionRepository,
    IntegrationDefinitionSummary,
    IntegrationDefinitionVersion,
} from "../interfaces/IntegrationDefinitionRepository";

export type HttpIntegrationDefinitionRepositoryConfig = {
    baseUrl: string;
    fetch?: typeof fetch;
    headers?: HeadersInit;
};

export class HttpIntegrationDefinitionRepository implements IntegrationDefinitionRepository {
    private readonly baseUrl: string;
    private readonly fetchImpl: typeof fetch;
    private readonly headers?: HeadersInit;

    constructor(config: string | HttpIntegrationDefinitionRepositoryConfig) {
        this.baseUrl = typeof config === "string" ? config : config.baseUrl;
        this.fetchImpl = typeof config === "string" ? fetch : config.fetch ?? fetch;
        this.headers = typeof config === "string" ? undefined : config.headers;
    }

    async list(): Promise<IntegrationDefinitionSummary[]> {
        return parseSummaries(await this.getJson("/api/integrations"));
    }

    async getIndex(kind: string): Promise<IntegrationDefinitionIndex | null> {
        const value = await this.getJsonOrNull(`/api/integrations/index?kind=${encodeURIComponent(kind)}`);
        return value ? parseIndex(value) : null;
    }

    async listVersions(kind: string): Promise<IntegrationDefinitionVersion[]> {
        const value = await this.getJsonOrNull(`/api/integrations/versions?kind=${encodeURIComponent(kind)}`);
        return value ? parseVersions(value) : [];
    }

    async get(kind: string, version?: string): Promise<IntegrationDefinition | null> {
        const params = new URLSearchParams({ kind });
        if (version) params.set("version", version);
        const value = await this.getJsonOrNull(`/api/integrations/definition?${params.toString()}`);
        return value ? parseIntegrationDefinition(value) : null;
    }

    private async getJson(path: string): Promise<unknown> {
        const response = await this.fetchImpl(new URL(path, normalizedBaseUrl(this.baseUrl)), {
            headers: requestHeaders(this.headers),
        });
        if (!response.ok) throw new Error(`Integration repository request failed: ${response.status} ${response.statusText}`);
        return response.json();
    }

    private async getJsonOrNull(path: string): Promise<unknown | null> {
        const response = await this.fetchImpl(new URL(path, normalizedBaseUrl(this.baseUrl)), {
            headers: requestHeaders(this.headers),
        });
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`Integration repository request failed: ${response.status} ${response.statusText}`);
        return response.json();
    }
}

function normalizedBaseUrl(value: string): string {
    return value.endsWith("/") ? value : `${value}/`;
}

function requestHeaders(headers: HeadersInit | undefined): Headers {
    const result = new Headers(headers);
    if (!result.has("accept")) result.set("accept", "application/json");
    return result;
}

function parseSummaries(value: unknown): IntegrationDefinitionSummary[] {
    if (!Array.isArray(value)) throw new Error("integration summaries response must be an array");
    return value.map(parseSummary);
}

function parseSummary(value: unknown): IntegrationDefinitionSummary {
    if (!isRecord(value)) throw new Error("integration summary must be an object");
    const kind = requiredText(value.kind, "kind");
    const label = requiredText(value.label, "label");
    const versions = stringArray(value.versions, "versions");
    return {
        kind,
        label,
        ...(text(value.schema) ? { schema: text(value.schema)! } : {}),
        ...(text(value.category) ? { category: text(value.category)! } : {}),
        ...(text(value.description) ? { description: text(value.description)! } : {}),
        ...(text(value.stable) ? { stable: text(value.stable)! } : {}),
        ...(text(value.latest) ? { latest: text(value.latest)! } : {}),
        versions,
    };
}

function parseIndex(value: unknown): IntegrationDefinitionIndex {
    if (!isRecord(value)) throw new Error("integration index must be an object");
    return {
        ...definitionMetadata(value),
        versions: parseVersions(value.versions),
    };
}

function definitionMetadata(value: Record<string, unknown>) {
    const kind = requiredText(value.kind, "kind");
    const label = requiredText(value.label, "label");
    return {
        kind,
        label,
        ...(text(value.schema) ? { schema: text(value.schema)! } : {}),
        ...(text(value.category) ? { category: text(value.category)! } : {}),
        ...(text(value.description) ? { description: text(value.description)! } : {}),
        ...(text(value.stable) ? { stable: text(value.stable)! } : {}),
        ...(text(value.latest) ? { latest: text(value.latest)! } : {}),
    };
}

function parseVersions(value: unknown): IntegrationDefinitionVersion[] {
    if (!Array.isArray(value)) throw new Error("integration versions response must be an array");
    return value.map(entry => {
        if (!isRecord(entry)) throw new Error("integration version must be an object");
        return {
            version: requiredText(entry.version, "version"),
            path: requiredText(entry.path, "path"),
            definition: requiredText(entry.definition, "definition"),
        };
    });
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredText(value: unknown, name: string): string {
    const result = text(value);
    if (!result) throw new Error(`integration repository response missing ${name}`);
    return result;
}

function stringArray(value: unknown, name: string): string[] {
    if (!Array.isArray(value) || value.some(item => typeof item !== "string")) {
        throw new Error(`integration repository response ${name} must be a string array`);
    }
    return value;
}
