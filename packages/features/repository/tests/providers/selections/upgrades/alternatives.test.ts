import { expect, test } from "bun:test";
import { validateCapabilityUsage } from "repository/providers/selections/core/upgrades/requirements";
import type { CapabilityUsageEvidence } from "repository/providers/selections/interfaces/ContractUpgrade";
import { graphFixture } from "../fixtures";

test("a host adapter's declared alternatives migrate without changing a page's explicit legacy references", async () => {
    const f = await graphFixture();
    const before = [await f.select("ulvia/emailer")];
    const transition = [await f.select("ulvia/emailer", "1.1.0")];
    const after = [await f.select("ulvia/emailer", "2.0.0")];
    const runtime = {
        contractId: "ulvia/emailer",
        capabilityId: "deliver",
        alternatives: [{ capabilityId: "send" }],
        location: "internal:edge/delivery",
    };
    const usage: CapabilityUsageEvidence = { complete: true, revision: "one", unknown: [], requirements: [runtime] };
    const grants = { default: "allow-selected" as const, denied: [] };
    const check = (target: typeof after, evidence = usage) =>
        validateCapabilityUsage(evidence, target, before, grants, [], f.releases);
    expect(await check(before)).toEqual([]);
    expect(await check(transition)).toEqual([]);
    expect(await check(after)).toEqual([]);
    const explicit = {
        ...usage,
        requirements: [runtime, { contractId: "ulvia/emailer", capabilityId: "send", location: "page:/contact/form" }],
    };
    expect(await check(after, explicit)).toContainEqual(
        expect.objectContaining({ code: "required-capability", location: "page:/contact/form" }),
    );
    const pinned = {
        ...usage,
        requirements: [
            {
                contractId: "ulvia/emailer",
                capabilityId: "deliver",
                versionRange: "^1.0.0",
                location: "collection:forms/contact",
            },
        ],
    };
    expect(await check(after, pinned)).toContainEqual(
        expect.objectContaining({ code: "required-capability", location: "collection:forms/contact" }),
    );
    const declaredCompatible = {
        ...pinned,
        requirements: [{ ...pinned.requirements[0]!, versionRange: "^1.0.0 || ^2.0.0" }],
    };
    expect(await check(after, declaredCompatible)).toEqual([]);
});
test("runtime alternatives remain subject to the selected capability's execution grant", async () => {
    const f = await graphFixture();
    const selection = [await f.select("ulvia/emailer", "1.1.0")];
    const issues = await validateCapabilityUsage(
        {
            complete: true,
            revision: "one",
            unknown: [],
            requirements: [
                {
                    contractId: "ulvia/emailer",
                    capabilityId: "deliver",
                    alternatives: [{ capabilityId: "send" }],
                    location: "internal:edge",
                },
            ],
        },
        selection,
        selection,
        { default: "allow-selected", denied: [{ contractId: "ulvia/emailer", capabilityId: "deliver" }] },
        [],
        f.releases,
    );
    expect(issues).toContainEqual(expect.objectContaining({ code: "required-grant" }));
});
