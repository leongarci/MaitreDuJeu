export const ART_STYLES = [
  "medieval-parchment",
  "high-fantasy",
  "space",
  "cyberpunk",
  "horror",
  "western",
  "modern",
  "nautical",
  "steampunk",
  "post-apo",
] as const;

export type ArtStyleId = (typeof ART_STYLES)[number];

export const DEFAULT_ART_STYLE: ArtStyleId = "medieval-parchment";

const RULES: Array<{ id: ArtStyleId; words: string[] }> = [
  {
    id: "space",
    words: [
      "espace",
      "spatial",
      "vaisseau",
      "station orbit",
      "orbite",
      "galactique",
      "science-fiction",
      "science fiction",
      "sci-fi",
      "scifi",
      "android",
      "laser",
      "colonie",
      "cosmos",
      "starship",
      "spaceship",
    ],
  },
  {
    id: "cyberpunk",
    words: [
      "cyber",
      "cyberpunk",
      "neon",
      "néon",
      "megacorp",
      "chrome",
      "hack",
      "night city",
      "synthwave",
    ],
  },
  {
    id: "horror",
    words: [
      "horreur",
      "horror",
      "lovecraft",
      "gothique",
      "vampire",
      "fantome",
      "fantôme",
      "macabre",
      "occulte",
      "cosmic horror",
    ],
  },
  {
    id: "western",
    words: ["western", "far west", "cowboy", "saloon", "desert", "désert", "outlaw"],
  },
  {
    id: "steampunk",
    words: ["steampunk", "vapeur", "engrenage", "dirigeable", "cuivre", "victorian"],
  },
  {
    id: "nautical",
    words: [
      "pirate",
      "navire",
      "ocean",
      "océan",
      "maritime",
      "iles",
      "îles",
      "caraibes",
      "caraïbes",
      "voile",
    ],
  },
  {
    id: "post-apo",
    words: [
      "post-apo",
      "postapo",
      "apocalypse",
      "wasteland",
      "ruines",
      "survivant",
      "fallout",
    ],
  },
  {
    id: "modern",
    words: [
      "contemporain",
      "moderne",
      "enquete",
      "enquête",
      "policier",
      "urbain",
      "paris",
      "xxie",
      "thriller",
    ],
  },
  {
    id: "high-fantasy",
    words: [
      "high fantasy",
      "heroic fantasy",
      "epique",
      "épique",
      "royaume magique",
      "archimage",
    ],
  },
  {
    id: "medieval-parchment",
    words: [
      "medieval",
      "médiéval",
      "medieval-fantasy",
      "fantasy",
      "fantaisie",
      "donjon",
      "chateau",
      "château",
      "elfe",
      "nain",
      "dragon",
      "sorcier",
      "chevalier",
      "royaume",
      "taverne",
    ],
  },
];

const IMAGE_LOOK: Record<ArtStyleId, string> = {
  "medieval-parchment":
    "black and white ink drawing on stained aged parchment, medieval manuscript illustration, cross-hatching, sepia paper texture, no color, no printed text",
  "high-fantasy":
    "painterly high-fantasy concept art, rich colors, dramatic sky, oil-painting look, no text",
  space:
    "cinematic sci-fi concept art, futuristic, cold starlight and practical lights, sleek technology, no text",
  cyberpunk:
    "neon-soaked cyberpunk concept art, rain-slick streets, magenta and cyan lighting, no text",
  horror:
    "dark gothic horror illustration, high contrast, oppressive shadows, muted sickly colors, no text",
  western:
    "dusty western painting, sun-bleached wood, wide desert light, muted earth tones, no text",
  modern:
    "contemporary cinematic still, naturalistic lighting, grounded urban atmosphere, no text",
  nautical:
    "age-of-sail painting, salt spray, weathered wood and canvas, dramatic sea light, no text",
  steampunk:
    "steampunk illustration, brass gears, steam, Victorian industrial atmosphere, no text",
  "post-apo":
    "desolate post-apocalyptic concept art, rust, dust, ruined structures, overcast light, no text",
};

const AMBIENT_LOOK: Record<ArtStyleId, string> = {
  "medieval-parchment":
    "instrumental medieval fantasy underscore, lute and low drone, tavern warmth, no vocals",
  "high-fantasy":
    "instrumental mythic orchestral underscore, soft strings and winds, no vocals",
  space:
    "instrumental sci-fi ambient score, slow pads, distant pulses, no vocals",
  cyberpunk:
    "instrumental darksynth underscore, rain-soaked neon mood, no vocals",
  horror:
    "instrumental horror drone, uneasy strings, sparse percussion, no vocals",
  western:
    "instrumental dusty western score, guitar and harmonica hints, no vocals",
  modern:
    "instrumental quiet contemporary underscore, muted piano, no vocals",
  nautical:
    "instrumental sea shanty-free nautical score, accordion and low strings, no vocals",
  steampunk:
    "instrumental industrial Victorian score, brass and clockwork rhythm, no vocals",
  "post-apo":
    "instrumental desolate wasteland score, sparse guitar and wind pads, no vocals",
};

export function isArtStyleId(value: string | null | undefined): value is ArtStyleId {
  return Boolean(value && (ART_STYLES as readonly string[]).includes(value));
}

export function inferArtStyle(corpus: string): ArtStyleId {
  const hay = corpus
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  let best: ArtStyleId = DEFAULT_ART_STYLE;
  let bestScore = 0;
  for (const rule of RULES) {
    let score = 0;
    for (const word of rule.words) {
      const needle = word
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      if (hay.includes(needle)) score += needle.length > 8 ? 2 : 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = rule.id;
    }
  }
  return best;
}

export function imageStylePrompt(style: ArtStyleId): string {
  return IMAGE_LOOK[style];
}

export function ambientStylePrompt(style: ArtStyleId): string {
  return AMBIENT_LOOK[style];
}

export function styleTag(style: ArtStyleId): string {
  return `style:${style}`;
}
