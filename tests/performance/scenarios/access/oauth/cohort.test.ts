import { expect, test } from "bun:test";
import { fixturePool } from "../../content/settings/pool";
import { prepareOAuthCohort } from "./preparation";

test("the exchange cohort creates all ten lazy tenants before issuing sixty-second authorization codes", async () => {
    let now = 0;
    let created = 0;
    const pool = fixturePool(13, async (index) => {
        now += 20_000;
        created++;
        return index;
    });
    await prepareOAuthCohort(() => pool.acquire(), "exchange-mcp-token", "concurrent", 0);
    expect(created).toBe(10);
    expect(now).toBe(200_000);
    const active = [];
    const issuedAt: number[] = [];
    for (let index = 0; index < 10; index++) {
        active.push(await pool.acquire());
        issuedAt.push(now);
    }
    expect(new Set(active.map((lease) => lease.value)).size).toBe(10);
    expect(created).toBe(10);
    expect(issuedAt.every((issued) => now - issued < 60_000)).toBe(true);
    for (const lease of active) {
        lease.release();
    }
});

test("cohort construction leaves other capabilities, variants and subsequent samples untouched", async () => {
    let acquisitions = 0;
    const acquire = async () => {
        acquisitions++;
        return { release() {} };
    };
    for (const variant of ["nominal", "cold", "warm"] as const) {
        await prepareOAuthCohort(acquire, "exchange-mcp-token", variant, 0);
    }
    await prepareOAuthCohort(acquire, "authorize-mcp-connection", "concurrent", 0);
    await prepareOAuthCohort(acquire, "exchange-mcp-token", "concurrent", 1);
    expect(acquisitions).toBe(0);
});

test("a failed tenant construction releases every earlier lease and never retries", async () => {
    let acquisitions = 0;
    const released: number[] = [];
    const acquire = async () => {
        const index = ++acquisitions;
        if (index === 4) {
            throw new Error("tenant-construction-failed");
        }
        return {
            release: () => {
                released.push(index);
            },
        };
    };
    await expect(prepareOAuthCohort(acquire, "exchange-mcp-token", "concurrent", 0)).rejects.toThrow(
        "tenant-construction-failed",
    );
    expect(acquisitions).toBe(4);
    expect(released).toEqual([3, 2, 1]);
});
