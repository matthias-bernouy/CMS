import { resolve } from "node:path";
import { InMemoryContentRepository, ValidatingContentRepository } from "@bernouy/cms-content";
import { CapabilityGateway } from "@bernouy/cms-gateway";
import { InMemoryGatewayCommandAuditStore } from "@bernouy/cms-gateway/audit";
import { createCapabilityHttpHandler } from "@bernouy/cms-gateway/http/handlers";
import { CapabilityMcpBinding } from "@bernouy/cms-gateway/mcp";
import { admitContractRelease } from "@bernouy/cms-repository/contracts";
import { InMemoryReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import { admitProviderManifest } from "@bernouy/cms-repository/providers";
import { DefaultProviderCapabilityDispatcher, ProviderCapabilityDispatchError } from "@bernouy/ulvia-provider";
import { registerContentCapabilities } from "@bernouy/ulvia-provider/capabilities";
import { gatewayRoute, NOW } from "../../../../../features/cms-gateway/tests/fixtures";

export const CONTRACT = "ulvia.cms.content";
export const PAGE_FIELDS = ["notFound", "forbidden", "serverError", "login"] as const;
export const ADMIN = { siteId: "site-a", actor: { kind: "administrator", subjectId: "admin" } } as const;

export async function sitePagesFixture() {
    const root = resolve(import.meta.dir, "../../../../../official-repository/contracts/ulvia.cms.content");
    const capabilities = await Promise.all(
        ["queries/get.json", "commands/update.json"].map(async (path) => {
            const capability = await Bun.file(resolve(root, "capabilities/site", path)).json();
            delete capability.docs;
            return capability;
        }),
    );
    const admission = await admitContractRelease({
        ...(await Bun.file(resolve(root, "definition.json")).json()),
        capabilities,
    });
    const catalogue = new InMemoryReleaseCatalogue();
    const release = await catalogue.publish(admission);
    const base = await gatewayRoute({ contractId: CONTRACT, access: "admin" });
    const manifest = await admitProviderManifest(
        {
            ...base.manifest.admission.manifest,
            implementations: [{ contractId: CONTRACT, version: "1.0.0", digest: admission.digest, requires: [] }],
        },
        catalogue,
    );
    const installation = structuredClone(base.installation);
    installation.installation.approval.manifestDigest = manifest.digest;
    installation.observation!.report.manifest.digest = manifest.digest;
    installation.observation!.report.implementations[0]!.digest = admission.digest;
    const route = {
        ...base,
        release,
        requestedRelease: release,
        selection: { ...base.selection, digest: admission.digest },
        manifest: { admission: manifest, publishedAt: NOW },
        installation,
        lineage: [
            {
                contractId: CONTRACT,
                version: "1.0.0",
                digest: admission.digest,
                name: admission.release.name,
                capabilityIds: capabilities.map((capability) => capability.id),
            },
        ],
    };
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
    registerContentCapabilities(dispatcher, { repo: repository } as never);
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
                        providerId: "ulvia.example",
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
        binding.call(`content_site_${capability}`, { input }, ADMIN);
    return { repository, references, pageReads, binding, gateway, http, call, dispatches: () => dispatches };
}
