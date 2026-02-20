<p align="center">
  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <strong>Français</strong> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a>
</p>

<p align="center">
  <img src="logo.svg" alt="PianoAI logo" width="180" />
</p>

<h1 align="center">PianoAI</h1>

<p align="center">
  Serveur MCP + CLI pour l'enseignement du piano par IA — joue via VMPK par MIDI avec retour vocal.
</p>

[![Tests](https://img.shields.io/badge/tests-181_passing-brightgreen)](https://github.com/mcp-tool-shop-org/pianoai)
[![Smoke](https://img.shields.io/badge/smoke-29_passing-brightgreen)](https://github.com/mcp-tool-shop-org/pianoai)
[![MCP Tools](https://img.shields.io/badge/MCP_tools-8-purple)](https://github.com/mcp-tool-shop-org/pianoai)
[![Songs](https://img.shields.io/badge/songs-10_(via_ai--music--sheets)-blue)](https://github.com/mcp-tool-shop-org/ai-music-sheets)

## Qu'est-ce que c'est ?

Un CLI TypeScript et un serveur MCP qui charge des morceaux de piano depuis [ai-music-sheets](https://github.com/mcp-tool-shop-org/ai-music-sheets), les convertit en MIDI et les joue via [VMPK](https://vmpk.sourceforge.io/) par un port MIDI virtuel. Le moteur pédagogique lance des interjections aux limites de mesure et aux moments clés, permettant à un LLM d'agir comme un professeur de piano en direct avec retour vocal et notifications aside.

## Fonctionnalités

- **4 modes de lecture** — complet, mesure par mesure, mains séparées, boucle
- **Contrôle de la vitesse** — 0.5x pour la pratique lente jusqu'à 2x en lecture rapide, cumulable avec le tempo personnalisé
- **Suivi de progression** — callbacks configurables par pourcentage ou par mesure
- **9 hooks pédagogiques** — console, silencieux, enregistrement, callback, voix, aside, chant accompagné, composition, live feedback
- **Narration chantée** — noms de notes, solfège, contour ou syllabes prononcés avant chaque mesure
- **Chant synchronisé + piano** — concurrent (sensation de duo) ou before (voix d'abord) via `--with-piano`
- **Retour vocal** — sortie `VoiceDirective` pour l'intégration mcp-voice-soundboard
- **Retour pédagogique en direct** — encouragements en temps réel, conseils de dynamique et avertissements de difficulté pendant la lecture
- **Interjections aside** — sortie `AsideDirective` pour la boîte de réception mcp-aside
- **Analyse sécurisée** — les notes invalides sont ignorées avec collecte de `ParseWarning`
- **8 outils MCP** — exposent le registre, les notes pédagogiques, le chant accompagné et les recommandations de morceaux aux LLMs
- **Analyseur de notes** — notation scientifique des hauteurs vers MIDI et inversement
- **Connecteur mock** — couverture de test complète sans matériel MIDI

## Prérequis

1. **[loopMIDI](https://www.tobias-erichsen.de/software/loopmidi.html)** — créer un port MIDI virtuel (ex. : "loopMIDI Port")
2. **[VMPK](https://vmpk.sourceforge.io/)** — configurer l'entrée MIDI sur votre port loopMIDI
3. **Node.js 18+**

## Installation

```bash
npm install -g @mcptoolshop/pianoai
```

## Démarrage rapide

```bash
# Lister tous les morceaux
pianoai list

# Afficher les détails d'un morceau + notes pédagogiques
pianoai info moonlight-sonata-mvt1

# Jouer un morceau via VMPK
pianoai play let-it-be

# Jouer avec un tempo personnalisé
pianoai play basic-12-bar-blues --tempo 80

# Avancer mesure par mesure
pianoai play autumn-leaves --mode measure

# Pratique à mi-vitesse
pianoai play moonlight-sonata-mvt1 --speed 0.5

# Pratique lente mains séparées
pianoai play dream-on --speed 0.75 --mode hands

# Chanter ensemble — narrer les noms de notes pendant la lecture
pianoai sing let-it-be --mode note-names

# Chanter ensemble en solfège, deux mains
pianoai sing fur-elise --mode solfege --hand both

# Chanter + piano ensemble (duo)
pianoai sing let-it-be --with-piano

# Voix d'abord, puis piano
pianoai sing fur-elise --with-piano --sync before
```

## Serveur MCP

Le serveur MCP expose 8 outils pour l'intégration LLM :

| Outil | Description |
|-------|-------------|
| `list_songs` | Parcourir/rechercher des morceaux par genre, difficulté ou requête |
| `song_info` | Obtenir le langage musical complet, les objectifs pédagogiques, les suggestions de pratique |
| `registry_stats` | Nombre de morceaux par genre et difficulté |
| `teaching_note` | Note pédagogique par mesure, doigtés, dynamiques |
| `sing_along` | Obtenir le texte chantable par mesure (noms de notes, solfège, contour, syllabes) ; supporte `withPiano` pour l'accompagnement synchronisé |
| `suggest_song` | Obtenir une recommandation selon des critères |
| `list_measures` | Aperçu des mesures avec notes pédagogiques + avertissements d'analyse |
| `practice_setup` | Suggérer la vitesse, le mode et les réglages vocaux pour un morceau |

```bash
# Démarrer le serveur MCP (transport stdio)
pnpm mcp
```

### Configuration Claude Desktop

```json
{
  "mcpServers": {
    "pianoai": {
      "command": "pianoai-mcp"
    }
  }
}
```

## Commandes CLI

| Commande | Description |
|----------|-------------|
| `list [--genre <genre>]` | Lister les morceaux disponibles, avec filtre optionnel par genre |
| `info <song-id>` | Afficher les détails du morceau : langage musical, notes pédagogiques, structure |
| `play <song-id> [opts]` | Jouer un morceau via VMPK par MIDI |
| `sing <song-id> [opts]` | Chanter ensemble — narrer les notes pendant la lecture |
| `stats` | Statistiques du registre (morceaux, genres, mesures) |
| `ports` | Lister les ports de sortie MIDI disponibles |
| `help` | Afficher les informations d'utilisation |

### Options de lecture

| Option | Description |
|--------|-------------|
| `--port <name>` | Nom du port MIDI (par défaut : détection automatique de loopMIDI) |
| `--tempo <bpm>` | Remplacer le tempo par défaut du morceau (10-400 BPM) |
| `--speed <mult>` | Multiplicateur de vitesse : 0.5 = moitié, 1.0 = normal, 2.0 = double |
| `--mode <mode>` | Mode de lecture : `full`, `measure`, `hands`, `loop` |

### Options de chant

| Option | Description |
|--------|-------------|
| `--mode <mode>` | Mode de chant : `note-names`, `solfege`, `contour`, `syllables` |
| `--hand <hand>` | Quelle main : `right`, `left`, `both` |
| `--with-piano` | Jouer l'accompagnement piano en chantant |
| `--sync <mode>` | Synchronisation voix+piano : `concurrent` (par défaut, duo), `before` (voix d'abord) |

## Moteur pédagogique

Le moteur pédagogique déclenche des hooks pendant la lecture. 9 implémentations de hooks couvrent tous les cas d'usage :

| Hook | Cas d'usage |
|------|-------------|
| `createConsoleTeachingHook()` | CLI — affiche les mesures, moments et complétion dans la console |
| `createSilentTeachingHook()` | Test — aucune opération |
| `createRecordingTeachingHook()` | Test — enregistre les événements pour les assertions |
| `createCallbackTeachingHook(cb)` | Personnalisé — redirige vers n'importe quel callback asynchrone |
| `createVoiceTeachingHook(sink)` | Voix — produit des `VoiceDirective` pour mcp-voice-soundboard |
| `createAsideTeachingHook(sink)` | Aside — produit des `AsideDirective` pour la boîte de réception mcp-aside |
| `createSingAlongHook(sink, song)` | Chant — narre les notes/solfège/contour avant chaque mesure |
| `createLiveFeedbackHook(voiceSink, asideSink, song)` | Retour en direct — encouragements, conseils de dynamique, avertissements de difficulté |
| `composeTeachingHooks(...hooks)` | Multi — dispatch vers plusieurs hooks en série |

### Retour vocal

```typescript
import { createSession, createVoiceTeachingHook } from "@mcptoolshop/pianoai";
import { getSong } from "ai-music-sheets";

const voiceHook = createVoiceTeachingHook(
  async (directive) => {
    // Rediriger vers voice_speak de mcp-voice-soundboard
    console.log(`[Voice] ${directive.text}`);
  },
  { voice: "narrator", speechSpeed: 0.9 }
);

const session = createSession(getSong("moonlight-sonata-mvt1")!, connector, {
  teachingHook: voiceHook,
  speed: 0.5, // pratique à mi-vitesse
});

await session.play();
// voiceHook.directives → toutes les instructions vocales émises
```

### Composition de hooks

```typescript
import {
  createVoiceTeachingHook,
  createAsideTeachingHook,
  createRecordingTeachingHook,
  composeTeachingHooks,
} from "@mcptoolshop/pianoai";

// Les trois se déclenchent à chaque événement
const composed = composeTeachingHooks(
  createVoiceTeachingHook(voiceSink),
  createAsideTeachingHook(asideSink),
  createRecordingTeachingHook()
);
```

### Narration chantée

```typescript
import {
  createSingAlongHook,
  createVoiceTeachingHook,
  composeTeachingHooks,
  createSession,
} from "@mcptoolshop/pianoai";
import { getSong } from "@mcptoolshop/ai-music-sheets";

const song = getSong("let-it-be")!;

// Narrer le solfège avant chaque mesure, puis les notes pédagogiques
const singHook = createSingAlongHook(voiceSink, song, {
  mode: "solfege",
  hand: "right",
});
const teachHook = createVoiceTeachingHook(voiceSink);
const combined = composeTeachingHooks(singHook, teachHook);

const session = createSession(song, connector, { teachingHook: combined });
await session.play();
// singHook.directives → "Do... Mi... Sol" bloquant avant chaque mesure
```

## API programmatique

```typescript
import { getSong } from "ai-music-sheets";
import { createSession, createVmpkConnector } from "@mcptoolshop/pianoai";

const connector = createVmpkConnector({ portName: /loop/i });
await connector.connect();

const song = getSong("autumn-leaves")!;
const session = createSession(song, connector, {
  mode: "measure",
  tempo: 100,
  speed: 0.75,           // 75% de la vitesse pour la pratique
  onProgress: (p) => console.log(p.percent), // "25%", "50%", etc.
});

await session.play();          // joue une mesure, puis pause
session.next();                // avance à la mesure suivante
await session.play();          // joue la mesure suivante
session.setSpeed(1.0);         // retour à la vitesse normale
await session.play();          // joue la mesure suivante à pleine vitesse
session.stop();                // arrêter et réinitialiser

// Vérifier les avertissements d'analyse (notes invalides dans les données du morceau)
if (session.parseWarnings.length > 0) {
  console.warn("Certaines notes n'ont pas pu être analysées :", session.parseWarnings);
}

await connector.disconnect();
```

## Architecture

```
ai-music-sheets (bibliothèque)   pianoai (runtime)
┌──────────────────────┐         ┌────────────────────────────────┐
│ SongEntry (hybride)  │────────→│ Note Parser (sûr + strict)    │
│ Registry (recherche) │         │ Session Engine (vitesse+suivi) │
│ 10 morceaux, 10 genres│        │ Teaching Engine (9 hooks)      │
└──────────────────────┘         │ VMPK Connector (JZZ)          │
                                 │ MCP Server (8 outils)          │
                                 │ CLI (barre de progression+voix)│
                                 └─────────┬──────────────────────┘
                                           │ MIDI
                                           ▼
                                 ┌─────────────────┐
                                 │ loopMIDI → VMPK │
                                 └─────────────────┘

Routage des hooks pédagogiques :
  Session → TeachingHook → VoiceDirective → mcp-voice-soundboard
                         → AsideDirective → boîte de réception mcp-aside
                         → Log console    → terminal CLI
                         → Enregistrement → assertions de test
```

## Tests

```bash
pnpm test       # 181 tests Vitest (parser + session + teaching + voice + aside + chant)
pnpm smoke      # 29 tests d'intégration (pas de MIDI requis)
pnpm typecheck  # tsc --noEmit
```

Le connecteur VMPK mock (`createMockVmpkConnector`) enregistre tous les événements MIDI sans matériel, permettant une couverture de test complète. Les fonctions d'analyse sécurisée (`safeParseMeasure`) collectent des objets `ParseWarning` au lieu de lever des exceptions, afin que la lecture continue normalement si un morceau contient des notes malformées.

## Liens connexes

- **[ai-music-sheets](https://github.com/mcp-tool-shop-org/ai-music-sheets)** — La bibliothèque de morceaux : 10 genres, format hybride (métadonnées + langage musical + mesures prêtes pour le code)

## Licence

MIT
