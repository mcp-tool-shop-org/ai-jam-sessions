<p align="center"><a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.es.md">Español</a> | <strong>Français</strong> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a></p>

<p align="center">
  <img src="logo.png" alt="Logo AI Jam Session" width="180" />
</p>

<h1 align="center">AI Jam Session</h1>

<p align="center">
  Piano IA avec moteur audio integre et bibliotheque de 100 morceaux. Serveur MCP + CLI.
</p>

[![MCP Tools](https://img.shields.io/badge/MCP_tools-15-purple)](https://github.com/mcp-tool-shop-org/ai_jam_session)
[![Songs](https://img.shields.io/badge/songs-100_built--in-blue)](https://github.com/mcp-tool-shop-org/ai_jam_session)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen)](https://github.com/mcp-tool-shop-org/ai_jam_session)

## Qu'est-ce que c'est ?

Un piano que Claude peut jouer. AI Jam Session est un serveur MCP avec un moteur audio integre -- il joue directement dans vos haut-parleurs, aucun logiciel externe requis. Claude parcourt une bibliotheque de 100 morceaux couvrant 10 genres, choisit des morceaux, les enseigne et improvise dessus. Fonctionne egalement en CLI autonome.

## Fonctionnalites

- **Moteur piano integre** -- audio a base d'echantillons via `node-web-audio-api`, joue dans les haut-parleurs
- **Bibliotheque de 100 morceaux** -- classique, jazz, pop, blues, rock, R&B, latin, film, ragtime, new-age
- **AI Jam Session** -- Claude analyse les accords et la melodie d'un morceau, puis cree sa propre interpretation
- **Support des fichiers MIDI** -- jouez n'importe quel fichier `.mid` : `ai-jam-session play song.mid`
- **Systeme pedagogique** -- notes d'enseignement par mesure, descriptions du langage musical, recommandations de pratique
- **4 modes de lecture** -- integral, mesure par mesure, mains separees, boucle
- **Controle de la vitesse** -- de 0.5x pour la pratique lente jusqu'a 4x rapide
- **Controles en temps reel** -- pause, reprise, changement de vitesse pendant la lecture
- **15 outils MCP** -- jouer, parcourir, enseigner, improviser, importer -- le tout via le protocole MCP
- **Ajoutez vos propres morceaux** -- l'outil `add_song` accepte du JSON SongEntry, `import_midi` convertit les fichiers MIDI
- **Sortie MIDI optionnelle** -- routage vers un logiciel externe via le flag `--midi` (necessite loopMIDI + VMPK)

## Installation

```bash
npm install -g @mcptoolshop/ai-jam-session
```

Necessite **Node.js 18+**. C'est tout -- pas de pilotes MIDI, pas de ports virtuels, pas de logiciel externe.

## Demarrage rapide

```bash
# Jouer un morceau integre
ai-jam-session play let-it-be

# Jouer un fichier MIDI
ai-jam-session play path/to/song.mid

# Pratique a demi-vitesse
ai-jam-session play moonlight-sonata-mvt1 --speed 0.5

# Lister tous les morceaux integres
ai-jam-session list

# Afficher les details d'un morceau et les notes pedagogiques
ai-jam-session info autumn-leaves
```

### Options de lecture

| Flag | Description |
|------|-------------|
| `--speed <mult>` | Multiplicateur de vitesse : 0.5 = moitie, 1.0 = normal, 2.0 = double |
| `--tempo <bpm>` | Remplacer le tempo par defaut du morceau (10-400 BPM) |
| `--mode <mode>` | Mode de lecture : `full`, `measure`, `hands`, `loop` |
| `--midi` | Router vers un logiciel MIDI externe au lieu du moteur integre |

## Serveur MCP

Le serveur MCP expose 15 outils pour l'integration avec les LLM :

| Outil | Description |
|-------|-------------|
| `list_songs` | Parcourir/rechercher des morceaux par genre, difficulte ou requete |
| `song_info` | Langage musical complet, objectifs pedagogiques, suggestions de pratique |
| `registry_stats` | Nombre de morceaux par genre et difficulte |
| `teaching_note` | Note pedagogique par mesure, doigte, dynamiques |
| `suggest_song` | Recommandation basee sur des criteres |
| `list_measures` | Vue d'ensemble des mesures avec notes pedagogiques |
| `practice_setup` | Suggestion de vitesse, mode et reglages pour un morceau |
| `sing_along` | Texte chantable (noms des notes, solfege, contour) par mesure |
| `play_song` | Jouer un morceau ou un fichier MIDI dans les haut-parleurs |
| `pause_playback` | Mettre en pause ou reprendre le morceau en cours |
| `set_speed` | Changer la vitesse de lecture pendant la lecture |
| `stop_playback` | Arreter le morceau en cours |
| `ai_jam_session` | Obtenir un brief de jam -- accords, melodie, conseils de style -- pour l'improvisation |
| `add_song` | Ajouter un nouveau morceau (JSON SongEntry) a la bibliotheque |
| `import_midi` | Convertir un fichier MIDI en SongEntry et l'enregistrer |

### AI Jam Session

L'outil `ai_jam_session` extrait un "brief de jam" structure a partir de n'importe quel morceau : progression d'accords, contour melodique et conseils stylistiques specifiques au genre. Claude utilise ce brief pour creer sa propre interpretation.

Deux modes :
- **Morceau specifique :** `ai_jam_session({ songId: "autumn-leaves", style: "blues" })` -- improviser sur Autumn Leaves, style blues
- **Choix aleatoire par genre :** `ai_jam_session({ genre: "jazz" })` -- choisir un morceau de jazz au hasard et improviser dessus

Parametres optionnels : `mood` (enjoue, melancolique, reveur, etc.), `difficulty`, `measures` (plage comme "1-8").

### Configuration Claude Desktop / Claude Code

```json
{
  "mcpServers": {
    "ai_jam_session": {
      "command": "npx",
      "args": ["-y", "-p", "@mcptoolshop/ai-jam-session", "ai-jam-session-mcp"]
    }
  }
}
```

### Plugin Claude Code

AI Jam Session est livre avec un plugin Claude Code qui ajoute des commandes slash et des personnalites d'agent :

| Commande | Description |
|----------|-------------|
| `/ai-jam-session:teach <song>` | Demarrer une session d'enseignement structuree |
| `/ai-jam-session:practice <song>` | Obtenir un plan de pratique avec des recommandations de vitesse/mode |
| `/ai-jam-session:explore [query]` | Parcourir la bibliotheque par genre, difficulte ou mot-cle |
| `/ai-jam-session:jam <song or genre>` | Demarrer une session de jam -- Claude cree sa propre interpretation |

Deux personnalites d'agent :
- **Professeur de piano** -- patient, pedagogique, s'adapte au niveau de l'eleve
- **Musicien de jam** -- ambiance decontractee, groove avant tout, encourage l'experimentation

## Bibliotheque de morceaux

100 morceaux integres couvrant 10 genres et 3 niveaux de difficulte :

| Genre | Morceaux | Exemples |
|-------|----------|----------|
| Classique | 10 | Fur Elise, Clair de Lune, Moonlight Sonata, Bach Prelude in C |
| Jazz | 10 | Autumn Leaves, Take Five, So What, Misty |
| Pop | 10 | Imagine, Hallelujah, Piano Man, Bohemian Rhapsody |
| Blues | 10 | Basic 12-Bar, St. Louis Blues, Stormy Monday, Thrill Is Gone |
| Rock | 10 | Stairway Intro, Hotel California, Rocket Man, Layla Coda |
| R&B | 10 | Superstition, Georgia On My Mind, Lean On Me, My Girl |
| Latin | 10 | Girl from Ipanema, Besame Mucho, Oye Como Va, Wave |
| Film | 11 | Cinema Paradiso, Moon River, Hedwig's Theme, Spirited Away |
| Ragtime | 9 | The Entertainer, Maple Leaf Rag, Elite Syncopations |
| New-Age | 10 | River Flows in You, Snowfall, Crystal Stream, Evening Calm |

## API programmatique

```typescript
import { createAudioEngine, parseMidiFile, PlaybackController } from "@mcptoolshop/ai-jam-session";

const connector = createAudioEngine();
await connector.connect();

const midi = await parseMidiFile("song.mid");
const controller = new PlaybackController(connector, midi);

controller.on("noteOn", (e) => console.log(`Note: ${e.noteName}`));
await controller.play({ speed: 0.75 });

controller.pause();
controller.setSpeed(1.5);
await controller.resume();

await connector.disconnect();
```

### Jouer un morceau integre

```typescript
import { getSong, createSession, createAudioEngine } from "@mcptoolshop/ai-jam-session";

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
Fichiers MIDI (.mid)           Bibliotheque integree (JSON)
       |                              |
       v                              v
  MIDI Parser ──────────────── Note Parser
       |                              |
       v                              v
 MidiPlaybackEngine            SessionController
       |                              |
       └──────── PlaybackController ──┘
                 (evenements temps reel, hooks)
                        |
          ┌─────────────┼─────────────┐
          v             v             v
     AudioEngine   Teaching Hooks  Progress
     (haut-parleurs) (par mesure)  (callbacks)
          |
          v
    node-web-audio-api (Rust DSP)
```

## Licence

MIT
