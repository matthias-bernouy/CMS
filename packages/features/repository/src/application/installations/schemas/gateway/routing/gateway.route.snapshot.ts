import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
import { gatewayDefinitionsSchema, knownGatewayDefinitionsSchema } from "./definitions";
export const gatewayRouteSnapshotInputSchema = z.strictObject({
    contractId: contractString({ minLength: 1, maxLength: 193 }),
    known: knownGatewayDefinitionsSchema,
});
export const gatewayRouteSnapshotOutputSchema = z.strictObject({
    snapshot: contractString({ maxLength: 1048576 }),
    definitions: gatewayDefinitionsSchema,
});
