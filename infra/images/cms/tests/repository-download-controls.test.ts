import { expect, test } from "bun:test";
import {
    composeTest,
    instanceComposeFile,
    instanceComposeSource,
    instanceEnvExampleSource,
    renderCompose,
    requiredCmsEnvironment,
} from "./deployment-fixtures";

const deploymentEnvironment = {
    ...requiredCmsEnvironment,
    DOMAIN: "integrations.example.test",
    MONGO_URL: "mongodb://cms_app:password@mongo:27017/cms_integrations?authSource=admin",
};

test("requires every CMS instance to configure the global integration repository", () => {
    expect(instanceComposeSource).toContain(
        "${P9R_INTEGRATION_REPOSITORY_URL:?P9R_INTEGRATION_REPOSITORY_URL must point to the public integration repository API}",
    );
    expect(instanceComposeSource).not.toContain("P9R_INTEGRATION_REPOSITORY_URL:-");
    expect(instanceEnvExampleSource).toContain(
        "P9R_INTEGRATION_REPOSITORY_URL=https://repository.example.com/.cms/repository",
    );
});

composeTest("rejects an instance whose global integration repository URL is missing", () => {
    const { P9R_INTEGRATION_REPOSITORY_URL: _repositoryUrl, ...withoutRepository } = requiredCmsEnvironment;

    expect(() =>
        renderCompose(instanceComposeFile, {
            ...withoutRepository,
            DOMAIN: "missing-repository.example.test",
            MONGO_URL: "mongodb://cms_app:password@mongo:27017/cms_missing_repository?authSource=admin",
        }),
    ).toThrow(/P9R_INTEGRATION_REPOSITORY_URL/u);
});

composeTest("enables package download protection for the standard proxy topology", () => {
    const config = renderCompose(instanceComposeFile, deploymentEnvironment);

    expect(config.services.cms.environment).toMatchObject({
        CMS_HTTP_CLIENT_ADDRESS_MODE: "trusted-proxy",
        CMS_HTTP_TRUSTED_PROXY_HOPS: "1",
        CMS_INTEGRATION_PACKAGE_DOWNLOAD_LIMIT: "60",
        CMS_INTEGRATION_PACKAGE_DOWNLOAD_WINDOW_SECONDS: "60",
        CMS_REPOSITORY_HUB_FACADE_ENABLED: "false",
        ANALYTICS_TRUST_PROXY: "false",
    });
});

composeTest("counts a CDN in front of nginx-proxy as a second trusted hop", () => {
    const config = renderCompose(instanceComposeFile, {
        ...deploymentEnvironment,
        CMS_HTTP_TRUSTED_PROXY_HOPS: "2",
        CMS_INTEGRATION_PACKAGE_DOWNLOAD_LIMIT: "120",
        CMS_INTEGRATION_PACKAGE_DOWNLOAD_WINDOW_SECONDS: "90",
    });

    expect(config.services.cms.environment).toMatchObject({
        CMS_HTTP_CLIENT_ADDRESS_MODE: "trusted-proxy",
        CMS_HTTP_TRUSTED_PROXY_HOPS: "2",
        CMS_INTEGRATION_PACKAGE_DOWNLOAD_LIMIT: "120",
        CMS_INTEGRATION_PACKAGE_DOWNLOAD_WINDOW_SECONDS: "90",
    });
});

test("documents the protected one-hop default without a repository read token", () => {
    expect(instanceEnvExampleSource).toContain("CMS_HTTP_CLIENT_ADDRESS_MODE=trusted-proxy");
    expect(instanceEnvExampleSource).toContain("CMS_HTTP_TRUSTED_PROXY_HOPS=1");
    expect(instanceEnvExampleSource).toContain("CMS_INTEGRATION_PACKAGE_DOWNLOAD_LIMIT=60");
    expect(instanceEnvExampleSource).toContain("CMS_INTEGRATION_PACKAGE_DOWNLOAD_WINDOW_SECONDS=60");
    expect(instanceEnvExampleSource).toContain("CMS_REPOSITORY_HUB_FACADE_ENABLED=false");
    expect(instanceComposeSource).not.toContain("P9R_INTEGRATION_REPOSITORY_TOKEN");
    expect(instanceEnvExampleSource).not.toContain("P9R_INTEGRATION_REPOSITORY_TOKEN");
});
