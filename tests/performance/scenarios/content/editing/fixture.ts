import { randomUUID } from "node:crypto";
import { ClientFailure } from "../../../harness/clients/failure";
import { assertCondition, requireRecord } from "../../queries/types";
import { editedSnapshot, largeSnapshot } from "./oracle";
import type { ScenarioClient } from "../../../harness/clients/session";

export function compositionFixture(client: ScenarioClient) {
    const tag = `site-edit-performance-${randomUUID()}`;
    let created = false;
    const call = (
        capability: string,
        binding: string,
        input: Readonly<Record<string, unknown>>,
        assert?: (output: unknown) => void,
    ) => client("ulvia/cms.content", capability, binding, input, assert);
    const fixture = async (capability: string, input: Readonly<Record<string, unknown>>) => {
        const result = await call(capability, "http", input);
        if (!result.observation.validated) {
            throw new ClientFailure(`composition-fixture-${capability}-${result.observation.failure ?? "invalid"}`);
        }
        return requireRecord(result.output);
    };
    const read = () => fixture("site-blocs.read", { tag });
    const updateInput = (document: Readonly<Record<string, unknown>>, marker: string) => ({
        tag,
        revision: document.draftRevision,
        definitionId: document.definitionId,
        draftJson: editedSnapshot(document.draftJson, marker),
    });
    return {
        tag,
        call,
        fixture,
        read,
        updateInput,
        async initialize(variant: string) {
            await fixture("site-blocs.create", {
                tag,
                name: "Original composition",
                group: "Performance editing",
                content: "<section><p>Original composition text é</p></section>",
            });
            created = true;
            const initial = await read();
            await fixture("site-blocs.publish", { tag, revision: initial.draftRevision });
            if (variant === "large") {
                await fixture("site-blocs.update", {
                    tag,
                    revision: initial.draftRevision,
                    definitionId: initial.definitionId,
                    draftJson: largeSnapshot(initial.draftJson),
                });
            }
            if (variant === "history") {
                for (let index = 0; index < 8; index++) {
                    await fixture("site-blocs.update", updateInput(await read(), `Historical draft ${index}`));
                }
            }
            const document = await read();
            assertCondition(
                document.tag === tag &&
                    typeof document.definitionId === "string" &&
                    typeof document.publishedJson === "string",
                "composition-initial-state",
            );
            return document;
        },
        async close() {
            if (!created) {
                return;
            }
            const found = await call("site-blocs.get", "http", { tag });
            if (!found.observation.validated && found.observation.status === 404) {
                return;
            }
            assertCondition(found.observation.validated, "composition-cleanup-read-failed");
            const current = requireRecord(found.output);
            if (current.lifecycle !== "archived") {
                await fixture("site-blocs.archive", { tag, revision: current.draftRevision });
            }
        },
    };
}

export type CompositionFixture = ReturnType<typeof compositionFixture>;
