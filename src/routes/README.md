# Routes

TanStack Start uses **file-based routing**. Every `.tsx` file in this directory
defines a route. Do **not** create `src/pages/`, `src/routes/_app/index.tsx`, or
`app/layout.tsx` — those are Next.js / Remix conventions. The only root layout
is `src/routes/__root.tsx`.

## Conventions

| File                     | URL                                                     |
| ------------------------ | ------------------------------------------------------- |
| `index.tsx`              | `/`                                                     |
| `about.tsx`              | `/about`                                                |
| `users/index.tsx`        | `/users`                                                |
| `users/$id.tsx`          | `/users/:id` (dynamic — bare `$`, no curly braces)      |
| `posts/{-$category}.tsx` | `/posts/:category?` (optional segment)                  |
| `files/$.tsx`            | `/files/*` (splat — read via `_splat` param, never `*`) |
| `_layout.tsx`            | layout route (renders children via `<Outlet />`)        |
| `__root.tsx`             | app shell — wraps every page; preserve `<Outlet />`     |

`routeTree.gen.ts` is auto-generated. Don't edit it by hand.

## Line endings (Windows)

`.gitattributes` pins **every text file to LF, in the index and in the working
tree, on every platform** (`* text=auto eol=lf`; archives and icons are `-text`).
That is what the toolchain already writes — prettier (`endOfLine` defaults to
`"lf"`), vite/nitro, node's `fs.writeFile`, and the TanStack router generator —
so a CRLF working tree fights all of it:

- `npm run lint` reported **14,118 `Delete ␍` errors across 140 files** on a
  Windows checkout with `core.autocrlf=true` (the git-for-Windows default).
- `npm run format` "fixed" those by rewriting every file to LF, which git then
  reported as modified **with an empty diff** — blocking any pull that touched
  one of them.
- `src/routeTree.gen.ts` is regenerated on **every** `npm run dev` /
  `npm run build`, and the generator compares the bytes it read with the text it
  produced, so a CRLF copy is rewritten to LF on every run. That made the file
  permanently dirty and aborted pulls with
  `Your local changes ... would be overwritten by merge: src/routeTree.gen.ts`.

Nothing changes for Linux/macOS checkouts (already LF) and nothing changes in the
index — `git add --renormalize .` stages no changes.

### One-time normalisation of an existing Windows clone

With a clean `git status`, after pulling `.gitattributes`:

```bash
git rm --cached -r .
git reset --hard
```

`git ls-files --eol` should then show `w/lf` for every text file, `npm run lint`
goes green, and `npm run format` becomes a no-op.

### If the generated route tree ever goes dirty

Discarding the local copy is always safe — it is generated, and
`git checkout -- src/routeTree.gen.ts` (or any dev/build run) reproduces the
committed bytes exactly:

```bash
git checkout -- src/routeTree.gen.ts
git pull
```

`tests/repo-hygiene.test.mjs` guards the `eol=lf` pins, the binary rules and the
matching `.prettierignore` entry, so `npm run format` cannot reformat generator
output either.
