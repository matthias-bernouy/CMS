import { createHash, randomUUID } from "node:crypto";
import { requireRecord } from "../../../queries/types";
import type { authoringCalls } from "../../client";
import type { AuthoringReadContext } from "../context";
import type { ScenarioClient } from "../../../../harness/clients/session";
import type { Observation } from "../../../../harness/clients/types";

/** Unit-only writer/status model; real benchmarks still use admitted network calls and persistence. */
export function sourceModel() {
    const prepared = new Map<unknown, Readonly<Record<string, unknown>>>();
    const publications = new Map<string, Readonly<Record<string, unknown>>>();
    const operations = new Map<unknown, Readonly<Record<string, unknown>>>();
    const events: string[] = [];
    let stale = false;
    let finishedBeforePrime = false;
    let statusReads = 0;
    const observation: Observation = {
        traceId: "unit-source",
        durationMs: 1,
        requestBytes: 1,
        responseBytes: 1,
        status: 200,
        validated: true,
        completed: true,
        streamConsumed: true,
    };
    const key = (kind: unknown, id: unknown, version: unknown) => `${kind}:${id}:${version}`;
    const publish = (input: Readonly<Record<string, unknown>>) => {
        const row = prepared.get(input.preparationId)!;
        const source = requireRecord(JSON.parse(String(row.sourceJson)));
        const files = source.files as { path: string; content: string }[];
        const definition = requireRecord(JSON.parse(files.find((file) => file.path === "definition.json")!.content));
        const kind = String(row.kind);
        const field = kind === "provider-manifest" ? "providerId" : `${kind}Id`;
        const output = {
            kind,
            [field]: definition[field],
            publisherId: definition.publisherId ?? requireRecord(definition.provenance).publisherId,
            version: definition.version,
            digest: row.digest,
            repositoryId: "unit-repository",
            added: true,
        };
        publications.set(key(kind, definition[field], definition.version), {
            releaseDigest: row.digest,
            sourceJson: JSON.stringify({ files, assets: [] }),
        });
        return output;
    };
    const fixture: ReturnType<typeof authoringCalls>["fixture"] = async (capability, input) => {
        events.push(capability);
        if (capability.startsWith("prepare-")) {
            const preparationId = randomUUID();
            const digest = `sha256:${createHash("sha256").update(String(input.sourceJson)).digest("hex")}`;
            prepared.set(preparationId, { sourceJson: input.sourceJson, kind: capability.slice(8), digest });
            return { valid: true, diagnostics: [], preparationId, digest };
        }
        if (capability.startsWith("publish-")) {
            return publish(input);
        }
        if (capability === "discard-preparation") {
            prepared.delete(input.preparationId);
            return { discarded: true };
        }
        if (capability === "get-publication-operation") {
            const result = operations.get(input.operationId)!;
            return {
                operationId: input.operationId,
                status: finishedBeforePrime || statusReads++ ? "succeeded" : "running",
                ...(finishedBeforePrime || statusReads > 1 ? { result } : {}),
            };
        }
        const kind =
            capability === "get-source-snapshot"
                ? input.kind
                : capability.includes("provider-manifest")
                  ? "provider-manifest"
                  : capability.includes("contract")
                    ? "contract"
                    : "collection";
        const id = input.id ?? input.providerId ?? input.contractId ?? input.collectionId;
        return stale ? null : (publications.get(key(kind, id, input.version)) ?? null);
    };
    const call: ReturnType<typeof authoringCalls>["call"] = async (
        capability,
        binding,
        input,
        assert = () => {},
        options,
    ) => {
        events.push(`read:${capability}:${binding}`);
        let output: unknown;
        if (capability === "publish-collection-operation") {
            const id = randomUUID();
            operations.set(id, publish(input));
            statusReads = 0;
            output = await options!.complete!(id, AbortSignal.timeout(5000), () => {});
        } else {
            output = await fixture(capability, input);
        }
        try {
            await assert(output);
            return { output, observation };
        } catch {
            return { output, observation: { ...observation, validated: false } };
        }
    };
    const calls = { call, fixture };
    const client: ScenarioClient = (_contract, capability, binding, input, assert, options) =>
        call(capability, binding, input, assert, options);
    const context: AuthoringReadContext = {
        main: calls,
        other: calls,
        namespace: "performance-unit-sources",
        initialize: async () => {},
        snapshot: async () => ({ connection: {}, namespaces: {} }),
        close: async () => {},
    };
    return {
        calls,
        client,
        context,
        events,
        prepared,
        publications,
        stale() {
            stale = true;
        },
        finishBeforePrime() {
            finishedBeforePrime = true;
        },
    };
}
