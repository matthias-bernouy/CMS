import { expect, test } from "bun:test";
import { mkdtemp, rm, readFile, chmod } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { profileCliFixture } from "../profiles/fixture";
import { defaultInstallationConfig, parseInstallationConfig } from "../../../src/runtime/stack/installation";
import { captureProviderMount } from "../../../src/runtime/stack/captures/mount";

test("capture connection is optional and malformed explicit settings never gain defaults", () => {
    expect(parseInstallationConfig(defaultInstallationConfig())).not.toHaveProperty("capture");
    for (const capture of [
        undefined,
        {},
        { socketDirectory: "/run/ulvia-capture" },
        { socketDirectory: "/", groupId: 1000 },
        { socketDirectory: "relative", groupId: 1000 },
        { socketDirectory: "/run/ulvia-capture", groupId: 0 },
    ]) {
        expect(() => parseInstallationConfig({ ...defaultInstallationConfig(), capture })).toThrow(
            "Capture connection",
        );
    }
});

test("socket mount refuses a world-accessible directory or another shared group", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ulvia-capture-mount-"));
    try {
        const groupId = process.getgid!();
        await expect(captureProviderMount({ socketDirectory: directory, groupId: groupId + 1 })).rejects.toThrow(
            "shared group",
        );
        await chmod(directory, 0o777);
        await expect(captureProviderMount({ socketDirectory: directory, groupId })).rejects.toThrow("private");
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("capture configuration applies a private read-only socket mount and preserves frozen startup", async () => {
    const f = await profileCliFixture();
    const directory = await mkdtemp(join(tmpdir(), "ulvia-stack-capture-"));
    try {
        const group = String(process.getgid!());
        const configured = await f.run([
            "configure",
            "--capture-socket-directory",
            directory,
            "--capture-group",
            group,
        ]);
        expect(configured.exitCode).toBe(0);
        expect((await f.run(["apply", "--version", "0.1.0"])).exitCode).toBe(0);
        const statePath = join(f.root, "data/services/stack.json");
        const state = await readFile(statePath, "utf8");
        const applied = JSON.parse(state).applied;
        const generated = join(f.root, "data/services/deployments", applied.id, "shared-edges.json");
        const model = JSON.parse(await readFile(generated, "utf8"));
        expect(model.services.provider).toMatchObject({
            environment: { ULVIA_CAPTURE_SOCKET: "/run/ulvia-capture/worker.sock" },
            group_add: [group],
            volumes: [
                {
                    type: "bind",
                    source: directory,
                    target: "/run/ulvia-capture",
                    read_only: true,
                    bind: { create_host_path: false },
                },
            ],
        });
        expect(model.services.provider.security_opt).toBeUndefined();
        expect(Object.keys(model.services).some((key) => key.includes("capture"))).toBeFalse();
        expect((await f.run(["configure", "--capture-socket-directory", "disabled"])).exitCode).toBe(0);
        expect((await f.run(["start"])).exitCode).toBe(0);
        expect(await readFile(statePath, "utf8")).toBe(state);
        const saved = await readFile(join(f.root, "data/services/installation.json"), "utf8");
        const refused = await f.run(["configure", "--capture-group", "bad"]);
        expect(refused.exitCode).not.toBe(0);
        expect(await readFile(join(f.root, "data/services/installation.json"), "utf8")).toBe(saved);
        expect((await f.run(["apply"])).exitCode).toBe(0);
        const next = JSON.parse(await readFile(statePath, "utf8")).applied;
        const disabled = JSON.parse(
            await readFile(join(f.root, "data/services/deployments", next.id, "shared-edges.json"), "utf8"),
        );
        expect(disabled.services.provider).toBeUndefined();
    } finally {
        await f.close();
        await rm(directory, { recursive: true, force: true });
    }
});
