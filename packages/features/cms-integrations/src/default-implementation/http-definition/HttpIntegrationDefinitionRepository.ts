import { parseIntegrationDefinition } from "../../core/parsing/definition/definition";
import { isExactIntegrationVersion, isIntegrationPrerelease } from "../../core/definitions/versioning";
import { hydrateDefinitionIconAssets, SVG_ICON_MAX_BYTES } from "../definition-assets/icons";
import type { IntegrationDefinition } from "../../interfaces/Integration";
import { parseIndex, parseSummaries, parseVersions } from "./httpDefinitionParsing";
import {
    DEFAULT_INTEGRATION_REPOSITORY_TIMEOUT_MS,
    HttpDefinitionTransport,
    parseRepositoryContract,
    parseRepositoryContractAsync,
} from "./httpDefinitionTransport";
import type {
    IntegrationAsset,
    IntegrationDefinitionIndex,
    IntegrationDefinitionRepository,
    IntegrationDefinitionSummary,
    IntegrationDefinitionVersion,
} from "../../interfaces/IntegrationDefinitionRepository";

export type HttpIntegrationDefinitionRepositoryConfig = {
    baseUrl: string;
    fetch?: typeof fetch;
    headers?: HeadersInit;
    timeoutMs?: number;
};

export { DEFAULT_INTEGRATION_REPOSITORY_TIMEOUT_MS };

export class HttpIntegrationDefinitionRepository implements IntegrationDefinitionRepository {
    private readonly baseUrl: string;
    private readonly transport: HttpDefinitionTransport;

    constructor(config: string | HttpIntegrationDefinitionRepositoryConfig) {
        this.baseUrl = typeof config === "string" ? config : config.baseUrl;
        this.transport = new HttpDefinitionTransport(
            typeof config === "string"
                ? { baseUrl: config, timeoutMs: DEFAULT_INTEGRATION_REPOSITORY_TIMEOUT_MS }
                : {
                      ...config,
                      timeoutMs: config.timeoutMs ?? DEFAULT_INTEGRATION_REPOSITORY_TIMEOUT_MS,
                  },
        );
    }

    async list(): Promise<IntegrationDefinitionSummary[]> {
        const value = await this.transport.getJson("/api/integrations");
        return parseRepositoryContract(() => parseSummaries(value));
    }

    async getIndex(kind: string): Promise<IntegrationDefinitionIndex | null> {
        const value = await this.transport.getJsonOrNull(`/api/integrations/index?kind=${encodeURIComponent(kind)}`);
        return value ? parseRepositoryContract(() => parseIndex(value)) : null;
    }

    async listVersions(kind: string): Promise<IntegrationDefinitionVersion[]> {
        const value = await this.transport.getJsonOrNull(`/api/integrations/versions?kind=${encodeURIComponent(kind)}`);
        return value ? parseRepositoryContract(() => parseVersions(value)) : [];
    }

    async get(kind: string, version?: string): Promise<IntegrationDefinition | null> {
        const params = new URLSearchParams({ kind });
        if (version) {
            params.set("version", version);
        }
        const value = await this.transport.getJsonOrNull(`/api/integrations/definition?${params.toString()}`);
        if (!value) {
            return null;
        }
        const definition = parseRepositoryContract(() => {
            assertRawDefinitionVersion(value, version);
            const parsed = parseIntegrationDefinition(value);
            assertDefinitionIdentity(parsed, kind, version);
            return parsed;
        });
        return await parseRepositoryContractAsync(() =>
            hydrateDefinitionIconAssets(definition, (path) =>
                this.readAsset(kind, definition.version ?? version, path, SVG_ICON_MAX_BYTES),
            ),
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
        if (version) {
            params.set("version", version);
        }
        return await this.transport.getAsset(`/api/integrations/asset?${params.toString()}`, maxBytes);
    }
}

function assertDefinitionIdentity(
    definition: IntegrationDefinition,
    expectedKind: string,
    expectedVersion: string | undefined,
): void {
    if (
        definition.kind !== expectedKind ||
        !definition.version ||
        !isExactIntegrationVersion(definition.version) ||
        (expectedVersion ? definition.version !== expectedVersion : isIntegrationPrerelease(definition.version))
    ) {
        throw new Error("integration definition identity does not match the request");
    }
}

function assertRawDefinitionVersion(value: unknown, expectedVersion: string | undefined): void {
    if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        !("version" in value) ||
        typeof value.version !== "string" ||
        !isExactIntegrationVersion(value.version) ||
        (expectedVersion ? value.version !== expectedVersion : isIntegrationPrerelease(value.version))
    ) {
        throw new Error("integration definition identity does not match the request");
    }
}
