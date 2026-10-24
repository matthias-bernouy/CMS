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
    const environment = localServicesEnvironment(paths, defaultInstallationConfig(), localServicesIdentity(paths));
    expect(environment.ULVIA_MONGO_DIR).toBe(paths.mongo);
    expect(environment.ULVIA_FILES_DIR).toBe(paths.cmsFiles);
    expect(environment.ULVIA_REPOSITORY_DIR).toBe(paths.repository);
    expect(environment.ULVIA_HTTP_PORT).toBe("5100");
    expect(environment.ULVIA_BIND_ADDRESS).toBe("127.0.0.1");
    expect(environment.ULVIA_INSTANCE_NETWORK).toContain("ulvia-instances-");
});
