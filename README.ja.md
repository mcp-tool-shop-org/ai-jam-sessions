<p align="center">
  <a href="README.md">English</a> | <strong>日本語</strong> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a>
</p>

<p align="center">
  <img src="logo.svg" alt="PianoAI ロゴ" width="180" />
</p>

<h1 align="center">PianoAI</h1>

<p align="center">
  AI搭載ピアノ教習用MCPサーバー＋CLI — MIDIを介してVMPKで演奏し、音声フィードバックを提供します。
</p>

[![Tests](https://img.shields.io/badge/tests-121_passing-brightgreen)](https://github.com/mcp-tool-shop-org/pianoai)
[![Smoke](https://img.shields.io/badge/smoke-20_passing-brightgreen)](https://github.com/mcp-tool-shop-org/pianoai)
[![MCP Tools](https://img.shields.io/badge/MCP_tools-7-purple)](https://github.com/mcp-tool-shop-org/pianoai)
[![Songs](https://img.shields.io/badge/songs-10_(via_ai--music--sheets)-blue)](https://github.com/mcp-tool-shop-org/ai-music-sheets)

## これは何ですか？

TypeScript製のCLIおよびMCPサーバーで、[ai-music-sheets](https://github.com/mcp-tool-shop-org/ai-music-sheets)からピアノ楽曲を読み込み、MIDIにパースし、仮想MIDIポートを介して[VMPK](https://vmpk.sourceforge.io/)で再生します。教習エンジンは小節の境界や重要なタイミングで指示を発し、LLMが音声やアサイドフィードバックを備えたリアルタイムのピアノ教師として機能できるようにします。

## 機能

- **4つの再生モード** — フル再生、小節ごと、片手ずつ、ループ
- **速度制御** — 0.5倍のスロー練習から2倍の高速再生まで、テンポオーバーライドと組み合わせ可能
- **進捗トラッキング** — パーセンテージマイルストーンまたは小節ごとのコールバックを設定可能
- **7つの教習フック** — console、silent、recording、callback、voice、aside、compose
- **音声フィードバック** — mcp-voice-soundboard連携用の`VoiceDirective`出力
- **アサイド指示** — mcp-asideインボックス用の`AsideDirective`出力
- **安全なパース** — 不正なノートはスキップされ、`ParseWarning`として収集
- **7つのMCPツール** — レジストリ、教習ノート、楽曲レコメンドをLLMに公開
- **ノートパーサー** — 科学的音名表記とMIDIの相互変換
- **モックコネクター** — MIDIハードウェアなしで完全なテストカバレッジを実現

## 前提条件

1. **[loopMIDI](https://www.tobias-erichsen.de/software/loopmidi.html)** — 仮想MIDIポートを作成（例：「loopMIDI Port」）
2. **[VMPK](https://vmpk.sourceforge.io/)** — MIDI入力をloopMIDIポートに設定
3. **Node.js 18+**

## インストール

```bash
npm install -g pianai
```

## クイックスタート

```bash
# 全楽曲を一覧表示
pianai list

# 楽曲の詳細と教習ノートを表示
pianai info moonlight-sonata-mvt1

# VMPKを通じて楽曲を再生
pianai play let-it-be

# テンポを指定して再生
pianai play basic-12-bar-blues --tempo 80

# 小節ごとにステップ再生
pianai play autumn-leaves --mode measure

# 半速で練習
pianai play moonlight-sonata-mvt1 --speed 0.5

# スロー片手練習
pianai play dream-on --speed 0.75 --mode hands
```

## MCPサーバー

MCPサーバーはLLM連携用に7つのツールを公開しています：

| ツール | 説明 |
|------|------|
| `list_songs` | ジャンル、難易度、クエリで楽曲を検索・閲覧 |
| `song_info` | 音楽表現、教習目標、練習提案の詳細を取得 |
| `registry_stats` | ジャンル別・難易度別の楽曲数 |
| `teaching_note` | 小節ごとの教習ノート、運指、ダイナミクス |
| `suggest_song` | 条件に基づくレコメンドを取得 |
| `list_measures` | 教習ノートとパース警告付きの小節一覧 |
| `practice_setup` | 楽曲に適した速度、モード、音声設定を提案 |

```bash
# MCPサーバーを起動（stdioトランスポート）
pnpm mcp
```

### Claude Desktop設定

```json
{
  "mcpServers": {
    "pianai": {
      "command": "pianai-mcp"
    }
  }
}
```

## CLIコマンド

| コマンド | 説明 |
|---------|------|
| `list [--genre <genre>]` | 利用可能な楽曲を一覧表示、ジャンルでフィルタリング可能 |
| `info <song-id>` | 楽曲の詳細を表示：音楽表現、教習ノート、構成 |
| `play <song-id> [opts]` | MIDIを介してVMPKで楽曲を再生 |
| `stats` | レジストリ統計（楽曲数、ジャンル、小節数） |
| `ports` | 利用可能なMIDI出力ポートを一覧表示 |
| `help` | 使用方法を表示 |

### 再生オプション

| フラグ | 説明 |
|------|------|
| `--port <name>` | MIDIポート名（デフォルト：loopMIDIを自動検出） |
| `--tempo <bpm>` | 楽曲のデフォルトテンポをオーバーライド（10-400 BPM） |
| `--speed <mult>` | 速度倍率：0.5 = 半速、1.0 = 通常、2.0 = 倍速 |
| `--mode <mode>` | 再生モード：`full`、`measure`、`hands`、`loop` |

## 教習エンジン

教習エンジンは再生中にフックを発火します。7つのフック実装がすべてのユースケースをカバーします：

| フック | 用途 |
|------|------|
| `createConsoleTeachingHook()` | CLI — 小節、モーメント、完了をコンソールに出力 |
| `createSilentTeachingHook()` | テスト — 何もしない |
| `createRecordingTeachingHook()` | テスト — アサーション用にイベントを記録 |
| `createCallbackTeachingHook(cb)` | カスタム — 任意の非同期コールバックにルーティング |
| `createVoiceTeachingHook(sink)` | 音声 — mcp-voice-soundboard用の`VoiceDirective`を生成 |
| `createAsideTeachingHook(sink)` | アサイド — mcp-asideインボックス用の`AsideDirective`を生成 |
| `composeTeachingHooks(...hooks)` | 複合 — 複数のフックに順次ディスパッチ |

### 音声フィードバック

```typescript
import { createSession, createVoiceTeachingHook } from "pianai";
import { getSong } from "ai-music-sheets";

const voiceHook = createVoiceTeachingHook(
  async (directive) => {
    // mcp-voice-soundboardのvoice_speakにルーティング
    console.log(`[Voice] ${directive.text}`);
  },
  { voice: "narrator", speechSpeed: 0.9 }
);

const session = createSession(getSong("moonlight-sonata-mvt1")!, connector, {
  teachingHook: voiceHook,
  speed: 0.5, // 半速練習
});

await session.play();
// voiceHook.directives → 発火されたすべての音声指示
```

### フックの合成

```typescript
import {
  createVoiceTeachingHook,
  createAsideTeachingHook,
  createRecordingTeachingHook,
  composeTeachingHooks,
} from "pianai";

// 3つすべてが各イベントで発火
const composed = composeTeachingHooks(
  createVoiceTeachingHook(voiceSink),
  createAsideTeachingHook(asideSink),
  createRecordingTeachingHook()
);
```

## プログラマティックAPI

```typescript
import { getSong } from "ai-music-sheets";
import { createSession, createVmpkConnector } from "pianai";

const connector = createVmpkConnector({ portName: /loop/i });
await connector.connect();

const song = getSong("autumn-leaves")!;
const session = createSession(song, connector, {
  mode: "measure",
  tempo: 100,
  speed: 0.75,           // 練習用に75%速度
  onProgress: (p) => console.log(p.percent), // "25%", "50%" など
});

await session.play();          // 1小節再生して一時停止
session.next();                // 次の小節に進む
await session.play();          // 次の小節を再生
session.setSpeed(1.0);         // 通常速度に戻す
await session.play();          // フルスピードで次の小節を再生
session.stop();                // 停止してリセット

// パース警告を確認（楽曲データ内の不正なノート）
if (session.parseWarnings.length > 0) {
  console.warn("パースできなかったノートがあります:", session.parseWarnings);
}

await connector.disconnect();
```

## アーキテクチャ

```
ai-music-sheets (ライブラリ)       pianai (ランタイム)
┌──────────────────────┐         ┌────────────────────────────────┐
│ SongEntry (ハイブリッド) │────────→│ Note Parser (安全＋厳密)       │
│ Registry (検索)       │         │ Session Engine (速度＋進捗)     │
│ 10曲, 10ジャンル      │         │ Teaching Engine (7フック)       │
└──────────────────────┘         │ VMPK Connector (JZZ)          │
                                 │ MCP Server (7ツール)            │
                                 │ CLI (プログレスバー＋音声)       │
                                 └─────────┬──────────────────────┘
                                           │ MIDI
                                           ▼
                                 ┌─────────────────┐
                                 │ loopMIDI → VMPK │
                                 └─────────────────┘

教習フックのルーティング:
  Session → TeachingHook → VoiceDirective → mcp-voice-soundboard
                         → AsideDirective → mcp-aside inbox
                         → Console log    → CLIターミナル
                         → Recording      → テストアサーション
```

## テスト

```bash
pnpm test       # 121個のVitestテスト（パーサー＋セッション＋教習＋音声＋アサイド）
pnpm smoke      # 20個のスモークテスト（統合テスト、MIDIハードウェア不要）
pnpm typecheck  # tsc --noEmit
```

モックVMPKコネクター（`createMockVmpkConnector`）はハードウェアなしですべてのMIDIイベントを記録し、完全なテストカバレッジを実現します。安全なパース関数（`safeParseMeasure`）はスローする代わりに`ParseWarning`オブジェクトを収集するため、楽曲に不正なノートがあっても再生はグレースフルに継続されます。

## 関連プロジェクト

- **[ai-music-sheets](https://github.com/mcp-tool-shop-org/ai-music-sheets)** — 楽曲ライブラリ：10ジャンル、ハイブリッドフォーマット（メタデータ＋音楽表現＋コード用小節データ）

## ライセンス

MIT
