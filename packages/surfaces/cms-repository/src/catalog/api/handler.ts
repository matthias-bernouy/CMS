import type { RepositoryCatalogReader } from "../contracts";
import {
    assertCatalogListDocument,
    assertIntegrationPageDocument,
    assertVersionPageDocument,
} from "../validation/catalogData";
import { buildRepositoryCatalogListView } from "../view/list";
import { publicJsonResponse, publicNotFound } from "../../publicReadResponse";
import { projectCatalogIntegration, projectCatalogList, projectCatalogVersion } from "./projection";
import { parseRepositoryCatalogApiQuery } from "./query";

export function integrationCatalogApiRouteHandler(
    reader: RepositoryCatalogReader,
): (request: Request) => Promise<Response> {
    return async (request) => {
        const query = parseRepositoryCatalogApiQuery(request);
        if (!query.kind) {
            const document = await reader.listIntegrations();
            assertCatalogListDocument(document);
            const view = buildRepositoryCatalogListView(document.value, query.context);
            return publicJsonResponse(request, projectCatalogList(document.revision, view), "catalog");
        }
        if (!query.version) {
            const document = await reader.getIntegration(query.kind);
            if (!document) {
                return publicNotFound("integration not found");
            }
            assertIntegrationPageDocument(document, query.kind);
            return publicJsonResponse(request, projectCatalogIntegration(document.revision, document.value), "catalog");
        }
        const document = await reader.getVersion(query.kind, query.version);
        if (!document) {
            return publicNotFound("integration version not found");
        }
        assertVersionPageDocument(document, query.kind, query.version);
        return publicJsonResponse(request, projectCatalogVersion(document.revision, document.value), "catalog");
    };
}
