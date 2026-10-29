import { expect, test } from "bun:test";
import { DelegationAuthority } from "@bernouy/cms-gateway/access/delegation";
import { delegationFixture } from "../fixtures";

test("root finalization checks the current grant after route loads, including a deleted selection", async () => {
    for (const change of ["denied", "deleted"] as const) {
        const f = await delegationFixture();
        const source = f.root();
        const root = (await f.authority.prepare(source))!;
        f.routes.isCurrent = async () => {
            if (change === "denied") {
                f.state.current.grants.denied.push({ contractId: "origin", capabilityId: "item.list" });
            } else {
                f.selections.get = async () => null as never;
            }
            return true;
        };
        let disclosed = false;
        await expect(
            root.finalize(source, async () => {
                disclosed = true;
            }),
        ).rejects.toMatchObject({ code: "not_authorized" });
        expect(disclosed).toBe(false);
    }
});

test("the grouped final authority reader is called once after actor verification and fails closed", async () => {
    for (const outcome of ["allowed", "route", "grant", "error"] as const) {
        const f = await delegationFixture();
        let reads = 0;
        const authority = new DelegationAuthority({
            siteId: "site-a",
            routes: f.routes,
            selections: f.selections,
            store: f.store,
            now: () => f.state.now,
            credentialFingerprint: async () => f.state.credential,
            inspectActor: async () => {
                f.state.inspections++;
                return f.state.actor;
            },
            checkAuthority: async (route, capabilityId) => {
                expect(route).toBe(f.source);
                expect(capabilityId).toBe("item.list");
                expect(f.state.inspections).toBe(1);
                reads++;
                if (outcome === "error") {
                    throw new Error("Authority unavailable");
                }
                return { current: outcome !== "route", granted: outcome !== "grant" };
            },
        });
        const source = f.root();
        const root = (await authority.prepare(source))!;
        f.routes.isCurrent = async () => {
            throw new Error("The grouped fence owns this read");
        };
        let signatures = 0;
        const result = root.finalize(
            source,
            async () => {
                signatures++;
                return "signed";
            },
            f.source,
        );
        if (outcome === "allowed") {
            expect(await result).toBe("signed");
            expect(signatures).toBe(1);
        } else {
            await expect(result).rejects.toThrow();
            expect(signatures).toBe(0);
        }
        expect(reads).toBe(1);
    }
});

test("a shared final fence cannot sign for another route snapshot with the same basic source IDs", async () => {
    for (const change of ["endpoint", "credential", "instance", "manifest", "release", "selection"] as const) {
        const f = await delegationFixture();
        const source = f.root();
        const root = (await f.authority.prepare(source))!;
        const expected = structuredClone(f.source);
        if (change === "endpoint") {
            expected.installation.installation.endpoint = "https://different.test";
        }
        if (change === "credential") {
            expected.installation.installation.providerTokenRef = "${DIFFERENT_TOKEN}";
        }
        if (change === "instance") {
            expected.installation.observation!.report.instanceId = "another-instance";
        }
        if (change === "manifest") {
            expected.manifest.admission.digest = "sha256:" + "0".repeat(64);
        }
        if (change === "release") {
            expected.requestedRelease.admission.digest = "sha256:" + "0".repeat(64);
        }
        if (change === "selection") {
            expected.selection.siteId = "another-site";
        }
        await expect(root.finalize(source, async () => "signed", expected)).rejects.toMatchObject({
            code: "not_authorized",
        });
        expect(f.state.inspections).toBe(0);
    }
});
