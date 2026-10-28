import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadOrCreateLocalInstanceConfig, validHostname } from "../../src/runtime/instanceConfig";
import { saveLocalInstanceConnection } from "../../src/runtime/instanceConnection";
import {
    assertLocalInstanceName,
    ensureLocalInstancePaths,
    ensureUlviaPaths,
    resolveLocalInstancePaths,
    resolveUlviaPaths,
} from "../../src/runtime/paths";
import { defaultInstallationConfig } from "../../src/runtime/stack/installation";
import { releaseInstanceDomain, reserveInstanceDomain } from "../../src/runtime/stack/domains";
import { instancePublicUrl, localInstanceHostname } from "../../src/runtime/stack/ports";
import { localEdgeEnvironment } from "../../src/runtime/stack/orchestration/environment";
import type { OfficialImageComponent } from "../../src/runtime/stack/orchestration/images";
import {
    loadLocalEdgeState,
    localEdgeProjectName,
    saveLocalEdgeState,
    saveLocalServicesState,
} from "../../src/runtime/stack/orchestration/state";

test("named instances keep independent identities, credentials, state, and hostnames", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-multi-instance-state-"));
    const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: root });
    await ensureUlviaPaths(paths);
    try {
        const services = await saveLocalServicesState(paths, defaultInstallationConfig(), {
            provider: image("provider"),
            repository: image("repository"),
        });
        const defaultInstance = resolveLocalInstancePaths(paths, "default");
        const previewInstance = resolveLocalInstancePaths(paths, "preview");
        await Promise.all([ensureLocalInstancePaths(defaultInstance), ensureLocalInstancePaths(previewInstance)]);
        const defaultConfig = await loadOrCreateLocalInstanceConfig(defaultInstance.root, {
            name: "default",
            label: "Default instance",
            hostname: localInstanceHostname("default"),
        });
        const previewConfig = await loadOrCreateLocalInstanceConfig(previewInstance.root, {
            name: "preview",
            label: "Preview instance",
            hostname: localInstanceHostname("preview"),
        });
        const connection = await saveLocalInstanceConnection(previewInstance.root, {
            instanceId: "instance:00000000-0000-4000-8000-000000000001",
            token: "a".repeat(43),
        });
        const projectName = localEdgeProjectName(paths, "preview");
        const edgeImage = image("edge");
        await saveLocalEdgeState(previewInstance, projectName, previewConfig.hostname, edgeImage);

        expect(defaultConfig.adminPassword).not.toBe(previewConfig.adminPassword);
        expect(instancePublicUrl(defaultConfig.hostname, services.installation)).toBe("http://localhost:5100");
        expect(instancePublicUrl(previewConfig.hostname, services.installation)).toBe("http://preview.localhost:5100");
        expect(localEdgeProjectName(paths, "default")).not.toBe(projectName);
        expect((await loadLocalEdgeState(previewInstance))?.projectName).toBe(projectName);

        const environment = localEdgeEnvironment(
            previewInstance,
            previewConfig,
            connection,
            services,
            edgeImage,
            projectName,
        );
        expect(environment.CMS_INSTALLATIONS_PROVIDER_TOKEN).toBe("a".repeat(43));
        expect(environment.ULVIA_EDGE_NETWORK_ALIAS).toBe(`${projectName}-edge`);
        expect(environment.ULVIA_INSTANCE_HOSTNAME).toBe("preview.localhost");
        expect(environment.ULVIA_MONGO_PASSWORD).toBeUndefined();
        expect(environment.ULVIA_PROVIDER_OPERATOR_TOKEN).toBeUndefined();
        expect(environment.ULVIA_REPOSITORY_TOKEN).toBeUndefined();
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

function image(component: OfficialImageComponent) {
    const version = "1.2.3";
    const digest = `sha256:${"a".repeat(64)}`;
    return { component, version, digest } as const;
}

test("instance names are safe for hostnames, paths, and Compose project names", () => {
    for (const name of ["default", "preview", "client-42"]) {
        expect(() => assertLocalInstanceName(name)).not.toThrow();
    }
    for (const name of ["", "Preview", "../preview", "preview.localhost", "preview_1"]) {
        expect(() => assertLocalInstanceName(name)).toThrow();
    }
});

test("instance domains accept DNS hostnames but reject URLs, paths, and wildcard authority", () => {
    for (const hostname of ["localhost", "preview.localhost", "example.com", "cms.eu.example.com"]) {
        expect(validHostname(hostname)).toBe(true);
    }
    for (const hostname of ["Example.com", "https://example.com", "example.com/path", "*.example.com", "127.0.0.1"]) {
        expect(validHostname(hostname)).toBe(false);
    }
});

test("concurrent instance configuration creation converges on one identity and secret", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-concurrent-instance-config-"));
    try {
        const input = { name: "preview", label: "Preview instance", hostname: "preview.localhost" } as const;
        const [first, second] = await Promise.all([
            loadOrCreateLocalInstanceConfig(root, input),
            loadOrCreateLocalInstanceConfig(root, input),
        ]);

        expect(first).toEqual(second);
        expect(first.adminPassword.length).toBeGreaterThanOrEqual(24);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("domain reservations reject concurrent ownership and become reusable after deletion", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-domain-reservation-"));
    const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: root });
    await ensureUlviaPaths(paths);
    try {
        expect(await reserveInstanceDomain(paths, "site", "example.com")).toBe(true);
        await expect(reserveInstanceDomain(paths, "other", "example.com")).rejects.toThrow(/already used by site/);
        expect(await reserveInstanceDomain(paths, "site", "example.com")).toBe(false);
        await releaseInstanceDomain(paths, "site", "example.com");
        expect(await reserveInstanceDomain(paths, "other", "example.com")).toBe(true);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
