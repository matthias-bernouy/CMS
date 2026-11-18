import { expect } from "bun:test";
import { requireRecord } from "../../queries/types";
import type { PageClient } from "../client";
import type { Observation } from "../../../harness/clients/types";

export function pageMock(observation: Observation) {
    const pages = new Map<string, Readonly<Record<string, unknown>>>();
    const routes = new Map<string, string>();
    const events: string[] = [];
    let sequence = 0;
    let failCreate = false;
    let failUpdate = false;
    const client: PageClient = async (capability, _binding, input, assert = () => {}) => {
        events.push(capability);
        let output: Readonly<Record<string, unknown>>;
        if (capability === "pages.create") {
            const id = `owned-${++sequence}`;
            output = { id, revision: 0, description: "", content: "", ...input };
            pages.set(id, output);
            routes.set(String(input.path), id);
            if (failCreate) {
                failCreate = false;
                throw Error("Create response lost after the owned write");
            }
        } else if (capability === "pages.list") {
            const items = [...pages.values()].filter((page) => String(page.title).includes(String(input.query ?? "")));
            output = { items: items.slice(0, Number(input.limit)), nextCursor: null };
        } else if (capability === "localization.get") {
            output = { language: "en" };
        } else {
            const id = String(input.id);
            const before = pages.get(id);
            expect(before).toBeDefined();
            if (capability === "pages.get") {
                output = before!;
            } else {
                expect(input.expectedRevision).toBe(before!.revision);
                if (capability === "pages.delete") {
                    pages.delete(id);
                    for (const [path, owner] of routes) {
                        if (owner === id) {
                            routes.set(path, "gone");
                        }
                    }
                    output = { id, deleted: true };
                } else {
                    const { expectedRevision, ...changes } = input;
                    output = { ...before, ...changes, revision: Number(expectedRevision) + 1 };
                    pages.set(id, output);
                    if (capability === "pages.update-route") {
                        routes.set(String(input.path), id);
                    }
                    if (failUpdate) {
                        failUpdate = false;
                        return { output: undefined, observation: { ...observation, validated: false, status: 503 } };
                    }
                }
            }
        }
        const copy = structuredClone(requireRecord(output));
        assert(copy);
        return { output: copy, observation };
    };
    return {
        client,
        pages,
        routes,
        events,
        loseCreate: () => {
            failCreate = true;
        },
        loseUpdate: () => {
            failUpdate = true;
        },
    };
}
