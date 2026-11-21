<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Repository-specific Next.js paths

Bun hoists `next` to the repository-root `node_modules`. In this monorepo, resolve the paths in the generated block above from the repository root, overriding its file-relative assumption:

- Guides: `node_modules/next/dist/docs/` from the repository root, or `../../node_modules/next/dist/docs/` from `apps/web`.
- Generator: `node_modules/next/dist/server/lib/generate-agent-files.js` from the repository root, or `../../node_modules/next/dist/server/lib/generate-agent-files.js` from `apps/web`.
