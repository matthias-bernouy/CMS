import { listEdges } from "../../core/edge/listEdges";
import { wrapAdmin } from "../../core/admin/wrapAdmin";

export default wrapAdmin(async (_req, provider) => {
    return listEdges(provider);
});
