import { describe, expect, test } from "bun:test";
import {
    InMemoryFunctionRepository,
    RequestScopedFunctionRepository,
    type CmsFunction,
    type FunctionRepository,
} from "@bernouy/cms-functions";

describe("request-scoped function repository", () => {
    test("shares concurrent reads and returns an isolated clone to every caller", async () => {
        const inner = new CountingFunctionRepository();
        await inner.createFunction(fn("v1"));
        const repository = new RequestScopedFunctionRepository(inner);

        const [first, second] = await Promise.all([
            repository.getFunction("workflow"),
            repository.getFunction("workflow"),
        ]);
        first!.meta!.name = "mutated";

        expect(inner.reads).toBe(1);
        expect(second).toEqual(fn("v1"));
        expect(await repository.getFunction("workflow")).toEqual(fn("v1"));
        expect(inner.reads).toBe(1);
    });

    test("evicts rejected reads so the same request can retry", async () => {
        const expected = fn("recovered");
        let reads = 0;
        const inner = repositoryStub(async () => {
            reads += 1;
            if (reads === 1) {
                throw new Error("temporary repository failure");
            }
            return expected;
        });
        const repository = new RequestScopedFunctionRepository(inner);

        await expect(repository.getFunction("workflow")).rejects.toThrow("temporary repository failure");
        expect(await repository.getFunction("workflow")).toEqual(expected);
        expect(reads).toBe(2);
    });

    test("invalidates a cached function after every write", async () => {
        const inner = new CountingFunctionRepository();
        await inner.createFunction(fn("v1"));
        const repository = new RequestScopedFunctionRepository(inner);
        expect(await repository.getFunction("workflow")).toEqual(fn("v1"));

        await repository.updateFunction(fn("v2"));
        expect(await repository.getFunction("workflow")).toEqual(fn("v2"));
        await repository.deleteFunction("workflow");
        expect(await repository.getFunction("workflow")).toBeNull();
        await repository.createFunction(fn("v3"));
        expect(await repository.getFunction("workflow")).toEqual(fn("v3"));

        expect(inner.reads).toBe(4);
    });
});

class CountingFunctionRepository extends InMemoryFunctionRepository {
    reads = 0;

    override getFunction(id: string): Promise<CmsFunction | null> {
        this.reads += 1;
        return super.getFunction(id);
    }
}

function repositoryStub(getFunction: FunctionRepository["getFunction"]): FunctionRepository {
    return {
        createFunction: async (value) => structuredClone(value),
        updateFunction: async (value) => structuredClone(value),
        deleteFunction: async () => false,
        getFunction,
        getAllFunctions: async () => [],
    };
}

function fn(version: string): CmsFunction {
    return {
        id: "workflow",
        method: "GET",
        meta: { name: version },
        steps: [],
        return: { body: { version } },
    };
}
