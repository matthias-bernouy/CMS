import { canonicalizeIJson } from "cms-repository/exports/contracts/protocol";
import type { CollectionBloc } from "../../interfaces/CollectionBloc";
import type { CollectionRelease } from "../../interfaces/CollectionRelease";

function sameJson(left: unknown, right: unknown): boolean {
    return canonicalizeIJson(left) === canonicalizeIJson(right);
}

function reject(message: string): never {
    throw Object.assign(new Error(message), { status: 409 });
}

function assertBlocCompatibility(previous: CollectionBloc, next: CollectionBloc | undefined): void {
    if (!next || next.kind !== previous.kind) {
        reject(`Upgrade removes or changes existing bloc ${previous.id}`);
    }
    for (const [slotId, slot] of Object.entries(previous.slots)) {
        if (!Object.hasOwn(next.slots, slotId) || !sameJson(slot, next.slots[slotId])) {
            reject(`Upgrade removes or changes existing slot contract ${previous.id}.${slotId}`);
        }
    }
    if (
        previous.kind === "component" &&
        next.kind === "component" &&
        !sameJson(previous.settings ?? [], next.settings ?? [])
    ) {
        reject(`Upgrade changes existing settings contract ${previous.id}`);
    }
}

function assertThemeCompatibility(previous: CollectionRelease, next: CollectionRelease): void {
    const nextTokens = new Map(
        (next.theme?.categories ?? []).flatMap((category) =>
            category.tokens.map((token) => [token.id, token] as const),
        ),
    );
    for (const token of previous.theme?.categories.flatMap((category) => category.tokens) ?? []) {
        const replacement = nextTokens.get(token.id);
        if (!replacement || replacement.type !== token.type) {
            reject(`Upgrade removes or changes existing theme token ${token.id}`);
        }
    }
}

export function assertCompatibleCollectionUpgrade(previous: CollectionRelease, next: CollectionRelease): void {
    const nextBlocs = new Map(next.blocs.map((bloc) => [bloc.id, bloc]));
    for (const bloc of previous.blocs) {
        assertBlocCompatibility(bloc, nextBlocs.get(bloc.id));
    }
    for (const resource of [
        ["text", previous.texts ?? [], next.texts ?? []],
        ["view", previous.views ?? [], next.views ?? []],
        ["dashboard", previous.dashboards ?? [], next.dashboards ?? []],
    ] as const) {
        const nextIds = new Set(resource[2].map(({ id }) => id));
        for (const { id } of resource[1]) {
            if (!nextIds.has(id)) {
                reject(`Upgrade removes existing ${resource[0]} ${id}`);
            }
        }
    }
    if (!sameJson(previous.configuration ?? null, next.configuration ?? null)) {
        reject("Upgrade changes the collection configuration contract");
    }
    assertThemeCompatibility(previous, next);
}
