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
    setRestResponder((request) => {
        const resource = new URL(request.url).pathname.split("/").at(-1);
        if (resource === "get_offer_filter_schema_read_model") {
            return jsonResponse(schema === null ? null : { ...schema, brands: brandRows });
        }
        throw new Error(`Unexpected filter-schema request: ${request.url}`);
    });
}
