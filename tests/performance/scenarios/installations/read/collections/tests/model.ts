import { createHash, randomUUID } from "node:crypto";
import { validateSchemaValue } from "@bernouy/ulvia-contracts/schema";
import { collectionReadResource } from "../resources/collection";
import { collectionReadState } from "../context/state";
import { installedCollectionRow, installedCollectionDetail } from "../resources/expected";
import { requireRecord } from "../../../../queries/types";
import { collectionRows, collectionRow } from "../read/metadata";
import type { CapabilityInventory } from "../../../../../capabilities/types";
import type { ScenarioClient } from "../../../../../harness/clients/session";
import type { Observation } from "../../../../../harness/clients/types";
import type { CollectionCorpusRegistry } from "../context/types";
import type { CollectionReadState } from "../context/types";
import type { CollectionReadResource } from "../resources/collection";
import type { FreshTenant } from "../../../fresh";

/** Unit-only scheduling/DTO model: these aliases are never admitted, sent over the network or counted as measurements. */
export async function collectionStateModel(inventory: CapabilityInventory) {
    const implementation = inventory.targets.find((row) => row.release.contractId === "ulvia/cms.content")!.release;
    const base = await collectionReadResource("performance-read-unit", implementation, 0, 0, false);
    const create = async (index: number, patch: number): Promise<CollectionReadResource> => ({
        ...base,
        index,
        patch,
        id: `${base.namespace}/unit-${index}`,
        version: `1.0.${patch}`,
        digest: `sha256:${createHash("sha256").update(`${index}:${patch}`).digest("hex")}` as CollectionReadResource["digest"],
    });
    const registry: CollectionCorpusRegistry = {
        origin: "http://registry.localhost",
        resources: [],
        calls: {
            call: async () => {
                throw new Error("Unit model has no Registry transport");
            },
            fixture: async () => {
                throw new Error("Unit model has no Registry transport");
            },
            checked: async () => {
                throw new Error("Unit model has no Registry transport");
            },
        },
        claim: async () => ({ namespace: base.namespace, revision: 1 }),
        publish: async (resource) => {
            registry.resources.push(resource);
        },
        close: async () => {},
    };
    const observation: Observation = {
        traceId: "unit-only",
        durationMs: 1,
        requestBytes: 1,
        responseBytes: 1,
        status: 200,
        validated: true,
        completed: true,
        streamConsumed: true,
    };
    const calls: string[] = [];
    const requests: { capability: string; input: Readonly<Record<string, unknown>> }[] = [];
    let state: CollectionReadState;
    const installed = new Map<string, CollectionReadResource>();
    const operations = new Map<string, Readonly<Record<string, unknown>>>();
    const upgrades = new Map<string, Readonly<Record<string, unknown>>>();
    const source = "unit-source";
    let revision = 0;
    let title = "Default";
    const rows = () => [...installed.values()].map((resource) => installedCollectionRow(resource, source));
    const client: ScenarioClient = async (_contract, capability, _binding, input, assert, options) => {
        const target = inventory.targets.find(
            (row) =>
                !row.retained &&
                row.release.contractId === "ulvia/cms.installations" &&
                row.definition.id === capability,
        )!;
        validateSchemaValue(target.definition.input, input);
        calls.push(capability);
        requests.push({ capability, input });
        let output: unknown;
        if (capability === "install-collections") {
            if (input.expectedRevision !== revision) {
                throw new Error("Unit stale install revision");
            }
            for (const pin of input.targets as readonly { collectionId: string; version: string }[]) {
                installed.set(
                    pin.collectionId,
                    registry.resources.find(
                        (resource) => resource.id === pin.collectionId && resource.version === pin.version,
                    )!,
                );
            }
            output = { revision: ++revision, items: rows() };
        } else if (capability === "update-collection-configuration") {
            if (input.expectedRevision !== revision) {
                throw new Error("Unit stale configuration revision");
            }
            title = JSON.parse(String(input.configurationJson)).title;
            output = { revision: ++revision, items: rows() };
        } else if (capability === "plan-collection-upgrade") {
            output = {
                expectedRevision: revision,
                planDigest: `sha256:${"b".repeat(64)}`,
                status: "applicable",
                issueCount: 0,
                issues: [],
                resources: [],
                resourceCount: 0,
                references: input.targets,
                source: [...installed.values()].map((resource) => ({
                    collectionId: resource.id,
                    version: resource.version,
                    digest: resource.digest,
                })),
                usageDigest: `sha256:${"c".repeat(64)}`,
            };
        } else if (capability === "apply-collection-upgrade") {
            const pin = (input.targets as readonly { collectionId: string; version: string }[])[0]!;
            installed.set(
                pin.collectionId,
                registry.resources.find(
                    (resource) => resource.id === pin.collectionId && resource.version === pin.version,
                )!,
            );
            const upgradeId = `sha256:${createHash("sha256").update(String(revision)).digest("hex")}`;
            const result = { upgradeId, status: "completed", collectionRevision: ++revision };
            const operationId = randomUUID();
            const time = new Date().toISOString();
            operations.set(operationId, {
                operationId,
                capabilityId: capability,
                status: "succeeded",
                revision: 1,
                createdAt: time,
                updatedAt: time,
                result,
            });
            upgrades.set(upgradeId, result);
            if (!options?.complete) {
                throw new Error("Unit fixture omitted async completion");
            }
            output = await options.complete(operationId, AbortSignal.timeout(1000), () => {});
        } else if (capability === "get-operation") {
            output = operations.get(String(input.operationId));
        } else if (capability === "get-collection-upgrade") {
            output = upgrades.get(String(input.upgradeId));
        } else if (capability === "get-collection-details") {
            output = installedCollectionDetail(installed.get(String(input.collectionId))!, source, revision, title);
        } else if (capability === "list-collection-installations") {
            output = { revision, items: rows() };
        } else if (capability === "list-collection-releases" || capability === "list-collection-catalogue") {
            const history = capability === "list-collection-releases";
            const records = collectionRows(state, history);
            const offset = input.cursor ? Number(String(input.cursor).split("-").at(-1)) : 0;
            const limit = Number(input.limit);
            output = {
                revision,
                channel: "stable",
                releases: records
                    .slice(offset, offset + limit)
                    .map((resource) => collectionRow(state, resource, !history)),
                nextCursor: offset + limit < records.length ? `unit-${offset + limit}` : "",
                ...(history
                    ? { repositoryId: source, publisherId: base.namespace, collectionId: state.resources[0]!.id }
                    : {}),
            };
        } else {
            throw new Error("Unexpected unit capability");
        }
        validateSchemaValue(target.definition.output, output);
        await assert?.(output);
        return { output, observation };
    };
    const tenant: FreshTenant = {
        site: {
            instanceId: `instance:${randomUUID()}`,
            url: "http://unit.localhost",
            administrator: { email: "unit@performance.test", password: "unit-only" },
        },
        session: { origin: "http://unit.localhost", subjectId: "unit", cookie: "unit", token: "", tools: [] },
        client,
        fixture: async (capability, input = {}) =>
            requireRecord((await client("ulvia/cms.installations", capability, "http", input)).output),
        prepare: async () => {},
        close: async () => {},
        invalid: async () => {
            throw new Error("No unit negative transport");
        },
    };
    state = collectionReadState({
        tenant,
        registry,
        repositoryId: source,
        namespace: base.namespace,
        namespaceRevision: 1,
        revision,
        create,
    });
    return { state, calls, requests, create, base };
}
