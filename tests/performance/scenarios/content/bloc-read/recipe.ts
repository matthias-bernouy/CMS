import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition } from "../../queries/types";
import { assertBlocRead } from "./oracle";
import type { BlocReadDataset } from "./dataset";
import type { ScenarioClient } from "../../../harness/clients/session";
import type { PreparedSample } from "../../../harness/execution/samples";

export async function prepareBlocRead(
    dataset: BlocReadDataset,
    capability: string,
    binding: string,
    variant: string,
    index: number,
    foreign: ScenarioClient,
    invalid: (tag: string, revision: unknown) => Promise<void>,
): Promise<PreparedSample> {
    let anchor = dataset.rows().find((row) => row.lifecycle === "active");
    if (variant === "invalidation") {
        anchor = await dataset.create(`sample-${String(index).padStart(3, "0")}`);
        const tag = String(anchor.tag);
        const primed = await dataset.call(
            capability,
            binding,
            capability === "site-blocs.get" ? { tag } : {},
            (output) => assertBlocRead(capability, output, dataset.rows(), dataset.marker, tag),
        );
        assertCondition(primed.observation.validated, "bloc-read-prime-failed");
        await dataset.publish(tag);
    }
    assertCondition(anchor && typeof anchor.tag === "string", "bloc-read-anchor-missing");
    const tag = anchor.tag;
    const rows = dataset.rows();
    const expected = rows.find((row) => row.tag === tag)!;
    const input = capability === "site-blocs.get" ? { tag } : {};
    return {
        async send() {
            return (
                await dataset.call(capability, binding, input, (output) =>
                    assertBlocRead(capability, output, rows, dataset.marker, tag),
                )
            ).observation;
        },
        async verify() {
            const before = canonicalizeIJson(await dataset.fixture("site-blocs.get", { tag }));
            assertCondition(before === canonicalizeIJson(expected), "bloc-read-stored-receipt");
            const denied = await foreign("ulvia/cms.content", capability, "http", input);
            assertCondition(
                !denied.observation.validated && [401, 403].includes(denied.observation.status),
                "bloc-read-foreign-session",
            );
            await invalid(tag, expected.draftRevision);
            const stale = await dataset.call("site-blocs.publish", "http", {
                tag,
                revision: Number(expected.draftRevision) + 1,
            });
            assertCondition(
                !stale.observation.validated && stale.observation.status === 409,
                "bloc-read-stale-publication",
            );
            const after = await dataset.fixture("site-blocs.get", { tag });
            assertCondition(canonicalizeIJson(after) === before, "bloc-read-refusal-mutated-state");
            assertBlocRead(capability, await dataset.fixture(capability, input), rows, dataset.marker, tag);
        },
    };
}
