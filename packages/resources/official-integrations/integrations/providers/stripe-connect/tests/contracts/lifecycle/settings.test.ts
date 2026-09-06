import { afterEach, expect, test } from "bun:test";
import { harness } from "./harness";
let fixture: ReturnType<typeof harness>;
afterEach(() => fixture?.restore());
const values = { stripeSecretKey: "${STRIPE_KEY}", stripePublishableKey: "${STRIPE_PUBLIC_KEY}" };

test("installs unconfigured and diagnostics remain available without Stripe credentials", async () => {
    fixture = harness();
    fixture.secrets.stripeSecretKey = "";
    fixture.secrets.stripePublishableKey = "";
    const result = await (await fixture.call("health")).json();
    expect(result.schemaVersion).toBe(1);
    expect(result.status).toBe("needs_configuration");
    expect(fixture.requests.every((request) => !request.url.includes("api.stripe.com"))).toBe(true);
    expect(await (await fixture.call("read-settings")).json()).toMatchObject({
        savedRevision: null,
        appliedRevision: null,
    });
});

test("saves only secret references, applies owned webhooks, and confirms after runtime sync", async () => {
    fixture = harness();
    expect(
        (
            await fixture.call("save-settings", {
                expectedRevision: null,
                values: { ...values, stripeSecretKey: "sk_test_raw" },
            })
        ).status,
    ).toBe(422);
    const saved = await (await fixture.call("save-settings", { expectedRevision: null, values })).json();
    expect(saved.savedRevision).toBeString();
    expect(saved.appliedRevision).toBeNull();
    expect(JSON.stringify(fixture.row)).not.toContain("sk_test_private");
    const applied = await (await fixture.call("apply-settings")).json();
    expect(applied.operation).toBe("pending_sync");
    expect(applied.appliedRevision).toBeNull();
    expect(fixture.endpoints).toHaveLength(3);
    expect((await fixture.call("save-settings", { expectedRevision: saved.savedRevision, values })).status).toBe(409);
    Object.assign(fixture.generated, applied.generatedSecrets);
    const confirmed = await (await fixture.call("confirm-apply", { savedRevision: saved.savedRevision })).json();
    expect(confirmed.appliedRevision).toBe(saved.savedRevision);
    expect((await (await fixture.call("health")).json()).status).toBe("ready");
    fixture.endpoints[0]!.status = "disabled";
    const drift = await (await fixture.call("health")).json();
    expect(drift.status).toBe("degraded");
    expect(drift.checks.some((check: any) => check.code === "webhook_configuration_drift")).toBe(true);
    await fixture.call("apply-settings");
    expect(fixture.endpoints).toHaveLength(3);
    expect(fixture.endpoints[0]!.status).toBe("enabled");
    expect(JSON.stringify(fixture.row)).not.toContain("whsec_");
});

test("rejects stale settings and confirmation revisions", async () => {
    fixture = harness();
    await fixture.call("save-settings", { expectedRevision: null, values });
    expect((await fixture.call("save-settings", { expectedRevision: null, values })).status).toBe(409);
    expect((await fixture.call("confirm-apply", { savedRevision: "stale" })).status).toBe(409);
});

test("local simulation cannot send real credentials to Stripe", async () => {
    fixture = harness();
    fixture.env.ULVIA_LOCAL_PROVIDER_SIMULATION = "v1";
    await fixture.call("save-settings", { expectedRevision: null, values });
    expect((await fixture.call("apply-settings")).status).toBe(502);
    expect(fixture.requests.every((request) => !request.url.includes("api.stripe.com"))).toBe(true);
});
