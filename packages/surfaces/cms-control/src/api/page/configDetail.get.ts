import type { ControlCms } from "cms-control/ControlCms";
import MissingParam from "cms-control/errors/Http/MissingParam";


export type PageConfigDetailResponse = {
    id: string;
    title: string;
    description: string;
    path: string;
    tags: string[];
    published: boolean;
}

export default async function getConfigDetail(req: Request, sys: ControlCms){

    const url = new URL(req.url);
    const id  = url.searchParams.get("id");

    if ( !id ) throw new MissingParam("id");

    const res = await sys.repository.getPage(id);

    return new Response("Not implemented")
}