import { assertCondition } from "../../../../../queries/types";
import { nextCollectionReadCoordinate } from "../../resources/collection";
import { consumerReferences, expectedUsage } from "./expected";
import type { UsagePage } from "./expected";
import type { collectionReadContexts } from "../../context";
import type { CapabilityInventory } from "../../../../../../capabilities/types";
import type { QueryEnvironment } from "../../../../../queries/execute";

export function usageReadContexts(inventory: CapabilityInventory, contexts: ReturnType<typeof collectionReadContexts>) {
    const consumers = consumerReferences(inventory);
    const values = new WeakMap<Awaited<ReturnType<typeof contexts>>, Promise<UsageReadContext>>();
    return async (environment: QueryEnvironment, profile: string) => {
        const state = await contexts(environment, profile);
        let pending = values.get(state);
        if (!pending) {
            pending = (async () => {
                if (
                    profile === "invalidation" &&
                    [...state.installed.values()].flatMap(({ release }) => release.blocs).length < 2
                ) {
                    const coordinate = nextCollectionReadCoordinate(state.resources, true);
                    const resource = await state.create(coordinate.index, coordinate.patch);
                    await state.publish(resource);
                    await state.install([resource]);
                }
                const tags = [...state.installed.values()]
                    .flatMap(({ release }) => release.blocs.map((bloc) => bloc.id))
                    .toSorted();
                assertCondition(new Set(tags).size === tags.length, "usage-read-unique-installed-tags");
                const count =
                    profile === "invalidation" ? Math.min(16, Math.floor(tags.length / 2)) : Math.min(16, tags.length);
                assertCondition(count >= 1 && (profile !== "large" || count === 16), "usage-read-real-page-complexity");
                const pages: UsagePage[] = [];
                const pageCount = profile === "invalidation" ? 1 : 16;
                const content = (selected: readonly string[]) =>
                    selected
                        .map((id) => `<div cms-bloc="${id}"><p slot="body">Usage performance fixture</p></div>`)
                        .join("");
                const write = async (index: number, selected: readonly string[]) => {
                    assertCondition(
                        index >= 0 && index < pageCount && new Set(selected).size === count,
                        "usage-read-page-bound",
                    );
                    const previous = pages[index];
                    const path = `/performance-usage-${profile}-${index}`;
                    const input = previous
                        ? { id: previous.id, expectedRevision: previous.revision, content: content(selected) }
                        : { path, title: "Usage performance", content: content(selected) };
                    const edited = await state.tenant.fixture(
                        previous ? "pages.update" : "pages.create",
                        input,
                        "ulvia/cms.content",
                    );
                    assertCondition(
                        typeof edited.id === "string" &&
                            Number.isSafeInteger(edited.revision) &&
                            (!previous || edited.id === previous.id),
                        "usage-read-authored-page",
                    );
                    const published = await state.tenant.fixture(
                        "pages.publish",
                        { id: edited.id, expectedRevision: edited.revision, visible: true },
                        "ulvia/cms.content",
                    );
                    assertCondition(
                        published.id === edited.id &&
                            published.visible === true &&
                            Number.isSafeInteger(published.revision),
                        "usage-read-published-page",
                    );
                    pages[index] = {
                        id: String(published.id),
                        revision: Number(published.revision),
                        path,
                        content: content(selected),
                        tags: selected,
                    };
                };
                const deadline = Date.now() + 60_000;
                for (let index = 0; index < pageCount; index++) {
                    assertCondition(Date.now() < deadline, "usage-read-page-preparation-deadline");
                    await write(index, tags.slice(0, count));
                }
                let mutation = 0;
                let failed = false;
                const expected = () => expectedUsage(state, pages, consumers);
                expected();
                return {
                    state,
                    pages,
                    expected,
                    async mutate() {
                        assertCondition(!failed && mutation < 20, "usage-read-mutation-bound-or-unknown-outcome");
                        try {
                            mutation++;
                            const start = (mutation % 2) * count;
                            await write(0, tags.slice(start, start + count));
                        } catch (error) {
                            failed = true;
                            throw error;
                        }
                    },
                };
            })();
            values.set(state, pending);
        }
        return pending;
    };
}

export type UsageReadContext = Readonly<{
    state: Awaited<ReturnType<ReturnType<typeof collectionReadContexts>>>;
    pages: UsagePage[];
    expected(): ReturnType<typeof expectedUsage>;
    mutate(): Promise<void>;
}>;
