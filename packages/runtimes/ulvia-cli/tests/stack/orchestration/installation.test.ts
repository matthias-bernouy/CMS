import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureUlviaPaths, resolveUlviaPaths } from "../../../src/runtime/paths";
import {
    defaultInstallationConfig,
    loadOrCreateInstallationConfig,
    loadInstallationConfig,
    parseInstallationConfig,
    saveInstallationConfig,
} from "../../../src/runtime/stack/installation";
import { instancePublicUrl } from "../../../src/runtime/stack/ports";

test("installation configuration defaults to loopback HTTP and persists explicit ACME exposure", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-installation-"));
    const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: root });
    await ensureUlviaPaths(paths);
    try {
        expect(defaultInstallationConfig()).toEqual({
            schema: "ulvia.installation.v1",
            bindAddress: "127.0.0.1",
            ports: { http: 5100, repository: 5102, provider: 5103 },
            tls: { mode: "disabled" },
        });
        const publicConfig = parseInstallationConfig({
            ...defaultInstallationConfig(),
            bindAddress: "0.0.0.0",
            ports: { http: 80, repository: 5102, provider: 5103 },
            tls: { mode: "acme", email: "ops@example.com", httpsPort: 443 },
        });
        await saveInstallationConfig(paths, publicConfig);
        expect(await loadInstallationConfig(paths)).toEqual(publicConfig);
        expect(instancePublicUrl("www.example.com", publicConfig)).toBe("https://www.example.com");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("first configuration preserves ports from an already installed alpha stack", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-installation-upgrade-"));
    const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: root });
    await ensureUlviaPaths(paths);
    try {
        await writeFile(
            join(paths.services, "stack.json"),
            JSON.stringify({
                schema: "ulvia.local-services-stack.v1",
                ports: { http: 5200, repository: 5202, provider: 5203 },
            }),
        );
        expect((await loadOrCreateInstallationConfig(paths)).ports).toEqual({
            http: 5200,
            repository: 5202,
            provider: 5203,
        });
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("installation configuration rejects ambiguous exposure", () => {
    expect(() =>
        parseInstallationConfig({
            ...defaultInstallationConfig(),
            bindAddress: "example.com",
        }),
    ).toThrow(/configuration is invalid/);
    expect(() =>
        parseInstallationConfig({
            ...defaultInstallationConfig(),
            ports: { http: 5100, repository: 5100, provider: 5103 },
        }),
    ).toThrow(/ports must be distinct/);
});
