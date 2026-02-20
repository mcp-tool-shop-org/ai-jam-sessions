<p align="center">
  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <strong>中文</strong> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a>
</p>

# pianai

AI 驱动的钢琴教学 MCP 服务器 + CLI —— 通过 MIDI 在 VMPK 上演奏，并提供语音反馈。

[![Tests](https://img.shields.io/badge/tests-121_passing-brightgreen)](https://github.com/mcp-tool-shop-org/pianoai)
[![Smoke](https://img.shields.io/badge/smoke-20_passing-brightgreen)](https://github.com/mcp-tool-shop-org/pianoai)
[![MCP Tools](https://img.shields.io/badge/MCP_tools-7-purple)](https://github.com/mcp-tool-shop-org/pianoai)
[![Songs](https://img.shields.io/badge/songs-10_(via_ai--music--sheets)-blue)](https://github.com/mcp-tool-shop-org/ai-music-sheets)

## 这是什么？

一个 TypeScript CLI 和 MCP 服务器，可从 [ai-music-sheets](https://github.com/mcp-tool-shop-org/ai-music-sheets) 加载钢琴曲目，将其解析为 MIDI，并通过虚拟 MIDI 端口在 [VMPK](https://vmpk.sourceforge.io/) 上播放。教学引擎在小节边界和关键时刻触发插话，使 LLM 能够作为实时钢琴教师，提供语音和旁白反馈。

## 功能特性

- **4 种播放模式** —— 完整播放、逐小节播放、分手练习、循环播放
- **速度控制** —— 0.5 倍慢速练习至 2 倍快速播放，可与速度覆盖叠加
- **进度追踪** —— 可配置的百分比里程碑或逐小节回调
- **7 种教学钩子** —— console、silent、recording、callback、voice、aside、compose
- **语音反馈** —— `VoiceDirective` 输出，集成 mcp-voice-soundboard
- **旁白插话** —— `AsideDirective` 输出，发送到 mcp-aside 收件箱
- **安全解析** —— 错误音符会被优雅跳过，并收集 `ParseWarning`
- **6 个 MCP 工具** —— 向 LLM 暴露曲库、教学注释和曲目推荐
- **音符解析器** —— 科学音高记谱法与 MIDI 互转
- **模拟连接器** —— 无需 MIDI 硬件即可实现完整测试覆盖

## 前置条件

1. **[loopMIDI](https://www.tobias-erichsen.de/software/loopmidi.html)** —— 创建虚拟 MIDI 端口（例如 "loopMIDI Port"）
2. **[VMPK](https://vmpk.sourceforge.io/)** —— 将 MIDI 输入设置为你的 loopMIDI 端口
3. **Node.js 18+**

## 快速开始

```bash
pnpm install
pnpm build

# 列出所有曲目
node dist/cli.js list

# 显示曲目详情 + 教学注释
node dist/cli.js info moonlight-sonata-mvt1

# 通过 VMPK 播放曲目
node dist/cli.js play let-it-be

# 覆盖速度播放
node dist/cli.js play basic-12-bar-blues --tempo 80

# 逐小节步进
node dist/cli.js play autumn-leaves --mode measure

# 半速练习
node dist/cli.js play moonlight-sonata-mvt1 --speed 0.5

# 慢速分手练习
node dist/cli.js play dream-on --speed 0.75 --mode hands
```

## MCP 服务器

MCP 服务器提供 7 个工具用于 LLM 集成：

| 工具 | 描述 |
|------|------|
| `list_songs` | 按流派、难度或关键词浏览/搜索曲目 |
| `song_info` | 获取完整的音乐语言、教学目标、练习建议 |
| `registry_stats` | 按流派和难度统计曲目数量 |
| `teaching_note` | 逐小节的教学注释、指法、力度 |
| `suggest_song` | 根据条件获取曲目推荐 |
| `list_measures` | 小节概览，含教学注释 + 解析警告 |
| `practice_setup` | 为曲目建议速度、模式和语音设置 |

```bash
# 启动 MCP 服务器（stdio 传输）
pnpm mcp
```

### Claude Desktop 配置

```json
{
  "mcpServers": {
    "pianai": {
      "command": "node",
      "args": ["F:/AI/pianai/dist/mcp-server.js"]
    }
  }
}
```

## CLI 命令

| 命令 | 描述 |
|------|------|
| `list [--genre <genre>]` | 列出可用曲目，可按流派筛选 |
| `info <song-id>` | 显示曲目详情：音乐语言、教学注释、结构 |
| `play <song-id> [opts]` | 通过 MIDI 在 VMPK 上播放曲目 |
| `stats` | 曲库统计（曲目数、流派、小节数） |
| `ports` | 列出可用的 MIDI 输出端口 |
| `help` | 显示使用说明 |

### 播放选项

| 标志 | 描述 |
|------|------|
| `--port <name>` | MIDI 端口名称（默认：自动检测 loopMIDI） |
| `--tempo <bpm>` | 覆盖曲目默认速度（10-400 BPM） |
| `--speed <mult>` | 速度倍率：0.5 = 半速，1.0 = 正常，2.0 = 双倍速 |
| `--mode <mode>` | 播放模式：`full`、`measure`、`hands`、`loop` |

## 教学引擎

教学引擎在播放过程中触发钩子。7 种钩子实现覆盖所有使用场景：

| 钩子 | 使用场景 |
|------|----------|
| `createConsoleTeachingHook()` | CLI —— 将小节、关键时刻、完成信息输出到控制台 |
| `createSilentTeachingHook()` | 测试 —— 空操作 |
| `createRecordingTeachingHook()` | 测试 —— 记录事件用于断言 |
| `createCallbackTeachingHook(cb)` | 自定义 —— 路由到任意异步回调 |
| `createVoiceTeachingHook(sink)` | 语音 —— 为 mcp-voice-soundboard 生成 `VoiceDirective` |
| `createAsideTeachingHook(sink)` | 旁白 —— 为 mcp-aside 收件箱生成 `AsideDirective` |
| `composeTeachingHooks(...hooks)` | 组合 —— 按顺序分发到多个钩子 |

### 语音反馈

```typescript
import { createSession, createVoiceTeachingHook } from "pianai";
import { getSong } from "ai-music-sheets";

const voiceHook = createVoiceTeachingHook(
  async (directive) => {
    // 路由到 mcp-voice-soundboard 的 voice_speak
    console.log(`[Voice] ${directive.text}`);
  },
  { voice: "narrator", speechSpeed: 0.9 }
);

const session = createSession(getSong("moonlight-sonata-mvt1")!, connector, {
  teachingHook: voiceHook,
  speed: 0.5, // 半速练习
});

await session.play();
// voiceHook.directives → 所有已触发的语音指令
```

### 组合钩子

```typescript
import {
  createVoiceTeachingHook,
  createAsideTeachingHook,
  createRecordingTeachingHook,
  composeTeachingHooks,
} from "pianai";

// 三个钩子在每个事件上都会触发
const composed = composeTeachingHooks(
  createVoiceTeachingHook(voiceSink),
  createAsideTeachingHook(asideSink),
  createRecordingTeachingHook()
);
```

## 编程 API

```typescript
import { getSong } from "ai-music-sheets";
import { createSession, createVmpkConnector } from "pianai";

const connector = createVmpkConnector({ portName: /loop/i });
await connector.connect();

const song = getSong("autumn-leaves")!;
const session = createSession(song, connector, {
  mode: "measure",
  tempo: 100,
  speed: 0.75,           // 75% 速度用于练习
  onProgress: (p) => console.log(p.percent), // "25%"、"50%" 等
});

await session.play();          // 播放一个小节后暂停
session.next();                // 前进到下一个小节
await session.play();          // 播放下一个小节
session.setSpeed(1.0);         // 恢复正常速度
await session.play();          // 以全速播放下一个小节
session.stop();                // 停止并重置

// 检查是否有解析警告（曲目数据中的错误音符）
if (session.parseWarnings.length > 0) {
  console.warn("部分音符无法解析:", session.parseWarnings);
}

await connector.disconnect();
```

## 架构

```
ai-music-sheets (曲库)           pianai (运行时)
┌──────────────────────┐         ┌────────────────────────────────┐
│ SongEntry (混合格式)  │────────→│ Note Parser (安全 + 严格)      │
│ Registry (搜索)      │         │ Session Engine (速度+进度)      │
│ 10 首曲目, 10 种流派  │         │ Teaching Engine (7 种钩子)      │
└──────────────────────┘         │ VMPK Connector (JZZ)          │
                                 │ MCP Server (6 个工具)           │
                                 │ CLI (进度条 + 语音)             │
                                 └─────────┬──────────────────────┘
                                           │ MIDI
                                           ▼
                                 ┌─────────────────┐
                                 │ loopMIDI → VMPK │
                                 └─────────────────┘

教学钩子路由：
  Session → TeachingHook → VoiceDirective → mcp-voice-soundboard
                         → AsideDirective → mcp-aside 收件箱
                         → Console log    → CLI 终端
                         → Recording      → 测试断言
```

## 测试

```bash
pnpm test       # 121 个 Vitest 测试（解析器 + 会话 + 教学 + 语音 + 旁白）
pnpm smoke      # 20 个冒烟测试（集成测试，无需 MIDI 硬件）
pnpm typecheck  # tsc --noEmit
```

模拟 VMPK 连接器（`createMockVmpkConnector`）无需硬件即可记录所有 MIDI 事件，实现完整测试覆盖。安全解析函数（`safeParseMeasure`）收集 `ParseWarning` 对象而不是抛出异常，因此即使曲目中存在格式错误的音符，播放也能优雅地继续。

## 相关项目

- **[ai-music-sheets](https://github.com/mcp-tool-shop-org/ai-music-sheets)** —— 曲目库：10 种流派，混合格式（元数据 + 音乐语言 + 可直接使用的小节数据）

## 许可证

MIT
