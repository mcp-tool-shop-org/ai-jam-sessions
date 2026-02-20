<p align="center">
  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <strong>Español</strong> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a>
</p>

<p align="center">
  <img src="logo.svg" alt="PianoAI logo" width="180" />
</p>

<h1 align="center">PianoAI</h1>

<p align="center">
  Servidor MCP + CLI para enseñanza de piano con IA — reproduce a través de VMPK vía MIDI con retroalimentación por voz.
</p>

[![Tests](https://img.shields.io/badge/tests-121_passing-brightgreen)](https://github.com/mcp-tool-shop-org/pianoai)
[![Smoke](https://img.shields.io/badge/smoke-20_passing-brightgreen)](https://github.com/mcp-tool-shop-org/pianoai)
[![MCP Tools](https://img.shields.io/badge/MCP_tools-7-purple)](https://github.com/mcp-tool-shop-org/pianoai)
[![Songs](https://img.shields.io/badge/songs-10_(via_ai--music--sheets)-blue)](https://github.com/mcp-tool-shop-org/ai-music-sheets)

## ¿Qué es esto?

Un CLI en TypeScript y servidor MCP que carga canciones de piano desde [ai-music-sheets](https://github.com/mcp-tool-shop-org/ai-music-sheets), las convierte a MIDI y las reproduce a través de [VMPK](https://vmpk.sourceforge.io/) mediante un puerto MIDI virtual. El motor de enseñanza lanza interjecciones en los límites de compás y en momentos clave, permitiendo que un LLM actúe como profesor de piano en vivo con retroalimentación por voz y notificaciones aparte.

## Características

- **4 modos de reproducción** — completa, compás por compás, manos separadas, bucle
- **Control de velocidad** — práctica lenta a 0.5x hasta reproducción rápida a 2x, acumulable con modificación de tempo
- **Seguimiento de progreso** — callbacks configurables en hitos porcentuales o por compás
- **7 hooks de enseñanza** — console, silent, recording, callback, voice, aside, compose
- **Retroalimentación por voz** — salida `VoiceDirective` para integración con mcp-voice-soundboard
- **Interjecciones aparte** — salida `AsideDirective` para la bandeja de mcp-aside
- **Análisis seguro** — las notas incorrectas se omiten con `ParseWarning`s recopilados
- **7 herramientas MCP** — exponen el registro, notas de enseñanza y recomendaciones de canciones a LLMs
- **Analizador de notas** — notación científica de altura a MIDI y viceversa
- **Conector simulado** — cobertura completa de tests sin hardware MIDI

## Requisitos previos

1. **[loopMIDI](https://www.tobias-erichsen.de/software/loopmidi.html)** — crea un puerto MIDI virtual (ej. "loopMIDI Port")
2. **[VMPK](https://vmpk.sourceforge.io/)** — configura la entrada MIDI a tu puerto loopMIDI
3. **Node.js 18+**

## Instalación

```bash
npm install -g pianai
```

## Inicio rápido

```bash
# Listar todas las canciones
pianai list

# Mostrar detalles de canción + notas de enseñanza
pianai info moonlight-sonata-mvt1

# Reproducir una canción a través de VMPK
pianai play let-it-be

# Reproducir con modificación de tempo
pianai play basic-12-bar-blues --tempo 80

# Avanzar compás por compás
pianai play autumn-leaves --mode measure

# Práctica a mitad de velocidad
pianai play moonlight-sonata-mvt1 --speed 0.5

# Práctica lenta con manos separadas
pianai play dream-on --speed 0.75 --mode hands
```

## Servidor MCP

El servidor MCP expone 7 herramientas para integración con LLMs:

| Herramienta | Descripción |
|-------------|-------------|
| `list_songs` | Explorar/buscar canciones por género, dificultad o consulta |
| `song_info` | Obtener lenguaje musical completo, objetivos de enseñanza, sugerencias de práctica |
| `registry_stats` | Conteo de canciones por género y dificultad |
| `teaching_note` | Nota de enseñanza por compás, digitación, dinámicas |
| `suggest_song` | Obtener una recomendación basada en criterios |
| `list_measures` | Vista general de compases con notas de enseñanza + advertencias de análisis |
| `practice_setup` | Sugerir velocidad, modo y configuración de voz para una canción |

```bash
# Iniciar el servidor MCP (transporte stdio)
pnpm mcp
```

### Configuración de Claude Desktop

```json
{
  "mcpServers": {
    "pianai": {
      "command": "pianai-mcp"
    }
  }
}
```

## Comandos del CLI

| Comando | Descripción |
|---------|-------------|
| `list [--genre <genre>]` | Listar canciones disponibles, opcionalmente filtradas por género |
| `info <song-id>` | Mostrar detalles de canción: lenguaje musical, notas de enseñanza, estructura |
| `play <song-id> [opts]` | Reproducir una canción a través de VMPK vía MIDI |
| `stats` | Estadísticas del registro (canciones, géneros, compases) |
| `ports` | Listar puertos de salida MIDI disponibles |
| `help` | Mostrar información de uso |

### Opciones de reproducción

| Bandera | Descripción |
|---------|-------------|
| `--port <name>` | Nombre del puerto MIDI (por defecto: autodetectar loopMIDI) |
| `--tempo <bpm>` | Modificar el tempo predeterminado de la canción (10-400 BPM) |
| `--speed <mult>` | Multiplicador de velocidad: 0.5 = mitad, 1.0 = normal, 2.0 = doble |
| `--mode <mode>` | Modo de reproducción: `full`, `measure`, `hands`, `loop` |

## Motor de enseñanza

El motor de enseñanza dispara hooks durante la reproducción. 7 implementaciones de hooks cubren todos los casos de uso:

| Hook | Caso de uso |
|------|-------------|
| `createConsoleTeachingHook()` | CLI — registra compases, momentos y finalización en consola |
| `createSilentTeachingHook()` | Testing — sin operación |
| `createRecordingTeachingHook()` | Testing — graba eventos para aserciones |
| `createCallbackTeachingHook(cb)` | Personalizado — redirige a cualquier callback asíncrono |
| `createVoiceTeachingHook(sink)` | Voz — produce `VoiceDirective` para mcp-voice-soundboard |
| `createAsideTeachingHook(sink)` | Aparte — produce `AsideDirective` para la bandeja de mcp-aside |
| `composeTeachingHooks(...hooks)` | Múltiple — despacha a múltiples hooks en serie |

### Retroalimentación por voz

```typescript
import { createSession, createVoiceTeachingHook } from "pianai";
import { getSong } from "ai-music-sheets";

const voiceHook = createVoiceTeachingHook(
  async (directive) => {
    // Redirigir a voice_speak de mcp-voice-soundboard
    console.log(`[Voice] ${directive.text}`);
  },
  { voice: "narrator", speechSpeed: 0.9 }
);

const session = createSession(getSong("moonlight-sonata-mvt1")!, connector, {
  teachingHook: voiceHook,
  speed: 0.5, // práctica a mitad de velocidad
});

await session.play();
// voiceHook.directives → todas las instrucciones de voz que se dispararon
```

### Composición de hooks

```typescript
import {
  createVoiceTeachingHook,
  createAsideTeachingHook,
  createRecordingTeachingHook,
  composeTeachingHooks,
} from "pianai";

// Los tres se disparan en cada evento
const composed = composeTeachingHooks(
  createVoiceTeachingHook(voiceSink),
  createAsideTeachingHook(asideSink),
  createRecordingTeachingHook()
);
```

## API programática

```typescript
import { getSong } from "ai-music-sheets";
import { createSession, createVmpkConnector } from "pianai";

const connector = createVmpkConnector({ portName: /loop/i });
await connector.connect();

const song = getSong("autumn-leaves")!;
const session = createSession(song, connector, {
  mode: "measure",
  tempo: 100,
  speed: 0.75,           // 75% de velocidad para práctica
  onProgress: (p) => console.log(p.percent), // "25%", "50%", etc.
});

await session.play();          // reproduce un compás, pausa
session.next();                // avanza al siguiente compás
await session.play();          // reproduce el siguiente compás
session.setSpeed(1.0);         // vuelve a velocidad normal
await session.play();          // reproduce el siguiente compás a velocidad completa
session.stop();                // detiene y reinicia

// Verificar advertencias de análisis (notas incorrectas en los datos de la canción)
if (session.parseWarnings.length > 0) {
  console.warn("Algunas notas no pudieron ser analizadas:", session.parseWarnings);
}

await connector.disconnect();
```

## Arquitectura

```
ai-music-sheets (biblioteca)     pianai (tiempo de ejecución)
┌──────────────────────┐         ┌────────────────────────────────┐
│ SongEntry (híbrido)  │────────→│ Note Parser (seguro + estricto)│
│ Registry (búsqueda)  │         │ Session Engine (veloc.+progreso│
│ 10 canciones, 10 gén.│         │ Teaching Engine (7 hooks)      │
└──────────────────────┘         │ VMPK Connector (JZZ)          │
                                 │ MCP Server (7 herramientas)    │
                                 │ CLI (barra de progreso + voz)  │
                                 └─────────┬──────────────────────┘
                                           │ MIDI
                                           ▼
                                 ┌─────────────────┐
                                 │ loopMIDI → VMPK │
                                 └─────────────────┘

Enrutamiento de hooks de enseñanza:
  Session → TeachingHook → VoiceDirective → mcp-voice-soundboard
                         → AsideDirective → bandeja de mcp-aside
                         → Console log    → terminal del CLI
                         → Recording      → aserciones de test
```

## Testing

```bash
pnpm test       # 121 tests con Vitest (parser + session + teaching + voice + aside)
pnpm smoke      # 20 smoke tests (integración, sin MIDI necesario)
pnpm typecheck  # tsc --noEmit
```

El conector VMPK simulado (`createMockVmpkConnector`) registra todos los eventos MIDI sin hardware, permitiendo cobertura completa de tests. Las funciones de análisis seguro (`safeParseMeasure`) recopilan objetos `ParseWarning` en lugar de lanzar excepciones, de modo que la reproducción continúa correctamente si una canción tiene notas malformadas.

## Relacionados

- **[ai-music-sheets](https://github.com/mcp-tool-shop-org/ai-music-sheets)** — La biblioteca de canciones: 10 géneros, formato híbrido (metadatos + lenguaje musical + compases listos para código)

## Licencia

MIT
