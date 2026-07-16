import { json, methodNotAllowed } from "../core/http.ts";
import {
    getProduct,
    getProductVariant,
    listProducts,
    listProductVariants,
    upsertProduct,
} from "../routes/catalog.ts";
import {
    getProductImageFile,
    removeProductImage,
    reorderProductImages,
    replaceProductImage,
    uploadProductImage,
} from "../routes/catalog/product-media.ts";
import { deleteBrand, getBrand, listBrands, reorderBrands, upsertBrand } from "../routes/catalog/taxonomy/brands.ts";
import { deleteCategory, getCategory, listCategories, reorderCategories, upsertCategory } from "../routes/catalog/taxonomy/categories.ts";
import {
    getOfferFilterSchema,
    getCategoryProductFieldSchema,
    listCategoryFields,
    upsertCategoryField,
} from "../routes/catalog/taxonomy/category-fields.ts";

export async function handleCatalogRoute(route: string, request: Request): Promise<Response | null> {
    if (route === "/health") {
        return request.method === "GET" ? json({ ok: true }) : methodNotAllowed("GET");
    }
    if (route === "/products") {
        return request.method === "GET" ? await listProducts(request, false) : methodNotAllowed("GET");
    }
    if (route === "/product") {
        return request.method === "GET" ? await getProduct(request, false) : methodNotAllowed("GET");
    }
    if (route === "/brands") {
        return request.method === "GET" ? await listBrands(request, false) : methodNotAllowed("GET");
    }
    if (route === "/brand") {
        return request.method === "GET" ? await getBrand(request, false) : methodNotAllowed("GET");
    }
    if (route === "/categories") {
        return request.method === "GET" ? await listCategories(request, false) : methodNotAllowed("GET");
    }
    if (route === "/category") {
        return request.method === "GET" ? await getCategory(request, false) : methodNotAllowed("GET");
    }
    if (route === "/offer-filter-schema") {
        return request.method === "GET" ? await getOfferFilterSchema(request) : methodNotAllowed("GET");
    }
    if (route === "/admin/category-product-fields") {
        return request.method === "GET" ? await getCategoryProductFieldSchema(request) : methodNotAllowed("GET");
    }
    if (route === "/admin/products") {
        return request.method === "GET" ? await listProducts(request, true) : methodNotAllowed("GET");
    }
    if (route === "/admin/product") {
        if (request.method === "GET") return await getProduct(request, true);
        if (request.method === "POST") return await upsertProduct(request);
        return methodNotAllowed("GET", "POST");
    }
    if (route === "/admin/brands") {
        return request.method === "GET" ? await listBrands(request, true) : methodNotAllowed("GET");
    }
    if (route === "/admin/brand") {
        if (request.method === "GET") return await getBrand(request, true);
        if (request.method === "POST") return await upsertBrand(request);
        if (request.method === "DELETE") return await deleteBrand(request);
        return methodNotAllowed("GET", "POST", "DELETE");
    }
    if (route === "/admin/brands/reorder") {
        return request.method === "POST" ? await reorderBrands(request) : methodNotAllowed("POST");
    }
    if (route === "/admin/categories") {
        return request.method === "GET" ? await listCategories(request, true) : methodNotAllowed("GET");
    }
    if (route === "/admin/category") {
        if (request.method === "GET") return await getCategory(request, true);
        if (request.method === "POST") return await upsertCategory(request);
        if (request.method === "DELETE") return await deleteCategory(request);
        return methodNotAllowed("GET", "POST", "DELETE");
    }
    if (route === "/admin/categories/reorder") {
        return request.method === "POST" ? await reorderCategories(request) : methodNotAllowed("POST");
    }
    if (route === "/admin/category-fields") {
        return request.method === "GET" ? await listCategoryFields(request) : methodNotAllowed("GET");
    }
    if (route === "/admin/category-field") {
        return request.method === "POST" ? await upsertCategoryField(request) : methodNotAllowed("POST");
    }
    if (route === "/admin/product/variants") {
        return request.method === "GET" ? await listProductVariants(request) : methodNotAllowed("GET");
    }
    if (route === "/admin/product/variant") {
        return request.method === "GET" ? await getProductVariant(request) : methodNotAllowed("GET");
    }
    if (route === "/admin/product/image") {
        if (request.method === "GET") return await getProductImageFile(request);
        if (request.method === "POST") return await uploadProductImage(request);
        if (request.method === "DELETE") return await removeProductImage(request);
        return methodNotAllowed("GET", "POST", "DELETE");
    }
    if (route === "/admin/product/image/replace") {
        return request.method === "POST" ? await replaceProductImage(request) : methodNotAllowed("POST");
    }
    if (route === "/admin/product/images/reorder") {
        return request.method === "POST" ? await reorderProductImages(request) : methodNotAllowed("POST");
    }
    return null;
}
