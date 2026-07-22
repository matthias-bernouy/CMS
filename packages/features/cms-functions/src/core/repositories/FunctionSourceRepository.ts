import type { Source, SourceEndpoint, SourceRepository } from "@bernouy/cms-sources";
import { makeEndpointUrn } from "@bernouy/cms-sources";
import type { FunctionRepository } from "cms-functions/interfaces/FunctionRepository";
import {
    functionAsEndpoint,
    functionsAsSource,
    SYSTEM_FUNCTIONS_SOURCE_ID,
    SYSTEM_FUNCTIONS_SOURCE_URN,
} from "cms-functions/core/repositories/projection";

export class FunctionSourceRepository implements SourceRepository {
    constructor(private readonly functions: FunctionRepository) {}

    async createSource(_source: Source): Promise<Source> {
        throw new Error("system function sources are readonly");
    }

    async updateSource(_source: Source): Promise<Source | null> {
        throw new Error("system function sources are readonly");
    }

    async deleteSource(_urn: string): Promise<boolean> {
        throw new Error("system function sources are readonly");
    }

    async getSource(urn: string): Promise<Source | null> {
        if (urn !== SYSTEM_FUNCTIONS_SOURCE_URN) {
            return null;
        }
        return functionsAsSource(await this.functions.getAllFunctions());
    }

    async getAllSources(): Promise<Source[]> {
        return [functionsAsSource(await this.functions.getAllFunctions())];
    }

    async getEndpoint(urn: string): Promise<SourceEndpoint | null> {
        const suffix = `urn:${SYSTEM_FUNCTIONS_SOURCE_ID}:`;
        if (!urn.startsWith(suffix)) {
            return null;
        }
        const id = urn.slice(suffix.length);
        const fn = await this.functions.getFunction(id);
        return fn ? functionAsEndpoint(fn) : null;
    }
}

export function functionEndpointUrn(functionId: string): string {
    return makeEndpointUrn(SYSTEM_FUNCTIONS_SOURCE_ID, functionId);
}
