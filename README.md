# Maître du Jeu

PWA mobile (Next.js) — un téléphone, plusieurs joueurs en hotseat, un MJ IA.

## Fonctionnalités MVP

- Campagnes locales (IndexedDB / Dexie) — reprise sur le même appareil
- Upload PDF (lore) + retrieval simple pour le MJ
- Personnages manuels ou aléatoires (système d20 fixe)
- Session hotseat + jets auto / manuel
- Assets images / sons importés, déclenchés par le MJ
- Illustrations de scène (Pollinations Flux) au changement de lieu, style adapté au scénario
- Ambiance sonore Pollinations au changement de lieu (Pollen) ; voix narrateur VoiceStudio, secours / PNJ via Pollinations
- Voix du MJ via synthèse vocale du navigateur (gratuit)

## Prérequis

1. Node.js 20+
2. Crée `.env.local` (copie de `.env.local.example`) :

```env
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.0-flash
POLLINATIONS_API_KEY=...
```

**Gemini** (MJ, free tier). **Pollinations** : clé `sk_…` sur [enter.pollinations.ai/keys](https://enter.pollinations.ai/keys). Flux (images) est gratuit. L’audio (ambiance, voix de secours) consomme du [Pollen](https://github.com/pollinations/pollinations/blob/master/enter.pollinations.ai/POLLEN_FAQ.md) — si le solde est à sec, la partie continue sans son généré.

## Lancer

```bash
npm install
npm run dev
```

Ouvre [http://localhost:3000](http://localhost:3000) sur le navigateur ou le téléphone (même Wi‑Fi).

## Parcours

1. **Nouvelle partie** — titre + PDF optionnel
2. **Héros** — création manuelle ou aléatoire (plusieurs joueurs)
3. **Assets** — import images / sons + tags
4. **Session** — pastilles hotseat, actions texte, jets, TTS navigateur

## Stack

- Next.js App Router + TypeScript + Tailwind
- Zustand + Dexie
- Google Gemini (MJ)
- Web Speech API (voix gratuite du téléphone / navigateur)
