# Atlas starter authored bundle

`atlas.collection.json` defines a shadow-shell panel and a composition-only page.
The page forwards its `main` substitution slot to the panel's `body` slot.
Only the panel has settings and styles; the page author fills editable content.

`preview.svg` is an immutable declared asset. Bundle admission verifies its
exact size and SHA-256 before producing the collection digest. It is not a
mutable file-library upload, provider file or remotely downloaded thumbnail.

```ts
import { admitCollectionReleaseJson } from "@bernouy/cms-repository/collections";

const admitted = await admitCollectionReleaseJson(documentJson, [
    { id: "preview", bytes: previewBytes },
]);
```

`tests/collections/fixture.test.ts` loads these exact files. No provider,
credentials, network request, renderer or browser execution is involved.
The sample's literal English text is author markup for this first slice;
collection i18n and theme tokens are not implemented in this format yet.
