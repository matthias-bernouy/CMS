import { expect, test } from "bun:test";
import { instanceFixture, creation } from "./fixture";

test("one verified zone provisions 150 distinct primary domains without individual proofs", async () => {
    const f = await instanceFixture();
    await f.zones.claim(f.actor, "cyaxis-demo.fr");
    f.setZoneVerified(true);
    await f.zones.verify(f.actor, "cyaxis-demo.fr", 1);
    const results = [];
    for (let index = 0; index < 150; index++) {
        results.push(await f.management.create(f.actor, creation(`https://artisan${index}.cyaxis-demo.fr`)));
    }
    expect(new Set(results.map(({ instance }) => instance.id)).size).toBe(150);
    expect(
        results.every(
            ({ domain, instance, proof }) =>
                domain.state === "verified" &&
                domain.tls === "pending" &&
                instance.status === "ready" &&
                proof === null,
        ),
    ).toBe(true);
    await f.zones.disable(f.actor, "cyaxis-demo.fr", 2);
    const late = await f.management.create(f.actor, creation("https://later.cyaxis-demo.fr"));
    expect(late.domain.state).toBe("pending");
    expect(late.proof?.name).toBe("_ulvia.later.cyaxis-demo.fr");
    expect((await f.store.getDomain("artisan0.cyaxis-demo.fr"))!.state).toBe("verified");
});
