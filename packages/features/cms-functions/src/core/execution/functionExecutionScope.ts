import type {
    IdentityAlias,
    IdentityResolver,
    IdentityService,
    IdentitySubjectId,
    IdentityValue,
} from "@bernouy/cms-identities";
import type {
    ExecutorDeps,
    Source,
    SourceComputedContext,
    SourceEndpoint,
    SourceRepository,
    SourceSchemaInvalidationScope,
} from "@bernouy/cms-sources";
import type { ExecuteFunctionOptions, FunctionUserContext } from "../executeFunction";
import { memoizePromise } from "./promiseMemoization";

export function withFunctionExecutionScope(options: ExecuteFunctionOptions): ExecuteFunctionOptions {
    const sources = new ExecutionSourceRepository(options.sources);
    const scopedIdentities = scopeIdentities(options.identities, options.deps?.identities);
    return {
        ...options,
        sources,
        identities: scopedIdentities.functionResolver,
        deps: scopeExecutorDeps(options.deps, options.user, scopedIdentities.sourceService),
    };
}

function scopeExecutorDeps(
    deps: ExecutorDeps | undefined,
    user: FunctionUserContext | undefined,
    identities: IdentityService | undefined,
): ExecutorDeps {
    const scoped: ExecutorDeps = { ...deps };
    const originalResolveContext = deps?.resolveContext;
    const contextCache = new Map<string, Promise<SourceComputedContext>>();
    scoped.resolveContext = (request) =>
        memoizePromise(contextCache, "context", async () => ({
            ...(originalResolveContext ? await originalResolveContext(request) : {}),
            ...(user?.id ? { userID: user.id } : {}),
            ...(user?.role ? { userRole: user.role } : {}),
        }));

    if (deps?.resolveSecret) {
        const secretCache = new Map<string, Promise<string | undefined>>();
        scoped.resolveSecret = (ref) => memoizePromise(secretCache, ref, () => deps.resolveSecret!(ref));
    }
    if (identities) {
        scoped.identities = identities;
    }
    return scoped;
}

function scopeIdentities(
    resolver: IdentityResolver | undefined,
    service: IdentityService | undefined,
): { functionResolver: IdentityResolver | undefined; sourceService: IdentityService | undefined } {
    if (resolver && service && resolver === service) {
        const shared = new ExecutionIdentityService(service);
        return { functionResolver: shared, sourceService: shared };
    }
    const functionResolver = resolver ? new ExecutionIdentityResolver(resolver) : undefined;
    return {
        functionResolver,
        sourceService: service
            ? new ExecutionIdentityService(service, () => functionResolver?.clearResolutions())
            : undefined,
    };
}

class ExecutionSourceRepository implements SourceRepository {
    private readonly endpoints = new Map<string, Promise<SourceEndpoint | null>>();
    readonly getEndpointForAuthorization?: (urn: string) => Promise<SourceEndpoint | null>;

    constructor(private readonly inner: SourceRepository) {
        if (inner.getEndpointForAuthorization) {
            this.getEndpointForAuthorization = (urn) => inner.getEndpointForAuthorization!(urn);
        }
    }

    createSource(source: Source): Promise<Source> {
        return this.inner.createSource(source);
    }
    updateSource(source: Source): Promise<Source | null> {
        return this.inner.updateSource(source);
    }
    deleteSource(urn: string): Promise<boolean> {
        return this.inner.deleteSource(urn);
    }
    getSource(urn: string): Promise<Source | null> {
        return this.inner.getSource(urn);
    }
    getAllSources(): Promise<Source[]> {
        return this.inner.getAllSources();
    }

    getEndpoint(urn: string): Promise<SourceEndpoint | null> {
        return memoizePromise(this.endpoints, urn, () => this.inner.getEndpoint(urn));
    }

    invalidateSchema(scope?: SourceSchemaInvalidationScope): void {
        this.endpoints.clear();
        this.inner.invalidateSchema?.(scope);
    }
}

class ExecutionIdentityResolver implements IdentityResolver {
    protected readonly resolutions = new Map<string, Promise<IdentityValue | null>>();

    constructor(private readonly inner: IdentityResolver) {}

    resolve(alias: IdentityAlias, targetAuthority: string): Promise<IdentityValue | null> {
        return memoizePromise(this.resolutions, identityKey(alias, targetAuthority), () =>
            this.inner.resolve(alias, targetAuthority),
        );
    }

    clearResolutions(): void {
        this.resolutions.clear();
    }
}

class ExecutionIdentityService extends ExecutionIdentityResolver implements IdentityService {
    constructor(
        private readonly service: IdentityService,
        private readonly afterBind?: () => void,
    ) {
        super(service);
    }

    async bind(subjectId: IdentitySubjectId, alias: IdentityAlias): Promise<void> {
        await this.service.bind(subjectId, alias);
        this.clearResolutions();
        this.afterBind?.();
    }
}

function identityKey(alias: IdentityAlias, targetAuthority: string): string {
    return JSON.stringify([alias.authority, alias.kind, typeof alias.value, alias.value, targetAuthority]);
}
