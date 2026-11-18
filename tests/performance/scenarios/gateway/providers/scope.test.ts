import { expect, test } from "bun:test";
import { settingsCredentialKey } from "./scope";
import { readProviderCredential } from "../../../../integration/instance/providers/credentials";

test("Gateway Provider control credentials are limited to the owned tenant on the exact disposable ingress", () => {
    const stack = { id: "ulvia-mcp-abcd1234", providerName: "ulvia-mcp-abcd1234-provider" };
    const site = { url: "http://perf-settings-3.localhost:32123", instanceId: `instance:${crypto.randomUUID()}` };
    const ingress = "http://primary.localhost:32123";
    expect(settingsCredentialKey(stack, site, ingress)).toBe("ulvia-mcp-abcd1234-perf-settings-3");
    for (const url of [
        "https://ulvia.fr",
        "http://other.localhost:32123",
        "http://perf-settings-3.localhost:32124",
        `${site.url}/path`,
        "https://perf-settings-3.localhost:32123",
    ]) {
        expect(() => settingsCredentialKey(stack, { ...site, url }, ingress)).toThrow();
    }
    expect(() => settingsCredentialKey({ ...stack, providerName: "production" }, site, ingress)).toThrow();
    expect(() => settingsCredentialKey(stack, { ...site, instanceId: "missing" }, ingress)).toThrow();
    expect(() => settingsCredentialKey(stack, { ...site, instanceId: crypto.randomUUID() }, ingress)).toThrow();
});

test("private credential reads refuse production containers and foreign idempotency keys before invoking Docker", async () => {
    await expect(readProviderCredential("production-provider", "production")).rejects.toThrow("owned disposable stack");
    await expect(readProviderCredential("ulvia-mcp-abcd1234-provider", "ulvia-mcp-deadbeef")).rejects.toThrow(
        "owned disposable stack",
    );
});
