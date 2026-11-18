import { expect, test } from "bun:test";
import {
    InMemoryContentRepository,
    ValidatingContentRepository,
    createCmsSiteBloc,
    publishCmsSiteBloc,
    readCmsSiteBloc,
    updateCmsSiteBloc,
} from "@bernouy/content";
import { inventoryFixture } from "../../../fixtures/inventory";
import { largeSnapshot } from "./oracle";
import { compositionRefusals } from "./refusals";
import type { ScenarioClient } from "../../../harness/clients/session";

test("large read fixtures save a valid expanded draft while preserving their independently published anchor", async () => {
    const repo = new ValidatingContentRepository(new InMemoryContentRepository());
    const created = await createCmsSiteBloc(repo, {
        tag: "site-performance-expanded",
        name: "Original",
        group: "Performance",
        content: "<section><p>Original composition text é</p></section>",
    });
    await publishCmsSiteBloc(repo, { tag: created.tag, revision: created.draftRevision });
    const before = await readCmsSiteBloc(repo, { tag: created.tag });
    const expanded = largeSnapshot(before.draftJson);
    expect(Buffer.byteLength(expanded)).toBeGreaterThan(64 * 1024);
    expect(JSON.parse(expanded).structure).toHaveLength(512);
    await updateCmsSiteBloc(repo, {
        tag: created.tag,
        revision: before.draftRevision,
        definitionId: before.definitionId,
        draftJson: expanded,
    });
    const after = await readCmsSiteBloc(repo, { tag: created.tag });
    expect(after.draftRevision).toBe(before.draftRevision + 1);
    expect(after.publishedRevision).toBe(before.publishedRevision);
    expect(after.publishedJson).toBe(before.publishedJson);
    expect(after.draftJson).toBe(expanded);
});

test("malformed composition probes bypass the validating nominal client and retain unchanged-state checks", async () => {
    const fixture = await inventoryFixture();
    let document = { tag: "site-owned", draftRevision: 7, name: "Before" };
    let rawProbes = 0;
    const calls: Readonly<Record<string, unknown>>[] = [];
    const refused = (status: number) => ({
        observation: { ...fixture.measurement, validated: false, status },
        output: undefined,
    });
    const foreign: ScenarioClient = async () => refused(401);
    const secondary: ScenarioClient = async () => refused(404);
    const state = {
        tag: "site-owned",
        read: async () => document,
        call: async (_id: string, _binding: string, input: Readonly<Record<string, unknown>>) => {
            expect(Object.hasOwn(input, "unexpectedPerformanceField")).toBe(false);
            calls.push(input);
            return refused(409);
        },
    };
    const input = { tag: state.tag, revision: 7, definitionId: "owned", draftJson: "{}" };
    await compositionRefusals(state, foreign, secondary, "site-blocs.update", input, async (capability, valid) => {
        expect(capability).toBe("site-blocs.update");
        expect(valid).toEqual(input);
        rawProbes++;
    });
    expect(rawProbes).toBe(1);
    expect(calls.map((row) => row.revision)).toEqual([8, 7]);
    await expect(
        compositionRefusals(state, foreign, secondary, "site-blocs.update", input, async () => {
            document = { ...document, name: "Unexpected mutation" };
        }),
    ).rejects.toThrow("composition-refusal-mutated-state");
});
