import type { Source, SourceEndpoint } from "../../interfaces/Source";
import type { SourceRepository, SourceSchemaInvalidationScope } from "../../interfaces/SourceRepository";
import { memoizeRequestPromise } from "./requestScopeCache";

/**
 * Shares identical source reads for one execution only. Construct a fresh
 * instance for every ingress request.
 */
export class RequestScopedSourceRepository implements SourceRepository {
    private readonly sources = new Map<string, Promise<Source | null>>();
    private readonly endpoints = new Map<string, Promise<SourceEndpoint | null>>();
    private readonly authorizationEndpoints = new Map<string, Promise<SourceEndpoint | null>>();
    private allSources: Promise<Source[]> | undefined;
    readonly getEndpointForAuthorization?: (urn: string) => Promise<SourceEndpoint | null>;

    constructor(private readonly inner: SourceRepository) {
        if (inner.getEndpointForAuthorization) {
            this.getEndpointForAuthorization = (urn) => this.getAuthorizationEndpoint(urn);
        }
    }

    async createSource(source: Source): Promise<Source> {
        try {
            return structuredClone(await this.inner.createSource(source));
        } finally {
            this.clear();
        }
    }

    async updateSource(source: Source): Promise<Source | null> {
        try {
            return cloneNullable(await this.inner.updateSource(source));
        } finally {
            this.clear();
        }
    }

    async deleteSource(urn: string): Promise<boolean> {
        try {
            return await this.inner.deleteSource(urn);
        } finally {
            this.clear();
        }
    }

    async getSource(urn: string): Promise<Source | null> {
        const source = await memoizeRequestPromise(this.sources, urn, async () =>
            cloneNullable(await this.inner.getSource(urn)),
        );
        return cloneNullable(source);
    }

    async getAllSources(): Promise<Source[]> {
        if (!this.allSources) {
            const pending = Promise.resolve()
                .then(() => this.inner.getAllSources())
                .then((sources) => structuredClone(sources));
            this.allSources = pending;
            void pending.catch(() => {
                if (this.allSources === pending) {
                    this.allSources = undefined;
                }
            });
        }
        return structuredClone(await this.allSources);
    }

    async getEndpoint(urn: string): Promise<SourceEndpoint | null> {
        const endpoint = await memoizeRequestPromise(this.endpoints, urn, async () =>
            cloneNullable(await this.inner.getEndpoint(urn)),
        );
        return cloneNullable(endpoint);
    }

    private async getAuthorizationEndpoint(urn: string): Promise<SourceEndpoint | null> {
        const endpoint = await memoizeRequestPromise(this.authorizationEndpoints, urn, async () =>
            cloneNullable(await this.inner.getEndpointForAuthorization!(urn)),
        );
        return cloneNullable(endpoint);
    }

    invalidateSchema(scope?: SourceSchemaInvalidationScope): void {
        this.clear();
        this.inner.invalidateSchema?.(scope);
    }

    private clear(): void {
        this.sources.clear();
        this.endpoints.clear();
        this.authorizationEndpoints.clear();
        this.allSources = undefined;
    }
}

function cloneNullable<Value>(value: Value | null): Value | null {
    return value === null ? null : structuredClone(value);
}
