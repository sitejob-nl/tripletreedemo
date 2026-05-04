# Agent Instructions

## Package Manager
- Use npm: `npm install`, `npm run dev`, `npm run build`, `npm run preview`.
- Vite dev server runs on `http://localhost:8080`.

## Validation
| Task | Command |
|------|---------|
| Build/typecheck | `npm run build` |
| Lint one TS/TSX file | `npx eslint path/to/file.tsx` |
| Full lint baseline | `npm run lint` |

- No test script is configured.
- Full lint currently fails on existing debt; fix lint issues in touched files.

## Project Shape
- React 18 + TypeScript + Vite PWA frontend.
- Routes live in `src/App.tsx`; pages in `src/pages`; UI in `src/components`.
- Reuse shadcn/Radix components from `src/components/ui`, Tailwind tokens from `src/index.css`, and `lucide-react` icons.
- Use `@/` imports and `cn()` from `src/lib/utils.ts`.

## Data + Sync
- Supabase client: `src/integrations/supabase/client.ts`.
- App data flows through TanStack Query hooks in `src/hooks`; invalidate relevant query keys after mutations.
- BasiCall SOAP sync source is `scripts/basicall-sync/sync.js`; deploy with `scripts/basicall-sync/deploy.sh`.
- `supabase/functions/sync-project` is deprecated; frontend queues sync work through `sync_jobs`.

## Supabase + Security
- Regular users read `projects_public`; admin-only paths may use `projects`.
- Never expose BasiCall tokens in frontend state, logs, or UI.
- `project_secrets` is service-role-only; manage tokens through the `project-secret` edge function.
- Service-role edge functions must verify the caller and admin/superadmin role first.
- Before DB/RLS changes, compare repo migrations with live Supabase because historical schema drift exists.

## Business Rules
- Query and sort dates by `beldatum_date`, not string `beldatum`.
- Preserve `project_type` and `report_template` branches for dashboard and Excel behavior.
- Hours/cost displays use `ceilHours` / `ceilHoursFromSeconds`.
- Keep BasiCall raw data PII-scrubbed; only preserve approved city/agent/result fields.

## Commit Attribution
AI commits MUST include:
```text
Co-Authored-By: (agent model name) <noreply@example.com>
```
