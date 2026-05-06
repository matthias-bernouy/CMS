import { addEdge } from "../../core/edge/addEdge";
import { parseEdgeCreateDto } from "../../core/validation/parseEdgeCreateDto";
import { wrapAdmin } from "../../core/admin/wrapAdmin";

export default wrapAdmin(async (req, provider) => {
    const body = await req.json() as Record<string, unknown>;
    const dto = parseEdgeCreateDto(body);
    return addEdge(provider, dto);
});
