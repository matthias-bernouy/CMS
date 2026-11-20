import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const knownGatewayDefinitionsSchema = z
    .array(contractString({ minLength: 80, maxLength: 80 }))
    .max(128)
    .readonly();
export const gatewayDefinitionsSchema = z
    .array(
        z.strictObject({
            key: contractString({ minLength: 80, maxLength: 80 }),
            json: contractString({ maxLength: 1048576 }),
        }),
    )
    .max(3)
    .readonly();
