import { initializationRoot } from "./root";
import { createHash } from "node:crypto";
import { canonicalizeIJson } from "cms-repository/exports/contracts/protocol";
import type { VerifiedCollectionReleaseMetadata } from "../../../interfaces/CollectionAdmission";
import type {
    CollectionBootstrapReference,
    CollectionCapabilityRequirement,
} from "../../../interfaces/CollectionRelease";
import { invalid } from "../../../core/errors";
import { resolveCollectionTranslation } from "../../../core/texts/translationCatalogue";
import type { InitializationLimits, InitializationPage, InitializationRoot } from "../interfaces";

export function initializationGraph(
    root: InitializationRoot,
    entries: ReadonlyMap<string, VerifiedCollectionReleaseMetadata>,
    locale: string,
    limits: Readonly<InitializationLimits>,
) {
    const needed = new Set<string>();
    const dependencyHeights = new Map<string, number>();
    const visiting = new Set<string>();
    const pages: InitializationPage[] = [];
    const requirements: CollectionCapabilityRequirement[] = [];
    let recipes = 0;
    const find = (pin: InitializationRoot) => {
        const entry = entries.get(pin.collectionId);
        if (
            !entry ||
            entry.digest !== pin.digest ||
            entry.release.publisherId !== pin.publisherId ||
            entry.release.version !== pin.version
        ) {
            invalid("exact bootstrap release is unavailable", `$.collections.${pin.collectionId}`);
        }
        return entry;
    };
    const visit = (pin: CollectionBootstrapReference, depth: number) => {
        if (depth > limits.maxDepth || ++recipes > limits.maxRecipes) {
            invalid("bootstrap expansion limit exceeded", "$.root");
        }
        const owner = initializationRoot(
            Object.fromEntries(Object.entries(pin).filter(([key]) => key !== "omitPages")),
        );
        const key = `${owner.collectionId}\0${owner.digest}\0${owner.bootstrapId}`;
        if (visiting.has(key)) {
            invalid("bootstrap include cycle", "$.root");
        }
        const { release } = find(owner);
        const recipe = release.bootstraps?.find(({ id }) => id === owner.bootstrapId);
        if (!recipe) {
            invalid("exact bootstrap recipe is unavailable", "$.root.bootstrapId");
        }
        const omit = new Set(pin.omitPages ?? []);
        if ([...omit].some((id) => !recipe.pages.some((page) => page.id === id))) {
            invalid("omitted Page is absent from the referenced recipe", "$.root.omitPages");
        }
        needed.add(release.collectionId);
        visiting.add(key);
        for (const include of recipe.includes) {
            visit(include, depth + 1);
        }
        visiting.delete(key);
        requirements.push(...recipe.requires);
        for (const page of recipe.pages.filter(({ id }) => !omit.has(id))) {
            if (pages.length >= limits.maxPages) {
                invalid("bootstrap Page limit exceeded", "$.root");
            }
            pages.push({
                ...page,
                owner,
                title: resolveCollectionTranslation(release, page.title, locale),
                description: resolveCollectionTranslation(release, page.description, locale),
                receiptId: `sha256:${createHash("sha256")
                    .update(canonicalizeIJson([owner, page.id]))
                    .digest("hex")}`,
            });
        }
    };
    visit(root, 1);
    const dependencyVisit = (id: string, depth: number, stack: ReadonlySet<string>): number => {
        if (depth > limits.maxDepth || stack.has(id)) {
            invalid("collection dependency expansion limit or cycle", "$.collections");
        }
        const knownHeight = dependencyHeights.get(id);
        if (knownHeight !== undefined) {
            if (depth + knownHeight - 1 > limits.maxDepth) {
                invalid("collection dependency expansion limit exceeded", "$.collections");
            }
            return knownHeight;
        }
        const entry = entries.get(id);
        if (!entry) {
            invalid(`missing collection dependency ${id}`, "$.collections");
        }
        needed.add(id);
        const next = new Set([...stack, id]);
        let height = 1;
        for (const dependency of entry.release.dependencies ?? []) {
            height = Math.max(height, 1 + dependencyVisit(dependency.collectionId, depth + 1, next));
        }
        dependencyHeights.set(id, height);
        return height;
    };
    for (const id of [...needed]) {
        dependencyVisit(id, 1, new Set());
    }
    const paths = new Set<string>();
    for (const page of pages) {
        if (paths.has(page.path)) {
            invalid(`bootstrap Page path conflict: ${page.path}`, "$.pages");
        }
        paths.add(page.path);
    }
    if (pages.filter(({ systemRole }) => systemRole === "login").length > 1) {
        invalid("bootstrap login Page conflict", "$.pages");
    }
    return { pages, requirements, collections: [...needed].sort().map((id) => entries.get(id)!) };
}
