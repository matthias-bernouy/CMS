# Ulvia Kernel image

This image contains only the stateless CMS Kernel runtime and the browser
assets it serves. Build it from the workspace root:

```bash
docker build \
  --build-arg IMAGE_VERSION=0.0.1-alpha.1 \
  --build-arg VCS_REF="$(git rev-parse HEAD)" \
  --file infra/images/kernel/Dockerfile \
  --tag ulvia-kernel:0.0.1-alpha.1 \
  .
```

The image requires one Provider instance URL and opaque access token. It does
not contain the Provider or Repository runtime, mount persistent data, or
receive database credentials.
