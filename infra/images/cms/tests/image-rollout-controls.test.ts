import { expect, test } from "bun:test";
import {
    composeTest,
    instanceComposeFile,
    instanceEnvExampleSource,
    renderCompose,
    requiredCmsEnvironment,
} from "./deployment-fixtures";

test("documents every Source image switch as enabled by default", () => {
    expect(instanceEnvExampleSource).toContain("CMS_SOURCE_IMAGE_TRANSFORMS_ENABLED=true");
    expect(instanceEnvExampleSource).toContain("CMS_RESPONSIVE_PUBLIC_SOURCE_IMAGES_ENABLED=true");
    expect(instanceEnvExampleSource).toContain("CMS_RESPONSIVE_PRIVATE_SOURCE_IMAGES_ENABLED=true");
});

composeTest("forwards independent Source image rollout switches to the runtime", () => {
    const config = renderCompose(instanceComposeFile, {
        ...requiredCmsEnvironment,
        DOMAIN: "images.example.test",
        MONGO_URL: "mongodb://cms_app:password@mongo:27017/cms_images?authSource=admin",
        CMS_SOURCE_IMAGE_TRANSFORMS_ENABLED: "true",
        CMS_RESPONSIVE_PUBLIC_SOURCE_IMAGES_ENABLED: "true",
        CMS_RESPONSIVE_PRIVATE_SOURCE_IMAGES_ENABLED: "false",
    });

    expect(config.services.cms.environment).toMatchObject({
        CMS_SOURCE_IMAGE_TRANSFORMS_ENABLED: "true",
        CMS_RESPONSIVE_PUBLIC_SOURCE_IMAGES_ENABLED: "true",
        CMS_RESPONSIVE_PRIVATE_SOURCE_IMAGES_ENABLED: "false",
    });
});
