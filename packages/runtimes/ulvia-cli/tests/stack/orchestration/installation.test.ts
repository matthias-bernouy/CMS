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
            ports: { http: 5100, repository: 5102, provider: 5103 },
            repository: { url: "https://repo.ulvia.fr", allowInsecureHttp: false },
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
        expect((await loadOrCreateInstallationConfig(paths)).ports).toEqual({
            http: 5100,
            repository: 5102,
            provider: 5103,
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

test("ACME challenge roots stay readable by Nginx workers across CLI invocations", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-acme-permissions-"));
    const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: root });
    try {
        await ensureUlviaPaths(paths);
        await chmod(paths.proxy.challenge, 0o700);
        await chmod(paths.proxy.certificates, 0o755);
        await ensureUlviaPaths(paths);
        expect((await stat(paths.proxy.challenge)).mode & 0o777).toBe(0o755);
        for (const path of [
            paths.data,
            paths.services,
            paths.mongo,
            paths.cmsFiles,
            paths.serviceLogs,
            paths.instances,
            paths.proxy.certificates,
            paths.proxy.virtualHosts,
            paths.proxy.acme,
        ]) {
            expect((await stat(path)).mode & 0o777).toBe(0o700);
        }
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("an explicit local Repository is persisted independently of later environment defaults", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-repository-connection-"));
    const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: root });
    await ensureUlviaPaths(paths);
    try {
        const installation = await loadOrCreateInstallationConfig(paths, {
            CMS_REPOSITORY_URL: "http://repository:3000",
            CMS_REPOSITORY_ALLOW_INSECURE_HTTP: "true",
        });
        expect(installation.repository).toEqual({ url: "http://repository:3000", allowInsecureHttp: true });
        expect((await loadOrCreateInstallationConfig(paths)).repository).toEqual(installation.repository);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("Repository connections reject implicit HTTP and credentials in URLs", () => {
    for (const url of [
        "http://repository:3000",
        "https://user:password@repo.example",
        "https://repo.example/?token=x",
    ]) {
        expect(() => defaultInstallationConfig({ CMS_REPOSITORY_URL: url })).toThrow();
    }
    expect(() => defaultInstallationConfig({ CMS_REPOSITORY_ALLOW_INSECURE_HTTP: "yes" })).toThrow();
});
