# @bernouy/ulvia-cli

Local development launcher for CmsCore.

```bash
bun run ulvia -- dev
bun run ulvia -- dev status
bun run ulvia -- dev credentials
bun run ulvia -- dev stop
```

The runtime stores generated credentials, CMS files, and MongoDB data below
`ULVIA_DATA_DIR` or the platform data directory. It no longer owns integration
packages, a local repository, release verification, publication, or Supabase.
