import type { OriginProvider } from "../../exports/OriginProvider";
import type { Edge } from "../../interfaces/entities/Edge";

export async function listEdges(provider: OriginProvider): Promise<Edge[]> {
    return provider.edgeRepo.list();
}
