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

[![Tests](https://img.shields.io/badge/tests-121_passing-brightgreen)](https://github.com/mcp-tool-shop-org/pianoai)
[![Smoke](https://img.shields.io/badge/smoke-20_passing-brightgreen)](https://github.com/mcp-tool-shop-org/pianoai)
[![MCP Tools](https://img.shields.io/badge/MCP_tools-7-purple)](https://github.com/mcp-tool-shop-org/pianoai)
[![Songs](https://img.shields.io/badge/songs-10_(via_ai--music--sheets)-blue)](https://github.com/mcp-tool-shop-org/ai-music-sheets)

## O que e isto?

Um CLI em TypeScript e servidor MCP que carrega musicas de piano de [ai-music-sheets](https://github.com/mcp-tool-shop-org/ai-music-sheets), converte em MIDI e reproduz atraves do [VMPK](https://vmpk.sourceforge.io/) por uma porta MIDI virtual. O motor de ensino dispara interjecoes nos limites de compasso e em momentos-chave, permitindo que um LLM atue como professor de piano ao vivo com feedback por voz e interjeccoes auxiliares.

## Funcionalidades

- **4 modos de reproducao** — completo, compasso a compasso, maos separadas, loop
- **Controle de velocidade** — pratica lenta em 0.5x ate reproducao rapida em 2x, acumula com override de tempo
- **Acompanhamento de progresso** — callbacks configuraveis em marcos percentuais ou por compasso
- **7 hooks de ensino** — console, silencioso, gravacao, callback, voz, aside, composicao
- **Feedback por voz** — saida `VoiceDirective` para integracao com mcp-voice-soundboard
- **Interjecoes aside** — saida `AsideDirective` para caixa de entrada do mcp-aside
- **Parsing seguro** — notas invalidas sao ignoradas graciosamente com `ParseWarning`s coletados
- **7 ferramentas MCP** — expoe registro, notas de ensino e recomendacoes de musicas para LLMs
- **Parser de notas** — notacao cientifica de altura para MIDI e vice-versa
- **Conector mock** — cobertura completa de testes sem hardware MIDI

## Pre-requisitos

1. **[loopMIDI](https://www.tobias-erichsen.de/software/loopmidi.html)** — crie uma porta MIDI virtual (ex.: "loopMIDI Port")
2. **[VMPK](https://vmpk.sourceforge.io/)** — configure a entrada MIDI para sua porta loopMIDI
3. **Node.js 18+**

## Instalação

```bash
npm install -g pianai
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
```

## Servidor MCP

O servidor MCP expoe 7 ferramentas para integracao com LLMs:

| Ferramenta | Descricao |
|------------|-----------|
| `list_songs` | Navegar/pesquisar musicas por genero, dificuldade ou consulta |
| `song_info` | Obter linguagem musical completa, objetivos de ensino, sugestoes de pratica |
| `registry_stats` | Contagem de musicas por genero e dificuldade |
| `teaching_note` | Nota de ensino por compasso, digitacao, dinamica |
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

O motor de ensino dispara hooks durante a reproducao. 7 implementacoes de hooks cobrem todos os casos de uso:

| Hook | Caso de uso |
|------|-------------|
| `createConsoleTeachingHook()` | CLI — registra compassos, momentos e conclusao no console |
| `createSilentTeachingHook()` | Testes — sem operacao |
| `createRecordingTeachingHook()` | Testes — grava eventos para assercoes |
| `createCallbackTeachingHook(cb)` | Personalizado — redireciona para qualquer callback assincrono |
| `createVoiceTeachingHook(sink)` | Voz — produz `VoiceDirective` para mcp-voice-soundboard |
| `createAsideTeachingHook(sink)` | Aside — produz `AsideDirective` para caixa de entrada do mcp-aside |
| `composeTeachingHooks(...hooks)` | Multiplo — despacha para multiplos hooks em serie |

### Feedback por voz

```typescript
import { createSession, createVoiceTeachingHook } from "pianai";
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

### Composicao de hooks

```typescript
import {
  createVoiceTeachingHook,
  createAsideTeachingHook,
  createRecordingTeachingHook,
  composeTeachingHooks,
} from "pianai";

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
import { createSession, createVmpkConnector } from "pianai";

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
│ 10 musicas, 10 gen.  │         │ Teaching Engine (7 hooks)      │
└──────────────────────┘         │ VMPK Connector (JZZ)          │
                                 │ MCP Server (7 ferramentas)     │
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
pnpm test       # 121 testes Vitest (parser + session + teaching + voice + aside)
pnpm smoke      # 20 testes de integracao (smoke, sem MIDI necessario)
pnpm typecheck  # tsc --noEmit
```

O conector VMPK mock (`createMockVmpkConnector`) grava todos os eventos MIDI sem hardware, permitindo cobertura completa de testes. As funcoes de parsing seguro (`safeParseMeasure`) coletam objetos `ParseWarning` em vez de lancar excecoes, para que a reproducao continue graciosamente se uma musica tiver notas malformadas.

## Relacionados

- **[ai-music-sheets](https://github.com/mcp-tool-shop-org/ai-music-sheets)** — A biblioteca de musicas: 10 generos, formato hibrido (metadados + linguagem musical + compassos prontos para codigo)

## Licenca

MIT
