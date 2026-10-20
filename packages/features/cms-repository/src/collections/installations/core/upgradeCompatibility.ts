import { firstSchemaSubsetViolation } from "cms-repository/exports/contracts/compatibility";
import { canonicalizeIJson } from "cms-repository/exports/contracts/protocol";
import { settingsSchema } from "../../core/parsing/blocs/settingSchema";
import type {
    CollectionComponentSettings,
    CollectionSlot,
    CollectionSlotAccept,
} from "../../interfaces/CollectionBloc";
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
        if (!slotAcceptsPrevious(slot, next.slots[slotId])) {
            reject(`Upgrade removes or changes existing slot contract ${previous.id}.${slotId}`);
        }
    }
    if (previous.kind === "component" && next.kind === "component") {
        if (!settingsAcceptPrevious(previous.settings ?? [], next.settings ?? [])) {
            reject(`Upgrade changes existing settings contract ${previous.id}`);
        }
        if (!managedNativeAcceptsPrevious(previous.root, next.root)) {
            reject(`Upgrade changes existing managed native contract ${previous.id}`);
        }
    }
}

function settingsAcceptPrevious(previous: CollectionComponentSettings, next: CollectionComponentSettings): boolean {
    if (previous.length > next.length) {
        return false;
    }
    const nextById = new Map(next.map((setting) => [setting.id, setting]));
    return previous.every((setting) => {
        const replacement = nextById.get(setting.id);
        if (!replacement) {
            return false;
        }
        const previousSchema = settingsSchema([setting]).properties[setting.id]!;
        const nextSchema = settingsSchema([replacement]).properties[replacement.id]!;
        return firstSchemaSubsetViolation(previousSchema, nextSchema, `settings.${setting.id}`) === null;
    });
}

function managedNativeAcceptsPrevious(
    previous: Extract<CollectionBloc, { kind: "component" }>["root"],
    next: Extract<CollectionBloc, { kind: "component" }>["root"],
): boolean {
    return (
        previous.accepts.every((tag) => next.accepts.includes(tag)) &&
        sameJson(previous.attributes ?? {}, next.attributes ?? {})
    );
}

function slotAcceptsPrevious(previous: CollectionSlot, next: CollectionSlot | undefined): boolean {
    if (!next || (next.min ?? 0) > (previous.min ?? 0) || (next.max ?? Infinity) < (previous.max ?? Infinity)) {
        return false;
    }
    if (!next.accepts) {
        return true;
    }
    if (!previous.accepts) {
        return false;
    }
    return previous.accepts.every((accepted) => next.accepts!.some((candidate) => acceptIncludes(candidate, accepted)));
}

function acceptIncludes(candidate: CollectionSlotAccept, previous: CollectionSlotAccept): boolean {
    if (candidate.kind === "any-component") {
        return previous.kind === "any-component" || previous.kind === "component";
    }
    if (candidate.kind !== previous.kind) {
        return false;
    }
    if (candidate.kind === "component" && previous.kind === "component") {
        return candidate.tag === previous.tag;
    }
    if (candidate.kind === "native-content" && previous.kind === "native-content") {
        return candidate.profile === previous.profile;
    }
    if (candidate.kind === "native-element" && previous.kind === "native-element") {
        return managedNativeAcceptsPrevious(previous, candidate);
    }
    return true;
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
    const nextTexts = new Set((next.texts ?? []).map(({ id }) => id));
    for (const { id } of previous.texts ?? []) {
        if (!nextTexts.has(id)) {
            reject(`Upgrade removes existing text ${id}`);
        }
    }
    const nextPages = new Map((next.pages ?? []).map((page) => [page.id, page]));
    for (const page of previous.pages ?? []) {
        const replacement = nextPages.get(page.id);
        if (!replacement) {
            reject(`Upgrade removes or changes existing Page ${page.id}`);
        }
    }
    if (previous.configuration && !next.configuration) {
        reject("Upgrade removes the collection configuration contract");
    }
    if (
        previous.configuration &&
        next.configuration &&
        firstSchemaSubsetViolation(previous.configuration.schema, next.configuration.schema, "configuration")
    ) {
        reject("Upgrade narrows the collection configuration contract");
    }
    assertThemeCompatibility(previous, next);
    assertAssetCompatibility(previous, next);
    assertStateCompatibility(previous, next);
}

