import { expect, test } from "bun:test";
import { SystemBootstrap } from "../../../../src/runtime/instances/system/execution/SystemBootstrap";
import { bundledBootstrapSources } from "../../../../src/runtime/instances/system/bootstrap";

test("system bootstrap loads one immutable SDK snapshot and never reads optional collections", async () => {
    let collectionReads = 0;
    const unavailable = async (): Promise<never> => {
        collectionReads++;
        throw new Error("No collections");
    };
    const sources = bundledBootstrapSources();
    const bootstrap = new SystemBootstrap({
        ...sources,
        collections: { id: "absent", list: unavailable, get: unavailable, getMetadata: unavailable },
    });
    const base = await bootstrap.current();
    const same = await bootstrap.current();
    expect(base.contracts.some(({ contractId }) => contractId === "ulvia/repository")).toBe(false);
    expect(base.manifest).toBe(same.manifest);
    expect(await bootstrap.contracts(base)).toHaveLength(base.contracts.length);
    expect(collectionReads).toBe(0);
    await expect(
        bootstrap.contracts({ ...base, manifest: { ...base.manifest, digest: `sha256:${"f".repeat(64)}` } }),
    ).rejects.toThrow("does not retain");
}, 30_000);
