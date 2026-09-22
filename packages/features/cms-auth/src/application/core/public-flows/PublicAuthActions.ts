import type { Authentication } from "cms-auth/application/interfaces/Authentication";
import type { PublicAuthActions } from "cms-auth/application/interfaces/PublicAuthActions";
import {
    confirmEmailVerification,
    confirmPasswordReset,
    requestEmailVerification,
    requestPasswordReset,
    signupLocalUser,
    type PublicAuthFlowConfig,
} from "cms-auth/application/core/public-flows/flows";
import type { LocalAuthenticationActions } from "cms-auth/application/interfaces/LocalAuthenticationActions";
import { resolveRequestSubject } from "cms-auth/application/core/authentication/requestSubject";
import { localLoginJsonHandler, localLogoutJsonHandler } from "cms-auth/application/http/handlers/localAuthentication";

export type PublicAuthActionsConfig = PublicAuthFlowConfig & {
    local: LocalAuthenticationActions & Authentication;
};

/** Runtime-composed, capability-limited public authentication API. */
export function createPublicAuthActions(config: PublicAuthActionsConfig): PublicAuthActions {
    return {
        buildLoginUrl: (returnTo) => config.local.buildLoginUrl(returnTo),
        login: (request) => localLoginJsonHandler(config.local, request),
        logout: () => localLogoutJsonHandler(config.local),
        subject: (request) => resolveRequestSubject(config.local, request),
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
