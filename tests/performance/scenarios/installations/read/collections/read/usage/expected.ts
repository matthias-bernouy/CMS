import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition } from "../../../../../queries/types";
import type { CollectionReadState } from "../../context/types";
import type { CapabilityInventory } from "../../../../../../capabilities/types";

export type UsageReference = Readonly<Record<string, string>>;
export type UsagePage = Readonly<{
    id: string;
    revision: number;
    path: string;
    content: string;
    tags: readonly string[];
}>;
export const referenceKey = (value: unknown) => canonicalizeIJson(value);

/** The pinned fixture has twelve explicitly declared Edge/Provider consumers; never infer an oracle from the reader. */
export function consumerReferences(inventory: CapabilityInventory): UsageReference[] {
    const consumers = [
        ["observability", "logs.append"],
        ["observability", "logs.query"],
        ["observability", "logs.get"],
        ["observability", "logs.aggregate"],
        ["installations", "capabilities.describe"],
        ["access", "resolve-actor"],
        ["installations", "list-provider-installations"],
        ["installations", "gateway.route.get"],
        ["installations", "gateway.identity.resolve"],
        ["installations", "gateway.audit.append"],
        ["installations", "gateway.invocation.issue"],
        ["content", "delivery.resolve-resource"],
    ];
    return consumers.map(([family, capabilityId]) => {
        const contractId = `ulvia/cms.${family}`;
        assertCondition(
            inventory.targets.some(
                (row) => !row.retained && row.release.contractId === contractId && row.definition.id === capabilityId,
            ),
            "usage-read-consumer-target",
        );
        return {
            type: "capability",
            scope: "runtime",
            contractId,
            capabilityId: capabilityId!,
            versionRange: "^1.0.0",
            location: `internal:edge-provider/${contractId}/${family === "content" ? "delivery" : capabilityId}`,
        };
    });
}

/** Fixture assumptions are deliberately narrow: no authored bindings, nested components, states, dependencies or theme. */
export function expectedUsage(
    state: Pick<CollectionReadState, "installed">,
    pages: readonly UsagePage[],
    consumers: readonly UsageReference[],
) {
    const references: UsageReference[] = [...consumers];
    const owners = new Map(
        [...state.installed.values()].flatMap(({ release }) =>
            release.blocs.map((bloc) => [bloc.id, release.collectionId]),
        ),
    );
    for (const { release } of state.installed.values()) {
        assertCondition(
            !release.dependencies?.length && !release.theme && !release.states?.length && !release.texts?.length,
            "usage-read-controlled-catalogue-shape",
        );
        for (const bloc of release.blocs) {
            assertCondition(
                !bloc.requires.length &&
                    !bloc.uses.length &&
                    !bloc.markup.includes("cms-") &&
                    !bloc.markup.includes("var("),
                "usage-read-controlled-bloc-shape",
            );
            assertCondition(
                Object.values(bloc.slots).every((slot) => !slot.accepts?.some((accept) => accept.kind === "component")),
                "usage-read-no-nested-components",
            );
        }
        for (const [field, kind] of [
            ["blocs", "bloc"],
            ["themeTokens", "theme-token"],
            ["texts", "text"],
            ["assets", "asset"],
            ["states", "state"],
        ] as const) {
            for (const id of release.exports?.[field] ?? []) {
                references.push({
                    type: "resource",
                    collectionId: release.collectionId,
                    kind,
                    id,
                    location: `collection:${release.collectionId}/exports/${field}/${id}`,
                    scope: "catalogue",
                });
            }
        }
        for (const example of release.examples ?? []) {
            const tags = [...example.document.html.matchAll(/cms-bloc="([a-z0-9-]+)"/gu)].map((match) => match[1]!);
            assertCondition(
                example.requires.length === 0 && tags.length === 1 && owners.get(tags[0]!) === release.collectionId,
                "usage-read-authored-example",
            );
            references.push({
                type: "resource",
                kind: "bloc",
                collectionId: release.collectionId,
                id: tags[0]!,
                scope: "catalogue",
                location: `collection:${release.collectionId}/example:${example.id}`,
            });
        }
    }
    for (const page of pages) {
        for (const id of page.tags) {
            const collectionId = owners.get(id);
            assertCondition(collectionId, "usage-read-owned-page-bloc");
            references.push({
                type: "resource",
                kind: "bloc",
                collectionId,
                id,
                scope: "runtime",
                location: `page:${page.id}:${page.path}/published`,
            });
        }
    }
    const expected = new Map(references.map((reference) => [referenceKey(reference), reference]));
    assertCondition(expected.size > 0 && expected.size <= 2048, "usage-read-reference-bound");
    return expected;
}
