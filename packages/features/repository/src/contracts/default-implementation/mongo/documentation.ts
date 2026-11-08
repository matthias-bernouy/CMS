import type { Db } from "mongodb";
import type { AdmittedContractRelease } from "@bernouy/ulvia-contracts";
import type { ContractDocumentationDefinition } from "@bernouy/ulvia-contracts";
import { sha256Digest } from "@bernouy/binary-media";

/** Document text is immutable, separately stored, and never hydrated by ordinary release reads. */
export class MongoDocumentationAssets {
    private readonly documents;
    constructor(db: Db) {
        this.documents = db.collection<{ _id: string; text: string }>("cms_contract_documentation");
    }

    async store(admission: AdmittedContractRelease): Promise<void> {
        for (const document of admission.release.documentation ?? []) {
            const bytes = admission.documentationAssets?.find((asset) => asset.id === `docs/${document.path}`)?.bytes;
            if (!bytes) {
                throw new Error("Missing verified documentation bytes");
            }
            const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(await bytes.arrayBuffer());
            await this.documents.updateOne({ _id: document.digest }, { $setOnInsert: { text } }, { upsert: true });
            await this.get(document);
        }
    }

    async get(document: ContractDocumentationDefinition): Promise<Blob | null> {
        const row = await this.documents.findOne({ _id: document.digest });
        if (!row) {
            return null;
        }
        const bytes = new TextEncoder().encode(row.text);
        if (bytes.byteLength !== document.byteLength || (await sha256Digest(bytes)) !== document.digest) {
            throw new Error("Corrupt documentation bytes");
        }
        return new Blob([bytes], { type: "text/markdown" });
    }
}
