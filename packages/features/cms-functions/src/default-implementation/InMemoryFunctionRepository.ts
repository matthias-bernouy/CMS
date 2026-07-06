import { DuplicateFunctionError } from "../core/errors";
import type { CmsFunction } from "../interfaces/FunctionDefinition";
import type { FunctionRepository } from "../interfaces/FunctionRepository";

export class InMemoryFunctionRepository implements FunctionRepository {
    private readonly functions = new Map<string, CmsFunction>();

    async createFunction(fn: CmsFunction): Promise<CmsFunction> {
        if (this.functions.has(fn.id)) throw new DuplicateFunctionError(fn.id);
        this.functions.set(fn.id, structuredClone(fn));
        return structuredClone(fn);
    }

    async updateFunction(fn: CmsFunction): Promise<CmsFunction | null> {
        if (!this.functions.has(fn.id)) return null;
        this.functions.set(fn.id, structuredClone(fn));
        return structuredClone(fn);
    }

    async deleteFunction(id: string): Promise<boolean> {
        return this.functions.delete(id);
    }

    async getFunction(id: string): Promise<CmsFunction | null> {
        const found = this.functions.get(id);
        return found ? structuredClone(found) : null;
    }

    async getAllFunctions(): Promise<CmsFunction[]> {
        return Array.from(this.functions.values(), fn => structuredClone(fn));
    }
}
