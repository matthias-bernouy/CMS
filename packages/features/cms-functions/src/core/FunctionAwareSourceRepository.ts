import { systemSourceUrnOf, type Source, type SourceEndpoint, type SourceRepository } from "@bernouy/cms-sources";
import type { FunctionRepository } from "../interfaces/FunctionRepository";
import { FunctionSourceRepository } from "./FunctionSourceRepository";
import { SYSTEM_FUNCTIONS_SOURCE_URN } from "./projection";

export class FunctionAwareSourceRepository implements SourceRepository {
    private readonly functionSources: FunctionSourceRepository;
    readonly getEndpointForAuthorization?: (urn: string) => Promise<SourceEndpoint | null>;

    constructor(
        private readonly inner: SourceRepository,
        functions: FunctionRepository,
    ) {
        this.functionSources = new FunctionSourceRepository(functions);
        if (inner.getEndpointForAuthorization) {
            this.getEndpointForAuthorization = async (urn: string) => {
                if (systemSourceUrnOf(urn) === SYSTEM_FUNCTIONS_SOURCE_URN) {
                    return this.functionSources.getEndpoint(urn);
                }
                return inner.getEndpointForAuthorization!(urn);
            };
        }
    }

    async createSource(source: Source): Promise<Source> {
        return this.inner.createSource(source);
    }

    async updateSource(source: Source): Promise<Source | null> {
        return this.inner.updateSource(source);
    }

    async deleteSource(urn: string): Promise<boolean> {
        return this.inner.deleteSource(urn);
    }

    async getSource(urn: string): Promise<Source | null> {
        if (urn === SYSTEM_FUNCTIONS_SOURCE_URN) return this.functionSources.getSource(urn);
        return this.inner.getSource(urn);
    }

    async getAllSources(): Promise<Source[]> {
        return [
            ...(await this.functionSources.getAllSources()),
            ...(await this.inner.getAllSources()).filter(source => source.urn !== SYSTEM_FUNCTIONS_SOURCE_URN),
        ];
    }

    async getEndpoint(urn: string): Promise<SourceEndpoint | null> {
        if (systemSourceUrnOf(urn) === SYSTEM_FUNCTIONS_SOURCE_URN) return this.functionSources.getEndpoint(urn);
        return this.inner.getEndpoint(urn);
    }
}

export function withFunctionsSource(sources: SourceRepository, functions: FunctionRepository): SourceRepository {
    return new FunctionAwareSourceRepository(sources, functions);
}
