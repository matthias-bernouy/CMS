import { describe, expect, test } from "bun:test";
import {
    composeTest,
    externalDockerfileBaseImages,
    extractMatches,
    infrastructureComposeFile,
    infrastructureComposeSource,
    instanceComposeFile,
    instanceComposeSource,
    mongoBootstrapSource,
    mongoPreflightSource,
    renderCompose,
    requiredCmsEnvironment,
} from "./deployment-fixtures.ts";

describe("per-instance Compose rendering", () => {
    composeTest("uses the shared MongoDB account with an instance-specific database", () => {
        const appPassword = "b".repeat(64);
        const mongoUrl = `mongodb://cms_app:${appPassword}@mongo:27017/cms_client?authSource=admin`;
        const config = renderCompose(instanceComposeFile, {
            ...requiredCmsEnvironment,
            DOMAIN: "client.example.test",
            MONGO_URL: mongoUrl,
        });

        expect(Object.keys(config.services)).toEqual(["cms"]);

        const cms = config.services.cms;
        expect(cms.environment?.MONGO_URL).toBe(mongoUrl);
        expect(Object.keys(cms.networks ?? {}).sort()).toEqual(["cms_mongo", "cms_proxy"]);
        expect(cms.networks?.cms_proxy).toMatchObject({ gw_priority: 1 });
        expect(config.networks?.cms_mongo).toMatchObject({ name: "cms_mongo", external: true });
        expect(config.networks?.cms_proxy).toMatchObject({ name: "cms_proxy", external: true });

        expect(cms.init).toBe(true);
        expect(cms.read_only).toBe(true);
        expect(cms.cap_drop).toEqual(["ALL"]);
        expect(cms.security_opt).toContain("no-new-privileges:true");
        expect(cms.tmpfs).toContain("/tmp:rw,nosuid,nodev,noexec,size=256m");
        expect(cms.ports).toBeUndefined();
        expect(cms.environment).toMatchObject({
            ENDPOINT_PERFORMANCE_ENABLED: "true",
            SOURCE_TIMING_SAMPLE_RATE: "0.01",
            SOURCE_SLOW_REQUEST_THRESHOLD_MS: "1000",
            CMS_SOURCE_IMAGE_TRANSFORMS_ENABLED: "true",
            CMS_RESPONSIVE_PUBLIC_SOURCE_IMAGES_ENABLED: "true",
            CMS_RESPONSIVE_PRIVATE_SOURCE_IMAGES_ENABLED: "true",
        });
    });

    composeTest("preserves an external cluster URL without requiring INSTANCE_ID", () => {
        const mongoUrl = "mongodb+srv://cms_user:password@cluster.example.test/cms-client?retryWrites=true&w=majority";
        const config = renderCompose(instanceComposeFile, {
            ...requiredCmsEnvironment,
            DOMAIN: "external.example.test",
            MONGO_URL: mongoUrl,
        });

        expect(Object.keys(config.services)).toEqual(["cms"]);
        expect(config.services.cms.environment?.MONGO_URL).toBe(mongoUrl);
    });
});

describe("shared infrastructure Compose rendering", () => {
    composeTest("contains pinned proxy and authenticated MongoDB services", () => {
        const rootPassword = "a".repeat(64);
        const appPassword = "b".repeat(64);
        const config = renderCompose(infrastructureComposeFile, {
            LETSENCRYPT_EMAIL: "ops@example.test",
            MONGO_ROOT_USERNAME: "cms_root",
            MONGO_ROOT_PASSWORD: rootPassword,
            MONGO_APP_USERNAME: "cms_app",
            MONGO_APP_PASSWORD: appPassword,
        });

        expect(Object.keys(config.services).sort()).toEqual(["acme-companion", "mongo", "nginx-proxy"]);

        const pinnedImage = /:\d+(?:\.\d+){1,2}(?:-[a-z0-9.-]+)?@sha256:[a-f0-9]{64}$/i;
        for (const serviceName of ["nginx-proxy", "acme-companion", "mongo"]) {
            expect(config.services[serviceName].image).toMatch(pinnedImage);
        }

        const mongo = config.services.mongo;
        expect(mongo.entrypoint).toEqual(["/bin/sh", "/opt/cms-mongo/validate-env.sh"]);
        expect(mongo.ports).toBeUndefined();
        expect(Object.keys(mongo.networks ?? {})).toEqual(["cms_mongo"]);
        expect(mongo.networks?.cms_mongo).toMatchObject({ aliases: ["mongo"] });
        expect(config.networks?.cms_mongo).toMatchObject({ name: "cms_mongo", internal: true });
        expect(mongo.environment).toMatchObject({
            MONGO_INITDB_ROOT_USERNAME: "cms_root",
            MONGO_INITDB_ROOT_PASSWORD: rootPassword,
            MONGO_APP_USERNAME: "cms_app",
            MONGO_APP_PASSWORD: appPassword,
        });
    });
});

describe("deployment definition safeguards", () => {
    test("creates exactly the shared root and readWriteAnyDatabase roles", () => {
        const roleBindings = Array.from(
            mongoBootstrapSource.matchAll(/roles:\s*\[\{\s*role:\s*["']([^"']+)["'],\s*db:\s*["']([^"']+)["']\s*\}\]/g),
            (match) => ({ role: match[1], database: match[2] }),
        );

        expect(roleBindings).toEqual([
            { role: "root", database: "admin" },
            { role: "readWriteAnyDatabase", database: "admin" },
        ]);
        expect(mongoBootstrapSource).not.toMatch(/role:\s*["']readWrite["']/);
        expect(mongoBootstrapSource).not.toContain("MONGO_APP_DATABASE");
        expect(mongoBootstrapSource).toContain('assertOnlyRole(existingApp, appUsername, "readWriteAnyDatabase")');
    });

    test("requires 64-character hexadecimal root and application passwords", () => {
        expect(mongoBootstrapSource).toContain('const rootPassword = requiredHexSecret("MONGO_INITDB_ROOT_PASSWORD")');
        expect(mongoBootstrapSource).toContain('const appPassword = requiredHexSecret("MONGO_APP_PASSWORD")');
        expect(mongoBootstrapSource).toContain("/^[a-fA-F0-9]{64}$/");
        expect(mongoPreflightSource).toContain("validate_hex_secret MONGO_INITDB_ROOT_PASSWORD");
        expect(mongoPreflightSource).toContain("validate_hex_secret MONGO_APP_PASSWORD");
        expect(mongoPreflightSource).toContain('exec /usr/local/bin/docker-entrypoint.sh "$@"');
    });

    test("does not use a latest image tag", () => {
        const imageReferences = [
            ...extractMatches(instanceComposeSource, /^\s*image:\s+([^\s#]+)/gim),
            ...extractMatches(infrastructureComposeSource, /^\s*image:\s+([^\s#]+)/gim),
            ...externalDockerfileBaseImages(),
        ];

        expect(imageReferences.length).toBeGreaterThan(0);
        for (const imageReference of imageReferences) {
            expect(imageReference).not.toMatch(/:latest(?:@sha256:[a-f0-9]{64})?$/i);
        }
    });

    test("pins every external Dockerfile base image by version and digest", () => {
        const baseImages = externalDockerfileBaseImages();

        expect(baseImages.length).toBeGreaterThan(0);
        for (const baseImage of baseImages) {
            expect(baseImage).toMatch(/:\d+(?:\.\d+)+-[a-z0-9.-]+@sha256:[a-f0-9]{64}$/i);
        }
    });
});
