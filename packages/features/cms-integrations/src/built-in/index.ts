import type { IntegrationDefinition } from "../interfaces/Integration";
import { BAN_INTEGRATION } from "./ban";
import { STRIPE_INTEGRATION } from "./stripe";

export const BUILT_IN_INTEGRATIONS: IntegrationDefinition[] = [
    STRIPE_INTEGRATION,
    BAN_INTEGRATION,
];

export {
    BAN_INTEGRATION,
} from "./ban";
export {
    STRIPE_INTEGRATION,
} from "./stripe";
