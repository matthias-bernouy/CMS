import { describe, expect } from "bun:test";
import { composeTest, instanceComposeFile, renderCompose, requiredCmsEnvironment } from "./deployment-fixtures.ts";

describe("per-instance Compose rendering", () => {
    composeTest("runs only one isolated Kernel against shared services", () => {
        const config = renderCompose(instanceComposeFile, {
            ...requiredCmsEnvironment,
            DOMAIN: "client.example.test",
        });
        const cms = config.services.cms;

        expect(Object.keys(config.services)).toEqual(["cms"]);
        expect(cms.environment).toMatchObject({
            CMS_INSTALLATIONS_PROVIDER_URL: "http://ulvia-provider:5103",
            CMS_INSTALLATIONS_PROVIDER_TOKEN: "g".repeat(48),
        });
        expect(cms.environment?.MONGO_URL).toBeUndefined();
        expect(cms.environment?.CMS_FILES_DIR).toBeUndefined();
        expect(cms.environment?.CMS_SESSION_SECRET).toBeUndefined();
        expect(cms.environment?.CMS_KEK_HEX).toBeUndefined();
        expect(cms.environment?.ULVIA_PROVIDER_OPERATOR_TOKEN).toBeUndefined();
        expect(cms.network_mode).toBeUndefined();
        expect(Object.keys(cms.networks ?? {}).sort()).toEqual(["cms_provider", "cms_proxy"]);
        expect(cms.networks?.cms_proxy).toMatchObject({ gw_priority: 1 });
        expect(config.networks?.cms_provider).toMatchObject({ external: true, name: "cms_provider" });
        expect(cms.volumes).toBeUndefined();
        expect(cms.read_only).toBe(true);
        expect(cms.cap_drop).toEqual(["ALL"]);
    });
});
