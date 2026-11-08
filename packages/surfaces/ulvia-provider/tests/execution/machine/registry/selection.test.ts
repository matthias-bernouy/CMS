import { expect, test } from "bun:test";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { registerOfficialFeatures, loadOfficialFeatures } from "@bernouy/ulvia-provider/capabilities";
import { RepositoryCapabilityError } from "@bernouy/repository/repository/capabilities";
import { repositoryTransport } from "./transport";
import { repositoryServices } from "./services";

test("Repository mounting requires its exact pin and services while unselected profiles require neither", async () => {
    const build = await loadOfficialFeatures();
    const pin = build.implementations.find(({ contractId }) => contractId === "ulvia/repository")!;
    const options = { providerId: "ulvia/primary-provider", scope: { siteId: "default", instanceId: "instance-a" } };
    let reads = 0;
    const services = {
        get repository(): never {
            reads++;
            throw new Error("No service projection before admission");
        },
    };
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    await expect(
        registerOfficialFeatures(dispatcher, services, [{ ...pin, digest: `sha256:${"0".repeat(64)}` }], options),
    ).rejects.toThrow();
    expect(reads).toBe(0);
    await expect(registerOfficialFeatures(dispatcher, {}, [pin], options)).rejects.toThrow("injected domain services");
    await registerOfficialFeatures(dispatcher, {}, []);
    dispatcher.seal([]);
});

test("Repository public error classification preserves declared refusals and conceals technical details", async () => {
    for (const [error, status, code] of [
        [new RepositoryCapabilityError("NOT_FOUND"), 404, "NOT_FOUND"],
        [new RepositoryCapabilityError("REJECTED"), 409, "REJECTED"],
        [new Error("private-path-or-token"), 503, "CORE_UNAVAILABLE"],
    ] as const) {
        const call = await repositoryTransport(
            repositoryServices({
                reads: {
                    info: async () => {
                        throw error;
                    },
                },
            }),
        );
        const response = await call("repository-info", {});
        expect(response.status).toBe(status);
        const text = await response.text();
        expect(text).toContain(code);
        expect(text).not.toContain("private-path-or-token");
    }
});
