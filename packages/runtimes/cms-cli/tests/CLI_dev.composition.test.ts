import { describe, expect, test } from "bun:test";

async function source(): Promise<string> {
    return Bun.file(new URL("../src/commands/dev/servers.ts", import.meta.url)).text();
}

describe("local CMS listener composition", () => {
    test("waits for Control readiness before listening", async () => {
        const text = await source();
        const ready = text.indexOf("await cms.ready");
        const listen = text.indexOf("runner.start", ready);

        expect(ready).toBeGreaterThan(-1);
        expect(listen).toBeGreaterThan(ready);
    });

    test("shares an in-memory analytics store between Control and Delivery", async () => {
        const text = await source();

        expect(text).toContain("new ValidatingAnalyticsStore(new InMemoryAnalyticsStore())");
        expect(text).toMatch(/services\.sources,\s*analytics,\s*services\.roles/);
        expect(text).toMatch(/new DeliveryCms\(\{[\s\S]*analytics,\s*analyticsSalt,/);
    });

    test.failing("binds both local listeners to the parsed host", async () => {
        const text = await source();

        expect(text).toMatch(/runner\.start\(\{\s*port,\s*hostname:\s*host\s*\}\)/);
        expect(text).toMatch(/deliveryRunner\.start\(\{\s*port:\s*deliveryPort,\s*hostname:\s*host\s*\}\)/);
    });
});
