import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition } from "../../queries/types";
import type { ScenarioClient } from "../../../harness/clients/session";
import type { CompositionFixture } from "./fixture";

/** Negative calls are preparation evidence, never timed nominal coverage. */
export async function compositionRefusals(
    state: Pick<CompositionFixture, "tag" | "read" | "call">,
    foreign: ScenarioClient,
    secondary: ScenarioClient,
    capability: string,
    input: Readonly<Record<string, unknown>>,
    invalidBody: (capability: string, input: Readonly<Record<string, unknown>>) => Promise<void>,
) {
    const before = canonicalizeIJson(await state.read());
    const denied = await foreign("ulvia/cms.content", capability, "http", input);
    assertCondition(
        !denied.observation.validated && [401, 403].includes(denied.observation.status),
        "composition-foreign-session",
    );
    const isolated = await secondary("ulvia/cms.content", "site-blocs.identity", "http", { tag: state.tag });
    assertCondition(
        !isolated.observation.validated && isolated.observation.status === 404,
        "composition-cross-instance-visible",
    );
    await invalidBody(capability, input);
    if (["site-blocs.update", "site-blocs.delete"].includes(capability)) {
        const stale = await state.call(capability, "http", { ...input, revision: Number(input.revision) + 1 });
        assertCondition(
            !stale.observation.validated && stale.observation.status === 409,
            "composition-stale-write-accepted",
        );
        const replaced = await state.call(capability, "http", {
            ...input,
            definitionId: `foreign-${input.definitionId}`,
        });
        assertCondition(
            !replaced.observation.validated && replaced.observation.status === 409,
            "composition-foreign-identity-accepted",
        );
    }
    assertCondition(canonicalizeIJson(await state.read()) === before, "composition-refusal-mutated-state");
}
