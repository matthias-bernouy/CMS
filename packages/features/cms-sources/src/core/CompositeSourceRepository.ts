import type { Source, SourceEndpoint } from "../interfaces/Source";
import type { SourceRepository, SourceSchemaInvalidationScope } from "../interfaces/SourceRepository";
import { SourceValidationError } from "./errors";
import { systemSourceUrnOf } from "./systemSources";

/**
 * Readonly system sources + a writable user source store behind one
 * SourceRepository. The editor can list and select system endpoints using the
 * same source model, while writes stay scoped to user sources.
 */
export class CompositeSourceRepository implements SourceRepository {
    private readonly systemSources = new Map<string, Source>();
    readonly getEndpointForAuthorization?: (urn: string) => Promise<SourceEndpoint | null>;
    readonly invalidateSchema?: (scope?: SourceSchemaInvalidationScope) => void;

    constructor(
        private readonly inner: SourceRepository,
        systemSources: readonly Source[] = [],
    ) {
        for (const source of systemSources) {
            this.systemSources.set(source.urn, structuredClone(source));
        }
        if (inner.getEndpointForAuthorization) {
            this.getEndpointForAuthorization = async (urn: string) => {
                const systemUrn = systemSourceUrnOf(urn);
                if (systemUrn) {
                    const system = this.systemSources.get(systemUrn);
                    const endpoint = system?.endpoints.find((candidate) => candidate.urn === urn);
                    return endpoint ? structuredClone(endpoint) : null;
                }
                return inner.getEndpointForAuthorization!(urn);
            };
        }
        if (inner.invalidateSchema) {
            this.invalidateSchema = (scope) => inner.invalidateSchema!(scope);
        }
    }

    async createSource(source: Source): Promise<Source> {
        this.assertUserSource(source.urn, "system source namespace is reserved");
        return this.inner.createSource(source);
    }

    async updateSource(source: Source): Promise<Source | null> {
        this.assertUserSource(source.urn, "system sources are readonly");
        return this.inner.updateSource(source);
    }

    async deleteSource(urn: string): Promise<boolean> {
        this.assertUserSource(urn, "system sources are readonly");
        return this.inner.deleteSource(urn);
    }

    async getSource(urn: string): Promise<Source | null> {
        const system = this.systemSources.get(urn);
        if (system) {
            return structuredClone(system);
        }
        return this.inner.getSource(urn);
    }

    async getAllSources(): Promise<Source[]> {
        const systemUrns = new Set(this.systemSources.keys());
        const system = Array.from(this.systemSources.values(), (source) => structuredClone(source));
        const user = (await this.inner.getAllSources()).filter(
            (source) => !systemUrns.has(source.urn) && !systemSourceUrnOf(source.urn),
        );
        return [...system, ...user];
    }

    async getEndpoint(urn: string): Promise<SourceEndpoint | null> {
        const systemUrn = systemSourceUrnOf(urn);
        if (systemUrn) {
            const system = this.systemSources.get(systemUrn);
            const endpoint = system?.endpoints.find((candidate) => candidate.urn === urn);
            return endpoint ? structuredClone(endpoint) : null;
        }
        return this.inner.getEndpoint(urn);
    }

    private assertUserSource(urn: string, message: string): void {
        if (systemSourceUrnOf(urn)) {
            throw new SourceValidationError("urn", message);
        }
    }
}
