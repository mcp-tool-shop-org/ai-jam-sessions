<p align="center"><a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <strong>Português</strong></p>

<p align="center">
  <img src="logo.png" alt="Logo do PianoAI" width="180" />
</p>

<h1 align="center">PianoAI</h1>

<p align="center">
  Piano com IA com motor de audio integrado e biblioteca de 100 musicas. Servidor MCP para o Claude, CLI para humanos.
</p>

[![MCP Tools](https://img.shields.io/badge/MCP_tools-15-purple)](https://github.com/mcp-tool-shop-org/ai_jam_session)
[![Songs](https://img.shields.io/badge/songs-100_built--in-blue)](https://github.com/mcp-tool-shop-org/ai_jam_session)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen)](https://github.com/mcp-tool-shop-org/ai_jam_session)

## O que e isto?

Um piano que o Claude consegue tocar. PianoAI e um servidor MCP com motor de audio integrado — toca diretamente pelas suas caixas de som, sem necessidade de software externo. O Claude navega por uma biblioteca de 100 musicas em 10 generos, escolhe musicas, ensina e improvisa sobre elas. Tambem funciona como CLI independente.

## Funcionalidades

- **Motor de piano integrado** — audio baseado em amostras via `node-web-audio-api`, toca pelas caixas de som
- **Biblioteca de 100 musicas** — classico, jazz, pop, blues, rock, R&B, latin, cinema, ragtime, new-age
- **AI Jam Session** — o Claude analisa os acordes e a melodia de uma musica e cria a sua propria interpretacao
- **Suporte a arquivos MIDI** — toque qualquer arquivo `.mid`: `ai-jam-session play song.mid`
- **Sistema de ensino** — notas de ensino por compasso, descricoes em linguagem musical, recomendacoes de pratica
- **4 modos de reproducao** — completo, compasso a compasso, maos separadas, loop
- **Controle de velocidade** — 0.5x para pratica lenta ate 4x rapido
- **Controles em tempo real** — pausar, retomar, alterar velocidade durante a reproducao
- **15 ferramentas MCP** — tocar, navegar, ensinar, improvisar, importar — tudo pelo protocolo MCP
- **Adicione suas proprias musicas** — a ferramenta `add_song` aceita JSON SongEntry, `import_midi` converte arquivos MIDI
- **Saida MIDI opcional** — encaminhe para software externo via flag `--midi` (requer loopMIDI + VMPK)

## Instalacao

```bash
npm install -g @mcptoolshop/ai_jam_session
```

Requer **Node.js 18+**. So isso — sem drivers MIDI, sem portas virtuais, sem software externo.

## Inicio Rapido

```bash
# Tocar uma musica da biblioteca
ai-jam-session play let-it-be

# Tocar um arquivo MIDI
ai-jam-session play path/to/song.mid

# Pratica em meia velocidade
ai-jam-session play moonlight-sonata-mvt1 --speed 0.5

# Listar todas as musicas da biblioteca
ai-jam-session list

# Mostrar detalhes da musica + notas de ensino
ai-jam-session info autumn-leaves
```

### Opcoes de Reproducao

| Flag | Descricao |
|------|-----------|
| `--speed <mult>` | Multiplicador de velocidade: 0.5 = metade, 1.0 = normal, 2.0 = dobro |
| `--tempo <bpm>` | Substituir o andamento padrao da musica (10-400 BPM) |
| `--mode <mode>` | Modo de reproducao: `full`, `measure`, `hands`, `loop` |
| `--midi` | Encaminhar para software MIDI externo em vez do motor integrado |

## Servidor MCP

O servidor MCP disponibiliza 15 ferramentas para integracao com LLMs:

| Ferramenta | Descricao |
|------------|-----------|
| `list_songs` | Navegar/buscar musicas por genero, dificuldade ou consulta |
| `song_info` | Linguagem musical completa, objetivos de ensino, sugestoes de pratica |
| `registry_stats` | Contagem de musicas por genero e dificuldade |
| `teaching_note` | Nota de ensino por compasso, dedilhado, dinamica |
| `suggest_song` | Recomendacao baseada em criterios |
| `list_measures` | Visao geral dos compassos com notas de ensino |
| `practice_setup` | Sugerir velocidade, modo e configuracoes para uma musica |
| `sing_along` | Texto cantavel (nomes de notas, solfejo, contorno) por compasso |
| `play_song` | Tocar uma musica ou arquivo MIDI pelas caixas de som |
| `pause_playback` | Pausar ou retomar a musica em reproducao |
| `set_speed` | Alterar a velocidade durante a reproducao |
| `stop_playback` | Parar a musica em reproducao |
| `ai_jam_session` | Obter um resumo para jam — acordes, melodia, orientacao de estilo — para improvisacao |
| `add_song` | Adicionar uma nova musica (JSON SongEntry) a biblioteca |
| `import_midi` | Converter um arquivo MIDI em SongEntry e registra-lo |

### AI Jam Session

A ferramenta `ai_jam_session` extrai um "resumo de jam" estruturado de qualquer musica: progressao de acordes, contorno melodico e orientacao de estilo especifica do genero. O Claude usa o resumo para criar a sua propria interpretacao.

Dois modos:
- **Musica especifica:** `ai_jam_session({ songId: "autumn-leaves", style: "blues" })` — improvisar sobre Autumn Leaves, estilo blues
- **Escolha aleatoria por genero:** `ai_jam_session({ genre: "jazz" })` — escolher uma musica de jazz aleatoria e improvisar

Parametros opcionais: `mood` (animado, melancolico, sonhador, etc.), `difficulty`, `measures` (intervalo como "1-8").

### Configuracao Claude Desktop / Claude Code

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

### Plugin para Claude Code

O PianoAI inclui um plugin para Claude Code que adiciona comandos de barra e personalidades de agente:

| Comando | Descricao |
|---------|-----------|
| `/ai-jam-session:teach <song>` | Iniciar uma sessao de ensino estruturada |
| `/ai-jam-session:practice <song>` | Obter um plano de pratica com recomendacoes de velocidade/modo |
| `/ai-jam-session:explore [query]` | Navegar pela biblioteca de musicas por genero, dificuldade ou palavra-chave |
| `/ai-jam-session:jam <song or genre>` | Iniciar uma sessao de jam — o Claude cria a sua propria interpretacao |

Duas personalidades de agente:
- **Professor de Piano** — paciente, pedagogico, encontra o aluno no nivel em que ele esta
- **Musico de Jam** — clima descontraido de jam band, groove em primeiro lugar, incentiva a experimentacao

## Biblioteca de Musicas

100 musicas integradas em 10 generos, 3 niveis de dificuldade:

| Genero | Musicas | Exemplos |
|--------|---------|----------|
| Classico | 10 | Fur Elise, Clair de Lune, Moonlight Sonata, Bach Prelude in C |
| Jazz | 10 | Autumn Leaves, Take Five, So What, Misty |
| Pop | 10 | Imagine, Hallelujah, Piano Man, Bohemian Rhapsody |
| Blues | 10 | Basic 12-Bar, St. Louis Blues, Stormy Monday, Thrill Is Gone |
| Rock | 10 | Stairway Intro, Hotel California, Rocket Man, Layla Coda |
| R&B | 10 | Superstition, Georgia On My Mind, Lean On Me, My Girl |
| Latin | 10 | Girl from Ipanema, Besame Mucho, Oye Como Va, Wave |
| Cinema | 11 | Cinema Paradiso, Moon River, Hedwig's Theme, Spirited Away |
| Ragtime | 9 | The Entertainer, Maple Leaf Rag, Elite Syncopations |
| New-Age | 10 | River Flows in You, Snowfall, Crystal Stream, Evening Calm |

## API Programatica

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

### Tocar uma musica da biblioteca

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

## Arquitetura

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

## Licenca

MIT
