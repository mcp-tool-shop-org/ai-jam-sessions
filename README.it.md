<p align="center">
  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <strong>Italiano</strong> | <a href="README.pt-BR.md">Português</a>
</p>

<p align="center">
  <img src="logo.svg" alt="PianoAI logo" width="180" />
</p>

<h1 align="center">PianoAI</h1>

<p align="center">
  Server MCP + CLI per l'insegnamento del pianoforte con IA — riproduce tramite VMPK via MIDI con feedback vocale.
</p>

[![Tests](https://img.shields.io/badge/tests-163_passing-brightgreen)](https://github.com/mcp-tool-shop-org/pianoai)
[![Smoke](https://img.shields.io/badge/smoke-25_passing-brightgreen)](https://github.com/mcp-tool-shop-org/pianoai)
[![MCP Tools](https://img.shields.io/badge/MCP_tools-8-purple)](https://github.com/mcp-tool-shop-org/pianoai)
[![Songs](https://img.shields.io/badge/songs-10_(via_ai--music--sheets)-blue)](https://github.com/mcp-tool-shop-org/ai-music-sheets)

## Cos'è questo?

Un CLI TypeScript e server MCP che carica brani per pianoforte da [ai-music-sheets](https://github.com/mcp-tool-shop-org/ai-music-sheets), li analizza in MIDI e li riproduce tramite [VMPK](https://vmpk.sourceforge.io/) attraverso una porta MIDI virtuale. Il motore didattico lancia interventi ai confini delle battute e nei momenti chiave, permettendo a un LLM di agire come insegnante di pianoforte dal vivo con feedback vocale e interjection aside.

## Funzionalità

- **4 modalità di riproduzione** — completa, battuta per battuta, mani separate, loop
- **Controllo della velocità** — pratica lenta a 0.5x fino a riproduzione veloce a 2x, cumulabile con override del tempo
- **Tracciamento dei progressi** — callback configurabili a traguardi percentuali o per battuta
- **8 hook didattici** — console, silent, recording, callback, voice, aside, sing-along, compose
- **Narrazione cantata** — nomi delle note, solfeggio, contorno o sillabe pronunciati prima di ogni battuta
- **Feedback vocale** — output `VoiceDirective` per l'integrazione con mcp-voice-soundboard
- **Interjection aside** — output `AsideDirective` per la inbox di mcp-aside
- **Parsing sicuro** — le note errate vengono saltate con raccolta di `ParseWarning`
- **8 strumenti MCP** — espongono registro, note didattiche, canto accompagnato e raccomandazioni di brani agli LLM
- **Parser delle note** — notazione scientifica delle altezze da e verso MIDI
- **Connettore mock** — copertura completa dei test senza hardware MIDI

## Prerequisiti

1. **[loopMIDI](https://www.tobias-erichsen.de/software/loopmidi.html)** — crea una porta MIDI virtuale (es. "loopMIDI Port")
2. **[VMPK](https://vmpk.sourceforge.io/)** — imposta l'input MIDI sulla porta loopMIDI
3. **Node.js 18+**

## Installazione

```bash
npm install -g @mcptoolshop/pianoai
```

## Avvio Rapido

```bash
# Elenca tutti i brani
pianai list

# Mostra dettagli del brano + note didattiche
pianai info moonlight-sonata-mvt1

# Riproduci un brano tramite VMPK
pianai play let-it-be

# Riproduci con override del tempo
pianai play basic-12-bar-blues --tempo 80

# Avanza battuta per battuta
pianai play autumn-leaves --mode measure

# Pratica a metà velocità
pianai play moonlight-sonata-mvt1 --speed 0.5

# Pratica lenta a mani separate
pianai play dream-on --speed 0.75 --mode hands

# Cantare insieme — narrare i nomi delle note durante la riproduzione
pianai sing let-it-be --mode note-names

# Cantare insieme con solfeggio, entrambe le mani
pianai sing fur-elise --mode solfege --hand both
```

## Server MCP

Il server MCP espone 8 strumenti per l'integrazione con LLM:

| Strumento | Descrizione |
|-----------|-------------|
| `list_songs` | Sfoglia/cerca brani per genere, difficoltà o query |
| `song_info` | Ottieni linguaggio musicale completo, obiettivi didattici, suggerimenti di pratica |
| `registry_stats` | Conteggio brani per genere e difficoltà |
| `teaching_note` | Nota didattica per battuta, diteggiatura, dinamiche |
| `suggest_song` | Ottieni una raccomandazione basata su criteri |
| `list_measures` | Panoramica delle battute con note didattiche + avvisi di parsing |
| `sing_along` | Ottieni testo cantabile per battuta (nomi note, solfeggio, contorno, sillabe) |
| `practice_setup` | Suggerisci velocità, modalità e impostazioni vocali per un brano |

```bash
# Avvia il server MCP (trasporto stdio)
pnpm mcp
```

### Configurazione Claude Desktop

```json
{
  "mcpServers": {
    "pianai": {
      "command": "pianai-mcp"
    }
  }
}
```

## Comandi CLI

| Comando | Descrizione |
|---------|-------------|
| `list [--genre <genre>]` | Elenca i brani disponibili, con filtro opzionale per genere |
| `info <song-id>` | Mostra dettagli del brano: linguaggio musicale, note didattiche, struttura |
| `play <song-id> [opts]` | Riproduci un brano tramite VMPK via MIDI |
| `sing <song-id> [opts]` | Canta insieme — narra le note durante la riproduzione |
| `stats` | Statistiche del registro (brani, generi, battute) |
| `ports` | Elenca le porte di output MIDI disponibili |
| `help` | Mostra le informazioni d'uso |

### Opzioni di Riproduzione

| Flag | Descrizione |
|------|-------------|
| `--port <name>` | Nome della porta MIDI (predefinito: rilevamento automatico loopMIDI) |
| `--tempo <bpm>` | Override del tempo predefinito del brano (10-400 BPM) |
| `--speed <mult>` | Moltiplicatore di velocità: 0.5 = metà, 1.0 = normale, 2.0 = doppio |
| `--mode <mode>` | Modalità di riproduzione: `full`, `measure`, `hands`, `loop` |

## Motore Didattico

Il motore didattico attiva hook durante la riproduzione. 8 implementazioni di hook coprono ogni caso d'uso:

| Hook | Caso d'uso |
|------|------------|
| `createConsoleTeachingHook()` | CLI — registra battute, momenti, completamento nella console |
| `createSilentTeachingHook()` | Test — nessuna operazione |
| `createRecordingTeachingHook()` | Test — registra gli eventi per le asserzioni |
| `createCallbackTeachingHook(cb)` | Personalizzato — indirizza verso qualsiasi callback asincrono |
| `createVoiceTeachingHook(sink)` | Voce — produce `VoiceDirective` per mcp-voice-soundboard |
| `createAsideTeachingHook(sink)` | Aside — produce `AsideDirective` per la inbox di mcp-aside |
| `createSingAlongHook(sink, song)` | Canto — narra note/solfeggio/contorno prima di ogni battuta |
| `composeTeachingHooks(...hooks)` | Multi — invia a più hook in serie |

### Feedback vocale

```typescript
import { createSession, createVoiceTeachingHook } from "@mcptoolshop/pianoai";
import { getSong } from "ai-music-sheets";

const voiceHook = createVoiceTeachingHook(
  async (directive) => {
    // Indirizza verso voice_speak di mcp-voice-soundboard
    console.log(`[Voice] ${directive.text}`);
  },
  { voice: "narrator", speechSpeed: 0.9 }
);

const session = createSession(getSong("moonlight-sonata-mvt1")!, connector, {
  teachingHook: voiceHook,
  speed: 0.5, // pratica a metà velocità
});

await session.play();
// voiceHook.directives → tutte le istruzioni vocali che sono state attivate
```

### Composizione degli hook

```typescript
import {
  createVoiceTeachingHook,
  createAsideTeachingHook,
  createRecordingTeachingHook,
  composeTeachingHooks,
} from "@mcptoolshop/pianoai";

// Tutti e tre si attivano ad ogni evento
const composed = composeTeachingHooks(
  createVoiceTeachingHook(voiceSink),
  createAsideTeachingHook(asideSink),
  createRecordingTeachingHook()
);
```

### Narrazione cantata

```typescript
import {
  createSingAlongHook,
  createVoiceTeachingHook,
  composeTeachingHooks,
  createSession,
} from "@mcptoolshop/pianoai";
import { getSong } from "@mcptoolshop/ai-music-sheets";

const song = getSong("let-it-be")!;

// Narrare il solfeggio prima di ogni battuta, poi le note didattiche
const singHook = createSingAlongHook(voiceSink, song, {
  mode: "solfege",
  hand: "right",
});
const teachHook = createVoiceTeachingHook(voiceSink);
const combined = composeTeachingHooks(singHook, teachHook);

const session = createSession(song, connector, { teachingHook: combined });
await session.play();
// singHook.directives → "Do... Mi... Sol" bloccante prima di ogni battuta
```

## API Programmatica

```typescript
import { getSong } from "ai-music-sheets";
import { createSession, createVmpkConnector } from "@mcptoolshop/pianoai";

const connector = createVmpkConnector({ portName: /loop/i });
await connector.connect();

const song = getSong("autumn-leaves")!;
const session = createSession(song, connector, {
  mode: "measure",
  tempo: 100,
  speed: 0.75,           // 75% di velocità per la pratica
  onProgress: (p) => console.log(p.percent), // "25%", "50%", ecc.
});

await session.play();          // riproduce una battuta, poi pausa
session.next();                // avanza alla battuta successiva
await session.play();          // riproduce la battuta successiva
session.setSpeed(1.0);         // torna alla velocità normale
await session.play();          // riproduce la battuta successiva a piena velocità
session.stop();                // ferma e ripristina

// Controlla eventuali avvisi di parsing (note errate nei dati del brano)
if (session.parseWarnings.length > 0) {
  console.warn("Alcune note non sono state analizzate:", session.parseWarnings);
}

await connector.disconnect();
```

## Architettura

```
ai-music-sheets (libreria)       pianai (runtime)
┌──────────────────────┐         ┌────────────────────────────────┐
│ SongEntry (ibrido)   │────────→│ Parser Note (sicuro + rigoroso)│
│ Registry (ricerca)   │         │ Motore Sessione (veloc+progr)  │
│ 10 brani, 10 generi  │         │ Motore Didattico (8 hook)      │
└──────────────────────┘         │ Connettore VMPK (JZZ)          │
                                 │ Server MCP (8 strumenti)        │
                                 │ CLI (barra progresso + voce)    │
                                 └─────────┬──────────────────────┘
                                           │ MIDI
                                           ▼
                                 ┌─────────────────┐
                                 │ loopMIDI → VMPK │
                                 └─────────────────┘

Instradamento hook didattici:
  Sessione → TeachingHook → VoiceDirective → mcp-voice-soundboard
                          → AsideDirective → inbox mcp-aside
                          → Log console    → terminale CLI
                          → Recording      → asserzioni test
```

## Test

```bash
pnpm test       # 163 test Vitest (parser + sessione + didattica + voce + aside + canto)
pnpm smoke      # 25 smoke test (integrazione, nessun MIDI necessario)
pnpm typecheck  # tsc --noEmit
```

Il connettore VMPK mock (`createMockVmpkConnector`) registra tutti gli eventi MIDI senza hardware, garantendo copertura completa dei test. Le funzioni di parsing sicuro (`safeParseMeasure`) raccolgono oggetti `ParseWarning` invece di lanciare eccezioni, così la riproduzione continua senza interruzioni anche se un brano contiene note malformate.

## Correlati

- **[ai-music-sheets](https://github.com/mcp-tool-shop-org/ai-music-sheets)** — La libreria di brani: 10 generi, formato ibrido (metadati + linguaggio musicale + battute pronte per il codice)

## Licenza

MIT
