import { canonicalIJsonBytes } from "cms-repository/exports/contracts/protocol";
import type {
    CollectionRelease,
    CollectionResourceDescriptor,
    CollectionResourceKind,
} from "../../interfaces/CollectionRelease";
import { collectionThemeTokenId } from "../namespace";

type ResourceProjection = {
    kind: CollectionResourceKind;
    id: string;
    generation: number;
    contract: unknown;
    implementation: unknown;
};

/** Deterministic per-resource identities. Author formatting and release metadata never affect these hashes. */
export async function describeCollectionResources(
    release: CollectionRelease,
): Promise<readonly CollectionResourceDescriptor[]> {
    const projections = resourceProjections(release).sort((left, right) =>
        `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`),
    );
    return Promise.all(
        projections.map(async ({ kind, id, generation, contract, implementation }) => ({
            kind,
            id,
            generation,
            contractDigest: await digest(contract),
            implementationDigest: await digest(implementation),
        })),
    );
}

function resourceProjections(release: CollectionRelease): ResourceProjection[] {
    const resources: ResourceProjection[] = release.blocs.map((bloc) => ({
        kind: "bloc",
        id: bloc.id,
        generation: bloc.generation ?? 1,
        contract: {
            id: bloc.id,
            generation: bloc.generation ?? 1,
            kind: bloc.kind,
            internal: bloc.internal ?? false,
            uses: bloc.uses,
            requires: bloc.requires,
            slots: bloc.slots,
            ...(bloc.kind === "component"
                ? { nativeElement: bloc.nativeElement ?? null, settings: bloc.settings ?? [] }
                : {}),
        },
        implementation: {
            resource: bloc,
            translations: referencedTranslations(release, {
                resource: bloc,
                fallbackCategory: bloc.category ?? release.name,
            }),
            assets: bloc.thumbnail ? release.assets.filter((asset) => asset.id === bloc.thumbnail) : [],
        },
    }));
    for (const { category, categoryIndex, token, tokenIndex } of release.theme?.categories.flatMap(
        (category, categoryIndex) =>
            category.tokens.map((token, tokenIndex) => ({ category, categoryIndex, token, tokenIndex })),
    ) ?? []) {
        resources.push({
            kind: "theme-token",
            id: collectionThemeTokenId(release.collectionId, token.id),
            generation: token.generation ?? 1,
            contract: { id: token.id, generation: token.generation ?? 1, type: token.type },
            implementation: {
                resource: token,
                translations: referencedTranslations(release, {
                    theme: release.theme!.label,
                    categoryId: category.id,
                    categoryIndex,
                    category: category.label,
                    categoryDescription: category.description,
                    tokenIndex,
                    token,
                }),
            },
        });
    }
    if (release.configuration) {
        resources.push({
            kind: "configuration",
            id: release.collectionId,
            generation: release.configuration.generation ?? 1,
            contract: { generation: release.configuration.generation ?? 1, schema: release.configuration.schema },
            implementation: release.configuration,
        });
    }
    resources.push(...(release.texts?.map((text) => projection(release, "text", text.id, text)) ?? []));
    resources.push(
        ...release.assets.map((asset) => ({
            kind: "asset" as const,
            id: asset.id,
            generation: asset.generation ?? 1,
            contract: { id: asset.id, generation: asset.generation ?? 1, mediaType: asset.mediaType },
            implementation: {
                byteLength: asset.byteLength,
                digest: asset.digest,
            },
        })),
    );
    resources.push(
        ...(release.views?.map((view) => ({
            kind: "view" as const,
            id: view.id,
            generation: view.generation ?? 1,
            contract: {
                id: view.id,
                generation: view.generation ?? 1,
                uses: view.uses,
                requires: view.requires,
            },
            implementation: { resource: view, translations: referencedTranslations(release, view) },
        })) ?? []),
    );
    return resources;
}

function projection(
    release: CollectionRelease,
    kind: Extract<CollectionResourceKind, "text" | "view">,
    id: string,
    resource: { readonly generation?: number },
): ResourceProjection {
    return {
        kind,
        id,
        generation: resource.generation ?? 1,
        contract: { id, generation: resource.generation ?? 1 },
        implementation: { resource, translations: referencedTranslations(release, resource) },
    };
}

function referencedTranslations(release: CollectionRelease, value: unknown): CollectionRelease["translations"] {
    const available = new Set(Object.values(release.translations).flatMap((catalogue) => Object.keys(catalogue)));
    const keys = new Set<string>();
    collectTranslationKeys(value, available, keys);
    return Object.fromEntries(
        Object.entries(release.translations).map(([locale, catalogue]) => [
            locale,
            Object.fromEntries(
                [...keys].sort().flatMap((key) => (catalogue[key] === undefined ? [] : [[key, catalogue[key]]])),
            ),
        ]),
    );
}

function collectTranslationKeys(value: unknown, available: ReadonlySet<string>, output: Set<string>): void {
    if (typeof value === "string") {
        if (available.has(value)) {
            output.add(value);
        }
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((item) => collectTranslationKeys(item, available, output));
        return;
    }
    if (value && typeof value === "object") {
        Object.values(value).forEach((item) => collectTranslationKeys(item, available, output));
    }
}

async function digest(value: unknown): Promise<`sha256:${string}`> {
    const bytes = canonicalIJsonBytes(value);
    const hash = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer));
    return `sha256:${Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
