
# Commit Convention

Use a short type plus a focused domain:

```text
feat(domain): summary
fix(domain): summary
improve(domain): summary
docs(domain): summary
test(domain): summary
chore(domain): summary
```

Examples:

```text
feat(cms-files): add image variant manifest
fix(cms-control): validate page editor id before loading
docs(agents): refresh package instructions
```

Keep the domain close to the package or feature being changed:
`cms-control`, `cms-delivery`, `cms-auth`, `components`, `http-runner`, `cli`,
`docs`, and so on.
