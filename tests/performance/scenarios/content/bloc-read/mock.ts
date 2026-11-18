import { expect } from "bun:test";
import type { ScenarioClient } from "../../../harness/clients/session";
import type { Observation } from "../../../harness/clients/types";

export function blocMock(observation: Observation) {
    const rows = new Map<string, Readonly<Record<string, unknown>>>();
    const events: string[] = [];
    let loseCreate = false;
    const client: ScenarioClient = async (_contract, capability, _binding, input, assert = () => {}) => {
        events.push(capability);
        const tag = String(input.tag);
        const before = rows.get(tag);
        let output: unknown;
        if (capability === "site-blocs.create") {
            output = {
                tag,
                name: input.name,
                group: input.group,
                description: input.description,
                lifecycle: "active",
                draftRevision: 1,
                publishedRevision: null,
                createdAt: "2026-11-18T00:00:00.000Z",
                updatedAt: "2026-11-18T00:00:00.000Z",
            };
            rows.set(tag, output as Readonly<Record<string, unknown>>);
            if (loseCreate) {
                loseCreate = false;
                throw Error("Owned create response lost");
            }
        } else if (["site-blocs.publish", "site-blocs.archive"].includes(capability)) {
            expect(before).toBeDefined();
            if (input.revision !== before!.draftRevision) {
                return { output: undefined, observation: { ...observation, validated: false, status: 409 } };
            }
            output = {
                ...before,
                updatedAt: "2026-11-18T00:00:01.000Z",
                ...(capability === "site-blocs.publish"
                    ? { publishedRevision: before!.draftRevision }
                    : { lifecycle: "archived" }),
            };
            rows.set(tag, output as Readonly<Record<string, unknown>>);
        } else if (capability === "site-blocs.get") {
            output = before;
            if (!output) {
                return { output: undefined, observation: { ...observation, validated: false, status: 404 } };
            }
        } else if (capability === "site-blocs.list") {
            output = {
                items: [...rows.values()].sort(
                    (a, b) =>
                        String(a.name).localeCompare(String(b.name)) || String(a.tag).localeCompare(String(b.tag)),
                ),
            };
        } else {
            expect(capability).toBe("pages.editor-catalogue");
            output = {
                items: [...rows.values()]
                    .filter((row) => row.publishedRevision !== null)
                    .map((row) => ({
                        id: row.tag,
                        name: row.name,
                        group: row.group,
                        description: row.description,
                        kind: "composition",
                        ownership: "site-builder",
                        order: 0,
                        defaultContent: "",
                        authoringJson: '{"root":{"accepts":["div"]},"settings":[],"slots":{}}',
                    }))
                    .sort(
                        (a, b) =>
                            String(a.group).localeCompare(String(b.group)) ||
                            String(a.name).localeCompare(String(b.name)) ||
                            String(a.id).localeCompare(String(b.id)),
                    ),
            };
        }
        const copy = structuredClone(output);
        await assert(copy);
        return { output: copy, observation };
    };
    return {
        client,
        rows,
        events,
        loseCreate: () => {
            loseCreate = true;
        },
    };
}
