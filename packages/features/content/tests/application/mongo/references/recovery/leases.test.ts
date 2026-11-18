import { expect, test } from "bun:test";
import { referenceFixture, barrier } from "../fixture";

test("a process lost during read-only validation leaves an expiring lease, not an uncertain business commit", async () => {
    const { db, first, second, identity } = await referenceFixture();
    const entered = barrier();
    const resume = barrier();
    db.get("blocs").beforeFind = async () => {
        entered.release();
        await resume.ready;
        throw new Error("Validation process stopped before persistence");
    };
    const abandoned = first
        .insertPage("/abandoned", "Abandoned", '<div cms-bloc="site-target"></div>')
        .catch((error: unknown) => error);
    let result: unknown;
    try {
        await entered.ready;
        db.get("blocs").beforeFind = undefined;
        // Simulate expiry after process loss without a 60-second wall-clock wait.
        await db.get("site_bloc_publication_locks").updateOne(
            { _id: "published-graph" },
            {
                $set: { expiresAt: new Date(0), committingAt: new Date(0) },
            },
        );
        result = await second.deleteSiteBloc("site-target", 1, identity).catch((error: unknown) => error);
    } finally {
        resume.release();
        await abandoned;
    }
    expect(result, "a read-only abandoned operation must not require manual commit recovery").toBeUndefined();
    expect(await second.getPage("/abandoned")).toBeNull();
    expect(await second.getBlocRecord("site-target")).toBeNull();
});

test("nested Mongo reference writes settle promptly without requiring manual recovery", async () => {
    const { db, first } = await referenceFixture();
    const pending = first
        .withContentReferenceWrite(() => first.withContentReferenceWrite(async () => "completed"))
        .then(
            () => "completed",
            () => "refused",
        );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const outcome = await Promise.race([
        pending,
        new Promise<string>((resolve) => {
            timer = setTimeout(() => resolve("deadlocked"), 500);
        }),
    ]).finally(() => clearTimeout(timer));
    if (outcome === "deadlocked") {
        // Unwind the failed test's pending acquisition instead of leaking its retry timer.
        await db.get("site_bloc_publication_locks").updateOne(
            { _id: "published-graph" },
            {
                $set: { expiresAt: new Date(0), committingAt: new Date(0) },
            },
        );
        await pending;
    }
    expect(outcome).not.toBe("deadlocked");
    expect(await db.get("site_bloc_publication_locks").findOne({ _id: "published-graph" })).toBeNull();
    await first.withContentReferenceWrite(async () => "next writer");
});
