import { expect, test } from "bun:test";
import { collectMcpContracts } from "@bernouy/cms-gateway/mcp";
import type { AdmittedContractRelease } from "@bernouy/ulvia-contracts";
import { fixture } from "./fixture";

async function catalogue() {
    const { original } = await fixture(1);
    return (id: string, parent?: string): AdmittedContractRelease => ({
        ...original,
        release: {
            ...original.release,
            contractId: id,
            ...(parent ? { extends: { contractId: parent, version: "1.0.0", digest: original.digest } } : {}),
        },
    });
}

test("parallel catalogue reads preserve serial root, duplicate, parent and cycle order", async () => {
    const make = await catalogue();
    const values = new Map([
        ["a", make("a", "p")],
        ["b", make("b", "q")],
        ["p", make("p", "a")],
        ["q", make("q", "p")],
    ]);
    let active = 0;
    let peak = 0;
    const reads: string[] = [];
    const resolve = async (id: string) => {
        active++;
        peak = Math.max(peak, active);
        reads.push(id);
        await Bun.sleep(id === "a" ? 4 : 1);
        active--;
        return values.get(id)!;
    };
    const roots = ["a", "a", "b", "b"];
    const parallel = await collectMcpContracts(roots, resolve);
    expect(peak).toBe(2);
    expect(active).toBe(0);
    expect(reads).toEqual(["a", "b", "p", "q"]);
    const serial = await collectMcpContracts(roots, async (id) => values.get(id)!, 1);
    expect(parallel).toEqual(serial);
    expect(parallel.map(({ release }) => release.contractId)).toEqual(["a", "b", "p", "q"]);
});

test("started reads drain and the first input failure wins, including synchronous throws", async () => {
    let finished = false;
    const first = new Error("first");
    await expect(
        collectMcpContracts(["a", "b", "c"], (id) => {
            if (id === "a") {
                throw first;
            }
            expect(id).toBe("b");
            return Bun.sleep(5).then(() => {
                finished = true;
                throw new Error("second");
            });
        }),
    ).rejects.toBe(first);
    expect(finished).toBe(true);
});

test("the original 256-contract ceiling and duplicate-at-ceiling refusal remain exact", async () => {
    const make = await catalogue();
    const ids = Array.from({ length: 256 }, (_, index) => `c${index}`);
    for (const concurrency of [1, 2]) {
        let count = 0;
        const resolve = async (id: string) => {
            count++;
            return make(id);
        };
        expect(await collectMcpContracts(ids, resolve, concurrency)).toHaveLength(256);
        expect(count).toBe(256);
        count = 0;
        await expect(collectMcpContracts([...ids, ids[0]!], resolve, concurrency)).rejects.toThrow("too large");
        expect(count).toBe(256);
    }
    await expect(collectMcpContracts([], async () => make("a"), 3)).rejects.toThrow("concurrency");
});
