import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCli } from "../../../src/cli";
import { clientConfigDirectory } from "../../../src/runtime/repository/config";
import {
    loadLocalInstanceConfig,
    loadOrCreateLocalInstanceConfig,
    saveLocalInstanceProfile,
} from "../../../src/runtime/instances/config";

test("an exact application profile persists without replacing instance identity or credentials", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-profile-config-"));
    const input = {
        name: "registry",
        label: "Registry",
        hostname: "registry.localhost",
        profile: { id: "ulvia.repository", version: "1.0.0" },
    };
    try {
        const initial = await loadOrCreateLocalInstanceConfig(root, input);
        expect(await loadOrCreateLocalInstanceConfig(root, input)).toEqual(initial);
        await expect(
            loadOrCreateLocalInstanceConfig(root, {
                ...input,
                profile: { id: "ulvia.official", version: "1.3.0" },
            }),
        ).rejects.toThrow("conflicts");
        await saveLocalInstanceProfile(root, { id: "ulvia.repository", version: "1.1.0" });
        const updated = await loadLocalInstanceConfig(root);
        expect(updated).toEqual({ ...initial, profile: { id: "ulvia.repository", version: "1.1.0" } });
        expect((await stat(join(root, "runtime.json"))).mode & 0o777).toBe(0o600);
        const bytes = await readFile(join(root, "runtime.json"), "utf8");
        await expect(saveLocalInstanceProfile(root, { id: "ulvia.repository", version: "latest" })).rejects.toThrow();
        expect(await readFile(join(root, "runtime.json"), "utf8")).toBe(bytes);
        await writeFile(
            join(root, "runtime.json"),
            JSON.stringify({ ...initial, schema: "ulvia.local-instance-runtime.v1" }),
        );
        await expect(loadLocalInstanceConfig(root)).rejects.toThrow("configuration is invalid");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("removed Repository deployments and signing commands have no forwarding aliases", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-removed-commands-"));
    try {
        const options = { environment: { ULVIA_DATA_DIR: root }, log: () => undefined };
        for (const action of ["configure", "start", "stop", "status", "upgrade"]) {
            await expect(runCli(["repository", action], options)).rejects.toThrow("Usage");
        }
        await expect(runCli(["upgrade", "repository", "--version", "1.0.0"], options)).rejects.toThrow("Usage");
        await expect(runCli(["identity", "create", "official"], options)).rejects.toThrow("Unknown command");
        await expect(runCli(["namespace", "keygen"], options)).rejects.toThrow("Usage");
        expect(await Bun.file(join(root, "repository-service/config.json")).exists()).toBe(false);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("client configuration respects XDG, home and explicit isolation", () => {
    expect(clientConfigDirectory({}, "/home/example")).toBe("/home/example/.config/ulvia");
    expect(clientConfigDirectory({ XDG_CONFIG_HOME: "/config" })).toBe("/config/ulvia");
    expect(clientConfigDirectory({ ULVIA_DATA_DIR: "/data" })).toBe("/data/config");
    expect(clientConfigDirectory({ ULVIA_CONFIG_DIR: "/private/client", ULVIA_DATA_DIR: "/data" })).toBe(
        "/private/client",
    );
    expect(() => clientConfigDirectory({ ULVIA_CONFIG_DIR: "relative" })).toThrow("absolute");
});
