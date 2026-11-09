import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadOrCreateLocalServicesConfig, loadOrCreateProviderOperatorToken } from "../../../src/runtime/config";

test("obsolete service credentials are rejected without a migration", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-service-credentials-"));
    try {
        await writeFile(
            join(root, "runtime.json"),
            JSON.stringify({
                schema: "ulvia.local-services.v1",
                sessionSecret: "s".repeat(48),
                kekHex: "0".repeat(64),
                mongoUsername: "ulvia",
                mongoPassword: "a".repeat(43),
            }),
        );
        const before = await readFile(join(root, "runtime.json"), "utf8");
        await expect(loadOrCreateLocalServicesConfig(root)).rejects.toThrow("configuration is invalid");
        expect(await readFile(join(root, "runtime.json"), "utf8")).toBe(before);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("service keys and protected administrator survive restarts without regenerating removed credentials", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-control-credentials-"));
    const administrator = join(root, "credentials/control-administrator.json");
    const operator = join(root, "provider-operator-token");
    try {
        const initial = await loadOrCreateLocalServicesConfig(root);
        const bootstrap = JSON.parse(await readFile(administrator, "utf8"));
        expect(bootstrap.email).toBe("admin@ulvia.local");
        expect(bootstrap.password.length).toBe(43);
        expect(initial.edgeRoutingSecret.length).toBe(43);
        expect((await stat(administrator)).mode & 0o777).toBe(0o600);
        expect((await stat(join(root, "credentials"))).mode & 0o777).toBe(0o700);
        expect(await loadOrCreateLocalServicesConfig(root)).toEqual(initial);
        await rm(administrator);
        expect(await loadOrCreateLocalServicesConfig(root)).toEqual(initial);
        expect(await Bun.file(administrator).exists()).toBe(false);
        await rm(operator);
        await expect(loadOrCreateProviderOperatorToken(root)).rejects.toThrow("operator recovery is required");
        expect(await Bun.file(operator).exists()).toBe(false);
        expect(await loadOrCreateLocalServicesConfig(root)).toEqual(initial);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("missing keys in persisted launch intent cannot be treated as a fresh installation", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-orphaned-launch-"));
    try {
        await writeFile(join(root, "stack.json"), '{"launch":"existing"}');
        await expect(loadOrCreateLocalServicesConfig(root)).rejects.toThrow("operator recovery is required");
        expect(await Bun.file(join(root, "runtime.json")).exists()).toBe(false);
        expect(await Bun.file(join(root, "provider-operator-token")).exists()).toBe(false);
        expect(await Bun.file(join(root, "credentials/control-administrator.json")).exists()).toBe(false);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("shared-hosting credentials are mandatory and invalid state is not repaired", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-incompatible-credentials-"));
    try {
        const value = await loadOrCreateLocalServicesConfig(root);
        const { edgeRoutingSecret: _secret, ...incompatible } = value;
        const source = JSON.stringify(incompatible);
        await writeFile(join(root, "runtime.json"), source);
        await expect(loadOrCreateLocalServicesConfig(root)).rejects.toThrow("configuration is invalid");
        expect(await readFile(join(root, "runtime.json"), "utf8")).toBe(source);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
