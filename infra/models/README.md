# Packaged embedding model

`release.json` pins the CPU q8 E5 model, its revision, exact file sizes, SHA-256
checksums and upstream MIT license. The ONNX conversion is distributed by
[Xenova](https://huggingface.co/Xenova/multilingual-e5-small/tree/761b726dd34fb83930e26aab4e9ac3899aa1fa78);
the original model is [multilingual-e5-small](https://huggingface.co/intfloat/multilingual-e5-small).
Weights are generated distribution assets, not Git files.

Prepare a native installation from the workspace root:

```bash
bun run infra/models/prepare.ts artifacts/models artifacts/model-downloads
ULVIA_EMBEDDING_MODEL_DIR="$PWD/artifacts/models" bun --no-macros run packages/runtimes/ulvia-provider-server/src/index.ts
```

Supply the runtime's other required environment variables as usual. The Provider
accepts the same absolute `ULVIA_EMBEDDING_MODEL_DIR` and then requires local files;
an absent model never triggers a remote download. Without this variable, native
development retains its existing writable model cache and download behavior.

The Provider Dockerfile prepares an independent `embedding-model`
stage before copying it into `/opt/ulvia/models`, outside persistent data volumes.
This adds 135,393,120 bytes of model/tokenizer/configuration/license files in the Provider image.
Application changes do not invalidate that stage. A locked, content-addressed
BuildKit cache also reuses verified downloads when the preparation layer changes.
Failed or corrupt downloads are never reused. Preparation runs sequentially with
one streamed file at a time, bounded by its declared byte length and a five-minute
request deadline; SHA-256 is checked before cache admission or output copying.

For ephemeral CI builders, export/import the intermediate build layers explicitly:

```bash
docker buildx build --load -f infra/images/provider/Dockerfile -t ulvia-provider:local \
  --cache-from type=registry,ref=<registry>/ulvia-build-cache \
  --cache-to type=registry,ref=<registry>/ulvia-build-cache,mode=max .
```

Registry cache export writes to the specified registry and requires its credentials.
Without a cached layer or download entry, a build needs network access to fetch the
pinned artifacts. Runtime loading and inference need no Internet access. Updating
the model requires updating both runtime defaults and this manifest, then rebuilding
and rerunning the offline test. Model memory use and corpus preparation are unchanged.

Verify the built images with the network physically disabled and fresh anonymous
data volumes (the test also refuses an empty local model directory):

```bash
ULVIA_MODEL_PROVIDER_IMAGE=ulvia-provider:local \
bun test tests/images/models/offline.docker.test.ts
```

The Repository is a CMS profile in this Provider and shares its embedding model.
The Edge image has no model. To additionally exercise the real Repository API
on an internal Docker network without Internet access, supply
`ULVIA_MCP_EDGE_DOCKER_IMAGE` alongside `ULVIA_MODEL_PROVIDER_IMAGE` and run
`bun test tests/images/models/runtime.docker.test.ts`.
