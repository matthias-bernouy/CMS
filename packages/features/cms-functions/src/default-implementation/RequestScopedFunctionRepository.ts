import { memoizePromise } from "../core/execution/promiseMemoization";
import type { CmsFunction } from "../interfaces/FunctionDefinition";
import type { FunctionRepository } from "../interfaces/FunctionRepository";

/**
 * Shares function reads inside one request. Callers must create a new instance
 * for every request so function updates remain visible without a global TTL.
 */
export class RequestScopedFunctionRepository implements FunctionRepository {
    private readonly functions = new Map<string, Promise<CmsFunction | null>>();

    constructor(private readonly inner: FunctionRepository) {}

    async createFunction(fn: CmsFunction): Promise<CmsFunction> {
        try {
            return structuredClone(await this.inner.createFunction(fn));
        } finally {
            this.functions.delete(fn.id);
        }
    }

    async updateFunction(fn: CmsFunction): Promise<CmsFunction | null> {
        try {
            return cloneFunction(await this.inner.updateFunction(fn));
        } finally {
            this.functions.delete(fn.id);
        }
    }

    async deleteFunction(id: string): Promise<boolean> {
        try {
            return await this.inner.deleteFunction(id);
        } finally {
            this.functions.delete(id);
        }
    }

    async getFunction(id: string): Promise<CmsFunction | null> {
        const found = await memoizePromise(this.functions, id, async () =>
            cloneFunction(await this.inner.getFunction(id)),
        );
        return cloneFunction(found);
    }

    async getAllFunctions(): Promise<CmsFunction[]> {
        return structuredClone(await this.inner.getAllFunctions());
    }
}

function cloneFunction(fn: CmsFunction | null): CmsFunction | null {
    return fn ? structuredClone(fn) : null;
}
