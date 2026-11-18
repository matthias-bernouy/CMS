import { randomUUID } from "node:crypto";
import { assertCondition, requireRecord } from "../../queries/types";
import { compositionFixture } from "./fixture";
import { assertComposition } from "./oracle";
import { compositionRefusals } from "./refusals";
import type { ScenarioClient } from "../../../harness/clients/session";
import type { PreparedSample } from "../../../harness/execution/samples";

export async function prepareComposition(
    client: ScenarioClient,
    foreign: ScenarioClient,
    secondary: ScenarioClient,
    capability: string,
    binding: string,
    variant: string,
    invalidBody: (capability: string, input: Readonly<Record<string, unknown>>) => Promise<void>,
): Promise<PreparedSample> {
    const state = compositionFixture(client);
    try {
        let before = await state.initialize(variant);
        if (variant === "invalidation") {
            const primed = await state.call(capability, binding, { tag: state.tag }, (value) =>
                assertComposition(value, before, capability === "site-blocs.identity"),
            );
            assertCondition(primed.observation.validated, "composition-prime-failed");
            await state.fixture("site-blocs.update", state.updateInput(before, `Invalidated ${randomUUID()}`));
            before = await state.read();
        }
        const change = state.updateInput(before, `Edited ${randomUUID()}`);
        const input =
            capability === "site-blocs.update"
                ? change
                : capability === "site-blocs.delete"
                  ? { tag: state.tag, revision: before.draftRevision, definitionId: before.definitionId }
                  : { tag: state.tag };
        await compositionRefusals(state, foreign, secondary, capability, input, invalidBody);
        const expected =
            capability === "site-blocs.update"
                ? {
                      ...before,
                      name: JSON.parse(change.draftJson).name,
                      draftRevision: Number(before.draftRevision) + 1,
                      draftJson: change.draftJson,
                  }
                : before;
        return {
            async send() {
                return (
                    await state.call(capability, binding, input, (value) => {
                        const out = requireRecord(value);
                        if (capability === "site-blocs.delete") {
                            assertCondition(
                                out.tag === state.tag && out.deleted === true,
                                "composition-delete-receipt",
                            );
                        } else if (capability === "site-blocs.update") {
                            assertCondition(
                                out.tag === state.tag &&
                                    out.name === expected.name &&
                                    out.draftRevision === expected.draftRevision &&
                                    out.publishedRevision === before.publishedRevision,
                                "composition-update-receipt",
                            );
                        } else {
                            assertComposition(out, expected, capability === "site-blocs.identity");
                        }
                    })
                ).observation;
            },
            async verify() {
                if (capability === "site-blocs.delete") {
                    const absent = await state.call("site-blocs.identity", "http", { tag: state.tag });
                    assertCondition(
                        !absent.observation.validated && absent.observation.status === 404,
                        "composition-delete-not-persisted",
                    );
                    const catalogue = await state.fixture("site-blocs.list", {});
                    assertCondition(
                        Array.isArray(catalogue.items) &&
                            catalogue.items.every((row) => requireRecord(row).tag !== state.tag),
                        "composition-delete-catalogue-stale",
                    );
                } else {
                    assertComposition(await state.read(), expected);
                }
            },
            close: state.close,
        };
    } catch (error) {
        await state.close();
        throw error;
    }
}
