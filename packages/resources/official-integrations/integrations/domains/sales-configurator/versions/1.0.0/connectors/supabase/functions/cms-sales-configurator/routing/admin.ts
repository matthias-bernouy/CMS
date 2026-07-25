import { requireCmsAdmin } from "../core/auth.ts";
import { methodNotAllowed } from "../core/http.ts";
import { getCatalogKind, listCatalogKind } from "../routes/admin/catalog-read.ts";
import { listRequirements, listVariantFeatures } from "../routes/admin/catalog-relationships.ts";
import {
    deleteRequirement,
    deleteVariantFeature,
    upsertCatalogItem,
    upsertRequirement,
    upsertVariantFeature,
} from "../routes/admin/catalog-write.ts";
import { getPartner, listPartners, setPartnerCapability, upsertPartner } from "../routes/admin/partners.ts";
import { getAdminProposal, listAdminProposals, transitionAdminProposal } from "../routes/admin/proposals.ts";

export async function handleAdminRoute(route: string, request: Request): Promise<Response | null> {
    if (!route.startsWith("/admin/")) {
        return null;
    }
    requireCmsAdmin(request);

    for (const [plural, singular, kind] of catalogRoutes) {
        if (route === plural) {
            return request.method === "GET" ? await listCatalogKind(request, kind) : methodNotAllowed("GET");
        }
        if (route === singular) {
            if (request.method === "GET") {
                return await getCatalogKind(request, kind);
            }
            if (request.method === "POST") {
                return await upsertCatalogItem(request, kind);
            }
            return methodNotAllowed("GET", "POST");
        }
    }
    if (route === "/admin/variant-features") {
        return request.method === "GET" ? await listVariantFeatures(request) : methodNotAllowed("GET");
    }
    if (route === "/admin/variant-feature") {
        if (request.method === "POST") {
            return await upsertVariantFeature(request);
        }
        if (request.method === "DELETE") {
            return await deleteVariantFeature(request);
        }
        return methodNotAllowed("POST", "DELETE");
    }
    if (route === "/admin/requirements") {
        return request.method === "GET" ? await listRequirements(request) : methodNotAllowed("GET");
    }
    if (route === "/admin/requirement") {
        if (request.method === "POST") {
            return await upsertRequirement(request);
        }
        if (request.method === "DELETE") {
            return await deleteRequirement(request);
        }
        return methodNotAllowed("POST", "DELETE");
    }
    return await handleAdminBusinessRoute(route, request);
}

async function handleAdminBusinessRoute(route: string, request: Request): Promise<Response | null> {
    if (route === "/admin/partners") {
        return request.method === "GET" ? await listPartners(request) : methodNotAllowed("GET");
    }
    if (route === "/admin/partner") {
        if (request.method === "GET") {
            return await getPartner(request);
        }
        if (request.method === "POST") {
            return await upsertPartner(request);
        }
        return methodNotAllowed("GET", "POST");
    }
    if (route === "/admin/partner/capability") {
        return request.method === "POST" ? await setPartnerCapability(request) : methodNotAllowed("POST");
    }
    if (route === "/admin/proposals") {
        return request.method === "GET" ? await listAdminProposals(request) : methodNotAllowed("GET");
    }
    if (route === "/admin/proposal") {
        return request.method === "GET" ? await getAdminProposal(request) : methodNotAllowed("GET");
    }
    if (route === "/admin/proposal/transition") {
        return request.method === "POST" ? await transitionAdminProposal(request) : methodNotAllowed("POST");
    }
    return null;
}

const catalogRoutes: ReadonlyArray<readonly [string, string, string]> = [
    ["/admin/modules", "/admin/module", "module"],
    ["/admin/variants", "/admin/variant", "variant"],
    ["/admin/features", "/admin/feature", "feature"],
];
