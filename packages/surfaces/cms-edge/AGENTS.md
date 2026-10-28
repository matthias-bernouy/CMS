# @bernouy/cms-edge

Stateless public HTTP surface. It mounts protocols and forwards native resources
through one provided Runner.

- Export `EdgeCms`, `EdgeCmsConfig`, reserved-path checks, MCP integration and
  the resource response adapter. Receive actor resolution, Gateway and resource
  handler ports through config.
- Never receive a ContentRepository, ContentReader, Page or rendering settings.
  Page/Bloc expansion, text substitution, access analysis and SEO belong to Content.
- Keep `/.cms/*`, MCP OAuth discovery and runtime health/readiness reserved.
  Content-owned resource URLs use `/_content/*` and resolve through the same
  resource capability as Pages.
- Authentication remains Access-owned; never introduce another session store.
- Validate native resource metadata. Edge exclusively controls cookies, CSP,
  HTTP security and compression. Authenticated output is private and no-store.
- Never import persistence adapters, environment or runtime composition here.
- Domain operations and their tests stay with the owning feature. Test the
  protocol and HTTP policy boundaries here.
