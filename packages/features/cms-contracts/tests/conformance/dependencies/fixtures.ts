import {
    admitContractRelease,
    type AdmittedContractRelease,
    type CapabilityDefinition,
    type CapabilityRequirement,
    type ContractConformanceSuite,
    type ContractRelease,
    type ConformanceCall,
} from "@bernouy/cms-contracts";
import type { UlviaObjectSchema } from "@bernouy/cms-contracts/schema";

export function capability(id: string, requires?: readonly CapabilityRequirement[]): CapabilityDefinition {
    const schema: UlviaObjectSchema = {
        type: "object",
        properties: { id: { type: "string", maxLength: 64 } },
        required: ["id"],
    };
    return {
        id,
        access: "admin",
        behavior: { effect: "command", execution: "sync", idempotency: "keyed" },
        input: schema,
        output: schema,
        errors: [],
        binding: {
            transport: "http",
            method: "POST",
            path: `/${id}`,
            input: { body: true },
            response: { successStatuses: [200], contentTypes: ["application/json"], errorStatuses: {} },
        },
        ...(requires ? { requires } : {}),
    };
}

export function contract(
    contractId: string,
    version: string,
    capabilities: readonly CapabilityDefinition[],
): ContractRelease {
    return {
        kind: "contract",
        protocol: "ulvia-provider/v1",
        schemaDialect: "ulvia-schema/v1",
        contractId,
        name: contractId,
        version,
        publisherId: "ulvia",
        capabilities,
    };
}

export function payment(version: string): ContractRelease {
    return contract("payment", version, [
        capability("payment.charge"),
        capability("fixture.prepare"),
        capability("payment.inspect"),
    ]);
}

export function requirement(
    contractId = "payment",
    capabilityId = "payment.charge",
    versionRange = "^1.0.0 || ^2.0.0",
): CapabilityRequirement {
    return { contractId, capabilityId, versionRange, supportRanges: versionRange.split(" || ") };
}

export function reference(admission: AdmittedContractRelease) {
    return { contractId: admission.release.contractId, version: admission.release.version, digest: admission.digest };
}

export async function fixture(
    dependencies: readonly ContractRelease[] = [payment("1.0.0"), payment("2.0.0")],
    root = contract("commerce", "1.0.0", [capability("checkout.start", [requirement()])]),
) {
    const admission = await admitContractRelease(root);
    const admissions = await Promise.all(dependencies.map((release) => admitContractRelease(release)));
    const suite: ContractConformanceSuite = {
        kind: "contract-conformance-suite",
        protocol: "ulvia-conformance/v1",
        contractId: root.contractId,
        contractVersion: root.version,
        contractDigest: admission.digest,
        publisherId: root.publisherId,
        version: "1.0.0",
        isolation: "disposable-tenant",
        dependencyProfiles: admissions.map((entry, index) => ({
            id: `payment-v${index + 1}`,
            releases: [reference(entry)],
        })),
        scenarios: [
            {
                id: "checkout",
                calls: [
                    {
                        id: "prepare",
                        dependencyContractId: "payment",
                        capabilityId: "fixture.prepare",
                        actor: { kind: "admin" },
                        input: { id: "sample" },
                        expect: { kind: "success", checks: [{ path: "/id", equals: "sample" }] },
                        captures: [{ name: "payment-id", path: "/id" }],
                    },
                    {
                        id: "checkout",
                        capabilityId: "checkout.start",
                        actor: { kind: "admin" },
                        input: { id: { $capture: "payment-id" } },
                        expect: { kind: "success", checks: [{ path: "/id", equals: { $capture: "payment-id" } }] },
                        captures: [{ name: "checkout-id", path: "/id" }],
                    },
                    {
                        id: "inspect",
                        dependencyContractId: "payment",
                        capabilityId: "payment.inspect",
                        actor: { kind: "admin" },
                        input: { id: { $capture: "checkout-id" } },
                        expect: { kind: "success", checks: [{ path: "/id", equals: { $capture: "checkout-id" } }] },
                    },
                ],
            },
        ],
    };
    return { admission, admissions, suite };
}

export function changeCall(
    suite: ContractConformanceSuite,
    id: string,
    change: Partial<ConformanceCall>,
): ContractConformanceSuite {
    return {
        ...suite,
        scenarios: suite.scenarios.map((scenario) => ({
            ...scenario,
            calls: scenario.calls.map((call) => (call.id === id ? { ...call, ...change } : call)),
        })),
    };
}
