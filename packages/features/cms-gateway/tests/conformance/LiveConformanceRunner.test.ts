import { describe, expect, test } from "bun:test";
import { admitConformanceSuite, admitContractRelease } from "@bernouy/cms-repository/contracts";
import {
    LiveConformanceRunner,
    type ConformanceEnvironmentFactory,
    type ConformanceInvocationRequest,
    type ConformanceScenarioEnvironment,
} from "@bernouy/cms-gateway/conformance";

const contractSource = await Bun.file(
    new URL("../../../cms-repository/fixtures/contracts/protocol-v1/conformance.contract.json", import.meta.url),
).json();
const suiteSource = await Bun.file(
    new URL("../../../cms-repository/fixtures/contracts/protocol-v1/conformance.suite.json", import.meta.url),
).json();

describe("LiveConformanceRunner", () => {
    test("executes a fresh live scenario, captures values and disposes its tenant", async () => {
        const { release, suite } = await admittedFixtures();
        const factory = new ItemEnvironmentFactory();
        const evidence = await runner().run({
            release,
            suite,
            provider: provider(),
            environments: factory,
        });

        expect(evidence.evidence.status).toBe("passed");
        expect(evidence.evidence.scenarios[0]?.calls.map(({ status }) => status)).toEqual([
            "passed",
            "passed",
            "passed",
            "passed",
            "passed",
        ]);
        expect(factory.disposed).toBe(1);
        expect(factory.invocationKeys[0]).toContain(":item-roundtrip:default:create");
        expect(evidence.canonicalJson).not.toContain("item-1");
    });

    test("records a bounded failure without publishing provider outputs", async () => {
        const { release, suite } = await admittedFixtures();
        const factory = new ItemEnvironmentFactory(true);
        const evidence = await runner().run({ release, suite, provider: provider(), environments: factory });

        expect(evidence.evidence.status).toBe("failed");
        expect(evidence.evidence.scenarios[0]).toMatchObject({ status: "failed" });
        expect(evidence.evidence.scenarios[0]?.calls.at(-1)).toMatchObject({
            id: "find",
            status: "failed",
            failureCode: "ASSERTION_FAILED",
        });
        expect(factory.disposed).toBe(1);
        expect(evidence.canonicalJson).not.toContain("wrong-provider-secret-output");
    });
});

class ItemEnvironmentFactory implements ConformanceEnvironmentFactory {
    disposed = 0;
    invocationKeys: (string | undefined)[] = [];

    constructor(private readonly wrongFind = false) {}

    async provision(): Promise<ConformanceScenarioEnvironment> {
        const items = new Map<string, string>();
        return {
            invoke: async (request) => this.invoke(request, items),
            complete: async () => {
                throw new Error("No operation is declared by this fixture");
            },
            dispose: async () => {
                this.disposed += 1;
            },
        };
    }

    private async invoke(request: ConformanceInvocationRequest, items: Map<string, string>) {
        this.invocationKeys.push(request.invocationKey);
        const input = request.input as { id?: string; name?: string };
        if (request.capabilityId === "item.create") {
            items.set("item-1", input.name!);
            return { kind: "success" as const, output: { id: "item-1", name: input.name } };
        }
        if (request.capabilityId === "item.find") {
            return {
                kind: "success" as const,
                output: {
                    id: this.wrongFind ? "wrong-provider-secret-output" : "item-1",
                    name: input.name,
                },
            };
        }
        if (request.capabilityId === "item.get") {
            const name = items.get(input.id!);
            return name
                ? { kind: "success" as const, output: { id: input.id, name } }
                : { kind: "error" as const, code: "NOT_FOUND" };
        }
        if (request.capabilityId === "item.delete") {
            items.delete(input.id!);
            return { kind: "success" as const, output: null };
        }
        throw new Error("Unexpected fixture capability");
    }
}

async function admittedFixtures() {
    const release = await admitContractRelease(structuredClone(contractSource));
    const suite = await admitConformanceSuite(structuredClone(suiteSource), release);
    return { release, suite };
}

function runner(): LiveConformanceRunner {
    const dates = [new Date("2026-10-07T10:00:00.000Z"), new Date("2026-10-07T10:00:01.000Z")];
    let tick = 0;
    return new LiveConformanceRunner({
        now: () => dates.shift()!,
        monotonicNow: () => tick++,
        createId: () => "00000000-0000-4000-8000-000000000001",
        sleep: async () => undefined,
    });
}

function provider() {
    return {
        publisherId: "ulvia.official",
        providerId: "ulvia.official",
        manifestVersion: "1.0.0",
        manifestDigest: `sha256:${"a".repeat(64)}` as const,
        buildVersion: "1.0.0",
    };
}
