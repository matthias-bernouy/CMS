import { expect, test } from "bun:test";
import {
    signupLocalUser,
    confirmEmailVerification,
    confirmPasswordReset,
    requestPasswordReset,
} from "auth/application/core/public-flows/flows";
import { createLocalUser } from "@bernouy/auth/management";
import { withAccountEventCausation } from "@bernouy/auth";
import { accountFixture } from "./fixture";

test("new memberships emit once across signup retries, external providers and administrator creation", async () => {
    const f = accountFixture();
    const result = await signupLocalUser(f.cfg, f.signup);
    await signupLocalUser(f.cfg, f.signup);
    await f.users.upsert({ sub: result.cmsUserId!, provider: "local", email: f.signup.email });
    await f.users.upsert({ sub: "external:member", provider: "external", email: "outside@example.test" });
    await f.users.upsert({ sub: "external:member", provider: "external" });
    await createLocalUser(f, { email: "admin@example.test", password: f.signup.password, emailVerified: true });
    const records = await f.records();
    expect(records).toHaveLength(3);
    expect(records.every(({ intent }) => intent.type === "account.created")).toBe(true);
    expect(records.map(({ intent }) => JSON.parse(intent.payloadJson).provider).sort()).toEqual([
        "external",
        "local",
        "local",
    ]);
    expect(JSON.stringify(records)).not.toContain("@example.test");
});
test("only the first real email ownership proof emits, and security delivery remains unchanged", async () => {
    const f = accountFixture();
    await signupLocalUser(f.cfg, f.signup);
    await confirmEmailVerification(f.cfg, { token: f.captured[0]!.token });
    const first = (await f.records()).find(({ intent }) => intent.type === "account.email-verified")!.intent;
    expect(JSON.parse(first.payloadJson)).toMatchObject({ method: "email-link" });
    await requestPasswordReset(f.cfg, { email: f.signup.email });
    await confirmPasswordReset(f.cfg, { token: f.captured[1]!.token, password: "Changed-strong-password-123!" });
    expect(
        (await f.records())
            .filter(({ intent }) => intent.type === "account.email-verified")
            .map(({ intent }) => intent),
    ).toEqual([first]);
    expect(f.emailer.sent).toHaveLength(2);
    for (const input of f.captured) {
        expect(JSON.stringify(await f.records())).not.toContain(input.token);
    }
    expect(JSON.stringify(await f.records())).not.toContain(f.signup.password);
    expect(JSON.stringify(await f.records())).not.toContain(f.signup.email);
});
test("implicit delivery-disabled verification emits no ownership proof; a later password-reset proof does", async () => {
    const f = accountFixture();
    f.cfg.emailer = {
        isEnabled: async () => false,
        send: async () => {
            throw new Error("disabled");
        },
    };
    await signupLocalUser(f.cfg, f.signup);
    expect((await f.credentials.getByEmail(f.signup.email))!.emailVerifiedAt).not.toBeNull();
    expect((await f.records()).map(({ intent }) => intent.type)).toEqual(["account.created"]);
    f.cfg.emailer = f.emailer;
    await requestPasswordReset(f.cfg, { email: f.signup.email });
    await confirmPasswordReset(f.cfg, { token: f.captured[0]!.token, password: "Changed-strong-password-123!" });
    expect((await f.records()).filter(({ intent }) => intent.type === "account.email-verified")).toHaveLength(1);
    expect(
        JSON.parse(
            (await f.records()).find(({ intent }) => intent.type === "account.email-verified")!.intent.payloadJson,
        ).method,
    ).toBe("password-reset");
});
test("invalid and expired tokens leave verification and its journal unchanged", async () => {
    const f = accountFixture();
    await signupLocalUser(f.cfg, f.signup);
    const credential = await f.credentials.getByEmail(f.signup.email);
    const expired = await f.cfg.tokens.create({
        purpose: "email_verification",
        sub: credential!.sub,
        expiresAt: new Date(Date.now() - 1000),
    });
    const before = await f.records();
    for (const token of ["invalid-token", expired.token]) {
        await expect(confirmEmailVerification(f.cfg, { token })).rejects.toThrow();
    }
    expect((await f.credentials.getByEmail(f.signup.email))!.emailVerifiedAt).toBeNull();
    expect(await f.records()).toEqual(before);
});
test("concurrent confirmations produce one intent and concurrent async scopes do not exchange causal chains", async () => {
    const f = accountFixture();
    const [left, right] = ["a".repeat(64), "b".repeat(64)];
    await Promise.all([
        withAccountEventCausation([left], () => signupLocalUser(f.cfg, f.signup)),
        withAccountEventCausation([right], () => signupLocalUser(f.cfg, { ...f.signup, email: "other@example.test" })),
    ]);
    const records = await f.records();
    expect(records.map(({ intent }) => intent.causation[0]).sort()).toEqual([left, right]);
    const token = f.captured[0]!.token;
    const results = await Promise.allSettled(
        Array.from({ length: 8 }, () =>
            withAccountEventCausation([left], () => confirmEmailVerification(f.cfg, { token })),
        ),
    );
    expect(results.some(({ status }) => status === "fulfilled")).toBe(true);
    expect((await f.records()).filter(({ intent }) => intent.type === "account.email-verified")).toHaveLength(1);
    expect(
        (await f.records()).find(({ intent }) => intent.type === "account.email-verified")!.intent.causation,
    ).toEqual([left]);
});
test("retained implementations do not acquire new publication behavior", async () => {
    const f = accountFixture(false);
    await signupLocalUser(f.cfg, f.signup);
    await confirmEmailVerification(f.cfg, { token: f.captured[0]!.token });
    expect(await f.records()).toEqual([]);
});

test("a retained proof without reference cannot replace an already recorded current proof", async () => {
    let enabled = true;
    const f = accountFixture(() => enabled);
    await signupLocalUser(f.cfg, f.signup);
    await confirmEmailVerification(f.cfg, { token: f.captured[0]!.token });
    const before = await f.records();
    const credential = (await f.credentials.getByEmail(f.signup.email))!;
    const member = await f.users.getBySub(`local:${credential.sub}`);
    enabled = false;
    await f.credentials.markEmailVerified(credential.sub, {
        method: "password-reset",
        accountCreatedAt: member!.createdAt.toISOString(),
    });
    enabled = true;
    await f.credentials.markEmailVerified(credential.sub, {
        method: "password-reset",
        accountCreatedAt: member!.createdAt.toISOString(),
        accountRef: f.outbox.reference(member!.sub, member!.createdAt.toISOString()),
    });
    expect(await f.records()).toEqual(before);
});
