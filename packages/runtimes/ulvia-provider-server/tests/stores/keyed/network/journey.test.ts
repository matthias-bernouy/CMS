import { expect, test } from "bun:test";
import { message, runningEmailer } from "./fixture";

test("signed SMTP requests share durable receipts across concrete and parent routes", async () => {
    const f = await runningEmailer();
    try {
        const first = await fetch(f.request());
        expect(first.status).toBe(200);
        expect(await first.json()).toEqual({ sent: true });
        const replay = await fetch(f.request(message, { claims: { contractId: "ulvia/cms.emailer" } }));
        expect(replay.status).toBe(200);
        expect(await replay.json()).toEqual({ sent: true });
        expect(f.sent).toHaveLength(1);
        expect(f.counts).toEqual({ authenticate: 2, authorize: 2 });
        expect(f.receipt.calls).toEqual({ insert: 2, find: 1, update: 1, retained: 0 });
        expect(JSON.stringify([...f.receipt.documents.values()])).not.toContain("private-password");
    } finally {
        f.close();
    }
});

test("invalid, unauthenticated and cross-instance SMTP requests cannot claim a receipt or send", async () => {
    const f = await runningEmailer();
    try {
        for (const [request, expected] of [
            [f.request({ ...message, toEmail: "invalid" }), 400],
            [f.request(message, { key: null }), 400],
            [f.request(message, { authenticated: false }), 401],
            [f.request(message, { claims: { instanceId: "instance-b" } }), 401],
        ] as const) {
            expect((await fetch(request)).status).toBe(expected);
        }
        expect(f.receipt.documents.size).toBe(0);
        expect(f.sent).toHaveLength(0);
        expect((await fetch(f.request())).status).toBe(200);
        const before = JSON.stringify([...f.receipt.documents.values()]);
        expect(await fetch(f.request({ ...message, text: "Changed body" }))).toHaveProperty("status", 422);
        expect(await fetch(f.request(message, { claims: { subjectId: "admin-b" } }))).toHaveProperty("status", 422);
        f.deny();
        expect((await fetch(f.request())).status).toBe(403);
        expect(JSON.stringify([...f.receipt.documents.values()])).toBe(before);
        expect(f.sent).toHaveLength(1);
    } finally {
        f.close();
    }
});
