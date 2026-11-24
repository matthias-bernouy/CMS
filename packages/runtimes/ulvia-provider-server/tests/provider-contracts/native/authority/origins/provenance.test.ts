import { expect, test } from "bun:test";
import { originFixture, context, definition } from "./fixture";
const user = { ...context, subjectId: "verified-native-alias", actorKind: "user" as const };
test("original verified users survive restart, recapture and cross-Provider alias resolution without credentials", async () => {
    const f = originFixture();
    const proof = await f.api.capture(user, definition, "submission-1");
    expect(proof).not.toContain("private-cms-subject");
    const captured = await f.api.verify(definition.owner, definition, "submission-1", proof);
    expect(captured.initiator.kind).toBe("user");
    const recaptured = await f.api.capture(user, definition, "submission-1");
    expect(recaptured).not.toBe(proof);
    expect((await f.reopen().verify(definition.owner, definition, "submission-1", recaptured)).fingerprint).toBe(
        captured.fingerprint,
    );
    expect(await f.api.resolve(user, proof, "example/commerce")).toEqual({
        authority: "remote-commerce",
        subjectId: "remote-commerce-alias",
    });
    expect(f.aliases).toEqual(["private-cms-subject"]);
    expect(f.reads()).toBe(0);
    f.revoke();
    await expect(f.api.resolve(user, proof, "example/commerce")).rejects.toThrow("revoked");
    expect(f.aliases).toHaveLength(1);
});
test("proofs refuse tampering, foreign tenants, keys, owners, declarations and occurrences", async () => {
    const f = originFixture();
    const proof = await f.api.capture(user, definition, "one");
    for (const api of [originFixture("foreign").api, originFixture("tenant", Buffer.alloc(32, 2)).api]) {
        await expect(api.verify(definition.owner, definition, "one", proof)).rejects.toHaveProperty(
            "code",
            "FORBIDDEN",
        );
    }
    for (const [owner, source, id, reference] of [
        [{ ...definition.owner, installationId: "foreign" }, definition, "one", proof],
        [definition.owner, { ...definition, id: "c".repeat(64) }, "one", proof],
        [definition.owner, definition, "two", proof],
        [definition.owner, definition, "one", proof.slice(0, -3) + "abc"],
        [definition.owner, definition, "one", "private-cms-subject"],
    ] as const) {
        await expect(f.api.verify(owner, source, id, reference)).rejects.toHaveProperty("code", "FORBIDDEN");
    }
    expect(f.aliases).toEqual([]);
});
test("only verified source contexts capture; anonymous, explicit system and unknown remain distinct", async () => {
    const f = originFixture();
    const anonymous = await f.api.capture(context, definition, "anon");
    expect((await f.api.verify(definition.owner, definition, "anon", anonymous)).initiator.kind).toBe("anonymous");
    const machine = {
        ...context,
        connectionId: "events",
        sourceInstallationId: "forms",
        invocation: { instanceId: "tenant", contractId: "ulvia/cms.events" },
    };
    expect(await f.api.publication(machine, definition, "unknown", {})).toEqual({ causation: [] });
    const system = await f.api.capture(machine, definition, "system");
    expect((await f.api.verify(definition.owner, definition, "system", system)).initiator.kind).toBe("system");
    const delegated = { ...machine, subjectId: user.subjectId, rootRequestId: crypto.randomUUID() };
    const direct = await f.api.publication(delegated, definition, "direct", {});
    expect((await f.api.verify(definition.owner, definition, "direct", direct.proof!)).initiator.kind).toBe("user");
    for (const invalid of [
        { ...user, subjectId: "forged" },
        { ...user, connectionId: "other" },
        { ...user, providerId: "foreign" },
        { ...user, invocation: { ...user.invocation!, instanceId: "foreign" } },
        { ...user, controlAuthority: true as const },
        { ...machine, subjectId: user.subjectId },
    ]) {
        await expect(f.api.capture(invalid, definition, "refused")).rejects.toHaveProperty("code", "FORBIDDEN");
    }
    await expect(f.api.resolve(user, anonymous, "example/commerce")).rejects.toHaveProperty("code", "NOT_FOUND");
});
test("recipient Providers resolve only their own alias, never impersonating a user or choosing another installation", async () => {
    const f = originFixture();
    const proof = await f.api.capture(user, definition, "one");
    const recipient = { ...context, sourceInstallationId: "commerce" };
    expect(await f.api.resolve(recipient, proof, "example/commerce")).toHaveProperty(
        "subjectId",
        "remote-commerce-alias",
    );
    for (const invalid of [
        { ...recipient, sourceInstallationId: "forms" },
        { ...recipient, subjectId: user.subjectId },
        { ...recipient, rootRequestId: "root" },
        { ...recipient, systemServiceId: "worker" },
    ]) {
        await expect(f.api.resolve(invalid, proof, "example/commerce")).rejects.toHaveProperty("code", "FORBIDDEN");
    }
    f.stale();
    await expect(f.api.resolve(recipient, proof, "example/commerce")).rejects.toHaveProperty("code", "FORBIDDEN");
    expect(f.aliases).toHaveLength(1);
});
test("causal republication retains the initiating user through one owner-scoped metadata lookup", async () => {
    const f = originFixture();
    const proof = await f.api.capture(user, definition, "original");
    f.parent({
        record: {
            event: { initiator: { kind: "user", reference: proof } },
            deliveries: [
                { id: "delivery", subscription: { id: "subscription", owner: { installationId: "commerce" } } },
            ],
        },
    });
    const next = {
        ...definition,
        owner: { ...definition.owner, installationId: "commerce", namespace: "example/commerce" },
    };
    const publisher = { ...context, sourceInstallationId: "commerce" };
    const inherited = await f.api.publication(publisher, next, "next", { causeDeliveryId: "delivery" });
    expect(inherited.causation).toHaveLength(1);
    expect(f.reads()).toBe(1);
    expect((await f.api.verify(next.owner, next, "next", inherited.proof!)).fingerprint).toBe(
        (await f.api.verify(definition.owner, definition, "original", proof)).fingerprint,
    );
    await expect(
        f.api.publication(publisher, next, "next", { causeDeliveryId: "delivery", initiatorProof: proof }),
    ).rejects.toHaveProperty("code", "INVALID_INPUT");
    await expect(
        f.api.publication({ ...publisher, sourceInstallationId: "foreign" }, next, "next", {
            causeDeliveryId: "delivery",
        }),
    ).rejects.toHaveProperty("code", "FORBIDDEN");
    expect(f.reads()).toBe(1);
});
