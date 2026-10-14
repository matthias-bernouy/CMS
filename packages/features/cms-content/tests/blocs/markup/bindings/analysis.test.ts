import { describe, expect, test } from "bun:test";
import { validateDocumentBindings, type BindingQueryCapability } from "@bernouy/cms-content/page-document";
import { parseHTML } from "linkedom";

const capability: BindingQueryCapability = {
    contractId: "catalog",
    capabilityId: "list",
    output: {
        type: "object",
        required: ["items"],
        properties: {
            items: {
                type: "array",
                items: {
                    type: "object",
                    required: ["title"],
                    properties: { title: { type: "string" } },
                },
            },
        },
    },
    errors: [
        {
            code: "NOT_FOUND",
            retryable: false,
            output: { type: "object", required: ["reason"], properties: { reason: { type: "string" } } },
        },
        { code: "CONFLICT", retryable: true },
    ],
};

describe("typed binding analysis", () => {
    test("accepts exhaustive outcomes, declared errors, repeats and proven indexed access", () => {
        expect(() => validate(validDocument())).not.toThrow();
    });

    test("rejects output access outside a successful or has-data branch", () => {
        expect(() => validate(validDocument("<p>{{ pages.data.items.length }}</p>"))).toThrow(
            "pages.data requires an ancestor branch",
        );
    });

    test("rejects unknown output properties", () => {
        expect(() => validate(validDocument("", "<p>{{ pages.data.missing }}</p>"))).toThrow(
            "is not declared by the output schema",
        );
    });

    test("requires a length proof before indexed array access", () => {
        expect(() => validate(validDocument("", "<p>{{ pages.data.items.0.title }}</p>"))).toThrow(
            "requires a proven length greater than 0",
        );
        expect(() =>
            validate(
                validDocument(
                    "",
                    '<div cms-condition="pages.data.items.length > 0"><p>{{ pages.data.items.0.title }}</p></div>',
                ),
            ),
        ).not.toThrow();
    });

    test("does not leak condition proofs into sibling branches", () => {
        expect(() =>
            validate(
                validDocument(
                    "",
                    '<p cms-condition="pages.data.items.length > 0">Safe</p><p>{{ pages.data.items.0.title }}</p>',
                ),
            ),
        ).toThrow("requires a proven length greater than 0");
    });

    test("requires exact outcome and error coverage", () => {
        expect(() =>
            validate(validDocument().replace("<div cms-case=" + "'\"failure\"'" + ">Offline</div>", "")),
        ).toThrow("must exhaustively match outcomes");
        expect(() =>
            validate(validDocument().replace("<div cms-case=" + "'\"CONFLICT\"'" + ">Conflict</div>", "")),
        ).toThrow("must exhaustively match declared errors");
    });

    test("error outputs require one selected code that declares an output", () => {
        expect(() => validate(validDocument().replace("Conflict", "{{ pages.outcome.output.reason }}"))).toThrow(
            'declared error "CONFLICT" has no output',
        );
    });

    test("keeps repeats available for intentionally opaque kernel queries", () => {
        const { document } = parseHTML("<!DOCTYPE html><html><body></body></html>");
        document.body.innerHTML = `<section cms-query="kernel.auth:methods as methods">
            <p cms-repeat="methods.data as method">{{ method.displayName }}</p>
        </section>`;
        expect(() => validateDocumentBindings(document, { requireCapabilityResolution: true })).not.toThrow();
    });
});

function validate(html: string): void {
    const { document } = parseHTML("<!DOCTYPE html><html><body></body></html>");
    document.body.innerHTML = html;
    validateDocumentBindings(document, { capabilities: [capability], requireCapabilityResolution: true });
}

function validDocument(beforeMatch = "", success = ""): string {
    return `<section cms-query="catalog:list as pages">
        ${beforeMatch}
        <div cms-match="pages.outcome.kind">
            <div cms-case='"none"'></div>
            <div cms-case='"success"'>
                ${success}
                <p cms-repeat="pages.data.items as item">{{ item.title }}</p>
            </div>
            <div cms-case='"error"'>
                <div cms-match="pages.outcome.code">
                    <div cms-case='"NOT_FOUND"'>{{ pages.outcome.output.reason }}</div>
                    <div cms-case='"CONFLICT"'>Conflict</div>
                </div>
            </div>
            <div cms-case='"failure"'>Offline</div>
        </div>
    </section>`;
}
