import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const gatewayRouteGetOutputSchema = z.strictObject({
    route: contractString({ maxLength: 1048576 }),
});
