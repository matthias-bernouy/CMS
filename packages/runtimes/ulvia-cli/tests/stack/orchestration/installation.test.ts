import { expect, test } from "bun:test";
import { chmod, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
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
            ports: { http: 5100, provider: 5103 },
            tls: { mode: "disabled" },
            hosting: {
                controlOrigin: "http://control.localhost:5100",
                edgeCount: 1,
                managedSuffixes: [],
                publicAddresses: [],
            },
        });
        const publicConfig = parseInstallationConfig({
            ...defaultInstallationConfig(),
            bindAddress: "0.0.0.0",
            ports: { http: 80, provider: 5103 },
            tls: { mode: "acme", email: "ops@example.com", httpsPort: 443 },
            hosting: { ...defaultInstallationConfig().hosting, controlOrigin: "https://control.example" },
        });
        await saveInstallationConfig(paths, publicConfig);
        expect(await loadInstallationConfig(paths)).toEqual(publicConfig);
        expect(instancePublicUrl("www.example.com", publicConfig)).toBe("https://www.example.com");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("fresh configuration does not import historical stack ports", async () => {
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
        await expect(loadOrCreateInstallationConfig(paths)).rejects.toThrow(
            "missing from existing infrastructure state",
        );
        expect(await Bun.file(join(paths.services, "installation.json")).exists()).toBe(false);
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
            ports: { http: 5100, provider: 5100 },
        }),
    ).toThrow(/ports must be distinct/);
});

test("Caddy certificate storage stays private across CLI invocations", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-acme-permissions-"));
    const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: root });
    try {
        await ensureUlviaPaths(paths);
        await chmod(paths.proxy.certificates, 0o755);
        await ensureUlviaPaths(paths);
        for (const path of [paths.data, paths.services, paths.mongo, paths.cmsFiles, paths.proxy.certificates]) {
            expect((await stat(path)).mode & 0o777).toBe(0o700);
        }
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("service configuration no longer owns a Repository connection", async () => {
    expect(defaultInstallationConfig()).not.toHaveProperty("repository");
    expect(defaultInstallationConfig({ CMS_REPOSITORY_URL: "http://obsolete.invalid" })).toEqual(
        defaultInstallationConfig(),
    );
    expect(() =>
        parseInstallationConfig({
            ...defaultInstallationConfig(),
            repository: { url: "https://old.example", allowInsecureHttp: false },
        }),
    ).toThrow("configuration is invalid");
});
