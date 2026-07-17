import { jsonResponse, setRestResponder } from "../../../harness";
import type { JsonRecord } from "../../../harness";
import { brands, filterSchema } from "./expected";

type FilterSchemaResponderOptions = {
    schema?: JsonRecord | null;
    brandRows?: JsonRecord[];
};

export function useFilterSchemaResponder(options: FilterSchemaResponderOptions = {}): void {
    const schema = options.schema === undefined ? filterSchema : options.schema;
    const brandRows = options.brandRows ?? brands;
    setRestResponder(request => {
        const resource = new URL(request.url).pathname.split("/").at(-1);
        if (resource === "offer_filter_schema") return jsonResponse(schema);
        if (resource === "brands") return jsonResponse(brandRows);
        throw new Error(`Unexpected filter-schema request: ${request.url}`);
    });
}
