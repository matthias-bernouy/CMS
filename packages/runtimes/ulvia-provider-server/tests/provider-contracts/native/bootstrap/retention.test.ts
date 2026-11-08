import type { InstanceTransitionRecord } from "@bernouy/ulvia-provider";
import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ProviderExecutionSupport } from "../../../../src/runtime/instances/system/execution/support";
import { assertHostedReleaseRetention } from "../../../../src/runtime/instances/system/retention";
import { installedFixture } from "../installedFixture";

test("retention of ready and disabled instances never opens an unavailable installation kit", async () => {
    const f = await installedFixture();
    let loads = 0;
    const system = {
        current: async (): Promise<never> => {
            loads++;
            throw new Error("Installation resources are unavailable");
        },
    };
    for (const status of ["ready", "disabled"] as const) {
        await assertHostedReleaseRetention(
            f.support,
            [{ ...f.instance, status }],
            [],
            async () => f.support.releases.map((pin) => ({ ...pin, location: f.instance.id })),
            system,
        );
    }
    expect(loads).toBe(0);
});

test("unfinished provisioning still requires its exact kit and cannot silently use installed execution", async () => {
    const f = await installedFixture();
    const system = {
        current: async (): Promise<never> => {
            throw new Error("Missing exact kit");
        },
    };
    await expect(
        assertHostedReleaseRetention(
            f.support,
            [{ ...f.instance, status: "provisioning" }],
            [],
            async () => [],
            system,
        ),
    ).rejects.toThrow("Missing exact kit");
});

test("the official manifest only claims exact implementations supported by this build", async () => {
    const manifest = JSON.parse(
        await readFile(
            resolve(
                import.meta.dir,
                "../../../../../ulvia-cli/dist/bootstrap/providers/primary-provider/definition.json",
            ),
            "utf8",
        ),
    );
    const support = new ProviderExecutionSupport();
    expect(manifest.providerId).toBe(support.providerId);
    for (const pin of manifest.implementations) {
        expect(() => support.assert(pin, "official manifest")).not.toThrow();
    }
    expect(() => support.assert({ ...support.releases[0]!, version: "99.0.0" }, "unreviewed release")).toThrow(
        "does not support",
    );
});

test("unsupported unfinished transition formats refuse before catalogue reads or recovery", async () => {
    const f = await installedFixture();
    let reads = 0;
    const unsupported = {
        id: "legacy",
        instanceId: f.instance.id,
        kind: "upgrade",
        status: "queued",
        targetProfile: { id: "ulvia", version: "1.0.0" },
    } as unknown as InstanceTransitionRecord;
    const read = async () => {
        reads++;
        return [];
    };
    const image = {
        current: async (): Promise<never> => {
            throw new Error("Must not select new image resources");
        },
    };
    await expect(assertHostedReleaseRetention(f.support, [f.instance], [unsupported], read, image)).rejects.toThrow(
        "original image",
    );
    await expect(
        assertHostedReleaseRetention(f.support, [{ ...f.instance, status: "upgrading" }], [], read, image),
    ).rejects.toThrow("original image");
    expect(reads).toBe(0);
});
