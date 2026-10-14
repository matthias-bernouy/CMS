import { validateStateQueryGraph } from "@bernouy/cms-content/bindings";
import { invalid } from "../../../errors";

/** Rejects automatic feedback loops inside one authored Light DOM document. */
export function validateDocumentStateCycles(document: Document, path: string): void {
    try {
        validateStateQueryGraph(document.body);
    } catch (error) {
        invalid(error instanceof Error ? error.message : "Invalid automatic state query graph", path);
    }
}
