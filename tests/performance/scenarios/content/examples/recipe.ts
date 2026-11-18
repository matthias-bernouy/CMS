import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition } from "../../queries/types";
import { exampleDocumentOracle, exampleListOracle } from "./oracle";
import type { ExampleReadState } from "./state";
import type { PreparedSample } from "../../../harness/execution/samples";
import type { ScenarioClient } from "../../../harness/clients/session";

const CONTRACT = "ulvia/cms.content";
export async function prepareExampleRead(
    state: ExampleReadState,
    capability: string,
    binding: string,
    invalidation: boolean,
    index: number,
    other: ScenarioClient,
    foreignCookie: string,
    invalid: (input: Readonly<Record<string, unknown>>) => Promise<void>,
): Promise<PreparedSample> {
    await state.prepare();
    const locale = index % 2 ? "fr" : "en";
    const offset = (index % 5) * 16;
    const input =
        capability === "examples.get"
            ? { collectionId: state.current.id, exampleId: "example-000" }
            : { collectionId: state.current.id, locale, limit: 16, ...(offset ? { cursor: String(offset) } : {}) };
    const oracle = () =>
        capability === "examples.get"
            ? exampleDocumentOracle(state.current, "example-000")
            : exampleListOracle(state.current, state.revision, locale, offset);
    if (invalidation) {
        const primed = await state.client(CONTRACT, capability, binding, input, oracle());
        assertCondition(primed.observation.validated, "example-reader-prime-failed");
        await state.advance(index + 1);
    }
    return {
        async send() {
            return (await state.client(CONTRACT, capability, binding, input, oracle())).observation;
        },
        async verify() {
            const before = canonicalizeIJson(await state.snapshot());
            for (const selected of ["en", "fr"]) {
                const examples = state.current.release.examples!;
                for (let start = 0; start <= examples.length; start += 16) {
                    const page = await state.client(
                        CONTRACT,
                        "examples.list",
                        binding,
                        {
                            collectionId: state.current.id,
                            locale: selected,
                            limit: 16,
                            ...(start ? { cursor: String(start) } : {}),
                        },
                        exampleListOracle(state.current, state.revision, selected, start),
                    );
                    assertCondition(page.observation.validated, "example-full-pagination");
                }
                const exhausted = await state.client(
                    CONTRACT,
                    "examples.list",
                    binding,
                    { collectionId: state.current.id, locale: selected, limit: 16, cursor: String(examples.length) },
                    exampleListOracle(state.current, state.revision, selected, examples.length),
                );
                assertCondition(exhausted.observation.validated, "example-exhausted-cursor");
            }
            const document = await state.client(
                CONTRACT,
                "examples.get",
                "http",
                { collectionId: state.current.id, exampleId: "example-000" },
                exampleDocumentOracle(state.current, "example-000"),
            );
            assertCondition(document.observation.validated, "example-current-document");
            const denied = await state.client(CONTRACT, capability, "http", input, undefined, {
                httpCredentials: { cookie: foreignCookie },
            });
            assertCondition(
                !denied.observation.validated && [401, 403].includes(denied.observation.status),
                "example-foreign-session",
            );
            const absent = await other(CONTRACT, capability, "http", input);
            assertCondition(
                !absent.observation.validated && absent.observation.status === 422,
                "example-cross-instance-collection",
            );
            await invalid(input);
            for (const bad of [{ locale: "not_a_locale" }, { cursor: "00" }, { cursor: "16", offset: 16 }]) {
                const refused = await state.client(CONTRACT, "examples.list", "http", {
                    collectionId: state.current.id,
                    locale: "en",
                    ...bad,
                });
                assertCondition(
                    !refused.observation.validated && refused.observation.status === 422,
                    "example-invalid-pagination-or-locale",
                );
            }
            assertCondition(canonicalizeIJson(await state.snapshot()) === before, "example-refusal-mutated-state");
        },
    };
}
