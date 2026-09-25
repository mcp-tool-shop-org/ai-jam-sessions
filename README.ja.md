<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="logo-banner.png" alt="AI Jam Sessions" width="520" />
</p>

<p align="center">
  <em>Machine Learning the Old Fashioned Way</em>
</p>

<p align="center">
  An MCP server that teaches AI to play piano and guitar — and sing.<br/>
  108 annotated songs across 12 genres. Six sound engines. Interactive guitar tablature.<br/>
  A browser cockpit with vocal synthesizer. A practice journal that remembers everything.
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-jam-sessions/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-jam-sessions/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/ai-jam-sessions"><img src="https://img.shields.io/npm/v/@mcptoolshop/ai-jam-sessions" alt="npm"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-jam-sessions"><img src="https://img.shields.io/badge/songs-108_across_12_genres-blue" alt="Songs"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-jam-sessions"><img src="https://img.shields.io/badge/annotated-108%2F108-green" alt="Ready"></a>
  <a href="datasets/jam-actions-v0-public/README.md"><img src="https://img.shields.io/badge/dataset-jam--actions--v0%20(57_records)-8b5cf6" alt="Training dataset"></a>
  <a href="https://doi.org/10.5281/zenodo.20279918"><img src="https://zenodo.org/badge/DOI/10.5281/zenodo.20279918.svg" alt="DOI"></a>
</p>

---

## これは何ですか？

AIが演奏を学習するピアノとギター。シンセサイザーでも、MIDIライブラリでもありません。これは教育用の楽器です。

LLMはテキストを読み書きできますが、私たちが体験する音楽を体験することはできません。耳も、指も、筋肉の記憶もありません。AI Jam Sessionsは、モデルが実際に使用できる感覚を与えることで、このギャップを埋めます。

