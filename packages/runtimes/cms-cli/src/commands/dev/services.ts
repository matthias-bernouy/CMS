import {
    ConfiguredEmailer,
    InMemoryAuthTokenStore,
    LocalAuthentication,
    SignedCookieCodec,
    SubjectResolver,
    TemplatedAuthEmailComposer,
} from "@bernouy/cms-auth";
import { ValidatingCmsRepository } from "@bernouy/cms-content";
import { LocalFsCmsFiles, ValidatingCmsFilesMetadata } from "@bernouy/cms-files";
import { FunctionSourceRepository } from "@bernouy/cms-functions";
import { InMemoryIdentityService } from "@bernouy/cms-identities";
import { type CMS_ROLES, InMemoryRolesRepository, ValidatingRolesRepository } from "@bernouy/cms-permissions";
import { createSecretResolver, ValidatingSecretStore } from "@bernouy/cms-secrets";
import { SourceOverlaySourceRepository } from "@bernouy/cms-sources";
import type { BuiltBloc } from "../../dev-server/build/index";
import { createDevSources, GENERATED_BLOCS_DIR, seedDevSourceAccess } from "../../dev-server/integrations";
import { LocalFsCmsRepository } from "../../dev-server/repo/LocalFsCmsRepository";
import { createDevAuth } from "../../dev-server/runtime/auth";
import { LocalFsDashboardRepository } from "../../dev-server/stores/dashboards";
import { LocalFsFunctionRepository } from "../../dev-server/stores/functions";
import { LocalFsIntegrationInstallationRepository } from "../../dev-server/stores/integrationInstallations";
import { LocalFsRelationRepository } from "../../dev-server/stores/relations";
import { LocalFsEnvSecretStore } from "../../dev-server/stores/secrets";
import { LocalFsSourceOverlayRepository } from "../../dev-server/stores/sourceOverlays";
import { LocalFsTriggerRepository } from "../../dev-server/stores/triggers";
import { reconcileLocalFiles } from "./files";
import { createLocalIntegrationServices } from "./integrations";

type ServiceOptions = {
    siteDir: string;
    built: Map<string, BuiltBloc>;
    publicHost: string;
    port: number;
    deliveryPort: number;
    command: "dev" | "preview";
};

export async function createLocalServices(options: ServiceOptions) {
    const repo = new ValidatingCmsRepository(new LocalFsCmsRepository(options.siteDir, options.built));
    const integrationBlocRepository = new ValidatingCmsRepository(
        new LocalFsCmsRepository(options.siteDir, options.built, { blocRootDir: GENERATED_BLOCS_DIR }),
    );
    const files = new LocalFsCmsFiles(`${options.siteDir}/files`);
    await reconcileLocalFiles(files);
    const filesMetadata = new ValidatingCmsFilesMetadata(files);
    const { auth, users, identityProviders, pats, credentials, devAdmin } = await createDevAuth();
    const sources = await createDevSources(options.siteDir);
    const sourceOverlays = new LocalFsSourceOverlayRepository(options.siteDir);
    const secrets = new ValidatingSecretStore(LocalFsEnvSecretStore.forSite(options.siteDir));
    const integrations = createLocalIntegrationServices(
        options.siteDir,
        `http://${options.publicHost}:${options.port}/.cms/repository`,
        secrets,
    );
    const integrationInstallations = new LocalFsIntegrationInstallationRepository(options.siteDir);
    const dashboards = new LocalFsDashboardRepository(options.siteDir);
    const relations = new LocalFsRelationRepository(options.siteDir);
    const functions = new LocalFsFunctionRepository(options.siteDir);
    const triggers = new LocalFsTriggerRepository(options.siteDir);
    const identities = new InMemoryIdentityService();
    const resolveSecret = createSecretResolver(secrets);
    const deliverySources = new SourceOverlaySourceRepository(sources, sourceOverlays, {
        deps: { resolveSecret, identities },
    });
    const roles = new ValidatingRolesRepository(new InMemoryRolesRepository());
    await seedDevSourceAccess(roles, sources);
    await seedDevSourceAccess(roles, new FunctionSourceRepository(functions));
    const publicAuth = {
        local: new LocalAuthentication<CMS_ROLES>({
            providerId: "local",
            loginPagePath: "/.cms/auth/login",
            logoutPath: "/.cms/auth/logout",
            credentials,
            resolver: new SubjectResolver<CMS_ROLES>(users, "user"),
            codec: new SignedCookieCodec(new TextEncoder().encode("p9r-dev-public-auth-session")),
            cookieName: "p9r-dev-site-session",
            defaultHome: "/",
            pats,
        }),
        credentials,
        users,
        tokens: new InMemoryAuthTokenStore(),
        emailer: new ConfiguredEmailer({
            readSettings: async () => (await repo.getSystem()).email,
            secrets,
        }),
        emailComposer: new TemplatedAuthEmailComposer({
            readTemplates: async () => (await repo.getSystem()).email.templates,
        }),
        defaultRole: "user" as CMS_ROLES,
        siteName: `p9r ${options.command}`,
        authEmailCooldownSeconds: 0,
        emailVerificationUrl: `http://${options.publicHost}:${options.deliveryPort}/auth/confirm-email`,
        passwordResetUrl: `http://${options.publicHost}:${options.deliveryPort}/auth/reset-password`,
    };

    return {
        repo,
        integrationBlocRepository,
        files,
        filesMetadata,
        auth,
        users,
        identityProviders,
        pats,
        credentials,
        devAdmin,
        sources,
        sourceOverlays,
        secrets,
        ...integrations,
        integrationInstallations,
        dashboards,
        relations,
        functions,
        triggers,
        identities,
        resolveSecret,
        deliverySources,
        roles,
        publicAuth,
    };
}

export type LocalServices = Awaited<ReturnType<typeof createLocalServices>>;
