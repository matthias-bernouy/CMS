import { describe, expect } from "bun:test";
import {
    cmsDirectory,
    composeTest,
    instanceComposeFile,
    renderCompose,
    requiredCmsEnvironment,
} from "./deployment-fixtures.ts";

describe("per-instance Compose rendering", () => {
    composeTest("can start the repository and Provider before an instance exists", () => {
        const {
            MONGO_URL: _mongoUrl,
            ULVIA_INSTANCE_TOKEN: _token,
            ULVIA_INSTANCE_STORAGE_KEY: _storage,
            ...phaseOne
        } = { ...requiredCmsEnvironment, MONGO_URL: "unused" };
        const config = renderCompose(instanceComposeFile, { ...phaseOne, DOMAIN: "client.example.test" });

        expect(config.services.provider.environment?.MONGO_URL).toBe(requiredCmsEnvironment.ULVIA_PROVIDER_MONGO_URL);
        expect(config.services.cms.environment).toMatchObject({
            CMS_FILES_DIR: "/var/lib/cms/files/unprovisioned",
            MONGO_URL: "mongodb://unprovisioned.invalid/unprovisioned",
            ULVIA_INSTANCE_TOKEN: "unprovisioned-instance-token-not-valid",
        });
    });

    composeTest("uses isolated Provider and Kernel database credentials", () => {
        const mongoUrl = `mongodb://cms_client:${"b".repeat(64)}@mongo:27017/cms_client?authSource=cms_client`;
        const config = renderCompose(instanceComposeFile, {
            ...requiredCmsEnvironment,
            DOMAIN: "client.example.test",
            MONGO_URL: mongoUrl,
        });
        const cms = config.services.cms;
        const provider = config.services.provider;

        expect(Object.keys(config.services).sort()).toEqual(["cms", "provider", "repository"]);
        expect(cms.environment).toMatchObject({
            CMS_FILES_DIR: "/var/lib/cms/files/instance-00000000-0000-4000-8000-000000000001",
            MONGO_URL: mongoUrl,
            ULVIA_PROVIDER_URL: "http://127.0.0.1:5103",
            ULVIA_INSTANCE_TOKEN: "g".repeat(48),
        });
        expect(cms.environment?.MONGO_URL).not.toBe(requiredCmsEnvironment.ULVIA_PROVIDER_MONGO_URL);
        expect(cms.environment?.ULVIA_PROVIDER_OPERATOR_TOKEN).toBeUndefined();
        expect(provider.environment?.MONGO_URL).toBe(requiredCmsEnvironment.ULVIA_PROVIDER_MONGO_URL);
        expect(provider.environment?.ULVIA_INSTANCE_TOKEN).toBeUndefined();
        expect(provider.environment).toMatchObject({
            ULVIA_PROVIDER_HOST: "127.0.0.1",
            ULVIA_PROVIDER_PUBLIC_URL: "http://127.0.0.1:5103",
        });

        expect(cms.network_mode).toBe("service:provider");
        expect(cms.networks).toBeUndefined();
        expect(Object.keys(provider.networks ?? {}).sort()).toEqual(["cms_internal", "cms_mongo", "cms_proxy"]);
        expect(provider.networks?.cms_proxy).toMatchObject({ gw_priority: 1 });
        expect(config.networks?.cms_mongo).toMatchObject({ name: "cms_mongo", external: true });
        expect(config.networks?.cms_proxy).toMatchObject({ name: "cms_proxy", external: true });
        expect(config.networks?.cms_internal).toMatchObject({ internal: true });

        expect(cms.init).toBe(true);
        expect(cms.read_only).toBe(true);
        expect(cms.cap_drop).toEqual(["ALL"]);
        expect(cms.security_opt).toContain("no-new-privileges:true");
        expect(cms.tmpfs).toContain("/tmp:rw,nosuid,nodev,noexec,size=256m");
        expect(cms.ports).toBeUndefined();
        expect(cms.volumes?.map(({ target }) => target)).toEqual(["/var/lib/cms/files"]);
        expect(cms.volumes?.map(({ source }) => source)).toEqual([`${cmsDirectory}/files`]);

        const repository = config.services.repository;
        expect(Object.keys(repository.networks ?? {})).toEqual(["cms_internal"]);
        expect(repository.environment).toMatchObject({
            REPOSITORY_PORT: "3100",
            ULVIA_REPOSITORY_DIR: "/var/lib/ulvia-repository/current",
            ULVIA_REPOSITORY_SEED_DIR: "/opt/ulvia-repository-seed",
        });
        expect(repository.volumes?.map(({ target }) => target)).toEqual(["/var/lib/ulvia-repository"]);
        expect(repository.read_only).toBe(true);
    });

    composeTest("preserves an external Kernel database URL", () => {
        const mongoUrl = "mongodb+srv://cms_user:password@cluster.example.test/cms-client?retryWrites=true&w=majority";
        const config = renderCompose(instanceComposeFile, {
            ...requiredCmsEnvironment,
            DOMAIN: "external.example.test",
            MONGO_URL: mongoUrl,
        });

        expect(config.services.cms.environment?.MONGO_URL).toBe(mongoUrl);
        expect(config.services.provider.environment?.MONGO_URL).toBe(requiredCmsEnvironment.ULVIA_PROVIDER_MONGO_URL);
    });
});
