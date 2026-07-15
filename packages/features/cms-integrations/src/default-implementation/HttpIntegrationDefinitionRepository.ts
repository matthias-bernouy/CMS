import { parseIntegrationDefinition } from "../core/parsing/definition";
import { hydrateDefinitionIconAssets, SVG_ICON_MAX_BYTES } from "./definition-assets/icons";
import type { IntegrationDefinition } from "../interfaces/Integration";
import { responseAsset } from "./httpDefinitionAssets";
import { parseIndex, parseSummaries, parseVersions } from "./httpDefinitionParsing";
import type {
    IntegrationAsset,
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
        if (!value) return null;
        const definition = parseIntegrationDefinition(value);
        assertDefinitionIdentity(definition, kind, version);
        return await hydrateDefinitionIconAssets(
            definition,
            path => this.readAsset(kind, definition.version ?? version, path, SVG_ICON_MAX_BYTES),
        );
    }

    async getAsset(kind: string, version: string | undefined, path: string): Promise<IntegrationAsset | null> {
        return await this.readAsset(kind, version, path);
    }

    private async readAsset(
        kind: string,
        version: string | undefined,
        path: string,
        maxBytes?: number,
    ): Promise<IntegrationAsset | null> {
        const params = new URLSearchParams({ kind, path });
        if (version) params.set("version", version);
        const response = await this.fetchPath(`/api/integrations/asset?${params.toString()}`);
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`Integration repository request failed: ${response.status} ${response.statusText}`);
        return responseAsset(response, maxBytes);
    }

    private async getJson(path: string): Promise<unknown> {
        const response = await this.fetchPath(path);
        if (!response.ok) throw new Error(`Integration repository request failed: ${response.status} ${response.statusText}`);
        return response.json();
    }

    private async getJsonOrNull(path: string): Promise<unknown | null> {
        const response = await this.fetchPath(path);
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`Integration repository request failed: ${response.status} ${response.statusText}`);
        return response.json();
    }

    private fetchPath(path: string): Promise<Response> {
        return this.fetchImpl(repositoryUrl(this.baseUrl, path), {
            headers: requestHeaders(this.headers),
        });
    }
}

function normalizedBaseUrl(value: string): string {
    return value.endsWith("/") ? value : `${value}/`;
}

function repositoryUrl(baseUrl: string, path: string): URL {
    return new URL(path.replace(/^\/+/, ""), normalizedBaseUrl(baseUrl));
}

function requestHeaders(headers: HeadersInit | undefined): Headers {
    const result = new Headers(headers);
    if (!result.has("accept")) result.set("accept", "application/json");
    return result;
}

function assertDefinitionIdentity(
    definition: IntegrationDefinition,
    expectedKind: string,
    expectedVersion: string | undefined,
): void {
    if (definition.kind !== expectedKind) {
        throw new Error(`Integration repository returned kind "${definition.kind}" for "${expectedKind}"`);
    }
    if (expectedVersion && definition.version !== expectedVersion) {
        throw new Error(
            `Integration repository returned version "${definition.version ?? ""}" for "${expectedVersion}"`,
        );
    }
}
