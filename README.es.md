<p align="center"><a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <strong>Español</strong> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a></p>

<p align="center">
  <img src="logo.png" alt="PianoAI logo" width="180" />
</p>

<h1 align="center">PianoAI</h1>

<p align="center">
  Pianista de IA con motor de audio integrado y biblioteca de 100 canciones. Servidor MCP para Claude, CLI para humanos.
</p>

[![MCP Tools](https://img.shields.io/badge/MCP_tools-15-purple)](https://github.com/mcp-tool-shop-org/ai_jam_session)
[![Songs](https://img.shields.io/badge/songs-100_built--in-blue)](https://github.com/mcp-tool-shop-org/ai_jam_session)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen)](https://github.com/mcp-tool-shop-org/ai_jam_session)

## Que es esto?

Un piano que Claude puede tocar. PianoAI es un servidor MCP con un motor de audio integrado -- reproduce a traves de tus altavoces, sin necesidad de software externo. Claude navega una biblioteca de 100 canciones en 10 generos, elige canciones, las ensena y hace jam con ellas. Tambien funciona como CLI independiente.

## Caracteristicas

- **Motor de piano integrado** -- audio basado en muestras mediante `node-web-audio-api`, reproduce a traves de los altavoces
- **Biblioteca de 100 canciones** -- clasica, jazz, pop, blues, rock, R&B, latina, cine, ragtime, new-age
- **AI Jam Session** -- Claude analiza los acordes y la melodia de una cancion, luego crea su propia interpretacion
- **Soporte de archivos MIDI** -- reproduce cualquier archivo `.mid`: `ai-jam-session play song.mid`
- **Sistema de ensenanza** -- notas didacticas por compas, descripciones del lenguaje musical, recomendaciones de practica
- **4 modos de reproduccion** -- completo, compas por compas, manos separadas, bucle
- **Control de velocidad** -- practica lenta a 0.5x hasta rapida a 4x
- **Controles en tiempo real** -- pausa, reanudacion, cambio de velocidad durante la reproduccion
- **15 herramientas MCP** -- reproducir, explorar, ensenar, improvisar, importar -- todo a traves del protocolo MCP
- **Agrega tus propias canciones** -- la herramienta `add_song` acepta JSON de SongEntry, `import_midi` convierte archivos MIDI
- **Salida MIDI opcional** -- envia a software externo con la bandera `--midi` (requiere loopMIDI + VMPK)

## Instalacion

```bash
npm install -g @mcptoolshop/ai-jam-session
```

Requiere **Node.js 18+**. Eso es todo -- sin controladores MIDI, sin puertos virtuales, sin software externo.

## Inicio rapido

```bash
# Reproducir una cancion integrada
ai-jam-session play let-it-be

# Reproducir un archivo MIDI
ai-jam-session play path/to/song.mid

# Practica a media velocidad
ai-jam-session play moonlight-sonata-mvt1 --speed 0.5

# Listar todas las canciones integradas
ai-jam-session list

# Mostrar detalles de la cancion + notas didacticas
ai-jam-session info autumn-leaves
```

### Opciones de reproduccion

| Bandera | Descripcion |
|---------|-------------|
| `--speed <mult>` | Multiplicador de velocidad: 0.5 = mitad, 1.0 = normal, 2.0 = doble |
| `--tempo <bpm>` | Anular el tempo predeterminado de la cancion (10-400 BPM) |
| `--mode <mode>` | Modo de reproduccion: `full`, `measure`, `hands`, `loop` |
| `--midi` | Enviar a software MIDI externo en lugar del motor integrado |

## Servidor MCP

El servidor MCP expone 15 herramientas para integracion con LLM:

| Herramienta | Descripcion |
|-------------|-------------|
| `list_songs` | Explorar/buscar canciones por genero, dificultad o consulta |
| `song_info` | Lenguaje musical completo, objetivos didacticos, sugerencias de practica |
| `registry_stats` | Conteo de canciones por genero y dificultad |
| `teaching_note` | Nota didactica por compas, digitacion, dinamicas |
| `suggest_song` | Recomendacion basada en criterios |
| `list_measures` | Vista general de compases con notas didacticas |
| `practice_setup` | Sugerir velocidad, modo y configuracion para una cancion |
| `sing_along` | Texto cantable (nombres de notas, solfeo, contorno) por compas |
| `play_song` | Reproducir una cancion o archivo MIDI a traves de los altavoces |
| `pause_playback` | Pausar o reanudar la cancion en reproduccion |
| `set_speed` | Cambiar la velocidad de reproduccion durante la reproduccion |
| `stop_playback` | Detener la cancion en reproduccion |
| `ai_jam_session` | Obtener un brief de jam -- acordes, melodia, guia de estilo -- para improvisacion |
| `add_song` | Agregar una nueva cancion (JSON de SongEntry) a la biblioteca |
| `import_midi` | Convertir un archivo MIDI en SongEntry y registrarlo |

### AI Jam Session

La herramienta `ai_jam_session` extrae un "brief de jam" estructurado de cualquier cancion: progresion de acordes, contorno melodico y guia de estilo especifica del genero. Claude usa el brief para crear su propia interpretacion.

Dos modos:
- **Cancion especifica:** `ai_jam_session({ songId: "autumn-leaves", style: "blues" })` -- improvisar sobre Autumn Leaves, estilo blues
- **Seleccion aleatoria por genero:** `ai_jam_session({ genre: "jazz" })` -- elegir una cancion de jazz al azar e improvisar

Parametros opcionales: `mood` (alegre, melancolico, sonador, etc.), `difficulty`, `measures` (rango como "1-8").

### Configuracion de Claude Desktop / Claude Code

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

### Plugin de Claude Code

PianoAI incluye un plugin de Claude Code que agrega comandos slash y personalidades de agente:

| Comando | Descripcion |
|---------|-------------|
| `/ai-jam-session:teach <song>` | Iniciar una sesion de ensenanza estructurada |
| `/ai-jam-session:practice <song>` | Obtener un plan de practica con recomendaciones de velocidad/modo |
| `/ai-jam-session:explore [query]` | Explorar la biblioteca de canciones por genero, dificultad o palabra clave |
| `/ai-jam-session:jam <song or genre>` | Iniciar una sesion de jam -- Claude crea su propia interpretacion |

Dos personalidades de agente:
- **Profesor de Piano** -- paciente, pedagogico, se adapta al nivel del estudiante
- **Musico de Jam** -- vibras relajadas de jam band, prioridad al groove, fomenta la experimentacion

## Biblioteca de canciones

100 canciones integradas en 10 generos, 3 niveles de dificultad:

| Genero | Canciones | Ejemplos |
|--------|-----------|----------|
| Classical | 10 | Fur Elise, Clair de Lune, Moonlight Sonata, Bach Prelude in C |
| Jazz | 10 | Autumn Leaves, Take Five, So What, Misty |
| Pop | 10 | Imagine, Hallelujah, Piano Man, Bohemian Rhapsody |
| Blues | 10 | Basic 12-Bar, St. Louis Blues, Stormy Monday, Thrill Is Gone |
| Rock | 10 | Stairway Intro, Hotel California, Rocket Man, Layla Coda |
| R&B | 10 | Superstition, Georgia On My Mind, Lean On Me, My Girl |
| Latin | 10 | Girl from Ipanema, Besame Mucho, Oye Como Va, Wave |
| Film | 11 | Cinema Paradiso, Moon River, Hedwig's Theme, Spirited Away |
| Ragtime | 9 | The Entertainer, Maple Leaf Rag, Elite Syncopations |
| New-Age | 10 | River Flows in You, Snowfall, Crystal Stream, Evening Calm |

## API programatica

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

### Reproducir una cancion integrada

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

## Arquitectura

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

## Licencia

MIT
