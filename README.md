# Triple Tree Portal

Geautomatiseerd rapportageplatform voor call center Triple Tree (ttcallcenters.nl). Vervangt handmatige Excel-rapportage met een live dashboard: BasiCall → Supabase → klantportaal.

**Productie**: https://app.ttcallcenters.nl

Zie [CLAUDE.md](./CLAUDE.md) voor de volledige architectuur, deploy-flow, bekende probleemgebieden en conventies.

## Stack

- React 18 + TypeScript + Vite + shadcn/ui + Tailwind
- Tanstack Query v5 + Supabase JS v2
- Recharts + Mapbox GL
- xlsx-js-style (Excel weekrapportage per project_type)
- PWA (installable op mobiel + desktop)

## Lokaal draaien

Vereist: Node.js + npm.

```sh
git clone git@github.com:sitejob-nl/tripletreedemo.git
cd tripletreedemo
npm install
npm run dev
```

Server draait op `http://localhost:8080`. Environment vars staan in `.env.local`:

```
VITE_SUPABASE_URL=https://tvsdbztjqksxybxjwtrf.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon key>
```

Uitnodigingsmails lopen via de Supabase edge function `create-customer` en worden verstuurd met Resend. Zet hiervoor server-side Supabase secrets:

```
RESEND_API_KEY=<resend api key>
RESEND_FROM_EMAIL=tripletree@sitejob.nl  # optioneel, default
RESEND_FROM_NAME=Triple Tree             # optioneel, default
RESEND_REPLY_TO_EMAIL=info@ttcallcenters.nl  # optioneel, default
```

## Deploy

Merges naar `main` op GitHub `sitejob-nl/tripletreedemo` → Vercel auto-deploy naar `app.ttcallcenters.nl`.

## Scripts

```sh
npm run dev      # dev server
npm run build    # production bundle
npm run lint     # eslint
```
