import { scenarioClient } from "../../harness/clients/session";
import { ClientFailure } from "../../harness/clients/failure";
import { expectBodyRefusal } from "../../harness/clients/refusal";
import { assertCondition, requireRecord } from "../queries/types";
import type { CapabilityInventory } from "../../capabilities/types";
import type { QueryEnvironment } from "../queries/execute";

export function readerContext(inventory: CapabilityInventory, environment: QueryEnvironment) {
    const client = scenarioClient(inventory, environment.main);
    const registry = scenarioClient(inventory, { ...environment.registry, token: "", tools: [] });
    const call = (
        capability: string,
        binding: string,
        input: Readonly<Record<string, unknown>>,
        assert?: Parameters<typeof client>[4],
    ) => client("ulvia/cms.installations", capability, binding, input, assert);
    const checked = async (capability: string, input: Readonly<Record<string, unknown>> = {}) => {
        const result = await call(capability, "http", input);
        if (!result.observation.validated) {
            throw new ClientFailure(`reader-fixture-${capability}-${result.observation.failure ?? "invalid"}`);
        }
        return requireRecord(result.output);
    };
    const refused = async (capability: string, input: Readonly<Record<string, unknown>>, statuses: number[]) => {
        const result = await call(capability, "http", input);
        assertCondition(
            !result.observation.validated && statuses.includes(result.observation.status),
            `reader-refusal-http-status-${result.observation.status}`,
        );
    };
    const collection = async () => {
        const available = await checked("list-available-collections");
        assertCondition(Array.isArray(available.releases));
        const release = available.releases
            .map(requireRecord)
            .find((row) => row.collectionId === "ulvia.test/smoke-kit");
        assertCondition(release);
        const scope = {
            repositoryId: release.repositoryId,
            publisherId: release.publisherId,
            collectionId: release.collectionId,
        };
        const pin = { ...scope, version: release.version, digest: release.digest };
        const reference = {
            kind: "collection",
            publisherId: pin.publisherId,
            id: pin.collectionId,
            version: pin.version,
            digest: pin.digest,
        };
        return { release, scope, pin, reference };
    };
    const provider = async () => {
        const installed = await checked("list-provider-installations");
        assertCondition(Array.isArray(installed.installations) && Array.isArray(installed.selections));
        const selections = installed.selections.map(requireRecord);
        const selected = selections.find((row) => row.contractId === "ulvia/cms.content");
        assertCondition(selected);
        const entry = installed.installations.map(requireRecord).find((row) => row.id === selected.installationId);
        assertCondition(entry && entry.status === "enabled");
        return { entry, selections: selections.filter((row) => row.installationId === entry.id) };
    };
    const invalid = (
        capability: string,
        valid: Readonly<Record<string, unknown>>,
        refused: Readonly<Record<string, unknown>>,
    ) => expectBodyRefusal(inventory, environment.main, "ulvia/cms.installations", capability, valid, refused, 400);
    return { call, checked, refused, collection, provider, registry, invalid };
}

export type ReaderContext = ReturnType<typeof readerContext>;
