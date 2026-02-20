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

[![Tests](https://img.shields.io/badge/tests-181_passing-brightgreen)](https://github.com/mcp-tool-shop-org/pianoai)
[![Smoke](https://img.shields.io/badge/smoke-29_passing-brightgreen)](https://github.com/mcp-tool-shop-org/pianoai)
[![MCP Tools](https://img.shields.io/badge/MCP_tools-8-purple)](https://github.com/mcp-tool-shop-org/pianoai)
[![Songs](https://img.shields.io/badge/songs-10_(via_ai--music--sheets)-blue)](https://github.com/mcp-tool-shop-org/ai-music-sheets)

## これは何ですか？

TypeScript製のCLIおよびMCPサーバーで、[ai-music-sheets](https://github.com/mcp-tool-shop-org/ai-music-sheets)からピアノ楽曲を読み込み、MIDIにパースし、仮想MIDIポートを介して[VMPK](https://vmpk.sourceforge.io/)で再生します。教習エンジンは小節の境界や重要なタイミングで指示を発し、LLMが音声やアサイドフィードバックを備えたリアルタイムのピアノ教師として機能できるようにします。

## 機能

- **4つの再生モード** — フル再生、小節ごと、片手ずつ、ループ
- **シンクロ歌唱＋ピアノ** — concurrent（デュエット）またはbefore（ボイス先行）を `--with-piano` で選択
- **速度制御** — 0.5倍のスロー練習から2倍の高速再生まで、テンポオーバーライドと組み合わせ可能
- **進捗トラッキング** — パーセンテージマイルストーンまたは小節ごとのコールバックを設定可能
- **9つの教習フック** — console、silent、recording、callback、voice、aside、sing-along、live feedback、compose
- **ライブ教習フィードバック** — 再生中のリアルタイム励まし、ダイナミクスのヒント、難易度の警告
- **シングアロングナレーション** — 各小節の前に音名、ソルフェージュ、輪郭、シラブルを読み上げ
- **音声フィードバック** — mcp-voice-soundboard連携用の`VoiceDirective`出力
- **アサイド指示** — mcp-asideインボックス用の`AsideDirective`出力
- **安全なパース** — 不正なノートはスキップされ、`ParseWarning`として収集
- **8つのMCPツール** — レジストリ、教習ノート、シングアロング、楽曲レコメンドをLLMに公開
- **ノートパーサー** — 科学的音名表記とMIDIの相互変換
- **モックコネクター** — MIDIハードウェアなしで完全なテストカバレッジを実現

## 前提条件

1. **[loopMIDI](https://www.tobias-erichsen.de/software/loopmidi.html)** — 仮想MIDIポートを作成（例：「loopMIDI Port」）
2. **[VMPK](https://vmpk.sourceforge.io/)** — MIDI入力をloopMIDIポートに設定
3. **Node.js 18+**

## インストール

```bash
npm install -g @mcptoolshop/pianoai
```

## クイックスタート

```bash
# 全楽曲を一覧表示
pianoai list

# 楽曲の詳細と教習ノートを表示
pianoai info moonlight-sonata-mvt1

# VMPKを通じて楽曲を再生
pianoai play let-it-be

# テンポを指定して再生
pianoai play basic-12-bar-blues --tempo 80

# 小節ごとにステップ再生
pianoai play autumn-leaves --mode measure

# 半速で練習
pianoai play moonlight-sonata-mvt1 --speed 0.5

# スロー片手練習
pianoai play dream-on --speed 0.75 --mode hands

# シングアロング — 再生中にノート名をナレーション
pianoai sing let-it-be --mode note-names

# ソルフェージュで両手をシングアロング
pianoai sing fur-elise --mode solfege --hand both

# シング＋ピアノ同時再生（デュエット）
pianoai sing let-it-be --with-piano

# ボイス先行でピアノ再生
pianoai sing fur-elise --with-piano --sync before
```

## MCPサーバー

MCPサーバーはLLM連携用に8つのツールを公開しています：

| ツール | 説明 |
|------|------|
| `list_songs` | ジャンル、難易度、クエリで楽曲を検索・閲覧 |
| `song_info` | 音楽表現、教習目標、練習提案の詳細を取得 |
| `registry_stats` | ジャンル別・難易度別の楽曲数 |
| `teaching_note` | 小節ごとの教習ノート、運指、ダイナミクス |
| `sing_along` | 小節ごとの歌唱テキスト（音名、ソルフェージュ、輪郭、シラブル）を取得。`withPiano`でピアノ伴奏同時再生に対応 |
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
    "pianoai": {
      "command": "pianoai-mcp"
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
| `sing <song-id> [opts]` | シングアロング — 再生中にノートをナレーション |
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

### シングオプション

| フラグ | 説明 |
|------|------|
| `--mode <mode>` | シングアロングモード：`note-names`、`solfege`、`contour`、`syllables` |
| `--hand <hand>` | どちらの手：`right`、`left`、`both` |
| `--with-piano` | 歌唱中にピアノ伴奏を再生 |
| `--sync <mode>` | ボイス＋ピアノ同期：`concurrent`（デフォルト、デュエット）、`before`（ボイス先行） |

## 教習エンジン

教習エンジンは再生中にフックを発火します。9つのフック実装がすべてのユースケースをカバーします：

| フック | 用途 |
|------|------|
| `createConsoleTeachingHook()` | CLI — 小節、モーメント、完了をコンソールに出力 |
| `createSilentTeachingHook()` | テスト — 何もしない |
| `createRecordingTeachingHook()` | テスト — アサーション用にイベントを記録 |
| `createCallbackTeachingHook(cb)` | カスタム — 任意の非同期コールバックにルーティング |
| `createVoiceTeachingHook(sink)` | 音声 — mcp-voice-soundboard用の`VoiceDirective`を生成 |
| `createAsideTeachingHook(sink)` | アサイド — mcp-asideインボックス用の`AsideDirective`を生成 |
| `createSingAlongHook(sink, song)` | シングアロング — 各小節の前にノート名/ソルフェージュ/輪郭をナレーション |
| `createLiveFeedbackHook(voiceSink, asideSink, song)` | ライブフィードバック — 励まし、ダイナミクスのヒント、難易度の警告 |
| `composeTeachingHooks(...hooks)` | 複合 — 複数のフックに順次ディスパッチ |

### 音声フィードバック

```typescript
import { createSession, createVoiceTeachingHook } from "@mcptoolshop/pianoai";
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

### シングアロングナレーション

```typescript
import {
  createSingAlongHook,
  createVoiceTeachingHook,
  composeTeachingHooks,
  createSession,
} from "@mcptoolshop/pianoai";
import { getSong } from "@mcptoolshop/ai-music-sheets";

const song = getSong("let-it-be")!;

// 各小節の前にソルフェージュをナレーション、その後教習ノートを読み上げ
const singHook = createSingAlongHook(voiceSink, song, {
  mode: "solfege",
  hand: "right",
});
const teachHook = createVoiceTeachingHook(voiceSink);
const combined = composeTeachingHooks(singHook, teachHook);

const session = createSession(song, connector, { teachingHook: combined });
await session.play();
// singHook.directives → 各小節前のブロッキング "Do... Mi... Sol"
```

### フックの合成

```typescript
import {
  createVoiceTeachingHook,
  createAsideTeachingHook,
  createRecordingTeachingHook,
  composeTeachingHooks,
} from "@mcptoolshop/pianoai";

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
import { createSession, createVmpkConnector } from "@mcptoolshop/pianoai";

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
ai-music-sheets (ライブラリ)       pianoai (ランタイム)
┌──────────────────────┐         ┌────────────────────────────────┐
│ SongEntry (ハイブリッド) │────────→│ Note Parser (安全＋厳密)       │
│ Registry (検索)       │         │ Session Engine (速度＋進捗)     │
│ 10曲, 10ジャンル      │         │ Teaching Engine (9フック)       │
└──────────────────────┘         │ VMPK Connector (JZZ)          │
                                 │ MCP Server (8ツール)            │
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
pnpm test       # 181個のVitestテスト（パーサー＋セッション＋教習＋音声＋アサイド＋シングアロング）
pnpm smoke      # 29個のスモークテスト（統合テスト、MIDIハードウェア不要）
pnpm typecheck  # tsc --noEmit
```

モックVMPKコネクター（`createMockVmpkConnector`）はハードウェアなしですべてのMIDIイベントを記録し、完全なテストカバレッジを実現します。安全なパース関数（`safeParseMeasure`）はスローする代わりに`ParseWarning`オブジェクトを収集するため、楽曲に不正なノートがあっても再生はグレースフルに継続されます。

## 関連プロジェクト

- **[ai-music-sheets](https://github.com/mcp-tool-shop-org/ai-music-sheets)** — 楽曲ライブラリ：10ジャンル、ハイブリッドフォーマット（メタデータ＋音楽表現＋コード用小節データ）

## ライセンス

MIT
