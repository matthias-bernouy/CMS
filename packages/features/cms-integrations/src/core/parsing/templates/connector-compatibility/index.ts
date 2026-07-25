import type { DeclarativeConnectorCompatibility } from "../../../../interfaces/Integration";
import { assertOnlyKeys, record } from "./values";
import { parseConnectorSchemaContract } from "./schema";

export { parseConnectorSchemaContract } from "./schema";

export function parseConnectorCompatibility(
    value: unknown,
    provider: string,
    name: string,
): DeclarativeConnectorCompatibility {
    const input = record(value, name);
    assertOnlyKeys(input, ["schema"], name);
    return {
        ...(input.schema !== undefined
            ? { schema: parseConnectorSchemaContract(input.schema, provider, `${name}.schema`) }
            : {}),
    };
}
