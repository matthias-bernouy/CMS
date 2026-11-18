import { expect } from "bun:test";
import { requireRecord } from "../../../queries/types";
import { unitExampleOutput, unitExampleResource } from "./reader";
import type { ExampleResource } from "../resource/publish";
import type { ExamplePorts } from "../state";
import type { ScenarioClient } from "../../../../harness/clients/session";
import type { Observation } from "../../../../harness/clients/types";

export function exampleModel(base: ExampleResource, observation: Observation) {
    const candidates = Array.from({ length: 11 }, (_, patch) => unitExampleResource(base, patch));
    const unrelated = { collectionId: "other/fixture", version: "1.0.0", digest: `sha256:${"f".repeat(64)}` };
    let current: ExampleResource | undefined;
    let revision = 1;
    let receipt: Readonly<Record<string, unknown>> | undefined;
    let stale = false;
    let polls = 0;
    const events: string[] = [];
    const refused = (status: number) => ({
        output: undefined,
        observation: { ...observation, validated: false, status },
    });
    const items = () => [
        unrelated,
        ...(current ? [{ collectionId: current.id, version: current.version, digest: current.digest }] : []),
    ];
    const client: ScenarioClient = async (contract, capability, _binding, input, assert = () => {}, options = {}) => {
        events.push(capability);
        if (options.httpCredentials) {
            return refused(401);
        }
        let output: unknown;
        if (contract === "ulvia/cms.content") {
            if (
                !current ||
                input.collectionId !== current.id ||
                input.locale === "not_a_locale" ||
                input.cursor === "00" ||
                (input.cursor !== undefined && input.offset !== undefined)
            ) {
                return refused(422);
            }
            output = unitExampleOutput(stale ? candidates[0]! : current, revision, capability, input);
        } else if (capability === "list-collection-catalogue") {
            output = { releases: [{ repositoryId: "repository-fixture" }] };
        } else if (capability === "get-collection-release") {
            output = { digest: input.digest, browserRiskDigest: `sha256:${"a".repeat(64)}` };
        } else if (capability === "list-collection-installations") {
            output = { revision, items: items() };
        } else if (capability === "get-collection-details") {
            output = { revision, collectionId: current!.id, version: current!.version, digest: current!.digest };
        } else if (capability === "install-collection") {
            expect(input.expectedRevision).toBe(revision);
            const target = requireRecord((input.targets as unknown[])[0]);
            current = candidates.find((candidate) => candidate.digest === target.digest)!;
            expect(current).toBeDefined();
            revision++;
            output = { revision, items: items() };
        } else if (capability === "plan-collection-upgrade") {
            output = {
                status: "applicable",
                expectedRevision: revision,
                issueCount: 0,
                issues: [],
                references: input.targets,
                source: [{ collectionId: current!.id, version: current!.version, digest: current!.digest }],
                planDigest: `sha256:${"b".repeat(64)}`,
            };
        } else if (capability === "apply-collection-upgrade") {
            expect(input.planDigest).toBe(`sha256:${"b".repeat(64)}`);
            expect(typeof options.idempotencyKey).toBe("string");
            expect(options.complete).toBeDefined();
            const target = requireRecord((input.targets as unknown[])[0]);
            current = candidates.find((candidate) => candidate.digest === target.digest)!;
            revision++;
            receipt = {
                status: "completed",
                collectionRevision: revision,
                upgradeId: `sha256:${revision.toString(16).padStart(64, "0")}`,
            };
            output = await options.complete!("owned-operation", AbortSignal.timeout(5000), () => {
                polls++;
            });
        } else if (capability === "get-operation") {
            output = { operationId: input.operationId, status: "succeeded", result: receipt };
        } else {
            expect(capability).toBe("get-collection-upgrade");
            expect(input.upgradeId).toBe(receipt!.upgradeId);
            output = receipt;
        }
        const copy = structuredClone(output);
        await assert(copy);
        return { output: copy, observation };
    };
    const ports: ExamplePorts = {
        client,
        prepare: async () => {},
        fixture: async (capability, input = {}, contract = "ulvia/cms.installations") =>
            requireRecord((await client(contract, capability, "http", input)).output),
    };
    return {
        ports,
        events,
        candidates,
        unrelated,
        polls: () => polls,
        stale: () => {
            stale = true;
        },
    };
}
