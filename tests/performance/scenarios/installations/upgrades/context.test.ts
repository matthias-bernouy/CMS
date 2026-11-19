import { expect, test } from "bun:test";
import { compileOfficialFeatures } from "@bernouy/ulvia-provider/build";
import { InMemoryReleaseCatalogue } from "@bernouy/repository/contracts/catalogue";
import { validateCapabilityUsage } from "@bernouy/repository/providers/selections";
import { DENIED_READ } from "./context";
import { prepareContractSwitch } from "./contracts";
import type { UpgradeContext } from "./context";
import type { CapabilityUsageEvidence } from "@bernouy/repository/providers/selections";
import type { ContractSelection } from "@bernouy/ulvia-providers/selections";

test("upgrade grant fixtures preserve required diagnostic consumers with real official contract definitions", async () => {
    const build = await compileOfficialFeatures();
    const releases = new InMemoryReleaseCatalogue();
    for (const admitted of build.contracts) {
        await releases.publish(admitted);
    }
    const selections: ContractSelection[] = build.implementations.map(({ contractId, version, digest }) => ({
        siteId: "default",
        installationId: "fixture-provider",
        contractId,
        version,
        digest,
    }));
    // This runtime consumer is explicit in createCollectionUpgradeAnalysis; its denial must stay invalid.
    const mandatory = { contractId: "ulvia/cms.observability", capabilityId: "logs.query" };
    const usage: CapabilityUsageEvidence = {
        complete: true,
        revision: "fixture-required-consumers",
        unknown: [],
        requirements: [{ ...mandatory, location: "internal:edge-provider/ulvia/cms.observability/logs.query" }],
    };
    const evaluate = (denied: (typeof mandatory)[]) =>
        validateCapabilityUsage(usage, selections, selections, { default: "allow-selected", denied }, [], releases);
    const refused = await evaluate([mandatory]);
    expect(refused).toContainEqual(expect.objectContaining({ code: "required-grant" }));
    expect(await evaluate([DENIED_READ])).toEqual([]);
    expect(await evaluate([])).toEqual([]);
});

test("contract planning expects its declared semantic refusal and then verifies foreign authority and unchanged state", async () => {
    for (const binding of ["http", "mcp"]) {
        const events: string[] = [];
        const selections: readonly unknown[] = [];
        const grants = { default: "allow-selected", denied: [DENIED_READ] };
        const digest = `sha256:${"1".repeat(64)}`;
        const review = {
            status: "applicable",
            issueCount: 0,
            issues: [],
            expectedRevision: 1,
            planDigest: digest,
            usageDigest: digest,
            selections,
            source: selections,
            grants,
            authority: { capabilities: [{}], providers: [{}] },
        };
        const snapshot = { selections, selectionRevision: 1, pages: [], collections: [] };
        const context = {
            original: { selections },
            targetGrants: grants,
            plan: async () => review,
            snapshot: async () => {
                events.push("snapshot");
                return snapshot;
            },
            invalid: async (capability: string, valid: unknown, refused: unknown, expectedStatus = 400) => {
                expect(capability).toBe("plan-contract-upgrade");
                expect(valid).toEqual({ selections, grants });
                expect(refused).toEqual({});
                expect(expectedStatus).toBe(422);
                events.push("negative-422");
            },
            environment: { main: { cookie: "foreign-session" } },
            state: {
                client: async (
                    _contract: string,
                    _capability: string,
                    transport: string,
                    _input: unknown,
                    assert?: (output: unknown) => void,
                    options?: { httpCredentials?: unknown },
                ) => {
                    if (options?.httpCredentials) {
                        expect(transport).toBe("http");
                        events.push("foreign");
                        return { observation: { validated: false, status: 403 } };
                    }
                    expect(transport).toBe(binding);
                    assert?.(review);
                    events.push("root");
                    return { observation: { validated: true, status: 200 } };
                },
            },
            close: async () => {},
        } as unknown as UpgradeContext;
        const sample = await prepareContractSwitch(context, "plan-contract-upgrade", binding, "nominal");
        expect((await sample.send()).validated).toBe(true);
        await sample.verify!();
        expect(events).toEqual(["snapshot", "root", "snapshot", "negative-422", "foreign", "snapshot"]);
    }
});
