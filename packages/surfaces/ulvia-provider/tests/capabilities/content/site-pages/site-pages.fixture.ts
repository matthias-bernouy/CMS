import { InMemoryContentRepository, ValidatingContentRepository } from "@bernouy/cms-content";
import { CapabilityGateway } from "@bernouy/cms-gateway";
import { InMemoryGatewayCommandAuditStore } from "@bernouy/cms-gateway/audit";
import { createCapabilityHttpHandler } from "@bernouy/cms-gateway/http/handlers";
import { CapabilityMcpBinding, capabilityToolName } from "@bernouy/cms-gateway/mcp";
import { InMemoryReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import { DefaultProviderCapabilityDispatcher, ProviderCapabilityDispatchError } from "@bernouy/ulvia-provider";
import { compileOfficialFeatures } from "@bernouy/ulvia-provider/build";
import { mountContentForTest } from "../mount";
import { contentRoute, NOW } from "./route";

export const CONTRACT = "ulvia/cms.content";
export const PAGE_FIELDS = ["notFound", "forbidden", "serverError", "login"] as const;
export const ADMIN = { siteId: "site-a", actor: { kind: "administrator", subjectId: "admin" } } as const;

export async function sitePagesFixture() {
    const build = await compileOfficialFeatures();
    const admission = build.contracts.find(({ release }) => release.contractId === CONTRACT)!;
    const catalogue = new InMemoryReleaseCatalogue();
    const release = await catalogue.publish(admission);
    const route = await contentRoute(release, catalogue);
    const repository = new ValidatingContentRepository(new InMemoryContentRepository());
    const references: Record<string, { pageId: string }> = {};
    for (const field of PAGE_FIELDS) {
        await repository.insertPage(`/${field}`, field);
        references[field] = { pageId: (await repository.getPage(`/${field}`))!.id };
    }
    const pageReads: string[] = [];
    const getPage = repository.getPageById.bind(repository);
    repository.getPageById = async (id) => {
        pageReads.push(id);
        return getPage(id);
    };
    repository.getAllPages = async () => {
        throw new Error("Site settings must not scan all Pages");
    };
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    await mountContentForTest(
        dispatcher,
        { repo: repository },
        { siteId: "site-a", providerId: "ulvia/ulvia.example" },
    );
    let dispatches = 0;
    const gateway = new CapabilityGateway({
        routes: { resolve: async () => route, isCurrent: async () => true },
        authorize: async () => true,
        identities: { getOrCreate: async () => "provider-admin", resolve: async () => null },
        now: () => NOW,
        commandAudit: new InMemoryGatewayCommandAuditStore(),
        transport: {
            async send(request) {
                dispatches += 1;
                try {
                    const output = await dispatcher.invoke(CONTRACT, request.capability.id, request.input, {
                        requestId: request.requestId,
                        contractVersion: "1.0.0",
                        siteId: "site-a",
                        providerId: "ulvia/ulvia.example",
                    });
                    return { status: 200, contentType: "application/json", output };
                } catch (error) {
                    if (!(error instanceof ProviderCapabilityDispatchError)) {
                        throw error;
                    }
                    return {
                        status: error.status,
                        contentType: "application/json",
                        errorCode: error.code,
                        output: error.output,
                    };
                }
            },
        },
    });
    const binding = new CapabilityMcpBinding({ invoker: gateway, contracts: async () => [admission] });
    const http = createCapabilityHttpHandler({
        basePath: "",
        siteId: "site-a",
        invoker: gateway,
        resolveActor: async () => ADMIN.actor,
    });
    const call = (capability: "get" | "update", input = {}) =>
        binding.call(
            capabilityToolName(CONTRACT, `site.${capability}`, "mcp", `content_site_${capability}`),
            { input },
            ADMIN,
        );
    return { repository, references, pageReads, binding, gateway, http, call, dispatches: () => dispatches };
}
