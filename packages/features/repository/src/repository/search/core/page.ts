import { RepositoryDiscoveryError } from "./errors";
import { object, resourceReference, text } from "./input";
import type { RepositorySearchPage, RepositorySearchResult } from "../interfaces";

/** Validate remote domain data without importing an authored contract or its transport bindings. */
export function searchPage(value: unknown): RepositorySearchPage {
    const page = object(value, ["revision", "mode", "degraded", "results", "nextCursor"]);
    if (
        typeof page.revision !== "string" ||
        !page.revision.length ||
        page.revision.length > 71 ||
        !["hybrid", "lexical"].includes(page.mode as string) ||
        typeof page.degraded !== "boolean" ||
        (page.mode === "lexical") !== page.degraded ||
        !Array.isArray(page.results) ||
        page.results.length > 50
    ) {
        throw new RepositoryDiscoveryError("RELEASE_MISMATCH", "Invalid repository search page");
    }
    return {
        revision: page.revision,
        mode: page.mode as RepositorySearchPage["mode"],
        degraded: page.degraded,
        results: page.results.map(result),
        ...(page.nextCursor === undefined ? {} : { nextCursor: text(page.nextCursor, 8192) }),
    };
}

function result(value: unknown): RepositorySearchResult {
    const row = object(value, ["reference", "blocId", "name", "description", "categories", "contractIds"]);
    return {
        reference: resourceReference(row.reference),
        ...(row.blocId === undefined ? {} : { blocId: text(row.blocId, 512) }),
        name: displayText(row.name, 512),
        description: displayText(row.description, 1600),
        categories: strings(row.categories, 32, 200),
        contractIds: strings(row.contractIds, 128, 193),
    };
}

function displayText(value: unknown, maximum: number): string {
    if (typeof value !== "string" || value.length > maximum || value !== value.toWellFormed()) {
        throw new RepositoryDiscoveryError("RELEASE_MISMATCH", "Invalid repository search text");
    }
    return value;
}

function strings(value: unknown, maximum: number, length: number): readonly string[] {
    if (!Array.isArray(value) || value.length > maximum) {
        throw new RepositoryDiscoveryError("RELEASE_MISMATCH", "Invalid repository search metadata");
    }
    return value.map((entry) => text(entry, length));
}
