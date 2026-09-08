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
    expect(await (await fixture.call("read-connection")).json()).toMatchObject({
        savedRevision: null,
        appliedRevision: null,
    });
});

test("saves only secret references and applies owned webhooks synchronously", async () => {
    fixture = harness();
    expect(
        (
            await fixture.call("save-connection", {
                expectedRevision: null,
                values: { ...values, stripeSecretKey: "sk_test_raw" },
            })
        ).status,
    ).toBe(422);
    const saved = await (await fixture.call("save-connection", { expectedRevision: null, values })).json();
    expect(saved.savedRevision).toBeString();
    expect(saved.appliedRevision).toBe(saved.savedRevision);
    expect(JSON.stringify(fixture.row)).not.toContain("sk_test_private");
    expect(fixture.endpoints).toHaveLength(3);
    expect((await fixture.call("save-connection", { expectedRevision: null, values })).status).toBe(409);
    Object.assign(fixture.generated, saved.generatedSecrets);
    expect((await (await fixture.call("health")).json()).status).toBe("ready");
    fixture.endpoints[0]!.status = "disabled";
    const drift = await (await fixture.call("health")).json();
    expect(drift.status).toBe("degraded");
    expect(drift.checks.some((check: any) => check.code === "webhook_configuration_drift")).toBe(true);
    const retried = await (
        await fixture.call("retry-connection", { expectedRevision: fixture.row.saved_revision })
    ).json();
    Object.assign(fixture.generated, retried.generatedSecrets);
    expect(fixture.endpoints).toHaveLength(3);
    expect(fixture.endpoints[0]!.status).toBe("enabled");
    expect(JSON.stringify(fixture.row)).not.toContain("whsec_");
});

test("rejects stale save and retry revisions", async () => {
    fixture = harness();
    await fixture.call("save-connection", { expectedRevision: null, values });
    expect((await fixture.call("save-connection", { expectedRevision: null, values })).status).toBe(409);
    expect((await fixture.call("retry-connection", { expectedRevision: "stale" })).status).toBe(409);
});

test("local simulation cannot send real credentials to Stripe", async () => {
    fixture = harness();
    fixture.env.ULVIA_LOCAL_PROVIDER_SIMULATION = "v1";
    expect((await fixture.call("save-connection", { expectedRevision: null, values })).status).toBe(502);
    expect(fixture.requests.every((request) => !request.url.includes("api.stripe.com"))).toBe(true);
});
