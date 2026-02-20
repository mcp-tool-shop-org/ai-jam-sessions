<p align="center"><a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <strong>Italiano</strong> | <a href="README.pt-BR.md">Português</a></p>

<p align="center">
  <img src="logo.png" alt="Logo PianoAI" width="180" />
</p>

<h1 align="center">PianoAI</h1>

<p align="center">
  Pianoforte AI con motore audio integrato e libreria di 100 brani. Server MCP per Claude, CLI per gli esseri umani.
</p>

[![MCP Tools](https://img.shields.io/badge/MCP_tools-15-purple)](https://github.com/mcp-tool-shop-org/ai_jam_session)
[![Songs](https://img.shields.io/badge/songs-100_built--in-blue)](https://github.com/mcp-tool-shop-org/ai_jam_session)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen)](https://github.com/mcp-tool-shop-org/ai_jam_session)

## Cos'e?

Un pianoforte che Claude sa suonare. PianoAI e un server MCP con motore audio integrato: riproduce il suono direttamente dai tuoi altoparlanti, senza bisogno di software esterno. Claude esplora una libreria di 100 brani in 10 generi, sceglie i pezzi, li insegna e ci improvvisa sopra. Funziona anche come CLI indipendente.

## Funzionalita

- **Motore piano integrato** — audio basato su campioni tramite `node-web-audio-api`, riproduce dagli altoparlanti
- **Libreria di 100 brani** — classica, jazz, pop, blues, rock, R&B, latin, colonne sonore, ragtime, new-age
- **AI Jam Session** — Claude analizza gli accordi e la melodia di un brano, poi crea la propria interpretazione
- **Supporto file MIDI** — riproduci qualsiasi file `.mid`: `ai-jam-session play song.mid`
- **Sistema didattico** — note didattiche per ogni battuta, descrizioni del linguaggio musicale, consigli per lo studio
- **4 modalita di riproduzione** — completa, battuta per battuta, mani separate, loop
- **Controllo velocita** — da 0.5x per lo studio lento fino a 4x per la riproduzione veloce
- **Controlli in tempo reale** — pausa, ripresa, cambio di velocita durante la riproduzione
- **15 strumenti MCP** — riproduci, esplora, insegna, improvvisa, importa — tutto tramite il protocollo MCP
- **Aggiungi i tuoi brani** — lo strumento `add_song` accetta JSON SongEntry, `import_midi` converte file MIDI
- **Uscita MIDI opzionale** — instrada verso software esterno con il flag `--midi` (richiede loopMIDI + VMPK)

## Installazione

```bash
npm install -g @mcptoolshop/ai_jam_session
```

Richiede **Node.js 18+**. Tutto qui — nessun driver MIDI, nessuna porta virtuale, nessun software esterno.

## Avvio rapido

```bash
# Riproduci un brano dalla libreria
ai-jam-session play let-it-be

# Riproduci un file MIDI
ai-jam-session play path/to/song.mid

# Esercitati a meta velocita
ai-jam-session play moonlight-sonata-mvt1 --speed 0.5

# Elenca tutti i brani disponibili
ai-jam-session list

# Mostra i dettagli di un brano e le note didattiche
ai-jam-session info autumn-leaves
```

### Opzioni di riproduzione

| Flag | Descrizione |
|------|-------------|
| `--speed <mult>` | Moltiplicatore di velocita: 0.5 = meta, 1.0 = normale, 2.0 = doppia |
| `--tempo <bpm>` | Sovrascrive il tempo predefinito del brano (10-400 BPM) |
| `--mode <mode>` | Modalita di riproduzione: `full`, `measure`, `hands`, `loop` |
| `--midi` | Instrada verso software MIDI esterno invece del motore integrato |

## Server MCP

Il server MCP espone 15 strumenti per l'integrazione con LLM:

| Strumento | Descrizione |
|-----------|-------------|
| `list_songs` | Esplora/cerca brani per genere, difficolta o query |
| `song_info` | Linguaggio musicale completo, obiettivi didattici, suggerimenti per lo studio |
| `registry_stats` | Conteggio brani per genere e difficolta |
| `teaching_note` | Nota didattica per battuta, diteggiatura, dinamiche |
| `suggest_song` | Raccomandazione basata su criteri |
| `list_measures` | Panoramica delle battute con note didattiche |
| `practice_setup` | Suggerisce velocita, modalita e impostazioni per un brano |
| `sing_along` | Testo cantabile (nomi delle note, solfeggio, contorno) per battuta |
| `play_song` | Riproduci un brano o file MIDI dagli altoparlanti |
| `pause_playback` | Metti in pausa o riprendi il brano in riproduzione |
| `set_speed` | Cambia la velocita durante la riproduzione |
| `stop_playback` | Ferma il brano in riproduzione |
| `ai_jam_session` | Ottieni un brief per la jam — accordi, melodia, guida stilistica — per l'improvvisazione |
| `add_song` | Aggiungi un nuovo brano (JSON SongEntry) alla libreria |
| `import_midi` | Converti un file MIDI in SongEntry e registralo |

### AI Jam Session

Lo strumento `ai_jam_session` estrae un "jam brief" strutturato da qualsiasi brano: progressione di accordi, contorno melodico e guida stilistica specifica per il genere. Claude usa il brief per creare la propria interpretazione.

Due modalita:
- **Brano specifico:** `ai_jam_session({ songId: "autumn-leaves", style: "blues" })` — improvvisa su Autumn Leaves in stile blues
- **Scelta casuale per genere:** `ai_jam_session({ genre: "jazz" })` — sceglie un brano jazz a caso e ci improvvisa sopra

Parametri opzionali: `mood` (allegro, malinconico, sognante, ecc.), `difficulty`, `measures` (intervallo come "1-8").

### Configurazione Claude Desktop / Claude Code

```json
{
  "mcpServers": {
    "ai_jam_session": {
      "command": "npx",
      "args": ["-y", "-p", "@mcptoolshop/ai_jam_session", "ai-jam-session-mcp"]
    }
  }
}
```

### Plugin per Claude Code

PianoAI include un plugin per Claude Code che aggiunge comandi slash e personalita agente:

| Comando | Descrizione |
|---------|-------------|
| `/ai-jam-session:teach <song>` | Avvia una sessione didattica strutturata |
| `/ai-jam-session:practice <song>` | Ottieni un piano di studio con raccomandazioni su velocita e modalita |
| `/ai-jam-session:explore [query]` | Esplora la libreria musicale per genere, difficolta o parola chiave |
| `/ai-jam-session:jam <song or genre>` | Avvia una jam session — Claude crea la propria interpretazione |

Due personalita agente:
- **Piano Teacher** — paziente, pedagogico, si adatta al livello dello studente
- **Jam Musician** — atmosfera rilassata da jam band, prima il groove, incoraggia la sperimentazione

## Libreria musicale

100 brani integrati in 10 generi, 3 livelli di difficolta:

| Genere | Brani | Esempi |
|--------|-------|--------|
| Classica | 10 | Fur Elise, Clair de Lune, Moonlight Sonata, Bach Prelude in C |
| Jazz | 10 | Autumn Leaves, Take Five, So What, Misty |
| Pop | 10 | Imagine, Hallelujah, Piano Man, Bohemian Rhapsody |
| Blues | 10 | Basic 12-Bar, St. Louis Blues, Stormy Monday, Thrill Is Gone |
| Rock | 10 | Stairway Intro, Hotel California, Rocket Man, Layla Coda |
| R&B | 10 | Superstition, Georgia On My Mind, Lean On Me, My Girl |
| Latin | 10 | Girl from Ipanema, Besame Mucho, Oye Como Va, Wave |
| Colonne sonore | 11 | Cinema Paradiso, Moon River, Hedwig's Theme, Spirited Away |
| Ragtime | 9 | The Entertainer, Maple Leaf Rag, Elite Syncopations |
| New-Age | 10 | River Flows in You, Snowfall, Crystal Stream, Evening Calm |

## API programmatica

```typescript
import { createAudioEngine, parseMidiFile, PlaybackController } from "@mcptoolshop/ai_jam_session";

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

### Riproduci un brano dalla libreria

```typescript
import { getSong, createSession, createAudioEngine } from "@mcptoolshop/ai_jam_session";

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

## Architettura

```
MIDI files (.mid)          Built-in song library (JSON)
       |                              |
       v                              v
  MIDI Parser ──────────────── Note Parser
       |                              |
       v                              v
 MidiPlaybackEngine            SessionController
       |                              |
       └──────── PlaybackController ──┘
                 (real-time events, hooks)
                        |
          ┌─────────────┼─────────────┐
          v             v             v
     AudioEngine   Teaching Hooks  Progress
     (speakers)    (per-measure)   (callbacks)
          |
          v
    node-web-audio-api (Rust DSP)
```

## Licenza

MIT