- **演奏** — 豊富な音楽的な注釈が加えられた、実際の MIDI 譜面。手書きの近似ではなく、解析、分析、説明が行われます。
- **聴取** — 6 つのオーディオエンジン（オシレーターピアノ、サンプルピアノ、ボーカルサンプル、物理的な声帯、加算型ボーカルシンセ、物理的にモデル化されたギター）がスピーカーを通して再生され、部屋にいる人々が AI の「耳」となります。そして今、このモデルは独自の「耳」を持つようになりました。録音した音、またはあなたが録音した音を測定し、実際に何が含まれているかを判断できます。詳細は [Listening](#listening) を参照してください。
- **視覚化** — ピアノロールは、再生された内容を SVG としてレンダリングし、モデルがそれを読み込んで検証できるようにします。インタラクティブなギタータブ譜エディター。視覚的なキーボード、デュアルモードのノートエディター、チューニングラボを備えたブラウザのインターフェース。
- **記憶** — セッション間で保持される練習ジャーナルにより、時間の経過とともに学習が積み重ねられます。
- **歌唱** — 20 種類の音声プリセット（オペラ歌手からエレクトロニックコーラスまで）を備えた声帯合成。ソルフレーゼ、音程、音節によるナレーションを備えた、一緒に歌えるモード。そして、ピアノのクロックに合わせて実際に歌うことができます。曲の MIDI に基づいて、タイミング（40 ミリ秒）と音程（50 セント）でゲート処理され、あなたがそれを聞く前に、スコアに沿った歌声が生成されます。詳細は [Sing](#sing) を参照してください。

108曲すべてに、歴史的背景、小節ごとの構造分析、重要なポイント、教育目標、演奏のヒントなど、詳細な注釈が加えられています。これらは12のジャンルすべてにわたります。このREADMEの以前のバージョンでは、生の楽曲は「AIがパターンを吸収し、音楽を演奏し、独自の注釈を作成するのを待っている」と記載されていました。まさにそれが起こりました。注釈は、決定論的な楽曲ごとの分析（コード、反復構造、セクションの境界、コンテンツ検証されたキー）に基づいてAIによって作成され、品質基準によって制御され、敵対的に事実確認されたクレームごとに検証されました。具体的には、小節番号、コードウィンドウ、構造カウントがすべて実際のMIDIに対して検証され、それからリリースされました。

この作業から、**[jam-actions-v0](#training-dataset)**も公開します。これは、実際のクラシックピアノ音楽を使用した57回の多段階のMCPツール使用のパブリックデータセットです。これは、単なるテキスト生成ではなく、シンボリック音楽における*実用的なツール使用*をLLMに教えます。また、7軸のリリースゲートも搭載されており、「証拠を伝える」ことと「タスクが些細なため合格とする」ことを区別します。詳細については、以下の[トレーニングデータセット](#training-dataset)を参照してください。

## 聴取

長い間、このサーバーは音を出すことはできましたが、それを分析することはできませんでした。モデルが演奏し、人間がそれを聴き、モデルはその人間の意見を鵜呑みにしていたのです。しかし、そのギャップは今や解消されました。

WAV ファイルを読み込ませると、その中に何が含まれているかを測定します。画像を見て推測するのではなく、スコアに対してすでに使用しているのと同じ種類のツールを使用して信号を処理します。

- **`analyze_audio`** — 音の開始点、音程の輪郭、音量。音程は、生の周波数ではなく、音名とセント単位のずれとして返されます。
- **`transcribe_audio`** — 録音された音をノートとして表現します。音程、開始時間、持続時間、および各ノートがコンサートピッチからどれだけ離れているか。
- **`score_audio_take`** — ライブラリ内の曲に対して、耳でパフォーマンスを評価します。録音された音をトランスクライブし、スコアと照合し、どのノートが正しく演奏されたか、どのノートがずれていたか、どのノートが演奏されなかったかを報告します。その後、`view_scored_piano_roll` がその結果をスコア上に表示します。これは、キャプチャされた MIDI データに対して行われるのと同じように行われます。これにより、実際の楽器、歌声、または MIDI データがないものを評価できます。
- **`view_spectrogram`** — 音を視覚化します。ピアノのキーボードが左端に配置された、一定の Q 値を持つスペクトログラムです。これにより、音程を一目で確認でき、曲の意図されたノートを必要に応じて重ねて表示できます。

**この機能では、以下のことはわかりません。** この画像は、どこに問題があるかを見つけるためのものです。すべての数値は、信号処理から得られたものであり、モデルが画像を読み取って判断したものではありません。トランスクライバーは、一度に 1 行を処理するため、コードや複数の音源が混ざった音を処理すると、確信を持って誤った結果を生成することがあります。また、その旨も表示されます。最新の技術では、音の開始点の検出精度は約 88% です。したがって、「見逃された」ノートは、あなたが演奏しなかったノートではなく、トランスクライバーが聞き取れなかったノートである可能性があります。これらのツールは、その点に注意を払い、出力にその情報を記載します。

このインターフェース全体は、依存関係がありません。変換、音程追跡、音の開始点検出、WAV デコーダー、PNG エンコーダーはすべてこのリポジトリに含まれており、Node とブラウザの両方で同じ数値を生成します。

## ライブ・アンサンブル

録音は、終了すると評価されます。これはもう一つの側面です。演奏中に、各楽器が**今、まさに**何をしているのかを尋ねます。

```
ensemble_now()
```

各楽器の保持音、その保持時間、そしてアンサンブル全体にわたる複合的なコードで回答します。デュエットの場合、2つのパートは別々に報告されるため、ピアノが三和音を保持し、シンセがその上にメロディーを演奏している様子を確認できます。

### 2つのチャンネルがあり、安価な方が正確です

これは理解する価値のある部分です。なぜなら、どの数値を信頼するかを決定するからです。

**意図 — 各エンジンに演奏するように指示されたこと。** モデルが演奏する場合、これは推測ではありません。ピアノのコードは書き起こすべきものではなく、送信された3つのノートオンです。ノートは正確で、自由で、即時的です。

**音響 — 実際に聞こえたこと。** 各エンジンは、その出力をプライベートな分析バスに分散させることができるため、すべての楽器は、分離や曖昧さなしに、ソースで測定されます。このチャンネルは**検証であり、発見ではありません**。あるパートがタイミングからずれたり、テイクが途切れたり、エンジンがノートの送信を続けているにもかかわらず沈黙したりした場合に、それを知るためのものです。

2つの結果が一致しない場合、それはレンダリングに関する事実であり、ノートの修正ではありません。

### コスト

楽器を監視するには、42.67msのブロックに対して、約**1回のオーディオコールバックあたり9マイクロ秒**かかり、これはオーディオ予算の約0.02%に相当し、サンプルが1つもドロップしない状態で測定されます。オブザーバーがアタッチされていない楽器は、まったくコストがかかりません。

### 教えてくれないこと

音響チャンネルは遅れており、その遅延量を示します。約23ms（ピッチ）、70ms（確認された発音）。なぜなら、発音は、その後のオーディオが到着するまで確認できないからです。そのエッジに近い発音は、報告される代わりに保留され、後で取り下げられます。

音響トラッカーは、一度に1つのラインを追跡するため、コードのノートを特定することはできません。また、そうしようともしません。解決できないコードは、既知の制限であり、ピアノが演奏するすべてのコードで「狼少年」のように叫ぶのではなく、アンサンブルはそれを黙って受け入れます。

## ピアノロール

ピアノロールは、AIが音楽をどのように認識するかを示しています。すべての楽曲をSVGとしてレンダリングします。右手は青、左手はコーラルで表示され、ビートグリッド、ダイナミクス、小節の境界線も表示されます。

<p align="center">
  <img src="docs/fur-elise-m1-8.svg" alt="Piano roll of Fur Elise measures 1-8, showing right hand (blue) and left hand (coral) notes" width="100%" />
</p>

<p align="center"><em>Für Elise, measures 1–8 — the E5-D#5 trill in blue, bass accompaniment in coral</em></p>

2つのカラーモード：**手**（青/コーラル）または**音階**（クロマティックレインボー - すべてのCは赤、すべてのF#はシアン）。SVG形式であるため、モデルは画像を視覚的に確認できるだけでなく、マークアップを読み込んで、音程、リズム、手の独立性を検証することもできます。

## コックピット

このリポジトリの[`apps/cockpit`](apps/cockpit)にあるブラウザベースの作曲スタジオで、**[mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit](https://mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit/)**でライブ実行できます。プラグインも、DAWも、インストールも不要です。すべてがブラウザ内で実行されます（作業内容はローカルに自動保存されます）。ハッキングしたいですか？

```bash
cd apps/cockpit && npm install && npm run dev   # Vite dev server, opens in your browser
```

- **デフォルトでは、サンプリングされたコンサートグランドピアノ** - コックピットには、トリミングされたSalamander Grandパック（90個のOGGファイル、8MB）が同梱されており、最初に操作するとロードされ、シンセボイスと同じ出力チェーンを通じて再生されます。ロードされる前（またはオフラインの場合）は、調整されたオシレーターピアノがシームレスにカバーします。サンプルは[Alexander Holm](https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html)によるもので、CC-BY 3.0です。
- **パネルモード - リスニングルーム** - 実際のライブラリのメロディーに合わせた、作曲エンジンのボイシングのブラインドペアワイズA/Bオーディション。音量調整されたクリップをオフラインでレンダリングし、実際のボイスパスで再生します。隠された最低限の試行を含む、シードされたシャッフルされた試行を行い、ブートストラップ信頼区間を使用したブラッドリー・テリーランキングを行い、正直な結果（すべてのペアが投票予算に達するまで一時的な結果、識別しきれない場合は解釈不能）を表示します。2番目のサブモードでは、ローカルのLLMジャッジを使用して同じランキングを実行し、両方の実行タイプにわたる履歴と、比較ビュー（ケンダルのτ + エンジンランクの一致）を表示します。これは、安価なプロキシが人間の真実を追跡するかどうかを尋ねます。
- **正確なビートに同期したトランスポート** - 音符は音楽的な時間で再生されるため、BPMコントロールは実際に再生時間を調整します。クリックしてシークできるタイムルーラーがあり、ドラッグして**ループ領域**を設定できます。プレイヘッドを追跡する自動スクロール機能もあります。
- **録音アームキャプチャ** - QWERTYキー、オン画面キーボード、またはWeb MIDIデバイスを再生すると、スコアに記録されます。1小節のカウントイン、ループサイクル全体にわたるルーパースタイルのオーバーダブ（または置換モード）、生のパフォーマンスタイミングを量子化されたビューの下に保存し、各パスは1つの元に戻せる単位として扱われます。
- **完全な元に戻す/やり直し** - クリアやインポートを含むすべての編集は元に戻すことができます（Ctrl+Z）。ドラッグジェスチャーは、実際の編集ツールが行うように統合されます。
- **複数選択 + クリップボード** - 選択/描画ツールの切り替えの下で、長方形選択が可能です。プラットフォーム標準の修飾キーをクリックし、コピー/カット/ペーストをプレイヘッドで行い、複製します。
- **タッチ + アクセシビリティ** - すべてのサーフェスでキャプチャされたポインターイベント、ドラッグの代替手段としてタップして再配置、キーボードでの音符編集、色覚異常でも識別しやすいスコアオーバーレイ。
- **デュアルモードピアノロール** - インストルメントモード（クロマティック音階色）とボイスモード（母音の形によって色分けされた音符：/a/ /e/ /i/ /o/ /u/）を切り替えます。
- **ビジュアルキーボード** - C4から2オクターブ、QWERTYキーボードにマッピングされています。クリックまたは入力します。
- **20個のボイスプリセット** - 15個のKokoroマッピングされたボイス（Aoede、Heart、Jessica、Sky、Eric、Fenrir、Liam、Onyx、Alice、Emma、Isabella、George、Lewis、および合唱とシンセボイス）、4個のトラクトマッピングされたボイス、および合成合唱セクション。
- **10個の楽器プリセット** - サーバー側の6つのピアノボイスに加えて、シンセパッド、オルガン、ベル、ストリングス。
- **音符インスペクター** - 任意の音符をクリックして、ベロシティ、母音、息の強さを編集します。
- **7つのチューニングシステム** - 平均律、純正律（長調/短調）、ピタゴラス音階、四分音差平均律、ヴェルクマイスターIII、またはカスタムセントオフセット。調整可能なA4基準（392〜494 Hz）。
- **チューニング監査** - 周波数テーブル、ビート周波数分析を備えたインターバルトエスター、およびチューニングのエクスポート/インポート。
- **スコアのインポート/エクスポート** - スコア全体をJSONとしてシリアライズし、ロードします。
- **LLM対応API** - `window.__cockpit`は、LLMがプログラムで作曲、編曲、再生できるように、`exportScore()`、`importScore()`、`addNote()`、`play()`、`stop()`、`panic()`、`setMode()`、および`getScore()`を公開します。

## 学習ループ

<p align="center">
  <img src="docs/learning-loop.svg" alt="The learning loop: Read (MIDI + annotations) → Play (six sound engines) → See (piano roll · guitar tab) → Reflect (practice journal), with the journal persisting so the next session picks up where the last left off" width="100%" />
</p>

## 楽曲ライブラリ

実際のMIDIファイルから作成された12のジャンルにわたる108曲の注釈付き楽曲。各ジャンルには、歴史的背景、小節ごとのハーモニー分析、重要なポイント、教育目標、および演奏のヒント（ボーカルガイダンスを含む）を備えた、詳細に注釈が付けられた模範曲が1つあります。これらの模範曲はテンプレートとして機能します。AIはまず1つを学習し、次に残りの楽曲に注釈を付けます。

**What ships, and what you fetch.** The annotations are ours and ship with every song. The MIDI files were downloaded from public MIDI sites when the library was built, and a per-file provenance audit ([`docs/findings/library-provenance-audit.md`](docs/findings/library-provenance-audit.md)) found that only 14 of them carry a licence that permits redistribution — Bernd Krueger's piano-midi.de arrangements (CC-BY-SA-3.0-DE) and the Mutopia Project's public-domain typesettings. Those 14 are in the npm package. The other 94 are not: their `.json` ships, with a `provenance` block naming the source, its terms and the file's SHA-256, and `ai-jam-sessions library fetch --accept-source-terms` downloads each one from the site that published it, under that site's terms, refusing any file whose hash no longer matches what the annotations were verified against. Twelve files that turned out to be a different piece than their name were quarantined, which is why the count is 108 and not the 120 earlier versions claimed. Versions before this one shipped all 120 MIDI files; that was a mistake, and it is corrected here rather than papered over.

| ジャンル | 模範 | キー | 教える内容 |
|-------|----------|-----|-----------------|
| ブルース | The Thrill Is Gone (B.B. King) | Bマイナー | マイナーブルース形式、コール＆レスポンス、ビートの後ろで演奏 |
| クラシック | Für Elise (ベートーヴェン) | Aマイナー | ロンド形式、タッチの使い分け、ペダルの練習 |
| 映画 | Comptine d'un autre été (ティエルセン) | Eマイナー | アルペジオのテクスチャ、ハーモニーの変化なしのダイナミックなアーキテクチャ |
| フォーク | Greensleeves | Eマイナー | 3/4ワルツのリズム、モーダルミクスチャー、ルネサンス様式のボーカルスタイル |
| ジャズ | Autumn Leaves (コスマ) | Gマイナー | ii-V-I進行、ガイドトーン、スウィングの8分音符、ルートレスボイシング |
| ラテン | The Girl from Ipanema (ジョビン) | Fメジャー | ボサノバリズム、クロマチックモジュレーション、抑制されたボーカル |
| ニューエイジ | River Flows in You (イルマ) | Aメジャー | I-V-vi-IVの認識、流れるようなアルペジオ、ルバート |
| ポップ | Imagine (レノン) | Cメジャー | アルペジオによる伴奏、抑制、誠実なボーカル |
| ラグタイム | The Entertainer (ジョプリン) | Cメジャー | オーム・パーベース、シンコペーション、多重セクション形式、テンポの練習 |
| R&B | Superstition (スティービー・ワンダー) | Ebマイナー | 16分音符のファンク、打楽器のようなキーボード、ゴーストノート |
| ロック | Your Song (エルトン・ジョン) | Ebメジャー | ピアノバラードのボイスリーディング、転回形、会話のような歌い方 |
| ソウル | Lean on Me (ビル・ウィザース) | Cメジャー | ダイアトニックメロディー、ゴスペル伴奏、コール＆レスポンス |

Songs progress from **raw** (MIDI only) → **annotated** → **ready** (fully playable with musical language). The AI promotes songs by studying them and writing annotations with `annotate_song`.

## サウンドエンジン

6つのエンジンと、任意の2つを同時に実行できるレイヤードコンビネーターがあります。

| エンジン | タイプ | 音 |
|--------|------|---------------------|
| **Oscillator Piano** | 加算合成 | ハンマーノイズ、不協和性、ベロシティによって変化する明るさ、48ボイスのポリフォニー、ステレオイメージを備えた、多重ハーモニックピアノ。依存関係はありません。 |
| **Sample Piano** | サンプル再生 | サラマンダー・グランドピアノ — 本物です。**パックがインストールされている場合は、デフォルトのエンジン**（`samples/AccurateSalamander`または`AI_JAM_SAMPLES_DIR`）です。npm tarballはサンプルを含まないため、[Salamander](https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html)のダウンロードを提供します。ブラウザのコックピットには、独自の8MBパック（90個のOGG、CC-BY 3.0 Alexander Holm）が付属しており、Web上ではセットアップは不要です。 |
| **Vocal (Sample)** | ピッチシフトされたサンプル | ポルタメントとレガートモードを備えた、持続する母音の音。 |
| **Vocal Tract** | 物理モデル | ピンク・トロンボーン — LFの喉頭波形を44セルのデジタル波導管に通します。4つのプリセット：ソプラノ、アルト、テノール、バス。 |
| **Vocal Synth** | 加算合成 | 15のKokoroボイスプリセット（フォルマントシェイピング、息遣い、ビブラート付き）。決定論的（シードされた乱数ジェネレーター）。 |
| **Guitar** | 加算合成 | 物理的にモデリングされた、はじかれた弦 — 4つのプリセット（スチール・ドレッドノート、ナイロン・クラシック、ジャズ・アーチトップ、12弦）、8つのチューニング、17の調整可能なパラメーター。 |
| **Layered** | コンビネーター | 2つのエンジンをラップし、すべてのMIDIイベントを両方に送信します — ピアノ+シンセ、ボーカル+シンセなど。 |

### キーボードボイス

6つの調整可能なピアノボイス。それぞれ、明るさ、減衰、ハンマーの硬さ、デチューン、ステレオ幅など、パラメーターごとに調整できます。

| ボイス | 特徴 |
|-------|-----------|
| コンサートグランド | 豊かで、フルで、クラシック |
| アップライト | 暖かく、親密で、フォーク |
| エレクトリックピアノ | 滑らかで、ジャジーで、フェンダー・ローズの雰囲気 |
| ホンキートンク | デチューンされ、ラグタイム、酒場 |
| オルゴール | クリスタル、エーテル |
| ブライトグランド | シャープで、現代的で、ポップ |

### ギターボイス

物理的にモデリングされた弦の合成を備えた4つのギターボイスプリセット。それぞれに17の調整可能なパラメーター（明るさ、ボディの共鳴、ピッキング位置、弦のダンピングなど）があります。

| ボイス | 特徴 |
|-------|-----------|
| スチール・ドレッドノート | 明るく、バランスが取れており、クラシックなアコースティック |
| ナイロン・クラシック | 暖かく、柔らかく、丸みを帯びている |
| ジャズ・アーチトップ | メロウで、木質で、クリーン |
| 12弦 | きらめき、倍音、コーラスのような |

## 練習日誌

セッションのたびに、サーバーは発生したことを記録します — どの曲、どの速度、何小節、どれくらいの時間。AIは、何に気づいたか、どのようなパターンを認識したか、次に何を試すべきかなど、独自の考察を追加します。

```markdown
---
### 14:32 — Autumn Leaves
**jazz** | intermediate | G minor | 69 BPM × 0.7 | 32/32 measures | 45s

The ii-V-I in bars 5-8 (Cm7-F7-BbMaj7) is the same gravity as the V-i
in The Thrill Is Gone, just in major. Blues and jazz share more than the
genre labels suggest.

Next: try at full speed. Compare the Ipanema bridge modulation with this.
---
```

1日あたり1つのマークダウンファイル。`~/.ai-jam-sessions/journal/`に保存されます。人間が読める形式で、追記のみ可能です。次のセッションでは、AIは日誌を読み、中断したところから再開します。

## トレーニングデータセット

**jam-actions-v0** — クラシックピアノMIDIに基づいた、複数ターンのMCPツール使用のトレースのパブリックデータセット。このサーバーで使用されているライブラリから作成されたデータセットは、LLMに**シンボリック音楽におけるグラウンデッドツール使用**を教えます — 単なるテキスト生成ではありません。

各レコードは、4小節のフレーズウィンドウと、注釈付きの教育目標、および「目標トレース」をペアにします。これは、アシスタントが上記のMCPツール（`get_events_in_measure`、`get_events_in_hand`、`count_distinct_pitch_classes`、およびその他の9つのMIDIインスペクターツール）を使用して、フレーズを読み、分析し、議論する、ターンごとに実行されるセッションです。

| | |
|---|---|
| バージョン | **0.6.0（2026年9月25日）—修正リリース**（下記参照） |
| レコード | 57（公開サブセット）：トレーニング用45件、保留中のテスト用12件（`clair-de-lune`） |
| 楽曲 | 4つのクラシックピアノ曲：バッハBWV 846、モーツァルトK. 545 I、ベートーヴェン「エリーゼのために」、ドビュッシー「月の光」 |
| MIDIソース | piano-midi.de — ベン・クルーガー編曲、各ファイルにはクルーガー自身の著作権表示が含まれています。 |
| ライセンス | パブリックドメインの楽曲に対するCC-BY-SA-3.0-DE（編曲） |
| 場所 | [`mcp-tool-shop/jam-actions-v0`](https://huggingface.co/datasets/mcp-tool-shop/jam-actions-v0) on Hugging Face and on Zenodo; DOIs and citation in the [dataset card](datasets/jam-actions-v0-public/README.md) and [`CITATION.cff`](datasets/jam-actions-v0-public/CITATION.cff) |

**0.6.0の修正。**バージョン0.4.xと0.5.xには、合計8曲にわたる115件のレコードが含まれており、すべてベン・クルーガーによるものとされています。この帰属は、ファイルではなく、piano-midi.deの作曲家ページに対して確認されました。MIDIバイトから楽曲ライブラリを監査したところ、ショパンのノクターンOp. 9 No. 2とプレリュードOp. 28 No. 4、ベートーヴェンの「悲愴」II、シューマンの「トロイメライ」の4曲が、midiworld.comとbitmidi.comから取得したファイルに基づいて作成されており、確立された編曲ライセンスがないことが判明しました。これらの58件のレコードには、その編曲が音符ごと含まれているため、0.6.0ではそれらを削除します。残りの57件のレコードは、0.5.0とバイト単位で同一です。以前のバージョンから削除されたレコードを再配布しないでください。詳細については、[`docs/findings/published-dataset-licence-audit.md`](docs/findings/published-dataset-licence-audit.md)を参照してください。

**エビデンスゲート。**パッケージャは、各楽曲のライブラリプロビナンスブロックをMIDIバイトから再導出し、再読み込みし、再配布可能な編曲ライセンスがない楽曲、またはソースファイルのハッシュがエビデンスのあるファイルと異なるレコードを拒否します。フェイルセーフで動作します。テストは、コミットされた公開されたパッケージごとに同じチェックを再実行するため、後続のプロビナンスの変更は、公開されたセット自体でビルドを赤色にします。

**品質ストーリー—7軸リリースゲート。**データセットのリリースゲートは、エビデンスに基づいた合格と、上限に達した合格を区別します。軸1〜6はブロック（絶対的な下限、マージン複合、ツール使用率、ツール使用後の修正、誤解の数、層の下限）であり、軸7はエンリッチド対非エンリッチドのレポートです。記録された結果は、0.4.xと0.5.xの115件のレコードで測定され、タグ`jam-actions-v0-0.5.0-cut-2026-07-11`から再現可能です。0.6.0では再測定されていません。

**再現性。**あらゆるプラットフォーム（Windowsネイティブ、macOS、Linux、WSL）上の新しいコントリビューターは、パッケージを検証し、再ビルドできます。

```bash
git clone https://github.com/mcp-tool-shop-org/ai-jam-sessions.git
cd ai-jam-sessions && pnpm install
pnpm exec tsx scripts/verify-public-package-checksums.ts                        # every file accounted for
pnpm exec tsx scripts/package-jam-actions-public.ts --today 2026-09-25 --dry-run # evidence gate runs first
pnpm build && pnpm exec tsx scripts/verify-public-package-execution.ts
# → "VERDICT: PASS" — every frozen tool call replays live (needs an audio device)
```

`.gitattributes`は、LF行末を`*.sha256`とパブリックデータセットツリーに固定し、チェックサム検証がすべてのプラットフォームで機能するようにします。

**微調整履歴。**データセットの主張は、事前に登録された微調整でテストされ、密閉されたベースラインに対してスコアリングされました。**v0**（78件のジャムトレースのみ）は、正直な否定を返しました（[レポート](docs/finetune-arc-eval-report.md））。**v1**は、ツールに基づいたQAを+0.202改善しましたが、事前に登録された目標を1つのペアで下回りました（[レポート](docs/finetune-arc-v1-eval-report.md））。**B-1**は、36件のレコードのコホートで、凍結されたv1アダプターを再テストしました。0.678 → 0.890、36件中29件のペアで、事前に設定された24/34の目標を上回りました（[レポート](docs/finetune-arc-v2-b1-eval-report.md））。これらの測定値は、記録されたとおりに維持されます。**アダプター自体は削除されました。**そのトレーニングデータには、削除された4つの楽曲のレコードが含まれているため、このデータセットの条件の下で提供することはできません。ライセンスがクリアされた素材のみでトレーニングされたアダプターは、`jam-actions-v1`データセットとともに公開されます。

> MIDIの編曲は、ベン・クルーガー（piano-midi.de）によるもので、ライセンスはCC-BY-SA-3.0-DEです。注釈、トレース、および評価アーティファクトは、AI Jam Sessionsチームによって作成され、同じライセンスで公開されるため、共有ライセンスチェーンは最初から最後まで維持されます。**ライセンス境界：**リポジトリのMITライセンスはコードを対象とし、`datasets/`の下にあるものはすべてCC-BY-SA-3.0-DEです。`datasets/jam-actions-v0/`にある作業コーパスには、公開されていないレコードも含まれています。それは、プロビナンスが検証されなかった2つの楽曲（サティのジムノペディNo. 1、ドビュッシーのアラベスクNo. 1）と、0.6.0で削除された4つの楽曲です。詳細については、[`datasets/jam-actions-v0/PROVENANCE-NOTE.md`](datasets/jam-actions-v0/PROVENANCE-NOTE.md)を参照してください。

### 音響コーパス

**jam-actions-acoustic-v0** — 上記のトレースに対応するもので、**オーディオ**ではなく、シンボリック音楽を対象としています。108件のレコードがあり、それぞれが、意図的に変更されたパブリックドメインのフレーズの合成レンダリングと、分析ツールが実際に返す結果をペアリングしています。そのため、すべてのラベルは、それ自体に対してのみではなく、楽器に対しても検証されます。

| | |
|---|---|
| バージョン | 1.1.0（2026年9月25日）—1.0.xの36件の「トロイメライ」レコードを削除しました。これらのレコードのソースファイルには、確立された編曲ライセンスがありません。 |
| レコード | 72 — 2つのフレーズ（バッハ、エリーゼのために）× 9種類の摂動× 4つのターゲットノート |
| 除外 | **フレーズ**（エリーゼのために）ごとに行われるため、同じメロディーの変更されたバージョンがリークすることはありません。 |
| クラス | 一致、ピッチの失敗/警告、タイミングの失敗/合格、見逃し、追加、適切なビブラート、評価するものが何もない沈黙 |
| オーディオ | 配布なし — 各レコードには、決定論的なレシピと、生成される波形のSHA-256が含まれています。 |
| スキーマ | `jam-actions-acoustic-v0/1.0.0` |

9つのクラスのうち2つは、単純なモデルが自信を持って誤った回答をするため存在します。正しい結果が*適切なビブラート*であるビブラートノートと、正しい結果が*評価するものが何もない*である沈黙です。結果が依存するすべての閾値はレコードにコピーされます。なぜなら、それらはビルド中に一度変更されたからです。

このリポジトリからコーパスを再現できます。再生成すると、公開されているすべての115個のファイルと、バイト単位で同一の`checksums.sha256`が生成され、テストによってそれが正確に検証されます。ただし、公開されたツリーは書き込まれません。

**1つの注意点。仮定するのではなく、測定します。** 各レコードには、そのレシピが生成する波形のハッシュである`wav_sha256`が含まれており、レンダラーはサンプルごとに1回、`Math.pow`と`Math.sin`を呼び出します。
どちらも正しく丸められる必要はなく、V8の結果はNode 22とNode 24の間で変化しました。このコーパスが評価する27,869個の異なる`Math.pow(2, x)`引数のうち、253個は異なるdouble値を返します。そのほとんどは16ビットの量子化の下で消えますが、**108個のレコードのうち2個** — どちらも、そのモチーフが半音の比率自体が異なるピッチにある「エリーゼのために」の`extra`の変更 — は、Node 24で異なるハッシュ値を持ちます。すべてのレコードの他のすべてのフィールドは、どのエンジンでも再現され、リポジトリは両方の主張を別々にテストします。再レンダリングして、これらの2つが一致しない場合は、それはこの問題であり、ダウンロードが破損しているわけではありません。波形をビットポータブルにするには、超越関数を置き換える必要があります。これにより、すべてのハッシュが変更されるため、新しいスキーマバージョンが必要になります。

### 独自のものをビルドする

コーパスが実行されるための足場は、独自の実験に使用できます。
[`experiments/_template/`](experiments/_template/)は、コピーできる動作する例です。タスクを宣言すると、SFT形式、クラスごとのスコアリング、宣言された結果セットに対する単純なベースライン、およびホールドアウトユニットが分割をまたがないかのチェックが得られます。

[契約](experiments/_template/README.md)は、読む価値のある部分です。正解は、手書きではなく、構築可能であり、ラベルはツールが測定する内容に対して検証され、リークするユニットで分割し、ベースラインとベースモデルを結果の横に報告します。これらのルールそれぞれに、学習コストがかかります。

## インストール

```bash
npm install -g @mcptoolshop/ai-jam-sessions
```

**Node.js 22+**が必要です（v2.0.0では、`node-web-audio-api`2.0で下限を引き上げました）。MIDIドライバ、仮想ポート、外部ソフトウェアは必要ありません。

### Claude Desktop / Claude Code

```json
{
  "mcpServers": {
    "ai_jam_sessions": {
      "command": "npx",
      "args": ["-y", "-p", "@mcptoolshop/ai-jam-sessions", "ai-jam-sessions-mcp"]
    }
  }
}
```

### Docker

すべてのリリースでは、MCPサーバーをstdioで実行する、軽量なイメージである`ghcr.io/mcp-tool-shop-org/ai-jam-sessions`も公開されます。知っておくべきことは、`/data`がメモリであるということです。ジャーナル、サーバー状態、ユーザーの楽曲、およびフェッチされたMIDIはすべてそこに保存されるため、ボリュームをマウントしないと、コンテナが終了します。

```json
{
  "mcpServers": {
    "ai_jam_sessions": {
      "command": "docker",
      "args": ["run", "--rm", "-i", "-v", "ai-jam-data:/data", "ghcr.io/mcp-tool-shop-org/ai-jam-sessions"]
    }
  }
}
```

このイメージには、再配布可能な14個のMIDIファイルが含まれています。`library fetch --accept-source-terms`をコンテナ内で一度実行すると、残りの94個のファイルがボリュームに配置されます。`docker compose up`は、名前付きボリュームを使用して同じことを行い、`--profile ollama`はOllamaサイドカーを追加します。詳細、イメージ内のCLI、および意図的に含まれていないものについては、[docs/docker.md](docs/docker.md)を参照してください。微調整されたグレーダーをOllamaで実行し、4ビットベースの測定コストを測定します。[docs/ollama-adapters.md](docs/ollama-adapters.md)を参照してください。

## MCPツール

8つのカテゴリにわたる54個のツールと4つのプロンプトテンプレート

### 学習

| ツール | そのツールの機能 |
|------|--------------|
| `list_songs` | ジャンル、難易度、またはキーワードで参照 |
| `song_info` | 詳細な楽曲分析 — 構成、重要な部分、指導目標、演奏のヒント |
| `registry_stats` | ライブラリ全体の統計：総楽曲数、ジャンル、難易度 |
| `list_measures` | 各小節の音符、ダイナミクス、および指導に関する注釈 |
| `teaching_note` | 単一の小節の詳細な分析 — 指の配置、ダイナミクス、文脈 |
| `suggest_song` | ジャンル、難易度、および過去の演奏に基づいて推奨 |
| `practice_setup` | 楽曲に対する推奨速度、モード、ボイス設定、およびCLIコマンド |
| `compare_songs` | クロスジャンルのパターン認識 — 重要な関係、音高/インターバルの類似性、共通の形式、指導のつながり |
| `annotation_progress` | ライブラリ全体の楽曲の注釈品質 — スコア、評価、および改善の提案 |
| `server_info` | サーバーバージョン、ライブラリ統計、エンジンリスト、アクティブなセッション |

### 再生

| ツール | そのツールの機能 |
|------|--------------|
| `play_song` | スピーカーから再生 — ライブラリの楽曲または生の.midファイル。4つのエンジン（ピアノ、ボーカル、トラクト、ギター）、任意の速度、モード、小節範囲 — さらに、開始時のカウントと、セッションを録音するための`record`フラグを備えたメトロノーム。シンセサイザーとレイヤードエンジンはCLIのみで使用可能。 |
| `stop_playback` | 停止 |
| `pause_playback` | 一時停止または再開 |
| `set_speed` | 再生中に速度を変更（0.1倍〜4.0倍） |
| `playback_status` | リアルタイムのスナップショット：現在の小節、テンポ、速度、キーボードのボイス、状態 |
| `view_piano_roll` | SVG形式でレンダリング（手の色または音階に基づく彩虹色） |
| `score_performance` | MIDI伴奏の演奏を評価 — 音程の正確さ、タイミング、完全性、および段階的なフィードバック |
| `mute_hand` | 練習中に左手/右手の音をミュートまたはミュート解除 — 一度に片方の手だけを分離 |
| `detect_chord` | 現在鳴っているMIDIノートのセットからコード名を特定（例：`[60,64,67]` → C） |
| `preview_teaching_cues` | 演奏前に、すべての指導に関する注釈と重要な部分を確認 |

### 練習

| ツール | そのツールの機能 |
|------|--------------|
| `practice_loop` | 実際の教師が割り当てる練習：5〜8小節を遅くループし、*完璧に*演奏できた場合にのみテンポを上げ（+5%） — 各演奏を録音、評価、および要約。 |
| `practice_status` | 練習の進捗状況：現在の演奏、速度、および最後の演奏の小節ごとの診断 |
| `score_last_take` | 最近録音された演奏を評価 — 音程の正確さ、タイミング、完全性、および音符ごとの評価 |
| `view_scored_piano_roll` | すべての教師が使用する、注釈が追加された楽譜：ピアノロールに、色覚異常でも識別しやすいパレットで音符ごとの評価を重ねて表示（実線＝正しい、破線＝タイミング、✕＝ミス） |

### 歌う

| ツール | そのツールの機能 |
|------|--------------|
| `sing_along` | 歌えるテキスト — 音名、ソルフーゲ、音程の動き、または音節。ピアノ伴奏の有無。 |
| `ai_jam_sessions` | 再解釈のためのコード進行、メロディーの概要、およびスタイルのヒントを生成 |
| `verify_harmony` | メーカーループの検証ゲート：提案されたコードの再構成は、プラットフォーム独自の決定論的ツールによってチェックされる — コードの忠実性（コードエンジンは、意図されたすべてのコードを検出する必要がある）、メロディーの調和性（音/緊張/半音）、ベースのボイスリーディング、キーのメンバーシップ |
| `auto_reharmonize` | 1回の操作でメーカーループを実行：ローカルモデルがコードの再構成を提案し、`verify_harmony`の決定論的ゲートがすべてのボイシングをチェックし、検証された解釈が得られるまで、n個の中から最適なものを選択 |
| `compose_panel` | 任意の楽曲でボイスリーディングの作曲パネルを実行：4つのシステムが伴奏を作成し、ブラインドクロスファミリーLLMがそれらを評価し、ブラッドリー・テリー法で集計 — 解釈不可能な演奏を無効にする識別閾値ゲート（方向性のある信号のみ、品質スコアはなし）。数分間実行し、進行状況をストリームで通知しながら動作する。 |

**クロックに合わせて歌う歌声 — ボーカルルート。** ライブラリ内の任意の曲に、ピアノに合わせて再生される実際の歌声を付加できます。**スコアクロック**（`scripts/build-score-clock.mjs`）は、曲の MIDI から、各音節の音程、開始点、持続時間を、プレイヤー自身のタイムライン上で抽出します。ローカルの Apache-2.0 ライセンスの、スコアに沿った歌声生成モデル（[SoulX-Singer](https://github.com/Soul-AILab/SoulX-Singer)）が、そのクロックに基づいて歌声を生成します。そして、2 つのゲートが、最終的なミックスとして出力される前に、その歌声を測定します。**タイミング**：すべての母音の開始点が、スコアから 40 ミリ秒以内であること。**音程**：すべてのノートが 50 セント以内であり、全体的な音程のずれが 20 セント以内であること。単語は、録音された歌声の断片から選択され、単語の境界でのみクロスフェードを使用して結合されます。調整可能なパラメータ：`--track`（どの MIDI トラックが曲であるか、確認用）、`--list-tracks`、`--lyrics "A-ma-zing grace …"`（1 つのノートにつき 1 つのトークン、音節は `-` で結合）、`--measures`、プロンプトクリップ（声）、録音回数、およびゲートの閾値。それぞれについて、`scripts/vocal_clock.py` に引用が記載されています。ルート、調整可能なパラメータ、および結果：[ハンドブック → ボーカル](https://mcp-tool-shop-org.github.io/ai-jam-sessions/handbook/vocals/)、[`docs/vocal-clock.md`](docs/vocal-clock.md)。この選択の背後にある研究：[`docs/vocal-singing-study-2026-09.md`](docs/vocal-singing-study-2026-09.md)。

### ギター

| ツール | そのツールの機能 |
|------|--------------|
| `view_guitar_tab` | インタラクティブなギタータブ譜をHTMLとしてレンダリング — クリックして編集、再生カーソル、キーボードショートカット |
| `list_guitar_voices` | 利用可能なギターボイスプリセット |
| `list_guitar_tunings` | 利用可能なギターチューニングシステム（標準、ドロップD、オープンG、DADGADなど） |
| `tune_guitar` | 任意のギターボイスの任意のパラメーターを調整。セッション間で保持。 |
| `get_guitar_config` | 現在のギターボイス設定と工場出荷時のデフォルト |
| `reset_guitar` | ギターボイスを工場出荷時の状態にリセット |

### ビルド

| ツール | そのツールの機能 |
|------|--------------|
| `add_song` | JSON形式で新しい楽曲を追加 |
| `import_midi` | メタデータを含む.midファイルをインポート |
| `annotate_song` | 生の楽曲の音楽言語を作成し、準備完了の状態にする |
| `save_practice_note` | 自動的にセッションデータをキャプチャしたジャーナルエントリ |
| `read_practice_journal` | コンテキストのために最近のエントリをロード |
| `list_keyboards` | 利用可能なキーボードボイス |
| `tune_keyboard` | 任意のキーボードボイスの任意のパラメーターを調整。セッション間で保持。 |
| `get_keyboard_config` | 現在の設定と工場出荷時のデフォルト |
| `reset_keyboard` | キーボードボイスを工場出荷時の状態にリセット |
| `score_annotation` | 5つの次元（完全性、深さ、具体性、指導価値、語彙）にわたるスコアの注釈品質 |
| `validate_song_entry` | 楽曲を追加する前に、楽曲のJSONをスキーマに対して検証 |
| `transpose_song` | 楽曲を半音単位で上下に転調 — 新しいキー、新しい音符 |
| `list_sections` | 楽曲の構造セクションを表示（イントロ、ヴァース、コーラスなど） |
| `add_section` | 構造的なナビゲーションのために、楽曲にセクションマーカーを追加 |

### スコア

| ツール | そのツールの機能 |
|------|--------------|
| `score_performance` | ライブラリの曲に対して、MIDIの伴奏をスコアリングします。ピッチ、タイミング、完全性、段階的なフィードバック。 |
| `score_annotation` | 5つの次元にわたる注釈の品質をスコアリングします。 |

### 聞く

録音されたオーディオを測定します。モノフォニック：一度に1つのラインを追跡するため、コードやフルミックスは、自信を持ってナンセンスな結果を生成します。すべての数値は、モデルが画像を読むのではなく、信号処理から得られます。

| ツール | そのツールの機能 |
|------|--------------|
| `analyze_audio` | WAVファイルを測定します。発音時間、ノート名とセントで表されるピッチの輪郭、レベル。 |
| `transcribe_audio` | 単音の録音を音符に変換し、各音符が基準音からどれだけずれているかを表示します。トラッカーが追跡できなかった音符は、推測するのではなく省略されます。 |
| `score_audio_take` | 既存の楽曲ライブラリの楽曲と比較して、演奏を「耳で」評価し、その結果を`view_scored_piano_roll`に渡します。 |
| `view_spectrogram` | 音を視覚化します。ピアノの鍵盤を軸とした定Qスペクトログラムを、必要に応じて意図された音符と重ねて表示します。デフォルトでは表示をオフにします。 |
| `ensemble_now` | 演奏中に、各楽器が「今、まさに」演奏している音を把握します。音符は送信された情報から生成されるため、推定値ではなく正確な値となります。 |

### MCPプロンプト

構造化された指導ワークフローのための4つのプロンプトテンプレート：

| プロンプト | そのツールの機能 |
|--------|--------------|
| `annotate_song` | ガイド付きの注釈ワークフロー — 模範を研究し、生の楽曲の音楽言語を作成 |
| `practice_plan` | ジャンル、難易度、および目標に基づいて、構造化された練習計画を作成 |
| `performance_review` | 完了したセッションを確認 — 良かった点、次に焦点を当てるべき点 |
| `maker_loop` | 完全なメーカーループを実行 — コードの再構成を提案し、プラットフォームの決定論的ツールで検証し、次に検証された結果を追加して再生 |

## CLI

```
ai-jam-sessions list [--genre <genre>] [--difficulty <level>]
ai-jam-sessions play <song-id> [--speed <mult>] [--mode <mode>] [--engine <piano|vocal|tract|synth|guitar|piano+synth|guitar+synth>] [--metronome] [--count-in <bars>] [--record]
ai-jam-sessions practice <song-id> --measures <start-end> [--start-speed <pct>] [--target <pct>] [--step <pct>]
ai-jam-sessions sing <song-id> [--with-piano] [--engine <engine>]
ai-jam-sessions view <song-id> [--measures <start-end>] [--out <file.svg>]
ai-jam-sessions view-guitar <song-id> [--measures <start-end>] [--tuning <tuning>]
ai-jam-sessions info <song-id>
ai-jam-sessions tune <keyboard-id> [--param value ...] [--reset] [--show]
ai-jam-sessions tune-guitar <voice-id> [--param value ...] [--reset] [--show]
ai-jam-sessions keyboards
ai-jam-sessions guitars
ai-jam-sessions stats
ai-jam-sessions library
ai-jam-sessions ports
ai-jam-sessions help
ai-jam-sessions --version
```

## ステータス

**v2.6.0 — the release that stops shipping what it had no licence to ship** (see [CHANGELOG](CHANGELOG.md)).
A per-file provenance audit of the song library found that of the 108 MIDI arrangements, 14 carry a
licence that permits redistribution and 94 do not — and that twelve files were a different piece
than their name. Every song now carries an evidence-backed `provenance` block (source URL, the
site's terms, the arranger as the file's own copyright event names them, SHA-256, title verdict);
the twelve are quarantined; the npm package ships the 14 and marks the rest *unfetched*, and
`ai-jam-sessions library fetch --accept-source-terms` downloads each from the site that published
it, under that site's terms, refusing any file whose hash no longer matches. Earlier versions shipped
all 120 files and are deprecated on npm. The same audit reset the jam-actions-v1 dataset to the
eleven songs whose arrangements are verified (three Krueger CC-BY-SA-3.0-DE, eight Mutopia Public
Domain); the corpus, its near-gate probe and the training arc that found the shown-work target — a
3B rank-16 LoRA at one unchanged recipe going from a class prior to 54/54 held-out and 72/72 near
the gate once the assistant turn wrote the digits of the comparison — are in the repo under
`datasets/` and `experiments/coverage-v1-sft/`, with publication to Hugging Face and Zenodo to
follow from the verified corpus. Also in this release: `scorePerformance` caps the correct window
at the caller's gate, so the 40 ms house rule is exactly the verdict window.

**v2.5.0 — モデルがバンドの演奏を「見る」ことができるようになったリリース**（[CHANGELOG](CHANGELOG.md)を参照）。
`ensemble_now`は、演奏中に各楽器が演奏している内容（保持されている音符、各音符の保持時間、および組み合わせられたコード）を報告します。2つのチャンネルで動作し、安価な方が正確です。このサーバーは、送信した内容を正確に把握しているため、コードは3つのノートオンとして表現され、トランスクリプションの問題ではありません。また、別の音響タップが各楽器の音源を測定し、検証を行います。測定コストは約**9マイクロ秒/オーディオコールバック**です。遅延は明示的に示されます（約23msのピッチ、約70msの確実な発音）。制限は文書化されており、対応可能です。トラッカーは単音であり、レイヤー化された音は個別にタップされ、ミックスとしてタップされることはありません。また、タップされていない楽器は、無音の楽器ではありません。
同じリリースでは、データセットの仕組みを、誰でも利用できる契約に変換し、サンプルテンプレートを提供することで、ユーザーが独自のコーパスを構築し、同じ基準で独自のアダプターをトレーニングできるようにしました。その過程で、音響コーパスの再現性の検証を行ったところ、115件の公開されたパスのうち109件がカバーされていることがわかりました。また、残りの6件のうち3件は、ジェネレーターによってまったく出力されなかったことが判明し、再生成によって削除されました。完全な再生成により、すべてのファイルとチェックサムマニフェストがバイト単位で完全に再現されます。ライブ環境には、**54のツールと4つのプロンプトテンプレート**があり、**165個のファイルで3,389個のテストが合格し（1個はスキップ）**しています。

以前のv2.4.0では、モデルに「耳」が与えられました。4つのツールが、オーディオのレンダリングと分析の間のギャップを埋めました。`analyze_audio`は、発音、ピッチの輪郭、およびレベルを処理します。
`transcribe_audio`は、単音の録音を音符に変換します。
`score_audio_take`は、演奏を「耳で」評価し、その結果を既存のスコアリングされたピアノロールにそのまま渡します。
`view_spectrogram`は、音を定Q、ピアノの鍵盤を軸としたグラフで表示します。これらはすべて、このリポジトリに記述された依存関係のない信号処理であり、独自のFFT、ウィンドウ、メルおよび定Q変換、発音検出、およびピッチ追跡を使用しています。モデルは、画像を信頼して目で確認することはできず、正確な答えが必要な質問に対しては、決定的なクエリが推論よりも優れているためです。このリリースでは、**jam-actions-acoustic-v0**、108件のオーディオに対するツールの使用方法のサンプルデータも公開されました。

**v2.3.0 — 楽器がクロックに合わせて歌うことを学習したリリース**（[CHANGELOG](CHANGELOG.md) を参照）。ライブラリ内の任意の曲に、ピアノに合わせて再生される実際の歌声を付加できるようになりました。**スコアクロック**は、曲の MIDI から、各音節の音程、開始点、持続時間を、プレイヤー自身のタイムライン上で抽出します。ローカルの Apache-2.0 ライセンスの、スコアに沿った歌声生成モデル（[SoulX-Singer](https://github.com/Soul-AILab/SoulX-Singer)）が、そのクロックに基づいて歌声を生成します。そして、2 つのゲートが、最終的なミックスとして出力される前に、その歌声を測定します。タイミング（すべての母音は、スコアから 40 ミリ秒以内）、音程（すべてのノートは 50 セント以内）。配信される Amazing Grace の録音では、最悪のタイミングのずれが 6 ミリ秒、全体の音程のずれが -2.7 セントであり、その結果はコミットされています。ランディングページには、正直な状態として表示されており、残っている唯一の欠陥（冒頭のスプライス）も明記されています。ルート、調整可能なパラメータ、および各選択の背後にある研究（5 つの研究分野、引用付き）は、[ハンドブック](https://mcp-tool-shop-org.github.io/ai-jam-sessions/handbook/vocals/) と [`docs/`](docs/) に記載されています。ライブインターフェースは変更されておらず、**49 個のツールと 4 つのプロンプトテンプレート**があり、**3,080 個のテストが合格（1 個はスキップ）**し、さらにボーカル楽器自身の pytest スイートがあります。**公開状態**：公開済み — [`@mcptoolshop/ai-jam-sessions@2.3.0`](https://www.npmjs.com/package/@mcptoolshop/ai-jam-sessions) で npm に公開され、プロビナンスが証明されています。

以前のバージョン2.2.0では、この楽器に実際に音を出すためのスピーカーと、音を聴くための部屋が追加されました。コックピットのデフォルトのピアノは、現在「サンプリングされたコンサートグランドピアノ」です。これは、起動時に読み込まれ、準備が整うまでは調整されたオシレーターシンセに切り替わる、最適化されたSalamanderパックです。また、サーバーは、完全なパックがインストールされた場合に、自動的にサンプルエンジンを選択します。「コンポジションパネル」がその上に配置されています。これは、人間の耳で聴き、理論的に妥当なものとそうでないものとを比較して、コンポジションエンジンの音色を評価する、ブラインドテストと音量調整がされたA/B比較用の部屋です（ブートストラップCIを使用したBradley-Terry法、MUSHRAスタイルの識別閾値、一次的な結果として「仮」および「解釈不能」を使用）。これに加えて、ローカルモデルパネルがあり、クロスファミリーLLMを使用して同じランキングを実行し、「比較」ビュー（Kendall τ）では、簡略化されたプロキシが人間の判断と一致するかどうかを評価します。

今回のリリースには、パネルに音響効果を与えるコンポジションエンジン（`src/compose/`：名前付きのスタイルプリセット、構成によるボイシング仕様、パートごとに処理を行うリファイナーを備えた、決定的なボイスリーディングゲート）が含まれています。また、完全な品質改善（45件の不具合を修正：セキュリティの強化、より自然な表現の文字列、視覚的な修正による外観の維持）、Mutopiaのパブリックドメインのデータから再構成されたサティとドビュッシーのライブラリのエントリー、および、より堅牢なテスト（詳細な検証エラー、構造化された`{code, message, hint}`エラーエンベロープ、厳選されたtarball、長時間実行されるツールの進捗状況の通知、およびCLIエラーの文法）が含まれています。このリリースは、49個のツール、4つのプロンプトテンプレート、および3,033個のテストとともに、[`@mcptoolshop/ai-jam-sessions@2.2.0`](https://www.npmjs.com/package/@mcptoolshop/ai-jam-sessions)として公開されました。

以前のバージョン2.1.0では、アナリストが「クリエイター」になりました。クリエイターループは製品として提供されます。モデルは、ライブラリ内の任意の曲の再編曲を提案し、プラットフォーム独自の決定的なツールがそれを評価します。コードエンジンは、意図されたすべての音色を確認する必要があります（`verify_harmony`）、すべてのメロディーノートは新しいハーモニーに対してラベル付けされ、検証された解釈のみが`add_song` → `play_song` → `view_piano_roll`に進みます。生成は、構築によって検証されます。評価基準はなく、自己評価もありません。ジャムセッションの概要を作成するのと同じ`inferChord`が、評価者となります。`maker_loop`のプロンプトテンプレートは、この一連の処理全体を制御します。

以前のバージョン2.0.0では、データセットがその有用性を証明しました。重要な変更点：Node.jsの最小バージョンが現在22（`node-web-audio-api` 2.0）になりました。ツールの表面自体は変更されていません。6つのサウンドエンジン、47のMCPツール、3つのプロンプトテンプレート、そして「完全に注釈が付けられたライブラリ：12のジャンルにわたる120曲/120曲」（このリリースでは、12の主要なフィールドがコンテンツから検出されたキーに修正されました）が含まれます。教育ループは、最初から最後まで閉じられています。メトロノーム（カウントイン付き）→ライブ録音→ノートごとの採点→採点されたピアノロール→テンポが安定するまで繰り返される練習ループ。ブラウザのコックピットは、実際の作曲ツールです。正確なビートで再生され、ループ領域、録音開始、完全なアンドゥ/リドゥ、複数選択とクリップボード、タッチサポートを備えています。[ウェブ上で利用可能](https://mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit/)。

また、「[jam-actions-v0](#training-dataset)」も公開されました。これは、クラシックピアノの多段階のMCPツール使用履歴を記録した、57件のレコードを含むトレーニングデータセットです。7軸のリリースゲート、コールドスタート時の再現性、および完全なZenodo + CITATION.cffメタデータ（CC-BY-SA-3.0-DE）を備えています。これは、[Hugging Face](https://huggingface.co/datasets/mcp-tool-shop/jam-actions-v0)にもミラーリングされており、現在、両方向の「検証済みのファインチューニング結果」が含まれています。正直なネガティブな結果（v0）と、独自の勝利目標を1つだけ達成しなかった、事前登録によって管理されたポジティブな結果（v1）です。詳細は、[ファインチューニングの結果](#training-dataset)を参照してください。このリリースでは、v1パイプラインの実行ゲートが、公開されたウィンドウがBWV 846の実際の62小節を超過したことを検出した後、ソースでバッハのレコードを修正しました（作業セットの修正r001/r002、および誤り）。MCPサーバー+コックピット+データセットパッケージャー+評価ハーネス+リリースゲートバリデーター全体で、2506件のテストが合格しました。MIDIデータはすべて含まれており、すべての曲を学習に使用でき、その学習のコーパスも一緒に提供されます。

## セキュリティとプライバシー

**アクセスされたデータ：** 楽曲ライブラリ（JSON + MIDI）、ユーザーの楽曲ディレクトリ（`~/.ai-jam-sessions/songs/`）、ギターのチューニング設定、練習日誌のエントリ、ローカルのオーディオ出力デバイス。

**アクセスされないデータ（デフォルトのパス）：** MCPサーバーとCLIは、ネットワーク接続を行わず、認証情報を読み取らず、ユーザーの楽曲ディレクトリ以外のシステムファイルにはアクセスしません。テレメトリーは収集または送信されません。同じパッケージに含まれる「オプトインのデータセット/評価ツール」（`scripts/run-llm-eval.ts`、プロビナンス検証ツール）が、唯一の例外です。明示的に起動した場合にのみ、LLM APIを呼び出すことができ（環境から`ANTHROPIC_API_KEY`を読み取りますが、保存することはありません）、プロビナンスURLを取得します。これは、サーバー、CLI、またはインストールのいずれかのコンポーネントとして実行されることはありません。

**権限：** MCPサーバーは、stdioトランスポートのみを使用します（HTTPは使用しません）。CLIは、ローカルファイルシステムとオーディオデバイスにアクセスします。完全なポリシーについては、[SECURITY.md](SECURITY.md)を参照してください。

## ライセンス

MIT
