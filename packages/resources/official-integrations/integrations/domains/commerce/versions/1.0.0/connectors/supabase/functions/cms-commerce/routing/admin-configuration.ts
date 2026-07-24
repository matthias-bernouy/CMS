import { methodNotAllowed } from "../core/http.ts";
import { requireCmsAdmin } from "../core/auth.ts";
import {
    deleteCustomField,
    getCustomField,
    getSettings,
    listCustomFieldSchema,
    listCustomFields,
    updateSettings,
    upsertCustomField,
} from "../routes/configuration/index.ts";
import {
    getOfferCondition,
    getWorkflowState,
    getWorkflowTransition,
    listWorkflowStates,
    listWorkflowTransitions,
    upsertOfferCondition,
    upsertWorkflowState,
    upsertWorkflowTransition,
} from "../routes/workflow/index.ts";
import { createC2cPolicyRevision } from "../routes/configuration/protected-policy/index.ts";
import { getC2cPolicies } from "../routes/configuration/read-model/policies.ts";
import { syncBuyerLegalDocuments } from "../routes/configuration/buyer-legal.ts";

export async function handleAdminConfigurationRoute(route: string, request: Request): Promise<Response | null> {
    if (route === "/admin/settings") {
        if (request.method === "GET") {
            return await getSettings();
        }
        if (request.method === "POST") {
            return await updateSettings(request);
        }
        return methodNotAllowed("GET", "POST");
    }
    if (route === "/system/buyer-legal-documents/sync") {
        return request.method === "POST" ? await syncBuyerLegalDocuments(request) : methodNotAllowed("POST");
    }
    if (route === "/admin/c2c-policies") {
        requireCmsAdmin(request);
        if (request.method === "GET") {
            return await getC2cPolicies();
        }
        if (request.method === "POST") {
            return await createC2cPolicyRevision(request);
        }
        return methodNotAllowed("GET", "POST");
    }
    if (route === "/admin/workflow-states") {
        return request.method === "GET" ? await listWorkflowStates() : methodNotAllowed("GET");
    }
    if (route === "/admin/workflow-state") {
        if (request.method === "GET") {
            return await getWorkflowState(request);
        }
        return request.method === "POST" ? await upsertWorkflowState(request) : methodNotAllowed("GET", "POST");
    }
    if (route === "/admin/workflow-transitions") {
        return request.method === "GET" ? await listWorkflowTransitions() : methodNotAllowed("GET");
    }
    if (route === "/admin/workflow-transition") {
        if (request.method === "GET") {
            return await getWorkflowTransition(request);
        }
        return request.method === "POST" ? await upsertWorkflowTransition(request) : methodNotAllowed("GET", "POST");
    }
    if (route === "/admin/offer-condition") {
        if (request.method === "GET") {
            return await getOfferCondition(request);
        }
        return request.method === "POST" ? await upsertOfferCondition(request) : methodNotAllowed("GET", "POST");
    }
    if (route === "/admin/custom-fields") {
        return request.method === "GET" ? await listCustomFields(request) : methodNotAllowed("GET");
    }
    if (route === "/admin/custom-field") {
        if (request.method === "GET") {
            return await getCustomField(request);
        }
        if (request.method === "POST") {
            return await upsertCustomField(request);
        }
        if (request.method === "DELETE") {
            return await deleteCustomField(request);
        }
        return methodNotAllowed("GET", "POST", "DELETE");
    }
    if (route === "/configuration/offer-custom-fields") {
        return request.method === "GET" ? await listCustomFields(request, "offer") : methodNotAllowed("GET");
    }
    if (route === "/configuration/custom-fields") {
        return request.method === "GET" ? await listCustomFieldSchema(request) : methodNotAllowed("GET");
    }
    return null;
}
