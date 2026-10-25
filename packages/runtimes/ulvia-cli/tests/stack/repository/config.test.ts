import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCli } from "../../../src/cli";
import { clientConfigDirectory } from "../../../src/runtime/repository/config";

test("Repository network configuration persists independently of client identities", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-repository-config-"));
    const options = { environment: { ULVIA_DATA_DIR: root }, log: () => undefined };
    const run = (args: string[]) => runCli(args, options);
    try {
        await run(["identity", "create", "official"]);
        await run([
            "repository",
            "configure",
            "--port",
            "15020",
            "--tls",
            "external",
            "--public-url",
            "https://repo.example",
        ]);
        const config = JSON.parse(await readFile(join(root, "repository-service/config.json"), "utf8"));
        expect(config.port).toBe(15020);
        expect(config.publicUrl).toBe("https://repo.example");
        expect(JSON.stringify(config)).not.toContain("PRIVATE KEY");
        await run(["identity", "create", "other"]);
        for (const args of [
            ["--port", "0"],
            ["--port", "2.5"],
            ["--tls", "wat"],
            ["--tls", "local", "--public-url", "https://repo.example"],
            ["--tls", "external", "--public-url", "http://repo.example"],
            ["--tls", "acme"],
            ["--tls", "acme", "--acme-email", "ops@example.com", "--public-url", "https://localhost"],
            ["--tls", "acme", "--acme-email", "ops@example.com", "--port", "443"],
        ]) {
            await expect(run(["repository", "configure", ...args])).rejects.toThrow();
        }
        expect(JSON.parse(await readFile(join(root, "repository-service/config.json"), "utf8"))).toEqual(config);
        await writeFile(
            join(root, "repository-service/service.json"),
            JSON.stringify({ schema: "ulvia.repository-service.v1", port: 5010 }),
        );
        await expect(run(["repository", "status"])).rejects.toThrow("Invalid standalone Repository state");
        await expect(run(["namespace", "keygen", "--key-file", "unused.pem"])).rejects.toThrow("Usage");
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
