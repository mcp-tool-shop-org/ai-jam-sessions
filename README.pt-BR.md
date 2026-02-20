<p align="center">
  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <strong>Português</strong>
</p>

<p align="center">
  <img src="logo.svg" alt="Logo PianoAI" width="180" />
</p>

<h1 align="center">PianoAI</h1>

<p align="center">
  Tocador de piano com motor de áudio integrado — reproduz pelas caixas de som, sem necessidade de software externo. Servidor MCP + CLI.
</p>

[![Tests](https://img.shields.io/badge/tests-passing-brightgreen)](https://github.com/mcp-tool-shop-org/pianoai)
[![MCP Tools](https://img.shields.io/badge/MCP_tools-12-purple)](https://github.com/mcp-tool-shop-org/pianoai)
[![Songs](https://img.shields.io/badge/songs-10_built--in-blue)](https://github.com/mcp-tool-shop-org/ai-music-sheets)

## O que é isto?

Um tocador de piano em TypeScript que reproduz arquivos MIDI padrão e músicas integradas pelas suas caixas de som. Sem necessidade de software externo — o motor de áudio integrado cuida de tudo. Inclui um servidor MCP para integração com LLMs e um CLI para uso direto.

Suporta narração cantada em tempo real e feedback de ensino ao vivo durante a reprodução.

## Funcionalidades

- **Motor de piano integrado** — reproduz pelas caixas de som via `node-web-audio-api`, sem necessidade de hardware MIDI
- **Suporte a arquivos MIDI padrão** — reproduza qualquer arquivo `.mid`: `pianoai play song.mid`
- **Canto em tempo real** — narra nomes de notas, solfejo, contorno ou sílabas durante a reprodução MIDI
- **Filtros de voz** — cante apenas a melodia (nota mais aguda), harmonia (nota mais grave) ou todas as notas por acorde
- **Feedback de ensino ao vivo** — dicas de dinâmica, avisos de extensão, limites de seção e anúncios de marcos conforme a posição
- **Rastreamento de posição** — mapeamento de pulso/compasso/tempo a partir de MIDI bruto com suporte a busca
- **4 modos de reprodução** — completo, compasso a compasso, mãos separadas, loop
- **Controle de velocidade** — prática lenta em 0.5x até rápida em 4x, acumula com override de tempo
- **Controles em tempo real** — pausar, retomar, mudar velocidade, buscar durante a reprodução com event listeners
- **12 ferramentas MCP** — reproduzir, pausar, velocidade, parar, navegar, cantar, ensinar — tudo pelo protocolo MCP
- **12 hooks de ensino** — console, silencioso, gravação, callback, voz, aside, canto acompanhado, feedback ao vivo, canto MIDI, feedback ao vivo MIDI, composição
- **Saída MIDI opcional** — redirecione para software externo via flag `--midi` (requer loopMIDI + VMPK)
- **Parsing seguro** — notas inválidas são ignoradas graciosamente com `ParseWarning`s coletados
- **Conector mock** — cobertura completa de testes sem hardware

## Instalação

```bash
npm install -g @mcptoolshop/pianoai
```

Requer **Node.js 18+**. Só isso — sem drivers MIDI, sem portas virtuais, sem software externo.

## Início Rápido

```bash
# Reproduzir um arquivo MIDI
pianoai play path/to/song.mid

# Reproduzir com canto (narrar nomes de notas enquanto toca)
pianoai play song.mid --with-singing

# Cantar apenas a melodia (pular notas de acorde, só a voz superior)
pianoai play song.mid --with-singing --voice-filter melody-only

# Reproduzir com feedback de ensino (dinâmica, encorajamento)
pianoai play song.mid --with-teaching

# Reproduzir com canto e ensino
pianoai play song.mid --with-singing --with-teaching --sing-mode solfege

# Prática em metade da velocidade com canto
pianoai play song.mid --speed 0.5 --with-singing

# Pular para o segundo 45 e reproduzir a partir daí
pianoai play song.mid --seek 45

# Reproduzir uma música da biblioteca integrada
pianoai play let-it-be

# Listar todas as músicas integradas
pianoai list

# Mostrar detalhes da música + notas de ensino
pianoai info moonlight-sonata-mvt1

# Cantar junto com uma música da biblioteca (narração por voz)
pianoai sing let-it-be --mode solfege --with-piano
```

### Opções de Reprodução

| Flag | Descrição |
|------|-----------|
| `--speed <mult>` | Multiplicador de velocidade: 0.5 = metade, 1.0 = normal, 2.0 = dobro |
| `--tempo <bpm>` | Substituir o tempo padrão da música (10-400 BPM) |
| `--mode <mode>` | Modo de reprodução: `full`, `measure`, `hands`, `loop` |
| `--with-singing` | Ativar narração cantada em tempo real |
| `--with-teaching` | Ativar feedback de ensino ao vivo |
| `--sing-mode <mode>` | Modo de canto: `note-names`, `solfege`, `contour`, `syllables` |
| `--voice-filter <f>` | Filtro de voz: `all`, `melody-only`, `harmony` |
| `--seek <seconds>` | Pular para um momento específico antes de reproduzir |
| `--midi` | Redirecionar para software MIDI externo em vez do motor integrado |

## Servidor MCP

O servidor MCP expõe 12 ferramentas para integração com LLMs:

| Ferramenta | Descrição |
|------------|-----------|
| `list_songs` | Navegar/pesquisar músicas por gênero, dificuldade ou consulta |
| `song_info` | Obter linguagem musical completa, objetivos de ensino, sugestões de prática |
| `registry_stats` | Contagem de músicas por gênero e dificuldade |
| `teaching_note` | Nota de ensino por compasso, dedilhado, dinâmica |
| `suggest_song` | Obter recomendação baseada em critérios |
| `list_measures` | Visão geral dos compassos com notas de ensino + avisos de parsing |
| `sing_along` | Obter texto cantável (nomes de notas, solfejo, contorno, sílabas) por compasso |
| `practice_setup` | Sugerir velocidade, modo e configurações de voz para uma música |
| `play_song` | Reproduzir uma música ou arquivo MIDI com canto e ensino opcionais |
| `pause_playback` | Pausar ou retomar a música em reprodução |
| `set_speed` | Alterar a velocidade de reprodução durante a execução |
| `stop_playback` | Parar a música em reprodução |

### Configuração do Claude Desktop

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

### play_song com canto e ensino

A ferramenta MCP `play_song` aceita as flags `withSinging` e `withTeaching`:

```
play_song({ id: "path/to/song.mid", withSinging: true, withTeaching: true, singMode: "solfege" })
```

## API Programática

### Reproduzir um arquivo MIDI com controles em tempo real

```typescript
import { createAudioEngine, parseMidiFile, PlaybackController } from "@mcptoolshop/pianoai";

const connector = createAudioEngine();
await connector.connect();

const midi = await parseMidiFile("song.mid");
const controller = new PlaybackController(connector, midi);

// Escutar eventos
controller.on("noteOn", (e) => console.log(`Nota: ${e.noteName}`));
controller.on("stateChange", (e) => console.log(`Estado: ${e.state}`));

await controller.play({ speed: 0.75 });

controller.pause();       // pausar
controller.setSpeed(1.5); // mudar velocidade
await controller.resume();// retomar na nova velocidade

await connector.disconnect();
```

### Reproduzir com canto e ensino ao vivo

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

// feedbackHook.tracker contém informações de posição
console.log(`Total de compassos: ${feedbackHook.tracker.totalMeasures}`);
```

### Reproduzir uma música da biblioteca integrada

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

## Arquitetura

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

## Testes

```bash
pnpm test       # 243 testes Vitest
pnpm typecheck  # tsc --noEmit
pnpm smoke      # testes de integração
```

## Relacionados

- **[ai-music-sheets](https://github.com/mcp-tool-shop-org/ai-music-sheets)** — A biblioteca de músicas integrada

## Licença

MIT
