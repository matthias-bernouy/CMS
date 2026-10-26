import { expect, test } from "bun:test";
import { resolveUlviaPaths } from "../../../src/runtime/paths";
import { defaultInstallationConfig } from "../../../src/runtime/stack/installation";
import { parseComposeServices } from "../../../src/runtime/stack/orchestration/compose";
import { localServicesEnvironment } from "../../../src/runtime/stack/orchestration/environment";
import { localServicesIdentity } from "../../../src/runtime/stack/orchestration/state";

test("Compose status accepts the array and line-delimited Docker formats", () => {
    const service = { Service: "kernel", State: "running", Health: "healthy" };
    expect(parseComposeServices(JSON.stringify([service]))).toEqual([
        { service: "kernel", state: "running", health: "healthy" },
    ]);
    expect(
        parseComposeServices(`${JSON.stringify(service)}\n${JSON.stringify({ ...service, Service: "provider" })}`),
    ).toEqual([
        { service: "kernel", state: "running", health: "healthy" },
        { service: "provider", state: "running", health: "healthy" },
    ]);
});

test("Compose receives explicit user-owned storage and loopback port configuration", () => {
    const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: "/tmp/ulvia-stack-fixture" });
    const digest = `sha256:${"a".repeat(64)}`;
    const identity = {
        ...localServicesIdentity(paths),
        images: {
            provider: {
                component: "provider" as const,
                version: "1.2.3",
                digest,
            },
            repository: {
                component: "repository" as const,
                version: "1.2.3",
                digest,
            },
        },
    };
    const environment = localServicesEnvironment(paths, defaultInstallationConfig(), identity);
    expect(environment.CMS_REPOSITORY_URL).toBe("https://repo.ulvia.fr");
    expect(environment.CMS_REPOSITORY_ALLOW_INSECURE_HTTP).toBe("false");
    expect(environment.ULVIA_MONGO_DIR).toBe(paths.mongo);
    expect(environment.ULVIA_FILES_DIR).toBe(paths.cmsFiles);
    expect(environment.ULVIA_REPOSITORY_DIR).toBe(paths.repository);
    expect(environment.ULVIA_HTTP_PORT).toBe("5100");
    expect(environment.ULVIA_BIND_ADDRESS).toBe("127.0.0.1");
    expect(environment.ULVIA_INSTANCE_NETWORK).toContain("ulvia-instances-");
    expect(environment.PROVIDER_IMAGE).toContain("@sha256:");
});
