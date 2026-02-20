<p align="center">
  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <strong>Español</strong> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a>
</p>

<p align="center">
  <img src="logo.svg" alt="PianoAI logo" width="180" />
</p>

<h1 align="center">PianoAI</h1>

<p align="center">
  Reproductor de piano con motor de audio integrado — suena por los altavoces, sin software externo necesario. Servidor MCP + CLI.
</p>

[![Tests](https://img.shields.io/badge/tests-passing-brightgreen)](https://github.com/mcp-tool-shop-org/pianoai)
[![MCP Tools](https://img.shields.io/badge/MCP_tools-12-purple)](https://github.com/mcp-tool-shop-org/pianoai)
[![Songs](https://img.shields.io/badge/songs-10_built--in-blue)](https://github.com/mcp-tool-shop-org/ai-music-sheets)

## ¿Qué es esto?

Un reproductor de piano en TypeScript que reproduce archivos MIDI estándar y canciones integradas a través de tus altavoces. No requiere software externo — el motor de audio integrado se encarga de todo. Incluye un servidor MCP para integración con LLMs y un CLI para uso directo.

Soporta narración de canto en tiempo real y retroalimentación de enseñanza en vivo durante la reproducción.

## Características

- **Motor de piano integrado** — reproduce por los altavoces vía `node-web-audio-api`, sin hardware MIDI necesario
- **Soporte de archivos MIDI estándar** — reproduce cualquier archivo `.mid`: `pianoai play song.mid`
- **Canto en tiempo real** — narra nombres de notas, solfeo, contorno o sílabas durante la reproducción MIDI
- **Filtros de voz** — canta solo la melodía (nota más aguda), armonía (más grave) o todas las notas por acorde
- **Retroalimentación de enseñanza en vivo** — consejos de dinámica según la posición, avisos de rango, límites de sección, anuncios de hitos
- **Seguimiento de posición** — mapeo de pulso/compás/tempo desde MIDI en crudo con soporte de búsqueda
- **4 modos de reproducción** — completa, compás por compás, manos separadas, bucle
- **Control de velocidad** — práctica lenta a 0.5x hasta 4x rápida, acumulable con modificación de tempo
- **Controles en tiempo real** — pausa, reanudación, cambio de velocidad, búsqueda durante la reproducción con listeners de eventos
- **12 herramientas MCP** — reproducir, pausar, velocidad, detener, explorar, cantar, enseñar — todo mediante el protocolo MCP
- **12 hooks de enseñanza** — console, silent, recording, callback, voice, aside, sing-along, live feedback, MIDI singing, MIDI live feedback, compose
- **Salida MIDI opcional** — enrutar a software externo con la bandera `--midi` (requiere loopMIDI + VMPK)
- **Análisis seguro** — las notas incorrectas se omiten con `ParseWarning`s recopilados
- **Conector simulado** — cobertura completa de tests sin hardware

## Instalación

```bash
npm install -g @mcptoolshop/pianoai
```

Requiere **Node.js 18+**. Eso es todo — sin controladores MIDI, sin puertos virtuales, sin software externo.

## Inicio rápido

```bash
# Reproducir un archivo MIDI
pianoai play path/to/song.mid

# Reproducir con canto (narrar nombres de notas mientras suenan)
pianoai play song.mid --with-singing

# Cantar solo la melodía (omitir notas de acorde, solo la voz superior)
pianoai play song.mid --with-singing --voice-filter melody-only

# Reproducir con retroalimentación de enseñanza (dinámica, estímulo)
pianoai play song.mid --with-teaching

# Reproducir con canto y enseñanza juntos
pianoai play song.mid --with-singing --with-teaching --sing-mode solfege

# Práctica a mitad de velocidad con canto
pianoai play song.mid --speed 0.5 --with-singing

# Saltar al segundo 45 y reproducir desde ahí
pianoai play song.mid --seek 45

# Reproducir una canción de la biblioteca integrada
pianoai play let-it-be

# Listar todas las canciones integradas
pianoai list

# Mostrar detalles de canción + notas de enseñanza
pianoai info moonlight-sonata-mvt1

# Cantar junto con una canción de la biblioteca (narración por voz)
pianoai sing let-it-be --mode solfege --with-piano
```

### Opciones de reproducción

| Bandera | Descripción |
|---------|-------------|
| `--speed <mult>` | Multiplicador de velocidad: 0.5 = mitad, 1.0 = normal, 2.0 = doble |
| `--tempo <bpm>` | Modificar el tempo predeterminado de la canción (10-400 BPM) |
| `--mode <mode>` | Modo de reproducción: `full`, `measure`, `hands`, `loop` |
| `--with-singing` | Activar narración de canto en tiempo real |
| `--with-teaching` | Activar retroalimentación de enseñanza en vivo |
| `--sing-mode <mode>` | Modo de canto: `note-names`, `solfege`, `contour`, `syllables` |
| `--voice-filter <f>` | Filtro de voz: `all`, `melody-only`, `harmony` |
| `--seek <seconds>` | Saltar a un momento específico antes de reproducir |
| `--midi` | Enrutar a software MIDI externo en lugar del motor integrado |

## Servidor MCP

El servidor MCP expone 12 herramientas para integración con LLMs:

| Herramienta | Descripción |
|-------------|-------------|
| `list_songs` | Explorar/buscar canciones por género, dificultad o consulta |
| `song_info` | Obtener lenguaje musical completo, objetivos de enseñanza, sugerencias de práctica |
| `registry_stats` | Conteo de canciones por género y dificultad |
| `teaching_note` | Nota de enseñanza por compás, digitación, dinámicas |
| `suggest_song` | Obtener una recomendación basada en criterios |
| `list_measures` | Vista general de compases con notas de enseñanza + advertencias de análisis |
| `sing_along` | Obtener texto cantable (nombres de notas, solfeo, contorno, sílabas) por compás |
| `practice_setup` | Sugerir velocidad, modo y configuración de voz para una canción |
| `play_song` | Reproducir una canción o archivo MIDI con canto y enseñanza opcionales |
| `pause_playback` | Pausar o reanudar la canción en reproducción |
| `set_speed` | Cambiar la velocidad de reproducción durante la reproducción |
| `stop_playback` | Detener la canción en reproducción |

### Configuración de Claude Desktop

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

### play_song con canto y enseñanza

La herramienta MCP `play_song` acepta las banderas `withSinging` y `withTeaching`:

```
play_song({ id: "path/to/song.mid", withSinging: true, withTeaching: true, singMode: "solfege" })
```

## API programática

### Reproducir un archivo MIDI con controles en tiempo real

```typescript
import { createAudioEngine, parseMidiFile, PlaybackController } from "@mcptoolshop/pianoai";

const connector = createAudioEngine();
await connector.connect();

const midi = await parseMidiFile("song.mid");
const controller = new PlaybackController(connector, midi);

// Escuchar eventos
controller.on("noteOn", (e) => console.log(`Nota: ${e.noteName}`));
controller.on("stateChange", (e) => console.log(`Estado: ${e.state}`));

await controller.play({ speed: 0.75 });

controller.pause();       // pausar
controller.setSpeed(1.5); // cambiar velocidad
await controller.resume();// reanudar a nueva velocidad

await connector.disconnect();
```

### Reproducir con canto y enseñanza en vivo

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

// feedbackHook.tracker tiene información de posición
console.log(`Total de compases: ${feedbackHook.tracker.totalMeasures}`);
```

### Reproducir una canción de la biblioteca integrada

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

## Arquitectura

```
Archivos MIDI estándar (.mid)   Canciones integradas (ai-music-sheets)
        │                              │
        ▼                              ▼
   MIDI Parser ──────────────── Note Parser
        │                              │
        ▼                              ▼
  MidiPlaybackEngine            SessionController
        │                              │
        └──────── PlaybackController ──┘
                  (eventos en tiempo real, hooks)
                         │
           ┌─────────────┼─────────────┐
           ▼             ▼             ▼
      AudioEngine   Teaching Hooks  Progress
      (altavoces)   (canto, retro.) (callbacks)
           │
           ▼
     node-web-audio-api (Rust DSP)

Seguimiento de posición:
  MIDI Parser → PositionTracker → mapeo de pulso/compás/tempo
                                → búsqueda por tiempo / búsqueda por compás
                                → resúmenes de compás para retroalimentación en vivo

Enrutamiento de hooks de enseñanza:
  PlaybackController → TeachingHook → VoiceDirective → mcp-voice-soundboard
                                    → AsideDirective → bandeja de mcp-aside
                                    → Console log    → terminal del CLI
                                    → Recording      → aserciones de test
```

## Testing

```bash
pnpm test       # 243 tests con Vitest
pnpm typecheck  # tsc --noEmit
pnpm smoke      # tests de integración
```

## Relacionados

- **[ai-music-sheets](https://github.com/mcp-tool-shop-org/ai-music-sheets)** — La biblioteca de canciones integrada

## Licencia

MIT
