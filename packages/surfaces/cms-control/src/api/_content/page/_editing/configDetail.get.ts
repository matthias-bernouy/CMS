import type { ControlCms } from "cms-control/ControlCms";

export type PageConfigDetailResponse = {
    id: string;
    title: string;
    description: string;
    path: string;
    publicUrl: string;
    tags: string[];
    published: boolean;
};

export default async function getConfigDetail(req: Request, cms: ControlCms): Promise<Response> {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (!id) {
        return redirectToPages(url);
    }

    const page = await cms.repository.getPageById(id);

    if (!page) {
        return redirectToPages(url);
    }

    const response: PageConfigDetailResponse = {
        id: page.id,
        title: page.title,
        description: page.description,
        path: page.path,
        publicUrl: pagePublicUrl(page.path, cms.config.deliveryUrl),
        tags: page.tags,
        published: page.visible,
    };

    return new Response(JSON.stringify(response), {
        headers: { "Content-Type": "application/json" },
    });
}

function pagePublicUrl(path: string, deliveryUrl?: string): string {
    if (!deliveryUrl) {
        return path;
    }
    try {
        return new URL(path, deliveryUrl).href;
    } catch {
        return path;
    }
}

function redirectToPages(url: URL): Response {
    return Response.redirect(`${controlBasePath(url.pathname)}/admin/pages`, 302);
}

function controlBasePath(pathname: string): string {
    const marker = "/api/page/configDetail";
    const index = pathname.indexOf(marker);
    if (index <= 0) {
        return "";
    }

    return pathname.slice(0, index);
}
