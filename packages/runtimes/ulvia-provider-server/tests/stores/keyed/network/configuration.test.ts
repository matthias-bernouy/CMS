import { expect, test } from "bun:test";
import { configuration, message, runningEmailer } from "./fixture";

const update = { claims: { capabilityId: "smtp.configuration.update" } };
const read = { claims: { capabilityId: "smtp.configuration.get" } };
const KEY = "SMTP_EMAILER_CONFIGURATION";

test("generated SMTP release configures namespaced secrets and delivers through the inherited capability", async () => {
    const f = await runningEmailer(false);
    try {
        const reportResponse = await fetch(f.reportRequest());
        expect(reportResponse.status).toBe(200);
        const report = await reportResponse.json();
        expect(report.manifest).toEqual({ version: f.manifest.manifest.version, digest: f.manifest.digest });
        expect(report.implementations).toEqual(
            f.releases.map(({ contractId, version, digest }) => ({ contractId, version, digest, status: "ready" })),
        );
        const updated = await fetch(f.request(configuration, update));
        expect(updated.status).toBe(200);
        const output = await updated.json();
        expect(output).toMatchObject({ smtp: { passwordConfigured: true } });
        expect(JSON.stringify(output)).not.toContain(configuration.smtp.password);
        const stored = await f.stores.smtpEmailer.get(KEY);
        expect(stored).toContain(configuration.smtp.password);
        expect(await f.stores.files.get(KEY)).toBeNull();
        expect(await f.stores.installations.get(KEY)).toBeNull();
        expect(await f.stores.repository.get(KEY)).toBeNull();
        const current = await fetch(f.request({}, read));
        expect(current.status).toBe(200);
        expect(await current.json()).toEqual(output);
        expect((await fetch(f.request(message, { claims: { contractId: "ulvia/cms.emailer" } }))).status).toBe(200);
        expect((await fetch(f.request())).status).toBe(200);
        expect(f.sent).toHaveLength(1);
        expect(f.receipt.calls).toEqual({ insert: 2, find: 1, update: 1, retained: 0 });
    } finally {
        f.close();
    }
});

test("invalid, unauthorized and cross-instance configuration cannot mutate SMTP secrets", async () => {
    const f = await runningEmailer();
    try {
        const before = await f.stores.smtpEmailer.get(KEY);
        for (const [request, status] of [
            [f.request({ ...configuration, smtp: { ...configuration.smtp, port: "invalid" } }, update), 400],
            [f.request({ ...configuration, fromEmail: "invalid" }, update), 422],
            [f.request(configuration, { ...update, authenticated: false }), 401],
            [f.request(configuration, { claims: { ...update.claims, actorKind: "user" } }), 403],
            [f.request(configuration, { claims: { ...update.claims, instanceId: "instance-b" } }), 401],
        ] as const) {
            const response = await fetch(request);
            expect(response.status).toBe(status);
            expect(await response.text()).not.toContain(configuration.smtp.password);
            expect(await f.stores.smtpEmailer.get(KEY)).toBe(before);
        }
        f.deny();
        expect((await fetch(f.request({ ...configuration, fromName: "Changed" }, update))).status).toBe(403);
        expect(await f.stores.smtpEmailer.get(KEY)).toBe(before);
        expect(f.sent).toHaveLength(0);
        expect(f.receipt.documents.size).toBe(0);
    } finally {
        f.close();
    }
});
