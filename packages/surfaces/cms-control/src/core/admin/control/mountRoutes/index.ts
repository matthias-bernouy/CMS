import {
    AUTH_ROUTES,
    PUBLIC_AUTH_ROUTES,
    authMethodsHandler,
    localLoginHandler,
    localLogoutHandler,
    oidcCallbackHandler,
    oidcLoginHandler,
    registerPublicAuthRoutes,
    resolveLoginMethods,
} from "@bernouy/cms-auth/http";
import { CMS_CACHE_KEYS, createContentReader, generateStyleEntry } from "@bernouy/cms-content";
import { CMS_FILES_ROUTE, filesPrefix } from "@bernouy/cms-content/files/urls";
import { serveFilesRequest } from "@bernouy/cms-content/files/serving";
import { replaceAuthorFileRequest, uploadAuthorFileRequest } from "@bernouy/cms-content/files";
import { cachedResponseAsync, publicAssetCacheControl, redirect } from "@bernouy/http-runner";
import { renderLoginPage } from "cms-control/core/admin/auth/authPages";
import { invalidatePagesReferencingFile } from "cms-control/core/admin/server/cache/invalidation";
import {
    createAuthenticatedControlGuard,
    createControlAccessGuard,
    createControlAdministratorGuard,
} from "cms-control/core/admin/control/adminAccess";
import type { ControlAuthBackends, ControlCmsState } from "cms-control/core/admin/control/types";
import { mountControlBrowserAssets } from "cms-control/core/admin/control/mountRoutes/assets";
import { mountControlCapabilityRoutes } from "cms-control/core/admin/control/mountRoutes/capability";
import { mountCollectionControlPages } from "cms-control/core/admin/control/mountRoutes/pages";
import { createControlMaintenanceGuard } from "cms-control/core/admin/control/maintenance";

export function mountControlCmsRoutes(state: ControlCmsState, authBackends: ControlAuthBackends): Promise<void> {
    const runner = state.runner;
    const basePath = runner.basePath === "/" ? "" : runner.basePath;
    const authGuard = createControlAccessGuard(basePath, state.auth);
    const authenticatedGuard = createAuthenticatedControlGuard(basePath, state.auth);
    const administratorGuard = createControlAdministratorGuard(state.auth, state.configuration.administrator);
    const maintenanceGuard = createControlMaintenanceGuard(state.configuration.collections);
    mountControlBrowserAssets(runner, state.cache);
    runner.addEndpoint("GET", "/login", async (req) => {
        const supportedKinds: ("local" | "oidc")[] = [];
        if (authBackends.local) {
            supportedKinds.push("local");
        }
        if (authBackends.oidc) {
            supportedKinds.push("oidc");
        }
        const methods = await resolveLoginMethods({
            publicBasePath: `${basePath}${AUTH_ROUTES.base}`,
            identityProviders: state.identityProviders,
            supportedKinds,
        });
        return renderLoginPage(req, basePath, methods);
    });

    const controlPublicAuth = state.configuration.publicAuth
        ? { ...state.configuration.publicAuth, allowSignup: false }
        : undefined;
    if (controlPublicAuth) {
        runner.group(PUBLIC_AUTH_ROUTES.base, (authRunner) => {
            registerPublicAuthRoutes(authRunner, controlPublicAuth);
        });
    }

    runner.group(AUTH_ROUTES.base, (authRunner) => {
        const supportedKinds: ("local" | "oidc")[] = [];
        if (authBackends.local) {
            supportedKinds.push("local");
            authRunner.addEndpoint("POST", AUTH_ROUTES.login, (req) => localLoginHandler(authBackends.local!, req));
            authRunner.addEndpoint("GET", AUTH_ROUTES.logout, (req) => localLogoutHandler(authBackends.local!, req));
        }
        if (authBackends.oidc) {
            supportedKinds.push("oidc");
            authRunner.addEndpoint("GET", AUTH_ROUTES.oidcLogin, (req) => oidcLoginHandler(authBackends.oidc!, req));
            authRunner.addEndpoint("GET", AUTH_ROUTES.oidcCallback, (req) =>
                oidcCallbackHandler(authBackends.oidc!, req),
            );
        }
        authRunner.addEndpoint("GET", AUTH_ROUTES.methods, () =>
            authMethodsHandler({
                publicBasePath: `${basePath}${AUTH_ROUTES.base}`,
                identityProviders: state.identityProviders,
                supportedKinds,
            }),
        );
    });

    runner.addEndpoint("GET", "/", () => redirect(`${basePath}/admin`), [authGuard]);
    mountCollectionControlPages(state, [authGuard]);
    mountControlCapabilityRoutes(state, [authenticatedGuard, maintenanceGuard]);
    const fileMutationGuards = [authenticatedGuard, administratorGuard, maintenanceGuard];
    runner.addEndpoint(
        "POST",
        `${CMS_FILES_ROUTE}/upload`,
        (request) =>
            uploadAuthorFileRequest(request, {
                metadata: required(state.filesMetadata, "files metadata backend not configured"),
                blob: required(state.filesBlob, "files blob backend not configured"),
                mutations: required(state.fileMutations, "file mutation journal not configured"),
            }),
        fileMutationGuards,
    );
    runner.addEndpoint(
        "PUT",
        `${CMS_FILES_ROUTE}/content`,
        (request) =>
            replaceAuthorFileRequest(request, {
                metadata: required(state.filesMetadata, "files metadata backend not configured"),
                blob: required(state.filesBlob, "files blob backend not configured"),
                mutations: required(state.fileMutations, "file mutation journal not configured"),
                afterContentUpdated: async ({ id }) => invalidatePagesReferencingFile(state, id),
            }),
        fileMutationGuards,
    );
    runner.group(
        CMS_FILES_ROUTE,
        (filesRunner) => {
            const prefix = filesPrefix(runner.basePath);
            filesRunner.setDefaultEndpoint("GET", (req) =>
                serveFilesRequest(
                    {
                        metadata: required(state.filesMetadata, "files metadata backend not configured"),
                        blob: required(state.filesBlob, "files blob backend not configured"),
                    },
                    req,
                    { prefix },
                ),
            );
        },
        [authGuard],
    );
    runner.addEndpoint(
        "GET",
        "/.cms/style",
        (req) =>
            cachedResponseAsync(
                req,
                CMS_CACHE_KEYS.STYLE,
                state.cache,
                async () => generateStyleEntry(createContentReader(state.repository)),
                publicAssetCacheControl(req),
            ),
        [authenticatedGuard],
    );
    return Promise.resolve();
}

function required<T>(value: T, message: string): NonNullable<T> {
    if (!value) {
        throw new Error(message);
    }
    return value;
}
