import { mintToken } from "../../core/upload/token/mintToken";
import { parseMintTokenDto } from "../../core/upload/token/parseMintDto";
import { getBrokerBucketId } from "../../core/authentication/createBrokerGuard";
import { wrapAdmin } from "../../core/admin/wrapAdmin";

export default wrapAdmin(async (req, provider) => {
    const bucketId = getBrokerBucketId(req);
    const body = await req.json() as Record<string, unknown>;
    const dto = parseMintTokenDto(body);
    const token = await mintToken(provider, bucketId, dto);
    return {
        id:        token.id,
        expiresAt: token.expiresAt,
        uploadURL: buildUploadUrl(req, token.id),
    };
});

function buildUploadUrl(req: Request, tokenId: string): string {
    const url = new URL(req.url);
    return `${url.origin}/upload?token=${encodeURIComponent(tokenId)}`;
}
