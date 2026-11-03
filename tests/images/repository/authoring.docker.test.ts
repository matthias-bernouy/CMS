import { expect, test } from "bun:test";
import { mcpContainers } from "../../integration/instance/containers";
import { repositoryApi } from "../../integration/instance/repository/client";
import { exerciseCmsAuthoring } from "../../integration/instance/repository/clientFlows";

const images = { edge: process.env.ULVIA_MCP_EDGE_DOCKER_IMAGE, provider: process.env.ULVIA_MCP_PROVIDER_DOCKER_IMAGE };

test.skipIf(!images.edge || !images.provider)(
    "a separate ordinary CMS publishes with a Repository account PAT and private sources remain owner-authorized",
    async () => {
        const f = await mcpContainers(images as Record<keyof typeof images, string>);
        try {
            const registry = repositoryApi(f.repositoryUrl);
            const other = await registry.signup("other@example.test", "Other-publisher-long-password");
            expect(other.administrator).toBe(false);
            const otherPat = await registry.pat(other.cookie);
            const cms = repositoryApi(f.cmsUrl);
            const admin = await cms.session(f.administrator.email, f.administrator.password);
            expect(admin.administrator).toBe(true);
            await exerciseCmsAuthoring(cms, f.repositoryUrl, admin, f.repository.pat, otherPat);
        } catch (error) {
            throw new Error(`${String(error)}\n${await f.diagnostics()}`);
        } finally {
            await f.close();
        }
    },
    240_000,
);
