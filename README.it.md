<p align="center">
  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <strong>Italiano</strong> | <a href="README.pt-BR.md">Português</a>
</p>

<p align="center">
  <img src="logo.svg" alt="Logo PianoAI" width="180" />
</p>

<h1 align="center">PianoAI</h1>

<p align="center">
  Lettore di pianoforte con motore audio integrato — riproduce attraverso gli altoparlanti, nessun software esterno necessario. Server MCP + CLI.
</p>

[![Tests](https://img.shields.io/badge/tests-passing-brightgreen)](https://github.com/mcp-tool-shop-org/pianoai)
[![MCP Tools](https://img.shields.io/badge/MCP_tools-12-purple)](https://github.com/mcp-tool-shop-org/pianoai)
[![Songs](https://img.shields.io/badge/songs-10_built--in-blue)](https://github.com/mcp-tool-shop-org/ai-music-sheets)

## Cos'è questo?

Un lettore di pianoforte TypeScript che riproduce file MIDI standard e brani integrati attraverso i tuoi altoparlanti. Nessun software esterno necessario — il motore audio integrato gestisce tutto. Include un server MCP per l'integrazione con LLM e un CLI per l'uso diretto.

Supporta la narrazione cantata in tempo reale e il feedback didattico dal vivo durante la riproduzione.

## Funzionalità

- **Motore piano integrato** — riproduce attraverso gli altoparlanti tramite `node-web-audio-api`, nessun hardware MIDI necessario
- **Supporto file MIDI standard** — riproduci qualsiasi file `.mid`: `pianoai play brano.mid`
- **Canto in tempo reale** — narra nomi delle note, solfeggio, contorno o sillabe durante la riproduzione MIDI
- **Filtri vocali** — canta solo la melodia (nota più alta), armonia (nota più bassa) o tutte le note per accordo
- **Feedback didattico dal vivo** — suggerimenti di dinamica sensibili alla posizione, avvisi di estensione, confini di sezione, annunci di traguardo
- **Tracciamento della posizione** — mappatura battito/battuta/tempo dal MIDI grezzo con supporto seek
- **4 modalità di riproduzione** — completa, battuta per battuta, mani separate, loop
- **Controllo della velocità** — pratica lenta a 0.5x fino a riproduzione veloce a 4x, cumulabile con override del tempo
- **Controlli in tempo reale** — pausa, ripresa, cambio velocità, seek durante la riproduzione con listener di eventi
- **12 strumenti MCP** — riproduci, pausa, velocità, stop, sfoglia, canta, insegna — tutto attraverso il protocollo MCP
- **12 hook didattici** — console, silent, recording, callback, voice, aside, sing-along, live feedback, MIDI singing, MIDI live feedback, compose
- **Uscita MIDI opzionale** — invia a software esterno tramite flag `--midi` (richiede loopMIDI + VMPK)
- **Parsing sicuro** — le note errate vengono saltate con raccolta di `ParseWarning`
- **Connettore mock** — copertura completa dei test senza hardware

## Installazione

```bash
npm install -g @mcptoolshop/pianoai
```

Richiede **Node.js 18+**. Tutto qui — nessun driver MIDI, nessuna porta virtuale, nessun software esterno.

## Avvio Rapido

```bash
# Riproduci un file MIDI
pianoai play percorso/del/brano.mid

# Riproduci con canto (narra i nomi delle note durante la riproduzione)
pianoai play brano.mid --with-singing

# Canta solo la melodia (salta le note degli accordi, solo la voce superiore)
pianoai play brano.mid --with-singing --voice-filter melody-only

# Riproduci con feedback didattico (dinamiche, incoraggiamento)
pianoai play brano.mid --with-teaching

# Riproduci con canto e feedback insieme
pianoai play brano.mid --with-singing --with-teaching --sing-mode solfege

# Pratica a metà velocità con canto
pianoai play brano.mid --speed 0.5 --with-singing

# Salta al secondo 45 e riproduci da lì
pianoai play brano.mid --seek 45

# Riproduci un brano dalla libreria integrata
pianoai play let-it-be

# Elenca tutti i brani integrati
pianoai list

# Mostra dettagli del brano + note didattiche
pianoai info moonlight-sonata-mvt1

# Canta insieme a un brano della libreria (narrazione vocale)
pianoai sing let-it-be --mode solfege --with-piano
```

### Opzioni di Riproduzione

| Flag | Descrizione |
|------|-------------|
| `--speed <mult>` | Moltiplicatore di velocità: 0.5 = metà, 1.0 = normale, 2.0 = doppio |
| `--tempo <bpm>` | Override del tempo predefinito del brano (10-400 BPM) |
| `--mode <mode>` | Modalità di riproduzione: `full`, `measure`, `hands`, `loop` |
| `--with-singing` | Attiva la narrazione cantata in tempo reale |
| `--with-teaching` | Attiva il feedback didattico dal vivo |
| `--sing-mode <mode>` | Modalità canto: `note-names`, `solfege`, `contour`, `syllables` |
| `--voice-filter <f>` | Filtro vocale: `all`, `melody-only`, `harmony` |
| `--seek <seconds>` | Salta a un momento specifico prima della riproduzione |
| `--midi` | Invia a software MIDI esterno anziché al motore integrato |

## Server MCP

Il server MCP espone 12 strumenti per l'integrazione con LLM:

| Strumento | Descrizione |
|-----------|-------------|
| `list_songs` | Sfoglia/cerca brani per genere, difficoltà o query |
| `song_info` | Ottieni linguaggio musicale completo, obiettivi didattici, suggerimenti di pratica |
| `registry_stats` | Conteggio brani per genere e difficoltà |
| `teaching_note` | Nota didattica per battuta, diteggiatura, dinamiche |
| `suggest_song` | Ottieni una raccomandazione basata su criteri |
| `list_measures` | Panoramica delle battute con note didattiche + avvisi di parsing |
| `sing_along` | Ottieni testo cantabile (nomi note, solfeggio, contorno, sillabe) per battuta |
| `practice_setup` | Suggerisci velocità, modalità e impostazioni vocali per un brano |
| `play_song` | Riproduci un brano o file MIDI con canto e feedback opzionali |
| `pause_playback` | Metti in pausa o riprendi il brano in riproduzione |
| `set_speed` | Cambia la velocità di riproduzione durante l'esecuzione |
| `stop_playback` | Ferma il brano in riproduzione |

### Configurazione Claude Desktop

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

### play_song con canto e feedback

Lo strumento MCP `play_song` accetta i flag `withSinging` e `withTeaching`:

```
play_song({ id: "percorso/del/brano.mid", withSinging: true, withTeaching: true, singMode: "solfege" })
```

## API Programmatica

### Riprodurre un file MIDI con controlli in tempo reale

```typescript
import { createAudioEngine, parseMidiFile, PlaybackController } from "@mcptoolshop/pianoai";

const connector = createAudioEngine();
await connector.connect();

const midi = await parseMidiFile("brano.mid");
const controller = new PlaybackController(connector, midi);

// Ascolta gli eventi
controller.on("noteOn", (e) => console.log(`Nota: ${e.noteName}`));
controller.on("stateChange", (e) => console.log(`Stato: ${e.state}`));

await controller.play({ speed: 0.75 });

controller.pause();       // pausa
controller.setSpeed(1.5); // cambia velocità
await controller.resume();// riprendi alla nuova velocità

await connector.disconnect();
```

### Riprodurre con canto e feedback didattico dal vivo

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
const midi = await parseMidiFile("brano.mid");

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

// feedbackHook.tracker contiene informazioni sulla posizione
console.log(`Battute totali: ${feedbackHook.tracker.totalMeasures}`);
```

### Riprodurre un brano dalla libreria integrata

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

## Architettura

```
Standard MIDI files (.mid)   Built-in songs (ai-music-sheets)
        │                              │
        ▼                              ▼
   MIDI Parser ──────────────── Note Parser
        │                              │
        ▼                              ▼
  MidiPlaybackEngine            SessionController
        │                              │
        └──────── PlaybackController ──┘
                  (real-time events, hooks)
                         │
           ┌─────────────┼─────────────┐
           ▼             ▼             ▼
      AudioEngine   Teaching Hooks  Progress
      (speakers)    (sing, feedback) (callbacks)
           │
           ▼
     node-web-audio-api (Rust DSP)

Position tracking:
  MIDI Parser → PositionTracker → beat/measure/tempo mapping
                                → seek-to-time / seek-to-measure
                                → measure summaries for live feedback

Teaching hook routing:
  PlaybackController → TeachingHook → VoiceDirective → mcp-voice-soundboard
                                    → AsideDirective → mcp-aside inbox
                                    → Console log    → CLI terminal
                                    → Recording      → test assertions
```

## Test

```bash
pnpm test       # 243 test Vitest
pnpm typecheck  # tsc --noEmit
pnpm smoke      # test di integrazione
```

## Correlati

- **[ai-music-sheets](https://github.com/mcp-tool-shop-org/ai-music-sheets)** — La libreria di brani integrata

## Licenza

MIT
