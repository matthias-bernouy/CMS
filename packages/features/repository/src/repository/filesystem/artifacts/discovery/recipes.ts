import { withRepositoryWriteLock } from "../../core/lock";
import type { VerifiedCollectionReleaseMetadata } from "repository/collections/interfaces/CollectionAdmission";
import { createHash } from "node:crypto";
import { deepFreeze } from "@bernouy/ulvia-contracts/protocol";
import { RepositoryRequestError } from "repository/repository/core/errors";
import type { RecipeCatalogueInput } from "repository/application/registry/interfaces/inputs";
import type { RecipeCatalogueOutput } from "repository/application/registry/interfaces/outputs";
import type { CollectionReference } from "./collectionReferences";
import { RecipeProjections } from "./projections";

import { recipePage } from "./page";
import type { RecipeSnapshot, RecipeRow } from "./page";

/** One bounded shared load per Registry. Locale-specific output is projected only for the requested page. */
export class RecipeCatalogue {
    private revision = 0;
    private snapshot?: RecipeSnapshot;
    private pending?: Promise<RecipeSnapshot>;
    private readonly projections: RecipeProjections;

    constructor(
        private readonly root: string,
        private readonly latest: () => Promise<readonly CollectionReference[]>,
        private readonly maximumBytes = 64 * 1024 * 1024,
    ) {
        if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || maximumBytes > 64 * 1024 * 1024) {
            throw new TypeError("Invalid recipe catalogue byte bound");
        }
        this.projections = new RecipeProjections(root);
    }

    invalidate() {
        this.revision++;
        this.snapshot = undefined;
    }

    page(input: RecipeCatalogueInput, signal?: AbortSignal): Promise<RecipeCatalogueOutput> {
        return recipePage(() => this.load(), input, signal);
    }

    async prepare(metadata: (reference: CollectionReference) => Promise<VerifiedCollectionReleaseMetadata | null>) {
        await withRepositoryWriteLock(this.root, async () => {
            for (const reference of await this.latest()) {
                if (await this.projections.get(reference)) {
                    continue;
                }
                const verified = await metadata(reference);
                if (!verified) {
                    throw new Error("Published collection disappeared during recipe preparation");
                }
                await this.projections.put(verified);
            }
        });
        this.invalidate();
    }

    private load() {
        if (this.snapshot) {
            return Promise.resolve(this.snapshot);
        }
        if (!this.pending) {
            const pending = this.build().finally(() => {
                if (this.pending === pending) {
                    this.pending = undefined;
                }
            });
            this.pending = pending;
        }
        return this.pending;
    }

    private async build(): Promise<RecipeSnapshot> {
        for (let attempt = 0; attempt < 3; attempt++) {
            const revision = this.revision;
            const rows: RecipeRow[] = [];
            const hash = createHash("sha256");
            let bytes = 0;
            const references = await this.latest();
            if (references.length > 10_000) {
                throw new RepositoryRequestError("CORE_UNAVAILABLE", "Recipe catalogue exceeds its entry bound");
            }
            for (const reference of references) {
                const projection = await this.projections.get(reference);
                if (!projection) {
                    throw new RepositoryRequestError(
                        "CORE_UNAVAILABLE",
                        "Recipe projection must be prepared before discovery",
                    );
                }
                const json = JSON.stringify(projection);
                bytes += json.length * 2;
                if (bytes > this.maximumBytes) {
                    throw new RepositoryRequestError("CORE_UNAVAILABLE", "Recipe catalogue exceeds its byte bound");
                }
                hash.update(json).update("\n");
                for (const recipe of projection.recipes) {
                    rows.push({ projection, recipe });
                }
            }
            if (revision === this.revision) {
                this.snapshot = deepFreeze({ digest: hash.digest("hex"), rows });
                return this.snapshot;
            }
        }
        throw new RepositoryRequestError("CORE_UNAVAILABLE", "Recipe catalogue changed repeatedly during discovery");
    }
}
