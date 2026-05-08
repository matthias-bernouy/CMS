import { requireCredential } from "@bernouy/core";
import { mintToken } from "../../core/upload/token/mintToken";
import { parseMintTokenDto } from "../../core/upload/token/parseMintDto";
import type { BucketCredential } from "../../interfaces/entities/BucketCredential";
import { wrapAdmin } from "../../core/admin/wrapAdmin";

export default wrapAdmin(async (req, provider) => {
    const bucketId = requireCredential<BucketCredential>(req).bucketId;
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
    // Behind a reverse proxy (typically nginx terminating TLS), `req.url` is
    // the internal HTTP URL. Trust the `X-Forwarded-{Proto,Host}` headers
    // when set so the URL handed back to clients matches what they used to
    // reach us.
    const url   = new URL(req.url);
    const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
    const host  = req.headers.get("x-forwarded-host")  ?? url.host;
    return `${proto}://${host}/upload?token=${encodeURIComponent(tokenId)}`;
}
