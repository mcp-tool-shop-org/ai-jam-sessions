<p align="center">
  <a href="README.md">English</a> | <strong>日本語</strong> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a>
</p>

<p align="center">
  <img src="logo.svg" alt="PianoAI ロゴ" width="180" />
</p>

<h1 align="center">PianoAI</h1>

<p align="center">
  内蔵オーディオエンジン搭載のピアノプレイヤー — スピーカーから直接再生、外部ソフトウェア不要。MCPサーバー＋CLI。
</p>

[![Tests](https://img.shields.io/badge/tests-passing-brightgreen)](https://github.com/mcp-tool-shop-org/pianoai)
[![MCP Tools](https://img.shields.io/badge/MCP_tools-12-purple)](https://github.com/mcp-tool-shop-org/pianoai)
[![Songs](https://img.shields.io/badge/songs-10_built--in-blue)](https://github.com/mcp-tool-shop-org/ai-music-sheets)

## これは何ですか？

TypeScript製のピアノプレイヤーで、標準MIDIファイルや内蔵楽曲をスピーカーから直接再生します。外部ソフトウェアは不要です — 内蔵オーディオエンジンがすべてを処理します。LLM連携用のMCPサーバーと、直接操作用のCLIを搭載しています。

再生中のリアルタイムシングアロングナレーションとライブ教習フィードバックに対応しています。

## 機能

- **内蔵ピアノエンジン** — `node-web-audio-api`を介してスピーカーから再生、MIDIハードウェア不要
- **標準MIDIファイル対応** — 任意の`.mid`ファイルを再生: `pianoai play song.mid`
- **リアルタイム歌唱** — MIDI再生中に音名、ソルフェージュ、輪郭、シラブルをナレーション
- **ボイスフィルター** — メロディのみ（最高音）、ハーモニー（最低音）、またはコードの全音を歌唱
- **ライブ教習フィードバック** — 位置に応じたダイナミクスのヒント、音域の警告、セクション境界、マイルストーン通知
- **ポジショントラッキング** — 生のMIDIからビート/小節/テンポマッピングを取得、シーク対応
- **4つの再生モード** — フル再生、小節ごと、片手ずつ、ループ
- **速度制御** — 0.5倍のスロー練習から4倍の高速再生まで、テンポオーバーライドと組み合わせ可能
- **リアルタイム操作** — 再生中の一時停止、再開、速度変更、シークをイベントリスナーで対応
- **12のMCPツール** — 再生、一時停止、速度変更、停止、閲覧、歌唱、教習 — すべてMCPプロトコル経由
- **12の教習フック** — console、silent、recording、callback、voice、aside、sing-along、live feedback、MIDI singing、MIDI live feedback、compose
- **オプションのMIDI出力** — `--midi`フラグで外部ソフトウェアに転送（loopMIDI + VMPKが必要）
- **安全なパース** — 不正なノートはグレースフルにスキップされ、`ParseWarning`として収集
- **モックコネクター** — ハードウェアなしで完全なテストカバレッジを実現

## インストール

```bash
npm install -g @mcptoolshop/pianoai
```

**Node.js 18+**が必要です。それだけです — MIDIドライバも、仮想ポートも、外部ソフトウェアも不要です。

## クイックスタート

```bash
# MIDIファイルを再生
pianoai play path/to/song.mid

# 歌唱付きで再生（再生中に音名をナレーション）
pianoai play song.mid --with-singing

# メロディのみを歌唱（コード音をスキップし、最高音のみ）
pianoai play song.mid --with-singing --voice-filter melody-only

# 教習フィードバック付きで再生（ダイナミクス、励まし）
pianoai play song.mid --with-teaching

# 歌唱と教習の両方を有効にして再生
pianoai play song.mid --with-singing --with-teaching --sing-mode solfege

# 半速で歌唱付き練習
pianoai play song.mid --speed 0.5 --with-singing

# 45秒地点にシークしてから再生
pianoai play song.mid --seek 45

# 内蔵ライブラリの楽曲を再生
pianoai play let-it-be

# すべての内蔵楽曲を一覧表示
pianoai list

# 楽曲の詳細と教習ノートを表示
pianoai info moonlight-sonata-mvt1

# ライブラリ楽曲でシングアロング（音声ナレーション）
pianoai sing let-it-be --mode solfege --with-piano
```

### 再生オプション

| フラグ | 説明 |
|------|------|
| `--speed <mult>` | 速度倍率: 0.5 = 半速、1.0 = 通常、2.0 = 倍速 |
| `--tempo <bpm>` | 楽曲のデフォルトテンポをオーバーライド（10-400 BPM） |
| `--mode <mode>` | 再生モード: `full`、`measure`、`hands`、`loop` |
| `--with-singing` | リアルタイムシングアロングナレーションを有効化 |
| `--with-teaching` | ライブ教習フィードバックを有効化 |
| `--sing-mode <mode>` | 歌唱モード: `note-names`、`solfege`、`contour`、`syllables` |
| `--voice-filter <f>` | ボイスフィルター: `all`、`melody-only`、`harmony` |
| `--seek <seconds>` | 再生前に指定した時間位置へジャンプ |
| `--midi` | 内蔵エンジンの代わりに外部MIDIソフトウェアに転送 |

## MCPサーバー

MCPサーバーはLLM連携用に12のツールを公開しています:

| ツール | 説明 |
|------|------|
| `list_songs` | ジャンル、難易度、クエリで楽曲を検索・閲覧 |
| `song_info` | 音楽表現、教習目標、練習提案の詳細を取得 |
| `registry_stats` | ジャンル別・難易度別の楽曲数 |
| `teaching_note` | 小節ごとの教習ノート、運指、ダイナミクス |
| `suggest_song` | 条件に基づくレコメンドを取得 |
| `list_measures` | 教習ノートとパース警告付きの小節一覧 |
| `sing_along` | 小節ごとの歌唱テキスト（音名、ソルフェージュ、輪郭、シラブル）を取得 |
| `practice_setup` | 楽曲に適した速度、モード、音声設定を提案 |
| `play_song` | 歌唱と教習を任意で付けて楽曲またはMIDIファイルを再生 |
| `pause_playback` | 現在再生中の楽曲を一時停止または再開 |
| `set_speed` | 再生中に速度を変更 |
| `stop_playback` | 現在再生中の楽曲を停止 |

### Claude Desktop設定

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

### 歌唱と教習付きのplay_song

`play_song` MCPツールは `withSinging` と `withTeaching` フラグを受け付けます:

```
play_song({ id: "path/to/song.mid", withSinging: true, withTeaching: true, singMode: "solfege" })
```

## プログラマティックAPI

### リアルタイム操作でMIDIファイルを再生

```typescript
import { createAudioEngine, parseMidiFile, PlaybackController } from "@mcptoolshop/pianoai";

const connector = createAudioEngine();
await connector.connect();

const midi = await parseMidiFile("song.mid");
const controller = new PlaybackController(connector, midi);

// イベントをリッスン
controller.on("noteOn", (e) => console.log(`ノート: ${e.noteName}`));
controller.on("stateChange", (e) => console.log(`状態: ${e.state}`));

await controller.play({ speed: 0.75 });

controller.pause();       // 一時停止
controller.setSpeed(1.5); // 速度変更
await controller.resume();// 新しい速度で再開

await connector.disconnect();
```

### 歌唱とライブ教習付きで再生

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

// feedbackHook.trackerにポジション情報あり
console.log(`総小節数: ${feedbackHook.tracker.totalMeasures}`);
```

### 内蔵ライブラリの楽曲を再生

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

## アーキテクチャ

```
標準MIDIファイル (.mid)      内蔵楽曲 (ai-music-sheets)
        │                              │
        ▼                              ▼
   MIDIパーサー ──────────────── ノートパーサー
        │                              │
        ▼                              ▼
  MidiPlaybackEngine            SessionController
        │                              │
        └──────── PlaybackController ──┘
                  (リアルタイムイベント、フック)
                         │
           ┌─────────────┼─────────────┐
           ▼             ▼             ▼
      AudioEngine   教習フック       プログレス
      (スピーカー)   (歌唱、フィードバック) (コールバック)
           │
           ▼
     node-web-audio-api (Rust DSP)

ポジショントラッキング:
  MIDIパーサー → PositionTracker → ビート/小節/テンポマッピング
                                → 時間/小節へのシーク
                                → ライブフィードバック用の小節サマリー

教習フックのルーティング:
  PlaybackController → TeachingHook → VoiceDirective → mcp-voice-soundboard
                                    → AsideDirective → mcp-aside inbox
                                    → Console log    → CLIターミナル
                                    → Recording      → テストアサーション
```

## テスト

```bash
pnpm test       # 243個のVitestテスト
pnpm typecheck  # tsc --noEmit
pnpm smoke      # 統合スモークテスト
```

## 関連プロジェクト

- **[ai-music-sheets](https://github.com/mcp-tool-shop-org/ai-music-sheets)** — 内蔵楽曲ライブラリ

## ライセンス

MIT
