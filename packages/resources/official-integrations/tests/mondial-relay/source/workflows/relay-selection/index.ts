import { registerRelayCheckoutTests } from "./checkout.ts";
import { registerRelayProfileTests } from "./profiles.ts";
import { registerRelayExpiryTests } from "./expiry.ts";

export function registerRelaySelectionTests(): void {
    registerRelayCheckoutTests();
    registerRelayProfileTests();
    registerRelayExpiryTests();
}
