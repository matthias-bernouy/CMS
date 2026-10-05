import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OfficialCmsInstanceDiscovery } from "@bernouy/ulvia-official-provider";
import { FileInstanceRegistry } from "@bernouy/ulvia-official-provider/local-fs";

const registration = {
    id: "default",
    label: "Local CMS",
    lifecycleState: "running" as const,
    coreVersion: "0.1.0",
    contracts: [],
    healthUrl: "http://127.0.0.1:5100/",
};

test("the private registry reuses the default instance across restarts", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-provider-instances-"));
    const path = join(root, "registry.json");
    try {
        const first = new OfficialCmsInstanceDiscovery(
            new FileInstanceRegistry(path),
            "default",
            async () => true,
            () => new Date("2026-10-05T10:00:00.000Z"),
        );
        const registered = await first.registerCurrent(registration);
        await first.current();

        const restarted = new OfficialCmsInstanceDiscovery(
            new FileInstanceRegistry(path),
            "default",
            async () => true,
            () => new Date("2026-10-05T10:00:10.000Z"),
        );
        const reused = await restarted.registerCurrent(registration);
        expect(reused.id).toBe(registered.id);
        expect(reused.registeredAt).toBe(registered.registeredAt);
        expect((await restarted.list(undefined, 50)).items).toHaveLength(1);

        const changed = await restarted.registerCurrent({ ...registration, coreVersion: "0.2.0" });
        expect(changed.registeredAt).toBe(registered.registeredAt);
        expect(changed.lastReadyAt).toBeUndefined();
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("stale and unavailable Core health fails closed without losing the last observation", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-provider-health-"));
    let time = new Date("2026-10-05T10:00:00.000Z");
    let available = true;
    try {
        const discovery = new OfficialCmsInstanceDiscovery(
            new FileInstanceRegistry(join(root, "registry.json")),
            "default",
            async () => available,
            () => time,
            1_000,
        );
        await discovery.registerCurrent(registration);
        expect(await discovery.current()).toMatchObject({
            availability: "ready",
            observedAt: "2026-10-05T10:00:00.000Z",
        });

        available = false;
        time = new Date("2026-10-05T10:00:02.000Z");
        expect(await discovery.current()).toMatchObject({
            availability: "unavailable",
            observedAt: "2026-10-05T10:00:00.000Z",
        });
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("the provider registry rejects corrupt state and Core advertisements of provider lifecycle", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-provider-corrupt-"));
    const path = join(root, "registry.json");
    try {
        await writeFile(path, "{}", { mode: 0o600 });
        await expect(new FileInstanceRegistry(path).list(undefined, 10)).rejects.toThrow("Corrupt");

        const discovery = new OfficialCmsInstanceDiscovery(new FileInstanceRegistry(path), "default", async () => true);
        expect(() =>
            discovery.registerCurrent({
                ...registration,
                contracts: [
                    {
                        contractId: "ulvia.provider.cms-instances",
                        version: "1.0.0",
                        digest: `sha256:${"a".repeat(64)}`,
                    },
                ],
            }),
        ).toThrow("cannot be advertised as Core contracts");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
