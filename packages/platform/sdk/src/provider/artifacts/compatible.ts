import { sameRetainedSensitivity } from "./sensitivity";
import {
    firstSchemaSubsetViolation,
    firstProjectedOutputViolation,
    parseVersionRange,
} from "@bernouy/ulvia-contracts/compatibility";
import { verifyStoredContractReleaseJson, resolveContract } from "@bernouy/ulvia-contracts";
import type { CapabilityDefinition } from "@bernouy/ulvia-contracts";
import type { ProviderRequirement, CompiledImplementations } from "ulvia-sdk/interfaces/providers";
import type { ImplementationRelease } from "ulvia-sdk/interfaces/runtime";
import { storeProviderPlan } from "ulvia-sdk/compiler/plan";
import { buildCatalogue } from "ulvia-sdk/compiler/catalogue";
import { selectImplementations } from "ulvia-sdk/provider/selection";
import { parseImplementationArtifact } from "./parse";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { SdkDefinitionError } from "ulvia-sdk/schema/errors";

/** Retained releases are explicit code-owned metadata, never installed catalogue claims. */
export async function loadCompatibleImplementation<Dependencies>(
    build: CompiledImplementations<Dependencies>,
    sourceInput: ImplementationRelease,
    retained: Readonly<{ canonicalJson: string; digest: string; requires?: readonly ProviderRequirement[] }>,
): Promise<CompiledImplementations<Dependencies>> {
    const source = Object.freeze({ ...sourceInput });
    const selected = selectImplementations(build, [source]);
    const captured = [...selected.plan];
    const artifact = parseImplementationArtifact({
        kind: "ulvia-sdk-runtime/v1",
        contracts: [{ canonicalJson: retained.canonicalJson, digest: retained.digest }],
        implementations: retained.requires
            ? [
                  {
                      ...build.implementations.find(
                          (claim) => claim.contractId === source.contractId && claim.digest === source.digest,
                      )!,
                      requires: retained.requires,
                  },
              ]
            : [],
    });
    const metadata = artifact.contracts[0]!;
    const retainedRequires = artifact.implementations[0]?.requires.map((entry) => ({
        ...entry,
        versionRange: parseVersionRange(entry.versionRange, "$.requires.versionRange"),
    }));
    const admission = await verifyStoredContractReleaseJson(metadata.canonicalJson, metadata.digest);
    if (admission.release.contractId !== source.contractId || admission.canonicalJson !== metadata.canonicalJson) {
        throw new SdkDefinitionError("Retained implementation identity differs from its source");
    }
    const admissions = [
        ...build.contracts.filter(({ release }) => release.contractId !== admission.release.contractId),
        admission,
    ];
    const catalogue = buildCatalogue(admissions);
    const view = await resolveContract(catalogue, admission);
    const plan = view.capabilities.map(({ definition: capability, owner }) => {
        const entry = captured.find((entry) => entry.capability.id === capability.id);
        if (
            !entry ||
            capabilityExecutionSignature(entry.capability, capability) !== capabilityExecutionSignature(capability)
        ) {
            throw new SdkDefinitionError(`Retained capability differs from its executor: ${capability.id}`);
        }
        const requests = view.lineage
            .filter((_contract, index) =>
                view.lineage
                    .slice(index)
                    .some(({ release, digest }) => release.contractId === owner.contractId && digest === owner.digest),
            )
            .map(({ release, digest }) => ({ contractId: release.contractId, version: release.version, digest }));
        return Object.freeze({
            ...entry,
            ...(capability.output.type !== "binary" &&
            canonicalizeIJson(schemaDocumentation(entry.capability.output)) !==
                canonicalizeIJson(schemaDocumentation(capability.output))
                ? { retainedOutputSchema: entry.capability.output }
                : {}),
            contractId: view.release.contractId,
            version: view.release.version,
            capability,
            requests: Object.freeze(requests),
        });
    });
    const original = build.implementations.find(
        (claim) =>
            claim.contractId === source.contractId &&
            claim.version === source.version &&
            claim.digest === source.digest,
    )!;
    const compatible = Object.freeze({
        contracts: Object.freeze(
            view.lineage.map(({ digest }) => admissions.find((entry) => entry.digest === digest)!),
        ),
        implementedContracts: Object.freeze([view]),
        implementations: Object.freeze([
            {
                ...original,
                ...(retainedRequires ? { requires: retainedRequires } : {}),
                version: view.release.version,
                digest: view.digest,
            },
        ]),
    }) as CompiledImplementations<Dependencies>;
    storeProviderPlan(compatible, plan);
    return compatible;
}

/** Ignore explanatory metadata only; business fields named description remain part of the API. */
function capabilityExecutionSignature(capability: CapabilityDefinition, retained?: CapabilityDefinition): string {
    const value = structuredClone(capability) as unknown as Record<string, unknown>;
    if (retained) {
        if (
            sameRetainedSensitivity(retained.input, capability.input) &&
            !firstSchemaSubsetViolation(retained.input, capability.input, "$.input")
        ) {
            value.input = structuredClone(retained.input);
        }
        if (
            capability.output.type !== "binary" &&
            sameRetainedSensitivity(retained.output, capability.output) &&
            !firstProjectedOutputViolation(capability.output, retained.output, "$.output")
        ) {
            value.output = structuredClone(retained.output);
        }
    }
    delete value.description;
    delete value.docs;
    for (const binding of value.bindings as Record<string, unknown>[]) {
        if (binding.tool && typeof binding.tool === "object") {
            delete (binding.tool as Record<string, unknown>).description;
        }
    }
    return canonicalizeIJson(schemaDocumentation(value));
}

function schemaDocumentation(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(schemaDocumentation);
    }
    if (!value || typeof value !== "object") {
        return value;
    }
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
        Object.entries(record)
            .filter(([key]) => key !== "description" || typeof record.type !== "string")
            .map(([key, child]) => [key, schemaDocumentation(child)]),
    );
}
