import { requireCmsRequest } from "../core/auth.ts";
import { json } from "../core/http.ts";

export function productDefaults(request: Request): Response {
    requireCmsRequest(request);
    return json({
        slug: "",
        title: "",
        description: "",
        brandId: null,
        status: "draft",
        visibility: "public",
        media: [],
        variants: [],
        variantOptionGroups: [],
    });
}

export function categoryDefaults(request: Request): Response {
    requireCmsRequest(request);
    return json({
        parentId: null,
        slug: "",
        fullSlug: "",
        title: "",
        description: "",
        position: 0,
        status: "active",
    });
}

export function brandDefaults(request: Request): Response {
    requireCmsRequest(request);
    return json({
        slug: "",
        name: "",
        description: "",
        status: "active",
    });
}

export function attributeDefaults(request: Request): Response {
    requireCmsRequest(request);
    return json({
        code: "",
        name: "",
        description: "",
        dataType: "text",
        options: [],
        optionsSummary: "",
    });
}
