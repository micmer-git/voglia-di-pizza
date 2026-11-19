# GoPizzaGo — Worker

Backend della pizza dell'amicizia (Cloudflare Worker + D1). In locale non serve un account: i test usano Miniflare.

```bash
npm test
npm run dev
```

Il dev server è su `http://127.0.0.1:8787`. Per provarlo dal sito, apri `http://127.0.0.1:4321/gopizzago/?api=http://127.0.0.1:8787` (l'override `?api=` funziona solo su localhost). Metti un PIN in `.dev.vars` (vedi `.dev.vars.example`) prima di `npm run dev`.

## Deploy

Servono tre variabili d'ambiente:

- `CLOUDFLARE_API_TOKEN` — token con permesso di modifica su Workers e D1
- `CLOUDFLARE_ACCOUNT_ID`
- `ADMIN_PIN` — PIN del forno, almeno 6 caratteri (non finisce nel git)

Poi, dalla cartella `server/gopizzago`:

```bash
npm run deploy
```

Lo script crea il database D1 se in `wrangler.jsonc` c'è ancora l'id segnaposto, salva il PIN come secret, applica le migration e pubblica il Worker. All'URL che stampa, togli lo slash finale e mettilo in `public/gopizzago/config.json`:

```json
{ "apiBase": "https://gopizzago.<account>.workers.dev" }
```

Poi rifai il build del sito Astro. Le origini ammesse sono `https://micmer-git.github.io` e `https://voglia-di-pizza.pages.dev` (più localhost).