function assertAssetCompatibility(previous: CollectionRelease, next: CollectionRelease): void {
    const nextAssets = new Map(next.assets.map((asset) => [asset.id, asset]));
    for (const asset of previous.assets) {
        const replacement = nextAssets.get(asset.id);
        if (!replacement || replacement.mediaType !== asset.mediaType) {
            reject(`Upgrade removes or changes existing asset ${asset.id}`);
        }
    }
}

export type CollectionBreakingResource = {
    kind: "bloc" | "theme-token" | "configuration" | "text" | "asset" | "page" | "state";
    id: string;
    reason: string;
};

/** Structural breaks only. Semantic breaks remain author-declared through a resource generation bump. */
export function collectionUpgradeBreakingResources(
    previous: CollectionRelease,
    next: CollectionRelease,
): readonly CollectionBreakingResource[] {
    const changes: CollectionBreakingResource[] = [];
    const nextBlocs = new Map(next.blocs.map((bloc) => [bloc.id, bloc]));
    for (const bloc of previous.blocs) {
        collectBreak(changes, "bloc", bloc.id, () => assertBlocCompatibility(bloc, nextBlocs.get(bloc.id)));
    }
    const nextTokens = new Map(
        (next.theme?.categories ?? []).flatMap((category) =>
            category.tokens.map((token) => [token.id, token] as const),
        ),
    );
    for (const token of previous.theme?.categories.flatMap((category) => category.tokens) ?? []) {
        const replacement = nextTokens.get(token.id);
        if (!replacement || replacement.type !== token.type) {
            changes.push({
                kind: "theme-token",
                id: token.id,
                reason: `theme token ${token.id} was removed or changed`,
            });
        }
    }
    const nextTexts = new Set((next.texts ?? []).map(({ id }) => id));
    for (const { id } of previous.texts ?? []) {
        if (!nextTexts.has(id)) {
            changes.push({ kind: "text", id, reason: `text ${id} was removed` });
        }
    }
    const nextPages = new Map((next.pages ?? []).map((page) => [page.id, page]));
    for (const page of previous.pages ?? []) {
        const replacement = nextPages.get(page.id);
        if (!replacement) {
            changes.push({ kind: "page", id: page.id, reason: `Page ${page.id} was removed` });
        }
    }
    const nextAssets = new Map(next.assets.map((asset) => [asset.id, asset]));
    for (const asset of previous.assets) {
        const replacement = nextAssets.get(asset.id);
        if (!replacement || replacement.mediaType !== asset.mediaType) {
            changes.push({ kind: "asset", id: asset.id, reason: `asset ${asset.id} was removed or changed` });
        }
    }
    if (previous.configuration && !next.configuration) {
        changes.push({ kind: "configuration", id: previous.collectionId, reason: "configuration was removed" });
    } else if (
        previous.configuration &&
        next.configuration &&
        firstSchemaSubsetViolation(previous.configuration.schema, next.configuration.schema, "configuration")
    ) {
        changes.push({ kind: "configuration", id: previous.collectionId, reason: "configuration schema narrowed" });
    }
    const nextStates = new Map((next.states ?? []).map((state) => [state.id, state]));
    for (const state of previous.states ?? []) {
        const replacement = nextStates.get(state.id);
        if (
            !replacement ||
            replacement.scope !== state.scope ||
            firstSchemaSubsetViolation(state.schema, replacement.schema, `state.${state.id}`)
        ) {
            changes.push({ kind: "state", id: state.id, reason: `state ${state.id} was removed or narrowed` });
        }
    }
    return changes;
}

function assertStateCompatibility(previous: CollectionRelease, next: CollectionRelease): void {
    const nextStates = new Map((next.states ?? []).map((state) => [state.id, state]));
    for (const state of previous.states ?? []) {
        const replacement = nextStates.get(state.id);
        if (
            !replacement ||
            replacement.scope !== state.scope ||
            firstSchemaSubsetViolation(state.schema, replacement.schema, `state.${state.id}`)
        ) {
            reject(`Upgrade removes or narrows existing state ${state.id}`);
        }
    }
}

function collectBreak(
    output: CollectionBreakingResource[],
    kind: CollectionBreakingResource["kind"],
    id: string,
    check: () => void,
): void {
    try {
        check();
    } catch (error) {
        output.push({ kind, id, reason: error instanceof Error ? error.message : `${kind} ${id} changed` });
    }
}
