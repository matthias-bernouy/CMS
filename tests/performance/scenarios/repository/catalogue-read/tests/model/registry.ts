import { randomUUID, createHash } from "node:crypto";
import { validateSchemaValue } from "@bernouy/ulvia-contracts/schema";
import { assertCondition } from "../../../../queries/types";
import type { CapabilityInventory } from "../../../../../capabilities/types";
import type { RegistryReadPorts, PublicResource } from "../../metadata/types";
import type { Observation } from "../../../../../harness/clients/types";

export function discoveryModel(inventory: CapabilityInventory) {
    const namespace = "performance-discovery-unit";
    const inputs: { capability: string; input: Readonly<Record<string, unknown>> }[] = [];
    const staged = new Map<unknown, PublicResource>();
    const published: (PublicResource & { publishedAt: string })[] = [];
    let stale = false;
    const observation: Observation = {
        traceId: "unit-registry",
        durationMs: 1,
        requestBytes: 1,
        responseBytes: 1,
        status: 200,
        validated: true,
        completed: true,
        streamConsumed: true,
    };
    const execute = async (capability: string, input: Readonly<Record<string, unknown>>) => {
        const definition = inventory.targets.find(
            (row) => row.release.contractId === "ulvia/repository" && row.definition.id === capability,
        )!.definition;
        validateSchemaValue(definition.input, input);
        inputs.push({ capability, input });
        if (capability === "publication-begin") {
            const uploadId = randomUUID();
            staged.set(uploadId, JSON.parse(new TextDecoder().decode(input.manifest as Uint8Array)));
            return { uploadId };
        }
        if (capability === "publication-commit") {
            const row = staged.get(input.uploadId)!;
            published.push({ ...row, publishedAt: new Date().toISOString() });
            const receipt = { kind: row.reference.kind, digest: row.reference.digest, added: true };
            validateSchemaValue(definition.output, receipt);
            return receipt;
        }
        if (capability === "namespace-get") {
            return { namespace, revision: 1, state: "active", updatedAt: "2026-11-18T00:00:00.000Z" };
        }
        if (capability === "publication-state") {
            return { revision: 0, yank: null };
        }
        const kind =
            capability === "collection-catalogue"
                ? "collection"
                : capability === "catalogue-search"
                  ? (input.kinds as string[])[0]
                  : input.kind;
        let rows = (stale ? published.slice(0, 1) : published).filter((row) => row.reference.kind === kind);
        if (capability !== "catalogue-list") {
            const latest = new Map<string, (typeof rows)[number]>();
            for (const row of rows) {
                latest.set(row.reference.id, row);
            }
            rows = [...latest.values()];
        }
        const offset = input.cursor ? Number(String(input.cursor).split("_")[1]) : 0;
        const limit = Number(input.limit);
        if (capability === "catalogue-search") {
            rows = [
                ...rows.filter((row) => row.reference.id === input.query),
                ...rows.filter((row) => row.reference.id !== input.query),
            ];
            return {
                revision: `sha256:${createHash("sha256")
                    .update(JSON.stringify(published.map((row) => row.reference)))
                    .digest("hex")}`,
                mode: "lexical",
                degraded: true,
                results: rows.slice(offset, offset + limit).map(({ reference, name, description, contractIds }) => ({
                    reference,
                    name,
                    description,
                    categories: [],
                    contractIds,
                })),
                ...(offset + limit < rows.length ? { nextCursor: `unit_${offset + limit}` } : {}),
            };
        }
        return {
            releases: rows.slice(offset, offset + limit).map((row) => ({
                ...row.reference,
                metadata: { ...row.metadata, ...(kind === "contract" ? { publishedAt: row.publishedAt } : {}) },
            })),
            ...(offset + limit < rows.length ? { nextCursor: `unit_${offset + limit}` } : {}),
        };
    };
    const fixture: RegistryReadPorts["fixture"] = async (capability, input) => execute(capability, input);
    const call: RegistryReadPorts["call"] = async (capability, _binding, input, assert = () => {}) => {
        if (
            capability === "publication-yank" ||
            (input.cursor && (input.publisherId !== namespace || String(input.query).endsWith("/missing-query")))
        ) {
            const definition = inventory.targets.find(
                (row) => row.release.contractId === "ulvia/repository" && row.definition.id === capability,
            )!.definition;
            validateSchemaValue(definition.input, input);
            return { output: undefined, observation: { ...observation, validated: false, status: 409 } };
        }
        const output = structuredClone(await execute(capability, input));
        try {
            await assert(output);
            return { output, observation };
        } catch {
            return { output, observation: { ...observation, validated: false } };
        }
    };
    const ports: RegistryReadPorts = { fixture, call, checked: execute };
    return {
        namespace,
        ports,
        inputs,
        published,
        stale() {
            stale = true;
        },
        assertInputs() {
            assertCondition(inputs.length > 0);
        },
    };
}
