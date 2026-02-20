<p align="center">
  <a href="README.md">English</a> | <strong>日本語</strong> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a>
</p>

<p align="center">
  <img src="logo.png" alt="AI Jam Session logo" width="180" />
</p>

<h1 align="center">AI Jam Session</h1>

<p align="center">
  内蔵オーディオエンジンと100曲ライブラリを備えたAIピアノプレイヤー。MCPサーバー + CLI。
</p>

[![MCP Tools](https://img.shields.io/badge/MCP_tools-15-purple)](https://github.com/mcp-tool-shop-org/ai_jam_session)
[![Songs](https://img.shields.io/badge/songs-100_built--in-blue)](https://github.com/mcp-tool-shop-org/ai_jam_session)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen)](https://github.com/mcp-tool-shop-org/ai_jam_session)

## これは何ですか？

Claudeが演奏できるピアノです。AI Jam Sessionは内蔵オーディオエンジンを搭載したMCPサーバーで、外部ソフトウェア不要でスピーカーから直接再生します。Claudeは10ジャンル100曲のライブラリを閲覧し、楽曲を選び、教え、ジャムセッションを行います。スタンドアロンCLIとしても動作します。

## 機能

- **内蔵ピアノエンジン** — `node-web-audio-api`によるサンプルベースオーディオ、スピーカーから再生
- **100曲ライブラリ** — クラシック、ジャズ、ポップ、ブルース、ロック、R&B、ラテン、映画音楽、ラグタイム、ニューエイジ
- **AIジャムセッション** — Claudeが楽曲のコードとメロディを分析し、独自の解釈を創作
- **MIDIファイル対応** — 任意の`.mid`ファイルを再生: `ai-jam-session play song.mid`
- **教習システム** — 小節ごとの教習ノート、音楽表現の解説、練習のアドバイス
- **4つの再生モード** — フル再生、小節ごと、片手ずつ、ループ
- **速度制御** — 0.5倍のスロー練習から4倍の高速再生まで
- **リアルタイム操作** — 再生中の一時停止、再開、速度変更
- **15のMCPツール** — 再生、閲覧、教習、ジャム、インポート — すべてMCPプロトコル経由
- **楽曲の追加** — `add_song`ツールでSongEntry JSONを受付、`import_midi`でMIDIファイルを変換
- **オプションのMIDI出力** — `--midi`フラグで外部ソフトウェアに転送（loopMIDI + VMPKが必要）

## インストール

```bash
npm install -g @mcptoolshop/ai-jam-session
```

**Node.js 18+**が必要です。それだけです — MIDIドライバも、仮想ポートも、外部ソフトウェアも不要です。

## クイックスタート

```bash
# 内蔵楽曲を再生
ai-jam-session play let-it-be

# MIDIファイルを再生
ai-jam-session play path/to/song.mid

# 半速で練習
ai-jam-session play moonlight-sonata-mvt1 --speed 0.5

# すべての内蔵楽曲を一覧表示
ai-jam-session list

# 楽曲の詳細と教習ノートを表示
ai-jam-session info autumn-leaves
```

### 再生オプション

| フラグ | 説明 |
|------|------|
| `--speed <mult>` | 速度倍率: 0.5 = 半速、1.0 = 通常、2.0 = 倍速 |
| `--tempo <bpm>` | 楽曲のデフォルトテンポをオーバーライド（10-400 BPM） |
| `--mode <mode>` | 再生モード: `full`、`measure`、`hands`、`loop` |
| `--midi` | 内蔵エンジンの代わりに外部MIDIソフトウェアに転送 |

## MCPサーバー

MCPサーバーはLLM連携用に15のツールを公開しています:

| ツール | 説明 |
|------|------|
| `list_songs` | ジャンル、難易度、クエリで楽曲を検索・閲覧 |
| `song_info` | 音楽表現、教習目標、練習提案の詳細情報 |
| `registry_stats` | ジャンル別・難易度別の楽曲数 |
| `teaching_note` | 小節ごとの教習ノート、運指、ダイナミクス |
| `suggest_song` | 条件に基づくおすすめ楽曲 |
| `list_measures` | 教習ノート付きの小節一覧 |
| `practice_setup` | 楽曲に適した速度、モード、設定を提案 |
| `sing_along` | 小節ごとの歌唱テキスト（音名、ソルフェージュ、輪郭） |
| `play_song` | 楽曲またはMIDIファイルをスピーカーから再生 |
| `pause_playback` | 現在再生中の楽曲を一時停止または再開 |
| `set_speed` | 再生中に速度を変更 |
| `stop_playback` | 現在再生中の楽曲を停止 |
| `ai_jam_session` | ジャムブリーフを取得 — コード、メロディ、スタイルのガイダンス — 即興演奏用 |
| `add_song` | 新しい楽曲（SongEntry JSON）をライブラリに追加 |
| `import_midi` | MIDIファイルをSongEntryに変換してライブラリに登録 |

### AIジャムセッション

`ai_jam_session`ツールは任意の楽曲から構造化された「ジャムブリーフ」を抽出します: コード進行、メロディの輪郭、ジャンル固有のスタイルガイダンス。Claudeはこのブリーフを使って独自の解釈を創作します。

2つのモード:
- **特定の楽曲:** `ai_jam_session({ songId: "autumn-leaves", style: "blues" })` — Autumn Leavesをブルーススタイルでジャム
- **ランダムなジャンル選択:** `ai_jam_session({ genre: "jazz" })` — ランダムなジャズ楽曲を選んでジャム

オプションパラメータ: `mood`（アップビート、メランコリック、ドリーミーなど）、`difficulty`、`measures`（"1-8"のような範囲指定）。

### Claude Desktop / Claude Code設定

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

### Claude Codeプラグイン

AI Jam Sessionにはスラッシュコマンドとエージェントパーソナリティを追加するClaude Codeプラグインが付属しています:

| コマンド | 説明 |
|---------|------|
| `/ai-jam-session:teach <song>` | 構造化された教習セッションを開始 |
| `/ai-jam-session:practice <song>` | 速度・モードのおすすめ付き練習プランを取得 |
| `/ai-jam-session:explore [query]` | ジャンル、難易度、キーワードでライブラリを閲覧 |
| `/ai-jam-session:jam <song or genre>` | ジャムセッションを開始 — Claudeが独自の解釈を創作 |

2つのエージェントパーソナリティ:
- **ピアノ教師** — 忍耐強く教育的、生徒のレベルに合わせた指導
- **ジャムミュージシャン** — リラックスしたジャムバンドの雰囲気、グルーヴ重視、実験を促進

## 楽曲ライブラリ

10ジャンル、3段階の難易度にわたる100曲の内蔵楽曲:

| ジャンル | 曲数 | 例 |
|---------|------|------|
| クラシック | 10 | Fur Elise, Clair de Lune, Moonlight Sonata, Bach Prelude in C |
| ジャズ | 10 | Autumn Leaves, Take Five, So What, Misty |
| ポップ | 10 | Imagine, Hallelujah, Piano Man, Bohemian Rhapsody |
| ブルース | 10 | Basic 12-Bar, St. Louis Blues, Stormy Monday, Thrill Is Gone |
| ロック | 10 | Stairway Intro, Hotel California, Rocket Man, Layla Coda |
| R&B | 10 | Superstition, Georgia On My Mind, Lean On Me, My Girl |
| ラテン | 10 | Girl from Ipanema, Besame Mucho, Oye Como Va, Wave |
| 映画音楽 | 11 | Cinema Paradiso, Moon River, Hedwig's Theme, Spirited Away |
| ラグタイム | 9 | The Entertainer, Maple Leaf Rag, Elite Syncopations |
| ニューエイジ | 10 | River Flows in You, Snowfall, Crystal Stream, Evening Calm |

## プログラマティックAPI

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

### 内蔵楽曲を再生

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

## アーキテクチャ

```
MIDIファイル (.mid)          内蔵楽曲ライブラリ (JSON)
       |                              |
       v                              v
  MIDIパーサー ──────────────── ノートパーサー
       |                              |
       v                              v
 MidiPlaybackEngine            SessionController
       |                              |
       └──────── PlaybackController ──┘
                 (リアルタイムイベント、フック)
                        |
          ┌─────────────┼─────────────┐
          v             v             v
     AudioEngine   教習フック       プログレス
     (スピーカー)   (小節ごと)      (コールバック)
          |
          v
    node-web-audio-api (Rust DSP)
```

## ライセンス

MIT
