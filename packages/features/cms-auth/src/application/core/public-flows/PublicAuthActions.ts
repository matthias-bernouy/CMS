import type { PublicAuthActions } from "cms-auth/application/interfaces/PublicAuthActions";
import {
    confirmEmailVerification,
    confirmPasswordReset,
    requestEmailVerification,
    requestPasswordReset,
    signupLocalUser,
    type PublicAuthFlowConfig,
} from "cms-auth/application/core/public-flows/flows";
export type PublicAuthActionsConfig = PublicAuthFlowConfig;

/** Runtime-composed, capability-limited public authentication API. */
export function createPublicAuthActions(config: PublicAuthActionsConfig): PublicAuthActions {
    return {
        async signup(input) {
            await signupLocalUser(config, input);
        },
        requestEmailVerification: (input) => requestEmailVerification(config, input),
        async confirmEmailVerification(input) {
            await confirmEmailVerification(config, input);
        },
        requestPasswordReset: (input) => requestPasswordReset(config, input),
        async confirmPasswordReset(input) {
            await confirmPasswordReset(config, input);
        },
    };
}

export type { PublicAuthActions } from "cms-auth/application/interfaces/PublicAuthActions";
