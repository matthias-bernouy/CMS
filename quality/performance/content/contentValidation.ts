import {
    validateBlocContentMarkup,
    validatePageDocument,
    type PageDocumentBlocContract,
} from "@bernouy/cms-content/page-document";
import { assertGrowth, assertMaximum, benchmark, printResults } from "../benchmark";

const CARD: PageDocumentBlocContract = {
    id: "performance-card",
    kind: "component",
    slots: {},
};

export async function runContentValidationBenchmarks(): Promise<void> {
    const page100 = await benchmark("validate page with 100 bloc hosts", () => validatePageDocument(page(100), [CARD]));
    const page1000 = await benchmark("validate page with 1,000 bloc hosts", () =>
        validatePageDocument(page(1_000), [CARD]),
    );
    const markup100 = await benchmark("validate fixed bloc content with 100 native nodes", () =>
        validateBlocContentMarkup(nativeMarkup(100), { field: "fixedContent", kind: "fixed" }),
    );
    const markup1000 = await benchmark("validate fixed bloc content with 1,000 native nodes", () =>
        validateBlocContentMarkup(nativeMarkup(1_000), { field: "fixedContent", kind: "fixed" }),
    );
    const queries10 = await benchmark("validate fixed bloc content with 10 queries", () =>
        validateBlocContentMarkup(queryMarkup(10), { field: "fixedContent", kind: "fixed" }),
    );
    const queries100 = await benchmark("validate fixed bloc content with 100 queries", () =>
        validateBlocContentMarkup(queryMarkup(100), { field: "fixedContent", kind: "fixed" }),
    );
    const results = [page100, page1000, markup100, markup1000, queries10, queries100];
    printResults("Page and Bloc markup validation", results);
    for (const result of results) {
        assertMaximum(`${result.name} p95`, result.p95Ms, 3_000);
    }
    assertGrowth("100 to 1,000 Page host validation growth", page100, page1000, 20);
    assertGrowth("100 to 1,000 native node validation growth", markup100, markup1000, 20);
    assertGrowth("10 to 100 query extraction growth", queries10, queries100, 20);
}

function page(count: number): string {
    return "<performance-card></performance-card>".repeat(count);
}

function nativeMarkup(count: number): string {
    return `<section>${"<p>Performance text</p>".repeat(count)}</section>`;
}

function queryMarkup(count: number): string {
    return Array.from(
        { length: count },
        (_, index) =>
            `<section cms-query="performance:item-${index} as query${index}"><p>{{ query${index}.data }}</p></section>`,
    ).join("");
}
