# Maître du Jeu

PWA mobile (Next.js) — un téléphone, plusieurs joueurs en hotseat, un MJ IA.

## Fonctionnalités MVP

- Campagnes locales (IndexedDB / Dexie) — reprise sur le même appareil
- Upload PDF (lore) + retrieval simple pour le MJ
- Personnages manuels ou aléatoires (système d20 fixe)
- Session hotseat + jets auto / manuel
- Assets images / sons importés, déclenchés par le MJ
- Illustrations de scène (Pollinations Flux) au changement de lieu, style adapté au scénario
- Ambiance instrumentale MiniMax au changement de lieu
- Voix Fish Audio (narrateur + PNJ) — clé sur [fish.audio/app/api-keys](https://fish.audio/app/api-keys)

## Prérequis

1. Node.js 20+
2. Crée `.env.local` (copie de `.env.local.example`) :

```env
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.0-flash
POLLINATIONS_API_KEY=...
FISH_API_KEY=...
MINIMAX_API_KEY=...
```

**Gemini** (MJ). **Pollinations** (images Flux). **Fish Audio** (voix). **MiniMax** (ambiance instrumentale, `music-3.0-free`) : clé sur [platform.minimax.io](https://platform.minimax.io/user-center/basic-information/interface-key).

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
- Fish Audio (voix)
