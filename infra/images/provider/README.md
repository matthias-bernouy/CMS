# Ulvia Provider image

This image contains only the official multi-instance Provider runtime. Build it
from the workspace root:

```bash
docker build \
  --build-arg IMAGE_VERSION=0.0.1-alpha.1 \
  --build-arg VCS_REF="$(git rev-parse HEAD)" \
  --file infra/images/provider/Dockerfile \
  --tag ulvia-provider:0.0.1-alpha.1 \
  .
```

The Provider owns database access, instance provisioning and file storage. It
does not contain the Kernel or Official Repository entrypoints.
