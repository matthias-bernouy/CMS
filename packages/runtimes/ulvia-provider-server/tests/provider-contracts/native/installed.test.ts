import { expect, test } from "bun:test";
import { readInstalledExecution } from "../../../src/runtime/instances/profiles/execution/installed";
import { ProviderExecutionSupport } from "../../../src/runtime/instances/profiles/execution/support";
import { installedFixture } from "./installedFixture";

test("a newer build reopens persisted execution without its former recipe or any collection resources", async () => {
    const f = await installedFixture();
    const execution = await f.read();
    expect(execution.report.buildVersion).toBe("1.1.0");
    expect(execution.report.implementations[0]!.version).toBe("1.0.0");
    expect(execution.contracts[0]!.digest).toBe(f.model.release.admission.digest);
    expect(execution.profile.contracts).toEqual([
        { contractId: "ulvia/cms.installations", version: "1.0.0", digest: f.model.release.admission.digest },
    ]);
    expect(f.model.reads).toEqual([
        "installations:default",
        "manifest:ulvia/primary-provider@1.0.0",
        "contract:ulvia/cms.installations@1.0.0",
        "selections:default",
    ]);
    expect(Object.isFrozen(execution.report)).toBe(true);
    expect(Object.isFrozen(f.model.installed)).toBe(false);
});

test("persisted availability and SemVer never grant untested implementation support", async () => {
    const f = await installedFixture();
    const unsupported = new ProviderExecutionSupport({
        providerId: f.support.providerId,
        buildVersion: "1.1.0",
        releases: [{ ...f.support.releases[0]!, digest: `sha256:${"0".repeat(64)}` }],
    });
    await expect(
        readInstalledExecution(f.instance, f.stores, unsupported, f.model.installed.installation.endpoint),
    ).rejects.toThrow("does not support");
    expect(f.model.reads).toHaveLength(2);
});

test("another instance cannot reopen a local Provider account", async () => {
    const f = await installedFixture();
    await expect(
        readInstalledExecution(
            { ...f.instance, id: "instance:other" },
            f.stores,
            f.support,
            f.model.installed.installation.endpoint,
        ),
    ).rejects.toThrow("unavailable or ambiguous");
    expect(f.model.reads).toEqual(["installations:default"]);
});

test("missing artifacts, mismatched observations and incomplete selections refuse without changing state", async () => {
    for (const kind of ["artifact", "manifest", "account", "audience", "selection"] as const) {
        const f = await installedFixture();
        if (kind === "artifact") {
            f.model.release = null as never;
        }
        if (kind === "manifest") {
            f.model.installed.installation.approval.manifestDigest = `sha256:${"0".repeat(64)}`;
        }
        if (kind === "account") {
            f.model.installed.observation!.report.account.id = "instance:other";
        }
        if (kind === "audience") {
            f.model.installed.observation!.report.instanceId = "instance:other";
        }
        if (kind === "selection") {
            f.model.selected = [];
        }
        const before = JSON.stringify({ ...f.model, reads: [] });
        await expect(f.read()).rejects.toThrow();
        expect(JSON.stringify({ ...f.model, reads: [] })).toBe(before);
    }
});

test("loading retained execution never restores a revoked installation's authority", async () => {
    const f = await installedFixture();
    f.model.installed.installation.status = "revoked";
    await f.read();
    expect(f.model.installed.installation.status).toBe("revoked");
});
