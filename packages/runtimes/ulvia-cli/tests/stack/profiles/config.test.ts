import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCli } from "../../../src/cli";
import { clientConfigDirectory } from "../../../src/runtime/repository/config";

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
