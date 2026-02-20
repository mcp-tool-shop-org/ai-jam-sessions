<p align="center">
  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <strong>Português</strong>
</p>

<p align="center">
  <img src="logo.svg" alt="PianoAI logo" width="180" />
</p>

<h1 align="center">PianoAI</h1>

<p align="center">
  Servidor MCP + CLI para ensino de piano com IA — reproduz através do VMPK via MIDI com feedback por voz.
</p>

[![Tests](https://img.shields.io/badge/tests-163_passing-brightgreen)](https://github.com/mcp-tool-shop-org/pianoai)
[![Smoke](https://img.shields.io/badge/smoke-25_passing-brightgreen)](https://github.com/mcp-tool-shop-org/pianoai)
[![MCP Tools](https://img.shields.io/badge/MCP_tools-8-purple)](https://github.com/mcp-tool-shop-org/pianoai)
[![Songs](https://img.shields.io/badge/songs-10_(via_ai--music--sheets)-blue)](https://github.com/mcp-tool-shop-org/ai-music-sheets)

## O que e isto?

Um CLI em TypeScript e servidor MCP que carrega musicas de piano de [ai-music-sheets](https://github.com/mcp-tool-shop-org/ai-music-sheets), converte em MIDI e reproduz atraves do [VMPK](https://vmpk.sourceforge.io/) por uma porta MIDI virtual. O motor de ensino dispara interjecoes nos limites de compasso e em momentos-chave, permitindo que um LLM atue como professor de piano ao vivo com feedback por voz e interjeccoes auxiliares.

## Funcionalidades

- **4 modos de reproducao** — completo, compasso a compasso, maos separadas, loop
- **Controle de velocidade** — pratica lenta em 0.5x ate reproducao rapida em 2x, acumula com override de tempo
- **Acompanhamento de progresso** — callbacks configuraveis em marcos percentuais ou por compasso
- **8 hooks de ensino** — console, silencioso, gravacao, callback, voz, aside, sing-along, composicao
- **Narracao cantada** — nomes de notas, solfejo, contorno ou silabas falados antes de cada compasso
- **Feedback por voz** — saida `VoiceDirective` para integracao com mcp-voice-soundboard
- **Interjecoes aside** — saida `AsideDirective` para caixa de entrada do mcp-aside
- **Parsing seguro** — notas invalidas sao ignoradas graciosamente com `ParseWarning`s coletados
- **8 ferramentas MCP** — expoe registro, notas de ensino, canto acompanhado e recomendacoes de musicas para LLMs
- **Parser de notas** — notacao cientifica de altura para MIDI e vice-versa
- **Conector mock** — cobertura completa de testes sem hardware MIDI

## Pre-requisitos

1. **[loopMIDI](https://www.tobias-erichsen.de/software/loopmidi.html)** — crie uma porta MIDI virtual (ex.: "loopMIDI Port")
2. **[VMPK](https://vmpk.sourceforge.io/)** — configure a entrada MIDI para sua porta loopMIDI
3. **Node.js 18+**

## Instalação

```bash
npm install -g @mcptoolshop/pianoai
```

## Inicio Rapido

```bash
# Listar todas as musicas
pianai list

# Mostrar detalhes da musica + notas de ensino
pianai info moonlight-sonata-mvt1

# Reproduzir uma musica pelo VMPK
pianai play let-it-be

# Reproduzir com override de tempo
pianai play basic-12-bar-blues --tempo 80

# Avancar compasso a compasso
pianai play autumn-leaves --mode measure

# Pratica em metade da velocidade
pianai play moonlight-sonata-mvt1 --speed 0.5

# Pratica lenta com maos separadas
pianai play dream-on --speed 0.75 --mode hands

# Cantar junto — narrar nomes de notas durante a reproducao
pianai sing let-it-be --mode note-names

# Cantar junto com solfejo, ambas as maos
pianai sing fur-elise --mode solfege --hand both
```

## Servidor MCP

O servidor MCP expoe 8 ferramentas para integracao com LLMs:

| Ferramenta | Descricao |
|------------|-----------|
| `list_songs` | Navegar/pesquisar musicas por genero, dificuldade ou consulta |
| `song_info` | Obter linguagem musical completa, objetivos de ensino, sugestoes de pratica |
| `registry_stats` | Contagem de musicas por genero e dificuldade |
| `teaching_note` | Nota de ensino por compasso, digitacao, dinamica |
| `sing_along` | Obter texto cantavel por compasso (nomes de notas, solfejo, contorno, silabas) |
| `suggest_song` | Obter recomendacao baseada em criterios |
| `list_measures` | Visao geral dos compassos com notas de ensino + avisos de parsing |
| `practice_setup` | Sugerir velocidade, modo e configuracoes de voz para uma musica |

```bash
# Iniciar o servidor MCP (transporte stdio)
pnpm mcp
```

### Configuracao do Claude Desktop

```json
{
  "mcpServers": {
    "pianai": {
      "command": "pianai-mcp"
    }
  }
}
```

## Comandos CLI

| Comando | Descricao |
|---------|-----------|
| `list [--genre <genre>]` | Listar musicas disponiveis, opcionalmente filtradas por genero |
| `info <song-id>` | Mostrar detalhes da musica: linguagem musical, notas de ensino, estrutura |
| `play <song-id> [opts]` | Reproduzir uma musica pelo VMPK via MIDI |
| `sing <song-id> [opts]` | Cantar junto — narrar notas durante a reproducao |
| `stats` | Estatisticas do registro (musicas, generos, compassos) |
| `ports` | Listar portas de saida MIDI disponiveis |
| `help` | Mostrar informacoes de uso |

### Opcoes de Reproducao

| Flag | Descricao |
|------|-----------|
| `--port <name>` | Nome da porta MIDI (padrao: deteccao automatica do loopMIDI) |
| `--tempo <bpm>` | Substituir o tempo padrao da musica (10-400 BPM) |
| `--speed <mult>` | Multiplicador de velocidade: 0.5 = metade, 1.0 = normal, 2.0 = dobro |
| `--mode <mode>` | Modo de reproducao: `full`, `measure`, `hands`, `loop` |

## Motor de Ensino

O motor de ensino dispara hooks durante a reproducao. 8 implementacoes de hooks cobrem todos os casos de uso:

| Hook | Caso de uso |
|------|-------------|
| `createConsoleTeachingHook()` | CLI — registra compassos, momentos e conclusao no console |
| `createSilentTeachingHook()` | Testes — sem operacao |
| `createRecordingTeachingHook()` | Testes — grava eventos para assercoes |
| `createCallbackTeachingHook(cb)` | Personalizado — redireciona para qualquer callback assincrono |
| `createVoiceTeachingHook(sink)` | Voz — produz `VoiceDirective` para mcp-voice-soundboard |
| `createAsideTeachingHook(sink)` | Aside — produz `AsideDirective` para caixa de entrada do mcp-aside |
| `createSingAlongHook(sink, song)` | Canto — narra notas/solfejo/contorno antes de cada compasso |
| `composeTeachingHooks(...hooks)` | Multiplo — despacha para multiplos hooks em serie |

### Feedback por voz

```typescript
import { createSession, createVoiceTeachingHook } from "@mcptoolshop/pianoai";
import { getSong } from "ai-music-sheets";

const voiceHook = createVoiceTeachingHook(
  async (directive) => {
    // Redirecionar para voice_speak do mcp-voice-soundboard
    console.log(`[Voice] ${directive.text}`);
  },
  { voice: "narrator", speechSpeed: 0.9 }
);

const session = createSession(getSong("moonlight-sonata-mvt1")!, connector, {
  teachingHook: voiceHook,
  speed: 0.5, // pratica em metade da velocidade
});

await session.play();
// voiceHook.directives → todas as instrucoes de voz que foram disparadas
```

### Narracao cantada

```typescript
import {
  createSingAlongHook,
  createVoiceTeachingHook,
  composeTeachingHooks,
  createSession,
} from "@mcptoolshop/pianoai";
import { getSong } from "@mcptoolshop/ai-music-sheets";

const song = getSong("let-it-be")!;

// Narrar solfejo antes de cada compasso, depois notas de ensino
const singHook = createSingAlongHook(voiceSink, song, {
  mode: "solfege",
  hand: "right",
});
const teachHook = createVoiceTeachingHook(voiceSink);
const combined = composeTeachingHooks(singHook, teachHook);

const session = createSession(song, connector, { teachingHook: combined });
await session.play();
// singHook.directives → "Do... Mi... Sol" bloqueante antes de cada compasso
```

### Composicao de hooks

```typescript
import {
  createVoiceTeachingHook,
  createAsideTeachingHook,
  createRecordingTeachingHook,
  composeTeachingHooks,
} from "@mcptoolshop/pianoai";

// Todos os tres disparam em cada evento
const composed = composeTeachingHooks(
  createVoiceTeachingHook(voiceSink),
  createAsideTeachingHook(asideSink),
  createRecordingTeachingHook()
);
```

## API Programatica

```typescript
import { getSong } from "ai-music-sheets";
import { createSession, createVmpkConnector } from "@mcptoolshop/pianoai";

const connector = createVmpkConnector({ portName: /loop/i });
await connector.connect();

const song = getSong("autumn-leaves")!;
const session = createSession(song, connector, {
  mode: "measure",
  tempo: 100,
  speed: 0.75,           // 75% da velocidade para pratica
  onProgress: (p) => console.log(p.percent), // "25%", "50%", etc.
});

await session.play();          // reproduz um compasso, pausa
session.next();                // avanca para o proximo compasso
await session.play();          // reproduz o proximo compasso
session.setSpeed(1.0);         // volta para a velocidade normal
await session.play();          // reproduz o proximo compasso em velocidade total
session.stop();                // para e reinicia

// Verificar avisos de parsing (notas invalidas nos dados da musica)
if (session.parseWarnings.length > 0) {
  console.warn("Algumas notas nao puderam ser analisadas:", session.parseWarnings);
}

await connector.disconnect();
```

## Arquitetura

```
ai-music-sheets (biblioteca)     pianai (runtime)
┌──────────────────────┐         ┌────────────────────────────────┐
│ SongEntry (hibrido)  │────────→│ Note Parser (seguro + estrito) │
│ Registry (busca)     │         │ Session Engine (veloc.+progr.) │
│ 10 musicas, 10 gen.  │         │ Teaching Engine (8 hooks)      │
└──────────────────────┘         │ VMPK Connector (JZZ)          │
                                 │ MCP Server (8 ferramentas)     │
                                 │ CLI (barra de progresso + voz) │
                                 └─────────┬──────────────────────┘
                                           │ MIDI
                                           ▼
                                 ┌─────────────────┐
                                 │ loopMIDI → VMPK │
                                 └─────────────────┘

Roteamento de hooks de ensino:
  Session → TeachingHook → VoiceDirective → mcp-voice-soundboard
                         → AsideDirective → caixa de entrada mcp-aside
                         → Console log    → terminal CLI
                         → Recording      → assercoes de teste
```

## Testes

```bash
pnpm test       # 163 testes Vitest (parser + session + teaching + voice + aside + sing-along)
pnpm smoke      # 25 testes de integracao (smoke, sem MIDI necessario)
pnpm typecheck  # tsc --noEmit
```

O conector VMPK mock (`createMockVmpkConnector`) grava todos os eventos MIDI sem hardware, permitindo cobertura completa de testes. As funcoes de parsing seguro (`safeParseMeasure`) coletam objetos `ParseWarning` em vez de lancar excecoes, para que a reproducao continue graciosamente se uma musica tiver notas malformadas.

## Relacionados

- **[ai-music-sheets](https://github.com/mcp-tool-shop-org/ai-music-sheets)** — A biblioteca de musicas: 10 generos, formato hibrido (metadados + linguagem musical + compassos prontos para codigo)

## Licenca

MIT
