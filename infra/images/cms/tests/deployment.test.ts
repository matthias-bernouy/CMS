import { describe, expect, test } from "bun:test";
import {
    composeTest,
    dockerfileSource,
    externalDockerfileBaseImages,
    extractMatches,
    infrastructureComposeFile,
    infrastructureComposeSource,
    instanceComposeSource,
    mongoBootstrapSource,
    mongoProviderBootstrapSource,
    mongoPreflightSource,
    renderCompose,
    requiredInfrastructureEnvironment,
} from "./deployment-fixtures.ts";

describe("shared infrastructure Compose rendering", () => {
    composeTest("contains pinned proxy and authenticated MongoDB services", () => {
        const config = renderCompose(infrastructureComposeFile, requiredInfrastructureEnvironment);

        expect(Object.keys(config.services).sort()).toEqual([
            "acme-companion",
            "mongo",
            "nginx-proxy",
            "provider",
            "repository",
        ]);

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
            MONGO_INITDB_ROOT_PASSWORD: requiredInfrastructureEnvironment.MONGO_ROOT_PASSWORD,
        });
        expect(config.services.provider.environment).toMatchObject({
            ULVIA_PROVIDER_HOST: "0.0.0.0",
            ULVIA_PROVIDER_PUBLIC_URL: "http://127.0.0.1:5103",
            CMS_REPOSITORY_URL: "http://repository:3100",
        });
        expect(config.networks?.cms_provider).toMatchObject({ name: "cms_provider", internal: true });
    });
});

describe("deployment definition safeguards", () => {
    test("keeps root infrastructure-only and gives only the Provider cross-database access", () => {
        expect(mongoBootstrapSource).toContain('roles[0].role !== "root"');
        expect(mongoProviderBootstrapSource).toContain('role: "readWriteAnyDatabase"');
        expect(mongoProviderBootstrapSource).not.toContain('role: "root"');
    });

    test("requires 64-character hexadecimal infrastructure passwords", () => {
        expect(mongoPreflightSource).toContain("validate_hex_secret MONGO_INITDB_ROOT_PASSWORD");
        expect(mongoPreflightSource).toContain("validate_hex_secret MONGO_PROVIDER_PASSWORD");
        expect(mongoPreflightSource).toContain('exec /usr/local/bin/docker-entrypoint.sh "$@"');
    });

    test("normalizes the mongosh environment before dynamic variable access", () => {
        expect(mongoBootstrapSource).toContain("const environment = { ...process.env }");
        expect(mongoProviderBootstrapSource).toContain("const environment = { ...process.env }");
        expect(mongoBootstrapSource).toContain("String(raw).trim()");
        expect(mongoProviderBootstrapSource).toContain("String(raw).trim()");
        expect(`${mongoBootstrapSource}\n${mongoProviderBootstrapSource}`).not.toContain("process.env[name]");
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

    test("prepares the writable file mount only for the Provider runtime", () => {
        expect(dockerfileSource).toContain("/var/lib/cms/files");
        expect(infrastructureComposeSource).toContain("- cms_files:/var/lib/cms/files");
        expect(instanceComposeSource).not.toContain("/var/lib/cms/files");
    });

    test("installs both runtime entrypoint dependency closures", () => {
        expect(dockerfileSource).toContain("--filter=@bernouy/cms-kernel-server");
        expect(dockerfileSource).toContain("--filter=@bernouy/ulvia-provider-server");
        expect(dockerfileSource).toContain("--filter=@bernouy/official-repository-server");
        expect(dockerfileSource).not.toContain("--omit=peer");
    });
});
