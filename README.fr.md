<p align="center">
  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <strong>Français</strong> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a>
</p>

<p align="center">
  <img src="logo.svg" alt="Logo PianoAI" width="180" />
</p>

<h1 align="center">PianoAI</h1>

<p align="center">
  Lecteur de piano avec moteur audio intégré — joue directement par les haut-parleurs, aucun logiciel externe requis. Serveur MCP + CLI.
</p>

[![Tests](https://img.shields.io/badge/tests-passing-brightgreen)](https://github.com/mcp-tool-shop-org/pianoai)
[![MCP Tools](https://img.shields.io/badge/MCP_tools-12-purple)](https://github.com/mcp-tool-shop-org/pianoai)
[![Songs](https://img.shields.io/badge/songs-10_built--in-blue)](https://github.com/mcp-tool-shop-org/ai-music-sheets)

## Qu'est-ce que c'est ?

Un lecteur de piano TypeScript qui lit des fichiers MIDI standard et des morceaux intégrés directement par vos haut-parleurs. Aucun logiciel externe requis — le moteur audio intégré gère tout. Inclut un serveur MCP pour l'intégration LLM et un CLI pour une utilisation directe.

Prend en charge la narration chantée en temps réel et le retour pédagogique en direct pendant la lecture.

## Fonctionnalités

- **Moteur piano intégré** — joue par les haut-parleurs via `node-web-audio-api`, aucun matériel MIDI nécessaire
- **Support des fichiers MIDI standard** — lisez n'importe quel fichier `.mid` : `pianoai play song.mid`
- **Chant en temps réel** — narration des noms de notes, solfège, contour ou syllabes pendant la lecture MIDI
- **Filtres vocaux** — chantez la mélodie uniquement (note la plus haute), l'harmonie (note la plus basse) ou toutes les notes par accord
- **Retour pédagogique en direct** — conseils de dynamique adaptés à la position, avertissements de tessiture, limites de section, annonces d'étapes
- **Suivi de position** — correspondance temps/mesure/tempo à partir du MIDI brut avec support de recherche
- **4 modes de lecture** — complet, mesure par mesure, mains séparées, boucle
- **Contrôle de la vitesse** — 0.5x pour la pratique lente jusqu'à 4x en rapide, cumulable avec le remplacement du tempo
- **Contrôles en temps réel** — pause, reprise, changement de vitesse, recherche pendant la lecture avec écouteurs d'événements
- **12 outils MCP** — lecture, pause, vitesse, arrêt, navigation, chant, enseignement — le tout via le protocole MCP
- **12 hooks pédagogiques** — console, silencieux, enregistrement, callback, voix, aside, chant accompagné, retour en direct, chant MIDI, retour MIDI en direct, composition
- **Sortie MIDI optionnelle** — routage vers un logiciel externe via le flag `--midi` (nécessite loopMIDI + VMPK)
- **Analyse sécurisée** — les notes invalides sont ignorées avec collecte de `ParseWarning`
- **Connecteur mock** — couverture de test complète sans matériel

## Installation

```bash
npm install -g @mcptoolshop/pianoai
```

Nécessite **Node.js 18+**. C'est tout — pas de pilotes MIDI, pas de ports virtuels, pas de logiciel externe.

## Démarrage rapide

```bash
# Lire un fichier MIDI
pianoai play path/to/song.mid

# Lire avec le chant (narrer les noms de notes pendant la lecture)
pianoai play song.mid --with-singing

# Chanter la mélodie uniquement (ignorer les notes d'accord, juste la voix supérieure)
pianoai play song.mid --with-singing --voice-filter melody-only

# Lire avec retour pédagogique (dynamiques, encouragements)
pianoai play song.mid --with-teaching

# Lire avec le chant et l'enseignement
pianoai play song.mid --with-singing --with-teaching --sing-mode solfege

# Pratique à mi-vitesse avec chant
pianoai play song.mid --speed 0.5 --with-singing

# Aller à la seconde 45 et lire à partir de là
pianoai play song.mid --seek 45

# Lire un morceau de la bibliothèque intégrée
pianoai play let-it-be

# Lister tous les morceaux intégrés
pianoai list

# Afficher les détails du morceau + notes pédagogiques
pianoai info moonlight-sonata-mvt1

# Chanter avec un morceau de la bibliothèque (narration vocale)
pianoai sing let-it-be --mode solfege --with-piano
```

### Options de lecture

| Flag | Description |
|------|-------------|
| `--speed <mult>` | Multiplicateur de vitesse : 0.5 = moitié, 1.0 = normal, 2.0 = double |
| `--tempo <bpm>` | Remplacer le tempo par défaut du morceau (10-400 BPM) |
| `--mode <mode>` | Mode de lecture : `full`, `measure`, `hands`, `loop` |
| `--with-singing` | Activer la narration chantée en temps réel |
| `--with-teaching` | Activer le retour pédagogique en direct |
| `--sing-mode <mode>` | Mode de chant : `note-names`, `solfege`, `contour`, `syllables` |
| `--voice-filter <f>` | Filtre vocal : `all`, `melody-only`, `harmony` |
| `--seek <seconds>` | Aller à un moment précis avant la lecture |
| `--midi` | Router vers un logiciel MIDI externe au lieu du moteur intégré |

## Serveur MCP

Le serveur MCP expose 12 outils pour l'intégration LLM :

| Outil | Description |
|-------|-------------|
| `list_songs` | Parcourir/rechercher des morceaux par genre, difficulté ou requête |
| `song_info` | Obtenir le langage musical complet, les objectifs pédagogiques, les suggestions de pratique |
| `registry_stats` | Nombre de morceaux par genre et difficulté |
| `teaching_note` | Note pédagogique par mesure, doigtés, dynamiques |
| `suggest_song` | Obtenir une recommandation selon des critères |
| `list_measures` | Aperçu des mesures avec notes pédagogiques + avertissements d'analyse |
| `sing_along` | Obtenir le texte chantable (noms de notes, solfège, contour, syllabes) par mesure |
| `practice_setup` | Suggérer la vitesse, le mode et les réglages vocaux pour un morceau |
| `play_song` | Lire un morceau ou un fichier MIDI avec chant et enseignement optionnels |
| `pause_playback` | Mettre en pause ou reprendre le morceau en cours de lecture |
| `set_speed` | Changer la vitesse de lecture pendant la lecture |
| `stop_playback` | Arrêter le morceau en cours de lecture |

### Configuration Claude Desktop

```json
{
  "mcpServers": {
    "pianoai": {
      "command": "npx",
      "args": ["-y", "-p", "@mcptoolshop/pianoai", "pianoai-mcp"]
    }
  }
}
```

### play_song avec chant et enseignement

L'outil MCP `play_song` accepte les flags `withSinging` et `withTeaching` :

```
play_song({ id: "path/to/song.mid", withSinging: true, withTeaching: true, singMode: "solfege" })
```

## API programmatique

### Lire un fichier MIDI avec contrôles en temps réel

```typescript
import { createAudioEngine, parseMidiFile, PlaybackController } from "@mcptoolshop/pianoai";

const connector = createAudioEngine();
await connector.connect();

const midi = await parseMidiFile("song.mid");
const controller = new PlaybackController(connector, midi);

// Écouter les événements
controller.on("noteOn", (e) => console.log(`Note : ${e.noteName}`));
controller.on("stateChange", (e) => console.log(`État : ${e.state}`));

await controller.play({ speed: 0.75 });

controller.pause();       // pause
controller.setSpeed(1.5); // changer la vitesse
await controller.resume();// reprendre à la nouvelle vitesse

await connector.disconnect();
```

### Lire avec chant et enseignement en direct

```typescript
import {
  createAudioEngine,
  parseMidiFile,
  PlaybackController,
  createSingOnMidiHook,
  createLiveMidiFeedbackHook,
  composeTeachingHooks,
} from "@mcptoolshop/pianoai";

const connector = createAudioEngine();
await connector.connect();
const midi = await parseMidiFile("song.mid");

const singHook = createSingOnMidiHook(
  async (d) => console.log(`♪ ${d.text}`),
  midi,
  { mode: "solfege", voiceFilter: "melody-only" }
);

const feedbackHook = createLiveMidiFeedbackHook(
  async (d) => console.log(`🎓 ${d.text}`),
  async (d) => console.log(`💡 ${d.text}`),
  midi,
  { voiceInterval: 8 }
);

const composed = composeTeachingHooks(singHook, feedbackHook);
const controller = new PlaybackController(connector, midi);
await controller.play({ teachingHook: composed });

// feedbackHook.tracker contient les informations de position
console.log(`Total de mesures : ${feedbackHook.tracker.totalMeasures}`);
```

### Lire un morceau de la bibliothèque intégrée

```typescript
import { getSong } from "@mcptoolshop/ai-music-sheets";
import { createSession, createAudioEngine } from "@mcptoolshop/pianoai";

const connector = createAudioEngine();
await connector.connect();

const song = getSong("autumn-leaves")!;
const session = createSession(song, connector, {
  mode: "full",
  speed: 0.75,
});

await session.play();
await connector.disconnect();
```

## Architecture

```
Fichiers MIDI standard (.mid)   Morceaux intégrés (ai-music-sheets)
        │                              │
        ▼                              ▼
   MIDI Parser ──────────────── Note Parser
        │                              │
        ▼                              ▼
  MidiPlaybackEngine            SessionController
        │                              │
        └──────── PlaybackController ──┘
                  (événements temps réel, hooks)
                         │
           ┌─────────────┼─────────────┐
           ▼             ▼             ▼
      AudioEngine   Teaching Hooks  Progress
      (haut-parleurs)(chant, retour) (callbacks)
           │
           ▼
     node-web-audio-api (Rust DSP)

Suivi de position :
  MIDI Parser → PositionTracker → correspondance temps/mesure/tempo
                                → recherche par temps / par mesure
                                → résumés de mesure pour le retour en direct

Routage des hooks pédagogiques :
  PlaybackController → TeachingHook → VoiceDirective → mcp-voice-soundboard
                                    → AsideDirective → boîte de réception mcp-aside
                                    → Log console    → terminal CLI
                                    → Enregistrement → assertions de test
```

## Tests

```bash
pnpm test       # 243 tests Vitest
pnpm typecheck  # tsc --noEmit
pnpm smoke      # tests d'intégration
```

## Liens connexes

- **[ai-music-sheets](https://github.com/mcp-tool-shop-org/ai-music-sheets)** — La bibliothèque de morceaux intégrée

## Licence

MIT
