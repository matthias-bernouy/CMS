import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { LazyOfficialProfiles } from "../../../src/runtime/instances/profiles/execution/LazyOfficialProfiles";
import { ProviderExecutionSupport } from "../../../src/runtime/instances/profiles/execution/support";
import { assertHostedReleaseRetention } from "../../../src/runtime/instances/profiles/retention";
import { installedFixture } from "./installedFixture";

test("retention of ready and disabled instances never opens an unavailable installation kit", async () => {
    const f = await installedFixture();
    let loads = 0;
    const profiles = new LazyOfficialProfiles(
        {
            defaultProfile: { id: "removed-recipe", version: "0.9.0" },
            profiles: [
                { id: "removed-recipe", version: "0.9.0" },
                { id: "ulvia", version: "1.0.0" },
            ],
        },
        async () => {
            loads++;
            throw new Error("Installation resources are unavailable");
        },
    );
    for (const status of ["ready", "disabled"] as const) {
        await assertHostedReleaseRetention(
            f.support,
            [{ ...f.instance, status }],
            [],
            async () => f.support.releases.map((pin) => ({ ...pin, location: f.instance.id })),
            profiles,
        );
    }
    expect(loads).toBe(0);
    expect(profiles.describe().defaultProfile.id).toBe("removed-recipe");
    expect(loads).toBe(0);
    await expect(profiles.resolve("ulvia", "1.0.0")).rejects.toThrow("resources are unavailable");
    expect(loads).toBe(1);
});

test("unfinished provisioning still requires its exact kit and cannot silently use installed execution", async () => {
    const f = await installedFixture();
    const profiles = new LazyOfficialProfiles(
        {
            defaultProfile: { id: "removed-recipe", version: "0.9.0" },
            profiles: [
                { id: "removed-recipe", version: "0.9.0" },
                { id: "ulvia", version: "1.0.0" },
            ],
        },
        async () => {
            throw new Error("Missing exact kit");
        },
    );
    await expect(
        assertHostedReleaseRetention(
            f.support,
            [{ ...f.instance, status: "provisioning" }],
            [],
            async () => [],
            profiles,
        ),
    ).rejects.toThrow("Missing exact kit");
});

test("the official manifest only claims exact implementations supported by this build", async () => {
    const manifest = JSON.parse(
        await readFile(
            resolve(import.meta.dir, "../../../../ulvia-cli/dist/bootstrap/providers/primary-provider/definition.json"),
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
