import { afterEach, expect, test } from "bun:test";
import { harness } from "./harness";
let fixture: ReturnType<typeof harness>;
afterEach(() => fixture?.restore());
const values = { stripeSecretKey: "${STRIPE_KEY}", stripePublishableKey: "${STRIPE_PUBLIC_KEY}" };
async function saveAndApply() {
    const saved = await (
        await fixture.call("save-settings", { expectedRevision: fixture.row.saved_revision, values })
    ).json();
    const response = await fixture.call("apply-settings");
    expect(response.status).toBe(200);
    return { saved, applied: await response.json() };
}
async function confirm(generated: Record<string, string>) {
    Object.assign(fixture.generated, generated);
    expect((await fixture.call("confirm-apply", { savedRevision: fixture.row.saved_revision })).status).toBe(200);
}
function creations() {
    return fixture.requests.filter(
        ({ method, url }) =>
            method === "POST" &&
            ["/v1/webhook_endpoints", "/v2/core/event_destinations"].includes(new URL(url).pathname),
    );
}

test("key rotation on the same account reuses only endpoint-bound secrets and health is read-only", async () => {
    fixture = harness();
    const first = await saveAndApply();
    await confirm(first.applied.generatedSecrets);
    fixture.secrets.stripeSecretKey = "sk_test_rotated";
    const second = await saveAndApply();
    expect(second.applied.generatedSecrets).toEqual(first.applied.generatedSecrets);
    await confirm(second.applied.generatedSecrets);
    expect(creations()).toHaveLength(3);
    expect(JSON.stringify(fixture.row)).not.toContain("whsec_");
    expect(JSON.stringify(fixture.row)).not.toContain("sk_test_");
    const before = fixture.requests.length;
    expect((await (await fixture.call("health")).json()).status).toBe("ready");
    expect(fixture.requests.slice(before).every(({ method }) => method === "GET")).toBe(true);
});

test("switching Stripe accounts creates fresh secrets and cannot confirm with the previous account secrets", async () => {
    fixture = harness();
    const first = await saveAndApply();
    await confirm(first.applied.generatedSecrets);
    fixture.provider.accountId = "acct_second";
    fixture.secrets.stripeSecretKey = "sk_test_second_account";
    const second = await saveAndApply();
    expect(second.applied.generatedSecrets).not.toEqual(first.applied.generatedSecrets);
    expect((await fixture.call("confirm-apply", { savedRevision: second.saved.savedRevision })).status).toBe(409);
    expect((await (await fixture.call("health")).json()).status).toBe("blocked");
    await confirm(second.applied.generatedSecrets);
    expect((await (await fixture.call("health")).json()).status).toBe("ready");
    expect(fixture.endpoints).toHaveLength(6);
    expect(fixture.requests.some(({ method }) => method === "DELETE")).toBe(false);
});

test("partial signing-secret persistence blocks retry without duplicate creation and permits restoring matching outputs", async () => {
    fixture = harness();
    const { saved, applied } = await saveAndApply();
    const [first] = Object.entries(applied.generatedSecrets) as Array<[string, string]>;
    fixture.generated[first![0]] = first![1];
    for (const name of Object.keys(applied.generatedSecrets).slice(1)) {
        fixture.generated[name] = "whsec_stale_from_another_endpoint";
    }
    expect((await fixture.call("confirm-apply", { savedRevision: saved.savedRevision })).status).toBe(409);
    const health = await (await fixture.call("health")).json();
    expect(health.status).toBe("blocked");
    expect(health.checks.some((check: any) => check.code === "signing_secret_binding_unverified")).toBe(true);
    expect((await fixture.call("apply-settings")).status).toBe(502);
    expect(fixture.row.applied_revision).toBeNull();
    expect(creations()).toHaveLength(3);
    expect(fixture.endpoints).toHaveLength(3);
    Object.assign(fixture.generated, applied.generatedSecrets);
    const retry = await (await fixture.call("apply-settings")).json();
    expect(retry.generatedSecrets).toEqual(applied.generatedSecrets);
    await confirm(retry.generatedSecrets);
    expect((await (await fixture.call("health")).json()).status).toBe("ready");
});

test.each(["changed-endpoint", "unbound-legacy"])(
    "%s signing secrets never pass readiness or reconciliation",
    async (scenario) => {
        fixture = harness();
        const { applied } = await saveAndApply();
        await confirm(applied.generatedSecrets);
        if (scenario === "changed-endpoint") {
            fixture.endpoints[0]!.id = "we_replaced_outside_cms";
        } else {
            fixture.row.resources = [];
        }
        const before = fixture.requests.length;
        expect((await (await fixture.call("health")).json()).status).toBe("blocked");
        expect((await fixture.call("apply-settings")).status).toBe(502);
        expect(
            fixture.requests
                .slice(before)
                .filter(({ url }) => url.includes("api.stripe.com"))
                .every(({ method }) => method === "GET"),
        ).toBe(true);
        expect(creations()).toHaveLength(3);
    },
);
