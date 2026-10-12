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
            CMS_FILES_DIR: "/var/lib/cms/files/instance-00000000-0000-4000-8000-000000000001",
            ULVIA_PROVIDER_URL: "http://ulvia-provider:5103",
            ULVIA_INSTANCE_TOKEN: "g".repeat(48),
            CMS_SESSION_SECRET: "c".repeat(64),
            CMS_KEK_HEX: "d".repeat(64),
        });
        expect(cms.environment?.ULVIA_PROVIDER_OPERATOR_TOKEN).toBeUndefined();
        expect(cms.network_mode).toBeUndefined();
        expect(Object.keys(cms.networks ?? {}).sort()).toEqual(["cms_mongo", "cms_provider", "cms_proxy"]);
        expect(cms.networks?.cms_proxy).toMatchObject({ gw_priority: 1 });
        expect(config.networks?.cms_provider).toMatchObject({ external: true, name: "cms_provider" });
        expect(cms.volumes?.map(({ source }) => source)).toEqual(["cms_files"]);
        expect(cms.read_only).toBe(true);
        expect(cms.cap_drop).toEqual(["ALL"]);
    });
});
