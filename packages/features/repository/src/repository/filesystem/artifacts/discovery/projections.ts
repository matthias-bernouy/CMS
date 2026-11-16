import { z } from "zod";
import { stat, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resourceName, canonicalizeIJson, parseStrictJson } from "@bernouy/ulvia-contracts/protocol";
import { validCollectionReference } from "repository/collections/sources/parseCatalogue";
import { parseCollectionTranslations } from "repository/collections/core/texts/translationCatalogue";
import type { VerifiedCollectionReleaseMetadata } from "repository/collections/interfaces/CollectionAdmission";
import type { CollectionReference } from "./collectionReferences";
import { ensureDurableDirectory } from "../../core/durable";
import { writeImmutableFile } from "../../core/immutableFiles";

const MAX_BYTES = 8 * 1024 * 1024;
const recipeSchema = z.strictObject({
    id: z.string().min(1).max(96),
    label: z.string().min(1).max(160),
    description: z.string().min(1).max(160),
    pageCount: z.int().min(0).max(256),
    includeCount: z.int().min(0).max(32),
});
const projectionSchema = z.strictObject({
    schema: z.literal("ulvia.recipe-projection/v1"),
    publisherId: z.string().min(1).max(96),
    collectionId: z.string().min(1).max(193),
    version: z.string().min(1).max(128),
    digest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
    locale: z.string().min(1).max(64),
    translations: z.record(z.string().max(64), z.record(z.string().max(160), z.string().max(4096))),
    recipes: z.array(recipeSchema).max(16),
});
export type RecipeProjection = z.output<typeof projectionSchema>;

/** Small derived records are written from admitted metadata before the release becomes visible. */
export class RecipeProjections {
    constructor(private readonly root: string) {}

    async put({ release, digest }: VerifiedCollectionReleaseMetadata) {
        const recipes = (release.bootstraps ?? []).map(({ id, label, description, pages, includes }) => ({
            id,
            label,
            description,
            pageCount: pages.length,
            includeCount: includes.length,
        }));
        const keys = new Set(recipes.flatMap(({ label, description }) => [label, description]));
        const projection = projectionSchema.parse({
            schema: "ulvia.recipe-projection/v1",
            publisherId: release.publisherId,
            collectionId: release.collectionId,
            version: release.version,
            digest,
            locale: release.locale,
            recipes,
            translations: Object.fromEntries(
                Object.entries(release.translations).map(([locale, messages]) => [
                    locale,
                    Object.fromEntries(Object.entries(messages).filter(([key]) => keys.has(key))),
                ]),
            ),
        });
        const bytes = new TextEncoder().encode(canonicalizeIJson(projection));
        if (bytes.byteLength > MAX_BYTES) {
            throw new Error("Recipe projection exceeds its byte bound");
        }
        const path = this.path(projection);
        await ensureDurableDirectory(dirname(path), this.root);
        await writeImmutableFile(path, bytes, "Recipe projection differs from admitted metadata");
    }

    async get(reference: CollectionReference): Promise<RecipeProjection | null> {
        const path = this.path(reference);
        const metadata = await stat(path).catch((error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") {
                return null;
            }
            throw error;
        });
        if (!metadata) {
            return null;
        }
        if (!metadata.isFile() || metadata.size > MAX_BYTES) {
            throw new Error("Invalid recipe projection file");
        }
        const projection = projectionSchema.parse(parseStrictJson(await readFile(path), MAX_BYTES, 12));
        parseCollectionTranslations(projection.translations, projection.locale);
        const fallback = projection.translations[projection.locale];
        const locales = Object.keys(projection.translations);
        if (
            !validCollectionReference(projection) ||
            projection.publisherId !== reference.publisherId ||
            projection.collectionId !== reference.collectionId ||
            projection.version !== reference.version ||
            Object.keys(projection.translations).length > 32 ||
            Object.values(projection.translations).some((messages) => Object.keys(messages).length > 32) ||
            !fallback ||
            locales.some((locale) => Intl.getCanonicalLocales(locale)[0] !== locale) ||
            new Set(projection.recipes.map(({ id }) => id)).size !== projection.recipes.length ||
            projection.recipes.some(
                ({ label, description }) => !Object.hasOwn(fallback, label) || !Object.hasOwn(fallback, description),
            )
        ) {
            throw new Error("Invalid recipe projection scope or bounds");
        }
        return projection;
    }

    private path(reference: CollectionReference) {
        if (!validCollectionReference({ ...reference, digest: `sha256:${"0".repeat(64)}` })) {
            throw new TypeError("Invalid recipe projection coordinate");
        }
        return join(
            this.root,
            "recipe-projections",
            reference.publisherId,
            resourceName(reference.collectionId),
            `${reference.version}.json`,
        );
    }
}
