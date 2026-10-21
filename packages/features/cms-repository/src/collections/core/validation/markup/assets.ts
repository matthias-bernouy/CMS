import type { CollectionBloc } from "../../../interfaces/CollectionBloc";
import type { CollectionPage } from "../../../interfaces/CollectionPage";
import { replaceCollectionAssetExpressions } from "../../texts/expressions";
import { CollectionValidationError, invalid } from "../../errors";
import { parseHTML } from "linkedom";
import { CMS_SVG_ATTRIBUTE, parseCollectionAssetReference } from "@bernouy/cms-content/page-document";
import type { CollectionAssetDefinition } from "../../../interfaces/CollectionAssets";
import type { CollectionRelease } from "../../../interfaces/CollectionRelease";

export function validateCollectionAssetReferences(
    blocs: readonly CollectionBloc[],
    collectionId: string,
    assets: ReadonlyMap<string, CollectionAssetDefinition>,
    importedAssets: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
    pages: readonly CollectionPage[] = [],
): void {
    for (const bloc of blocs) {
        const markupValues = [bloc.markup, bloc.defaultContent];
        for (const value of markupValues) {
            if (value !== undefined) {
                const path = `$.blocs[${bloc.id}]`;
                validateValue(value, collectionId, assets, importedAssets, path);
                validateSvgAuthority(value, collectionId, assets, path);
            }
        }
        if (bloc.kind === "component" && bloc.style !== undefined) {
            validateValue(bloc.style, collectionId, assets, importedAssets, `$.blocs[${bloc.id}].style`);
        }
    }
    for (const page of pages) {
        const path = `$.pages[${page.id}].document.html`;
        validateValue(page.document.html, collectionId, assets, importedAssets, path);
        validateSvgAuthority(page.document.html, collectionId, assets, path);
    }
}

/** Rechecks imported SVG authority once dependency releases are available during installation. */
export function validateInstalledCollectionSvgReferences(
    release: CollectionRelease,
    releases: ReadonlyMap<string, CollectionRelease>,
): void {
    const documents = [
        ...release.blocs.flatMap((bloc) => [
            { value: bloc.markup, path: `Collection Bloc ${bloc.id}.markup` },
            ...(bloc.defaultContent === undefined
                ? []
                : [{ value: bloc.defaultContent, path: `Collection Bloc ${bloc.id}.defaultContent` }]),
        ]),
        ...(release.pages?.map((page) => ({
            value: page.document.html,
            path: `Collection Page ${release.collectionId}.${page.id}`,
        })) ?? []),
    ];
    for (const { value, path } of documents) {
        validateInstalledSvgAuthority(value, releases, path);
    }
}

function validateValue(
    value: string,
    collectionId: string,
    assets: ReadonlyMap<string, CollectionAssetDefinition>,
    importedAssets: ReadonlyMap<string, ReadonlySet<string>>,
    path: string,
): void {
    try {
        replaceCollectionAssetExpressions(value, (referencedCollection, assetId) => {
            const available =
                referencedCollection === collectionId
                    ? new Set(assets.keys())
                    : importedAssets.get(referencedCollection);
            if (!available?.has(assetId)) {
                invalid(`unknown or unimported collection asset ${referencedCollection}.${assetId}`, path);
            }
            return "";
        });
    } catch (error) {
        if (error instanceof CollectionValidationError) {
            throw error;
        }
        invalid(error instanceof Error ? error.message : "Invalid collection asset expression", path);
    }
}

function validateSvgAuthority(
    value: string,
    collectionId: string,
    assets: ReadonlyMap<string, CollectionAssetDefinition>,
    path: string,
): void {
    const { document } = parseHTML("<!DOCTYPE html><html><head></head><body></body></html>");
    document.body.innerHTML = value;
    for (const svg of Array.from(document.body.querySelectorAll(`svg[${CMS_SVG_ATTRIBUTE}]`))) {
        const reference = svg.getAttribute(CMS_SVG_ATTRIBUTE) ?? "";
        if (!parseCollectionAssetReference(reference)) {
            invalid("collection-authored cms-svg must reference a declared collection asset", path);
        }
        replaceCollectionAssetExpressions(reference, (owner, assetId) => {
            if (owner === collectionId && !assets.get(assetId)?.profiles?.includes("inline-svg")) {
                invalid(`collection asset ${owner}.${assetId} is not an admitted inline SVG`, path);
            }
            return "";
        });
    }
}

function validateInstalledSvgAuthority(
    value: string,
    releases: ReadonlyMap<string, CollectionRelease>,
    path: string,
): void {
    const { document } = parseHTML("<!DOCTYPE html><html><head></head><body></body></html>");
    document.body.innerHTML = value;
    for (const svg of Array.from(document.body.querySelectorAll(`svg[${CMS_SVG_ATTRIBUTE}]`))) {
        const reference = svg.getAttribute(CMS_SVG_ATTRIBUTE) ?? "";
        replaceCollectionAssetExpressions(reference, (owner, assetId) => {
            const asset = releases.get(owner)?.assets.find((candidate) => candidate.id === assetId);
            if (!asset?.profiles?.includes("inline-svg")) {
                invalid(`collection asset ${owner}.${assetId} is not an admitted inline SVG`, path);
            }
            return "";
        });
    }
}
