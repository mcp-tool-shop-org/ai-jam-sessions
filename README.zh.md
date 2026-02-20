<p align="center">
  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <strong>中文</strong> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a>
</p>

<p align="center">
  <img src="logo.svg" alt="PianoAI 标志" width="180" />
</p>

<h1 align="center">PianoAI</h1>

<p align="center">
  内置音频引擎的钢琴播放器 —— 直接通过扬声器播放，无需任何外部软件。MCP 服务器 + CLI。
</p>

[![Tests](https://img.shields.io/badge/tests-passing-brightgreen)](https://github.com/mcp-tool-shop-org/pianoai)
[![MCP Tools](https://img.shields.io/badge/MCP_tools-12-purple)](https://github.com/mcp-tool-shop-org/pianoai)
[![Songs](https://img.shields.io/badge/songs-10_built--in-blue)](https://github.com/mcp-tool-shop-org/ai-music-sheets)

## 这是什么？

一个 TypeScript 钢琴播放器，可通过扬声器播放标准 MIDI 文件和内置曲目。无需任何外部软件 —— 内置音频引擎处理一切。包含用于 LLM 集成的 MCP 服务器和可直接使用的 CLI。

支持播放期间的实时跟唱叙述和实时教学反馈。

## 功能特性

- **内置钢琴引擎** —— 通过 `node-web-audio-api` 直接从扬声器播放，无需 MIDI 硬件
- **标准 MIDI 文件支持** —— 播放任意 `.mid` 文件：`pianoai play song.mid`
- **实时歌唱** —— 在 MIDI 播放期间朗读音名、唱名、轮廓或音节
- **声部筛选** —— 仅唱旋律（最高音）、和声（最低音）或和弦中的所有音符
- **实时教学反馈** —— 基于位置的力度提示、音域警告、段落边界、里程碑播报
- **位置追踪** —— 从原始 MIDI 提取拍/小节/速度映射，支持定位跳转
- **4 种播放模式** —— 完整播放、逐小节播放、分手练习、循环播放
- **速度控制** —— 0.5 倍慢速练习至 4 倍快速播放，可与速度覆盖叠加
- **实时控制** —— 播放期间支持暂停、恢复、变速、定位跳转，并提供事件监听
- **12 个 MCP 工具** —— 播放、暂停、变速、停止、浏览、歌唱、教学 —— 全部通过 MCP 协议
- **12 种教学钩子** —— console、silent、recording、callback、voice、aside、sing-along、live feedback、MIDI singing、MIDI live feedback、compose
- **可选 MIDI 输出** —— 通过 `--midi` 标志路由到外部软件（需要 loopMIDI + VMPK）
- **安全解析** —— 错误音符会被优雅跳过，并收集 `ParseWarning`
- **模拟连接器** —— 无需硬件即可实现完整测试覆盖

## 安装

```bash
npm install -g @mcptoolshop/pianoai
```

需要 **Node.js 18+**。仅此而已 —— 无需 MIDI 驱动、虚拟端口或任何外部软件。

## 快速开始

```bash
# 播放 MIDI 文件
pianoai play path/to/song.mid

# 带歌唱播放（播放时朗读音名）
pianoai play song.mid --with-singing

# 仅唱旋律（跳过和弦音，只唱最高声部）
pianoai play song.mid --with-singing --voice-filter melody-only

# 带教学反馈播放（力度、鼓励）
pianoai play song.mid --with-teaching

# 同时启用歌唱和教学
pianoai play song.mid --with-singing --with-teaching --sing-mode solfege

# 半速练习并带歌唱
pianoai play song.mid --speed 0.5 --with-singing

# 跳转到第 45 秒并从该处开始播放
pianoai play song.mid --seek 45

# 播放内置曲库中的曲目
pianoai play let-it-be

# 列出所有内置曲目
pianoai list

# 显示曲目详情 + 教学注释
pianoai info moonlight-sonata-mvt1

# 用唱名跟唱内置曲目（语音叙述）
pianoai sing let-it-be --mode solfege --with-piano
```

### 播放选项

| 标志 | 描述 |
|------|------|
| `--speed <mult>` | 速度倍率：0.5 = 半速，1.0 = 正常，2.0 = 双倍速 |
| `--tempo <bpm>` | 覆盖曲目默认速度（10-400 BPM） |
| `--mode <mode>` | 播放模式：`full`、`measure`、`hands`、`loop` |
| `--with-singing` | 启用实时跟唱叙述 |
| `--with-teaching` | 启用实时教学反馈 |
| `--sing-mode <mode>` | 歌唱模式：`note-names`、`solfege`、`contour`、`syllables` |
| `--voice-filter <f>` | 声部筛选：`all`、`melody-only`、`harmony` |
| `--seek <seconds>` | 跳转到指定时间后开始播放 |
| `--midi` | 路由到外部 MIDI 软件，而非使用内置引擎 |

## MCP 服务器

MCP 服务器提供 12 个工具用于 LLM 集成：

| 工具 | 描述 |
|------|------|
| `list_songs` | 按流派、难度或关键词浏览/搜索曲目 |
| `song_info` | 获取完整的音乐语言、教学目标、练习建议 |
| `registry_stats` | 按流派和难度统计曲目数量 |
| `teaching_note` | 逐小节的教学注释、指法、力度 |
| `suggest_song` | 根据条件获取曲目推荐 |
| `list_measures` | 小节概览，含教学注释 + 解析警告 |
| `sing_along` | 获取每小节可唱文本（音名、唱名、轮廓、音节） |
| `practice_setup` | 为曲目建议速度、模式和语音设置 |
| `play_song` | 播放曲目或 MIDI 文件，支持可选的歌唱和教学 |
| `pause_playback` | 暂停或恢复当前正在播放的曲目 |
| `set_speed` | 在播放期间更改播放速度 |
| `stop_playback` | 停止当前正在播放的曲目 |

### Claude Desktop 配置

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

### 带歌唱和教学的 play_song

`play_song` MCP 工具接受 `withSinging` 和 `withTeaching` 标志：

```
play_song({ id: "path/to/song.mid", withSinging: true, withTeaching: true, singMode: "solfege" })
```

## 编程 API

### 播放 MIDI 文件并实时控制

```typescript
import { createAudioEngine, parseMidiFile, PlaybackController } from "@mcptoolshop/pianoai";

const connector = createAudioEngine();
await connector.connect();

const midi = await parseMidiFile("song.mid");
const controller = new PlaybackController(connector, midi);

// 监听事件
controller.on("noteOn", (e) => console.log(`Note: ${e.noteName}`));
controller.on("stateChange", (e) => console.log(`State: ${e.state}`));

await controller.play({ speed: 0.75 });

controller.pause();       // 暂停
controller.setSpeed(1.5); // 更改速度
await controller.resume();// 以新速度恢复播放

await connector.disconnect();
```

### 带歌唱和实时教学的播放

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

// feedbackHook.tracker 包含位置信息
console.log(`Total measures: ${feedbackHook.tracker.totalMeasures}`);
```

### 播放内置曲库中的曲目

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

## 架构

```
标准 MIDI 文件 (.mid)         内置曲目 (ai-music-sheets)
        │                              │
        ▼                              ▼
   MIDI 解析器 ─────────────── 音符解析器
        │                              │
        ▼                              ▼
  MidiPlaybackEngine            SessionController
        │                              │
        └──────── PlaybackController ──┘
                  (实时事件、钩子)
                         │
           ┌─────────────┼─────────────┐
           ▼             ▼             ▼
      音频引擎       教学钩子       进度回调
      (扬声器)    (歌唱、反馈)    (回调函数)
           │
           ▼
     node-web-audio-api (Rust DSP)

位置追踪：
  MIDI 解析器 → PositionTracker → 拍/小节/速度映射
                                → 按时间跳转 / 按小节跳转
                                → 小节摘要用于实时反馈

教学钩子路由：
  PlaybackController → TeachingHook → VoiceDirective → mcp-voice-soundboard
                                    → AsideDirective → mcp-aside 收件箱
                                    → Console log    → CLI 终端
                                    → Recording      → 测试断言
```

## 测试

```bash
pnpm test       # 243 个 Vitest 测试
pnpm typecheck  # tsc --noEmit
pnpm smoke      # 集成冒烟测试
```

## 相关项目

- **[ai-music-sheets](https://github.com/mcp-tool-shop-org/ai-music-sheets)** —— 内置曲目库

## 许可证

MIT
