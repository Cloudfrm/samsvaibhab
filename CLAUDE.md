# Rules for this project

## Git
- Always start from `main`. Pull latest before starting new work.
- For every feature or bug, create a new branch off `main`.
- Only switch branches when the new task is unrelated to the current one.

## How to talk to the user
- Use simple words. No advanced English, no jargon.
- Keep it short. Do not over-explain.
- User is a business analyst, not a developer.

## How to code
- Do not write more code than needed. No extra features, no extra files.
- Keep it simple.

## Order of work
- Work feature by feature. For each feature: build the backend, test it fully, then build the frontend for that same feature, then move to the next feature.
- Never build backend for the whole site at once.
- Frontend comes after: user designs UI in Google Stitch and hands it over. Then wire frontend to the backend.

## Before building anything (always follow this)
1. Ask the user questions until the requirement is clear.
2. Tell the user what is needed from them (keys, access, decisions).
3. Tell the user what you are about to build, in simple words.
4. Wait for the user to say go.
5. Only then start building.
Never skip straight to building.

## API keys / secrets
- Never guess or hardcode keys. Always ask the user for them when needed.
- Never put real keys in chat replies or commit them to git. Keep them in `.env.local` (git-ignored).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
