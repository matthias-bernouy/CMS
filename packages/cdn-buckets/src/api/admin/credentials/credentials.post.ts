import { createCredential } from "../../../core/credential/createCredential";
import { parseCredentialCreateDto } from "../../../core/validation/credential/parseCreateDto";
import { wrapAdmin } from "../../../core/admin/wrapAdmin";

export default wrapAdmin(async (req, provider) => {
    const bucketId = new URL(req.url).searchParams.get("bucketId");
    if (!bucketId) throw new TypeError("Missing 'bucketId' query param.");

    const body = await req.json() as Record<string, unknown>;
    const dto = parseCredentialCreateDto(body);

    const { credential, cleartextToken } = await createCredential(provider, bucketId, dto);
    // Cleartext is returned ONCE — caller is expected to store it client-side.
    return { credential, cleartextToken };
});
