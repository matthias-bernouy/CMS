import { expect, test } from "bun:test";
import { SystemBootstrap } from "../../../../src/runtime/instances/system/execution/SystemBootstrap";
import { bundledBootstrapSources } from "../../../../src/runtime/instances/system/bootstrap";

test("system bootstrap loads one immutable Provider-only SDK snapshot", async () => {
    const sources = bundledBootstrapSources();
    expect(Object.keys(sources)).toEqual(["providers"]);
    const bootstrap = new SystemBootstrap(sources);
    const base = await bootstrap.current();
    const same = await bootstrap.current();
    expect(base.contracts.some(({ contractId }) => contractId === "ulvia/repository")).toBe(false);
    expect(base.contracts.some(({ contractId }) => contractId === "ulvia/cms.hosting")).toBe(false);
    const control = await bootstrap.control();
    expect(control.contracts.some(({ contractId }) => contractId === "ulvia/cms.hosting")).toBe(true);
    expect(control.contracts.some(({ contractId }) => contractId === "ulvia/repository")).toBe(false);
    expect(control.manifest.digest).toBe(base.manifest.digest);
    expect(base.manifest).toBe(same.manifest);
    expect(await bootstrap.contracts(base)).toHaveLength(base.contracts.length);
    await expect(
        bootstrap.contracts({ ...base, manifest: { ...base.manifest, digest: `sha256:${"f".repeat(64)}` } }),
    ).rejects.toThrow("does not retain");
}, 30_000);
