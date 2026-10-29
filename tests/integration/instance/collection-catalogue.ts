import { expect } from "bun:test";

type Catalogue = {
    revision: number;
    releases: { collectionId: string; digest: string; action: string; browserRiskDigest: string }[];
    installed: { collectionId: string; digest: string }[];
};
type Call = (contract: string, capability: string) => Promise<Catalogue>;

/** Records real authenticated timings without machine-specific latency assertions. */
export async function exerciseCollectionCatalogue(call: Call, digest: string, installed: boolean) {
    const durations: number[] = [];
    let previous: Catalogue | undefined;
    for (let index = 0; index < 2; index++) {
        const started = performance.now();
        const result = await call("ulvia.cms.installations", "list-available-collections");
        durations.push(performance.now() - started);
        const release = result.releases.find((item) => item.collectionId === "mcp-kit");
        expect(release?.digest).toBe(digest);
        expect(release?.action).toBe(installed ? "current" : "install");
        expect(release?.browserRiskDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);
        expect(result.installed.some((item) => item.digest === digest)).toBe(installed);
        if (previous) {
            expect(result).toEqual(previous);
        }
        previous = result;
    }
    console.log(
        `Authenticated collection catalogue (${installed ? "installed" : "available"}): ${durations.map((duration) => duration.toFixed(1)).join(", ")} ms`,
    );
}

type RepositoryCallArguments = [contract: string, capability: string, input?: Record<string, unknown>];

export function observeRepositoryCall<Output>(call: (...args: RepositoryCallArguments) => Promise<Output>) {
    return async (...args: RepositoryCallArguments): Promise<Output> => {
        const started = performance.now();
        try {
            return await call(...args);
        } finally {
            console.log(`Repository journey ${args[0]}:${args[1]}: ${(performance.now() - started).toFixed(1)} ms`);
        }
    };
}
