import { expect, test } from "bun:test";
import { installationsFeature } from "@bernouy/repository/features/installations";
import { executeCapability } from "@bernouy/ulvia-sdk/local";
import { context, services } from "./fixture";
const input = {
    installationId: "provider:one",
    contractId: "example/forms",
    version: "1.0.0",
    digest: `sha256:${"a".repeat(64)}`,
};

test("generic contract selection requires a verified user before accessing management", async () => {
    await expect(
        executeCapability(installationsFeature, "select-contract", { input, context, services: services() }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
test("generic contract selection forwards exact input and preserves its domain result", async () => {
    const calls: unknown[] = [];
    const selected = [{ siteId: "site-a", ...input }];
    const ports = services({
        management: {
            selectContract: async (value: unknown) => {
                calls.push(value);
                return { revision: 4, selected };
            },
        },
    });
    const result = await executeCapability(installationsFeature, "select-contract", {
        input,
        context: { ...context, subjectId: "admin" },
        services: ports,
    });
    expect(result).toEqual({ revision: 4, selected });
    expect(calls).toEqual([input]);
    await expect(
        executeCapability(installationsFeature, "select-contract", {
            input: { ...input, injected: true },
            context: { ...context, subjectId: "admin" },
            services: ports,
        }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(1);
});
