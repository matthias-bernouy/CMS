import { expect, test } from "bun:test";
import { assertOwnedNamespaceCleanup } from "./ownership";

test("namespace teardown cannot address production containers, foreign instances or non-fixture namespaces", () => {
    const stack = {
        id: "ulvia-mcp-aabbccdd",
        providerName: "ulvia-mcp-aabbccdd-provider",
        instanceId: "instance:00000000-0000-4000-8000-000000000000",
    };
    const credentials = { namespaceId: "namespace-a", namespaceKey: "k".repeat(64) };
    expect(() => assertOwnedNamespaceCleanup(stack, credentials, "performance-owned")).not.toThrow();
    expect(() =>
        assertOwnedNamespaceCleanup(
            { ...stack, providerName: "production-provider" },
            credentials,
            "performance-owned",
        ),
    ).toThrow();
    expect(() =>
        assertOwnedNamespaceCleanup({ ...stack, instanceId: "foreign" }, credentials, "performance-owned"),
    ).toThrow();
    expect(() => assertOwnedNamespaceCleanup(stack, credentials, "SMTP configuration")).toThrow();
    expect(() =>
        assertOwnedNamespaceCleanup(stack, { ...credentials, namespaceKey: "short" }, "performance-owned"),
    ).toThrow();
});
