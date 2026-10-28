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
        projections.map(async ({ kind, id, contract, implementation }) => ({
            kind,
            id,
            contractDigest: await digest(contract),
            implementationDigest: await digest(implementation),
        })),
    );
}

function resourceProjections(release: CollectionRelease): ResourceProjection[] {
    const resources: ResourceProjection[] = release.blocs.map((bloc) => ({
        kind: "bloc",
        id: bloc.id,
        contract: {
            id: bloc.id,
            kind: bloc.kind,
            catalogue: bloc.catalogue ?? "listed",
            uses: bloc.uses,
            requires: bloc.requires,
            slots: bloc.slots,
            ...(bloc.kind === "component"
                ? { root: bloc.root, settings: (bloc.settings ?? []).map(({ deprecation: _, ...setting }) => setting) }
                : {}),
        },
        implementation: {
            resource: bloc,
            ...(bloc.examples
                ? { examples: release.examples?.filter((example) => bloc.examples!.includes(example.id)) }
                : {}),
            translations: referencedTranslations(release, {
                resource: bloc,
            }),
        },
    }));
    for (const { category, categoryIndex, token, tokenIndex } of release.theme?.categories.flatMap(
        (category, categoryIndex) =>
            category.entries
                .filter((entry) => entry.type !== "font-face")
                .map((token, tokenIndex) => ({ category, categoryIndex, token, tokenIndex })),
    ) ?? []) {
        resources.push({
            kind: "theme-token",
            id: collectionThemeTokenId(release.collectionId, token.id),
            contract: { id: token.id, type: token.type },
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
            contract: { schema: release.configuration.schema },
            implementation: release.configuration,
        });
    }
    resources.push(...(release.texts?.map((text) => projection(release, "text", text.id, text)) ?? []));
    resources.push(
        ...release.assets.map((asset) => ({
            kind: "asset" as const,
            id: asset.id,
            contract: {
                id: asset.id,
                mediaType: asset.mediaType,
                profiles: asset.profiles ?? [],
            },
            implementation: {
                byteLength: asset.byteLength,
                digest: asset.digest,
            },
        })),
    );
    resources.push(
        ...(release.states?.map((state) => ({
            kind: "state" as const,
            id: state.id,
            contract: {
                id: state.id,
                scope: state.scope,
                schema: state.schema,
            },
            implementation: state,
        })) ?? []),
    );
    return resources;
}

function projection(
    release: CollectionRelease,
    kind: Extract<CollectionResourceKind, "text">,
    id: string,
    resource: { readonly deprecation?: unknown },
): ResourceProjection {
    return {
        kind,
        id,
        contract: { id },
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
