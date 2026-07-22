import { registerClaimReturnAuthorizationTests } from "./authorization";
import { registerClaimReturnCreationTests } from "./creation";
import { registerClaimReturnEventTests } from "./events";
import { registerClaimReturnHandoffTests } from "./handoff";

export function registerClaimReturnTests(): void {
    registerClaimReturnCreationTests();
    registerClaimReturnAuthorizationTests();
    registerClaimReturnEventTests();
    registerClaimReturnHandoffTests();
}
