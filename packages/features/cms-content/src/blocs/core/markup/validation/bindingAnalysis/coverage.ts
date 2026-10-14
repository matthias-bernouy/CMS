import { ContentValidationError } from "cms-content/application/core/validation/errors";
import { CMS_BINDING_ATTRIBUTES, parseCase, parseMatch, parseQuery } from "cms-content/blocs/core/markup/bindings";
import type { BindingQueryCapability } from "./types";

export function validateQueryCoverage(owner: Element, name: string, capability: BindingQueryCapability): void {
    const expected = new Set(["none", "success", "failure", ...(capability.errors.length > 0 ? ["error"] : [])]);
    const matches = descendantsOwnedBy(owner, name).filter(
        (element) => parseMatch(element.getAttribute(CMS_BINDING_ATTRIBUTES.match) ?? "") === `${name}.outcome.kind`,
    );
    const complete = matches.find((element) => sameSet(caseValues(element), expected));
    if (!complete) {
        throw new ContentValidationError(
            "content",
            `CMS query ${JSON.stringify(name)} must exhaustively match outcomes: ${[...expected].join(", ")}`,
        );
    }
    if (capability.errors.length === 0) {
        return;
    }
    const errorBranch = Array.from(complete.children).find(
        (element) => parseCase(element.getAttribute(CMS_BINDING_ATTRIBUTES.case) ?? "") === "error",
    );
    const errorCodes = new Set(capability.errors.map(({ code }) => code));
    const errorMatches = errorBranch
        ? descendantsOwnedBy(errorBranch, name).filter(
              (element) =>
                  parseMatch(element.getAttribute(CMS_BINDING_ATTRIBUTES.match) ?? "") === `${name}.outcome.code`,
          )
        : [];
    if (!errorMatches.some((element) => sameSet(caseValues(element), errorCodes))) {
        throw new ContentValidationError(
            "content",
            `CMS query ${JSON.stringify(name)} must exhaustively match declared errors: ${[...errorCodes].join(", ")}`,
        );
    }
}

function descendantsOwnedBy(owner: Element, queryName: string): Element[] {
    const result: Element[] = [];
    const visit = (element: Element): void => {
        const query = parseQuery(element.getAttribute(CMS_BINDING_ATTRIBUTES.query) ?? "");
        if (element !== owner && query && query.name !== queryName) {
            return;
        }
        result.push(element);
        for (const child of Array.from(element.children)) {
            visit(child);
        }
    };
    visit(owner);
    return result;
}

function caseValues(element: Element): Set<string> {
    return new Set(
        Array.from(element.children)
            .map((child) => parseCase(child.getAttribute(CMS_BINDING_ATTRIBUTES.case) ?? ""))
            .filter((value): value is string => typeof value === "string"),
    );
}

function sameSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
    return left.size === right.size && [...left].every((value) => right.has(value));
}
