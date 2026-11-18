import { capabilityToolName } from "@bernouy/cms-gateway/mcp";
import { sitePagesFixture, ADMIN, CONTRACT } from "../site-pages/site-pages.fixture";

export async function editingFixture() {
    const fixture = await sitePagesFixture();
    const call = (capability: string, input = {}) =>
        fixture.binding.call(
            capabilityToolName(CONTRACT, capability, "mcp", `content_${capability.replaceAll(/[.-]/g, "_")}`),
            { input },
            ADMIN,
        );
    const http = (path: string, input: unknown, method = "POST") =>
        fixture.http(
            new Request(`https://site.test/.cms/call/${CONTRACT}${path}`, {
                method,
                headers: { "content-type": "application/json" },
                body: JSON.stringify(input),
            }),
        );
    return { ...fixture, call, request: http };
}
