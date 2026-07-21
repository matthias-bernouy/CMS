import type { IdentityResolver } from "@bernouy/cms-identities";
import type { FunctionRepository } from "@bernouy/cms-functions";
import type { ExecutorDeps, Source, SourceEndpoint, SourceRepository } from "@bernouy/cms-sources";

export type FunctionExecutionProbeEvent =
    | { kind: "endpoint-lookup"; urn: string }
    | { kind: "authorization-endpoint-lookup"; urn: string }
    | { kind: "function-lookup"; id: string }
    | { kind: "upstream-call"; method: string; url: string }
    | { kind: "secret-resolution"; ref: string }
    | { kind: "context-resolution" }
    | { kind: "identity-resolution"; sourceAuthority: string; targetAuthority: string };

export type FunctionExecutionBudget = {
    endpointLookups: number;
    authorizationEndpointLookups: number;
    functionLookups: number;
    upstreamCalls: number;
    secretResolutions: number;
    contextResolutions: number;
    identityResolutions: number;
    uniqueEndpointUrns: number;
    uniqueUpstreamTargets: number;
};

export class FunctionExecutionProbe {
    readonly events: FunctionExecutionProbeEvent[] = [];
    readonly sources: SourceRepository;

    constructor(sources: SourceRepository) {
        this.sources = new ProbedSourceRepository(sources, (event) => this.events.push(event));
    }

    mark(): number {
        return this.events.length;
    }

    budgetSince(mark = 0): FunctionExecutionBudget {
        const events = this.events.slice(mark);
        const endpointUrns = events
            .filter(
                (event): event is Extract<FunctionExecutionProbeEvent, { kind: "endpoint-lookup" }> =>
                    event.kind === "endpoint-lookup",
            )
            .map((event) => event.urn);
        const upstreamTargets = events
            .filter(
                (event): event is Extract<FunctionExecutionProbeEvent, { kind: "upstream-call" }> =>
                    event.kind === "upstream-call",
            )
            .map((event) => new URL(event.url).origin);
        return {
            endpointLookups: count(events, "endpoint-lookup"),
            authorizationEndpointLookups: count(events, "authorization-endpoint-lookup"),
            functionLookups: count(events, "function-lookup"),
            upstreamCalls: count(events, "upstream-call"),
            secretResolutions: count(events, "secret-resolution"),
            contextResolutions: count(events, "context-resolution"),
            identityResolutions: count(events, "identity-resolution"),
            uniqueEndpointUrns: new Set(endpointUrns).size,
            uniqueUpstreamTargets: new Set(upstreamTargets).size,
        };
    }

    deps(deps: ExecutorDeps): ExecutorDeps {
        return {
            ...deps,
            fetchImpl:
                deps.fetchImpl &&
                (async (input, init) => {
                    const request = new Request(input, init);
                    this.events.push({ kind: "upstream-call", method: request.method, url: request.url });
                    return deps.fetchImpl!(input, init);
                }),
            resolveSecret:
                deps.resolveSecret &&
                (async (ref) => {
                    this.events.push({ kind: "secret-resolution", ref });
                    return deps.resolveSecret!(ref);
                }),
            resolveContext:
                deps.resolveContext &&
                (async (request) => {
                    this.events.push({ kind: "context-resolution" });
                    return deps.resolveContext!(request);
                }),
        };
    }

    identities(identities: IdentityResolver): IdentityResolver {
        return {
            resolve: async (alias, targetAuthority) => {
                this.events.push({
                    kind: "identity-resolution",
                    sourceAuthority: alias.authority,
                    targetAuthority,
                });
                return identities.resolve(alias, targetAuthority);
            },
        };
    }

    functions(functions: FunctionRepository): FunctionRepository {
        return {
            createFunction: (fn) => functions.createFunction(fn),
            updateFunction: (fn) => functions.updateFunction(fn),
            deleteFunction: (id) => functions.deleteFunction(id),
            getAllFunctions: () => functions.getAllFunctions(),
            getFunction: (id) => {
                this.events.push({ kind: "function-lookup", id });
                return functions.getFunction(id);
            },
        };
    }
}

class ProbedSourceRepository implements SourceRepository {
    readonly getEndpointForAuthorization?: (urn: string) => Promise<SourceEndpoint | null>;

    constructor(
        private readonly inner: SourceRepository,
        private readonly record: (event: FunctionExecutionProbeEvent) => void,
    ) {
        if (inner.getEndpointForAuthorization) {
            this.getEndpointForAuthorization = (urn) => {
                this.record({ kind: "authorization-endpoint-lookup", urn });
                return inner.getEndpointForAuthorization!(urn);
            };
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
        this.record({ kind: "endpoint-lookup", urn });
        return this.inner.getEndpoint(urn);
    }
}

function count(events: FunctionExecutionProbeEvent[], kind: FunctionExecutionProbeEvent["kind"]): number {
    return events.filter((event) => event.kind === kind).length;
}
