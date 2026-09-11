# Routes

TanStack Start uses **file-based routing**. Every `.tsx` file in this directory
defines a route. Do **not** create `src/pages/`, `src/routes/_app/index.tsx`, or
`app/layout.tsx` — those are Next.js / Remix conventions. The only root layout
is `src/routes/__root.tsx`.

## Conventions

| File | URL |
| --- | --- |
| `index.tsx` | `/` |
| `about.tsx` | `/about` |
| `users/index.tsx` | `/users` |
| `users/$id.tsx` | `/users/:id` (dynamic — bare `$`, no curly braces) |
| `posts/{-$category}.tsx` | `/posts/:category?` (optional segment) |
| `files/$.tsx` | `/files/*` (splat — read via `_splat` param, never `*`) |
| `_layout.tsx` | layout route (renders children via `<Outlet />`) |
| `__root.tsx` | app shell — wraps every page; preserve `<Outlet />` |

`routeTree.gen.ts` is auto-generated. Don't edit it by hand.

## Line endings (Windows)

`src/routeTree.gen.ts` is regenerated on **every** `npm run dev` / `npm run build`,
and the generator always writes LF. `.gitattributes` therefore pins it with
`text eol=lf`; without that pin a Windows checkout (`core.autocrlf=true`) stores
the file with CRLF, the dev server rewrites it to LF, and git reports it as
modified **with an empty diff** — which makes any `git pull` that touches the
file abort with `Your local changes ... would be overwritten by merge`.

If it ever goes dirty anyway, discarding the local copy is always safe (it is
generated — `git checkout -- src/routeTree.gen.ts` or any dev/build run
reproduces the committed bytes):

```bash
git checkout -- src/routeTree.gen.ts
git pull
```

`tests/repo-hygiene.test.mjs` guards the pin and the matching `.prettierignore`
entry, so `npm run format` cannot reformat generator output either.
