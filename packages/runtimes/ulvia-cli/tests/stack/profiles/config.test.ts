import { expect, test } from "bun:test";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCli } from "../../../src/cli";
import { clientConfigDirectory } from "../../../src/runtime/repository/config";
import { loadLocalInstanceConfig, loadOrCreateLocalInstanceConfig } from "../../../src/runtime/instances/config";

test("instance credentials and identity persist independently from Repository setup", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-instance-config-"));
    const input = { name: "registry", label: "Registry", hostname: "registry.localhost" };
    try {
        const initial = await loadOrCreateLocalInstanceConfig(root, input);
        expect(await loadOrCreateLocalInstanceConfig(root, input)).toEqual(initial);
        expect(initial).not.toHaveProperty("profile");
        await expect(loadOrCreateLocalInstanceConfig(root, { ...input, hostname: "other.localhost" })).rejects.toThrow(
            "conflicts",
        );
        expect((await stat(join(root, "runtime.json"))).mode & 0o777).toBe(0o600);
        await writeFile(
            join(root, "runtime.json"),
            JSON.stringify({ ...initial, profile: { id: "repository", version: "1.0.0" } }),
        );
        expect(await loadLocalInstanceConfig(root)).toEqual(initial);
        await writeFile(
            join(root, "runtime.json"),
            JSON.stringify({ ...initial, schema: "ulvia.local-instance-runtime.v2" }),
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
