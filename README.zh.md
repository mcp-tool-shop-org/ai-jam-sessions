<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

## 这是什么？

一台钢琴和一把吉他，AI学习如何演奏。它不是合成器，也不是 MIDI 库——而是一种教学乐器。

大型语言模型可以阅读和书写文本，但它无法像我们一样体验音乐。它没有耳朵，没有手指，也没有肌肉记忆。AI 即兴演奏会通过赋予模型它可以实际使用的感官来弥补这一差距：

- **阅读**——带有深入音乐注释的真实 MIDI 乐谱。不是手写的近似版本——而是经过解析、分析和解释的版本。
- **聆听**——六个音频引擎（振荡器钢琴、采样钢琴、人声采样、物理人声声道、加法人声合成器、物理建模吉他），通过扬声器播放，使房间里的人成为人工智能的“耳朵”。现在，该模型也有了自己的“耳朵”，而且是双重的：它可以事后测量录音（参见[聆听](#聆听）），并且可以在**音乐仍在播放时**观察乐队（参见[现场合奏](#现场合奏））。
- **观看**——一个钢琴卷帘，它将播放的内容渲染为 SVG，模型可以读取并验证。一个交互式吉他谱编辑器。一个带有视觉键盘、双模式音符编辑器和调音实验室的浏览器控制面板。
- **记忆**——一个练习日志，可以跨会话保存，因此学习效果会随着时间的推移而累积。
- **演唱**——带有 20 种人声预设的人声声道合成，从歌剧女高音到电子合唱。带有音阶、轮廓和音节叙述的合唱模式。以及在钢琴时钟上进行真实的演唱：一种基于歌曲 MIDI 驱动的、在时序（40 毫秒）和音高（50 分）上进行门控的、在您听到之前进行评分的歌手（参见[演唱](#演唱））。

这 108 首歌曲中的每一首现在都已完全注释——包括历史背景、逐小节的结构分析、关键时刻、教学目标和演奏技巧，涵盖所有 12 个流派。早期版本的 README 中提到，原始歌曲“正在等待 AI 吸收模式、演奏音乐并编写自己的注释”。而这正是发生的事情：这些注释是由 AI 根据每首歌曲的确定性分析（和弦、重复结构、乐段边界、经过验证的内容）编写的，并受到质量标准的约束，并且对每个声明进行对抗性的事实核查——包括小节编号、和弦范围和结构计数，所有这些都经过验证，以确保与实际 MIDI 文件一致，然后才发布。

基于相同的工作，我们还发布了 **[jam-actions-v0](#training-dataset)**——一个包含 57 个多轮 MCP 工具使用轨迹的公共数据集，这些轨迹基于真实的古典钢琴。它教会大型语言模型进行*基于符号音乐的实际工具使用*，而不仅仅是文本生成，并且附带一个 7 轴发布门，用于区分“传递证据”和“因为任务很简单而通过”。有关完整信息，请参阅下方的 [训练数据集](#training-dataset)。

## 聆听

在很长一段时间里，这个服务器可以发出声音，但无法对其进行分析。模型播放，人类聆听，模型接受他们的判断。现在，这个差距已经弥合。

将其指向一个 WAV 文件，它会测量其中的内容。不是通过查看图像并进行猜测——而是通过将信号传递到它已经用于乐谱的相同类型的工具：

- **`analyze_audio`**——起音、音高轮廓和音量。音高以音符名称返回，并带有半音偏差，而不是原始频率。
- **`transcribe_audio`**——将录音转换为音符：音高、起始时间、持续时间和每个音符与标准音高的距离。
- **`score_audio_take`**——通过“耳朵”对库中的歌曲进行性能评估。它转录录音，将其与乐谱匹配，并报告哪些音符播放正确，哪些音符偏离，以及哪些音符遗漏。然后，`view_scored_piano_roll`将结果绘制在乐谱上，就像它对捕获的 MIDI 录音一样。这就是评估真实乐器、演唱录音或任何没有 MIDI 录音的材料的方式。
- **`view_spectrogram`**——查看声音。一个恒定 Q 值的频谱图，左侧边缘带有钢琴键盘，因此可以一目了然地读取音高，并且可以根据要求在上面绘制歌曲的预期音符。

**它不会告诉您什么。**图像用于查找*哪里*出了问题；每个数字都来自信号处理，而不是来自模型读取图像。转录器一次处理一行，因此和弦或完整的混音会产生一个确定的错误结果，并且会明确指出。在最先进的技术中，起音检测的准确率约为 F1 0.88，因此“遗漏”的音符可能只是转录器无法听到的音符，而不是您没有播放的音符——这些工具会在其自身的输出中包含这一警告，而不是将其隐藏在这里。

整个表面都是无依赖的：转换、音高跟踪器、起音检测器、WAV 解码器和 PNG 编码器都位于此存储库中，并且它们在 Node 和浏览器中产生相同的数字。

## 现场合奏

聆听是在录音完成后对其进行评估。这是另一部分：询问每种乐器**现在**正在做什么，即在演奏过程中。

```
ensemble_now()
```

它会回答每种乐器保持的音符、每个音符保持了多长时间，以及整个合奏中组合成的和弦。在二重奏中，两个声音会分别报告，因此您可以看到钢琴保持一个三和弦，而合成器在其上方演奏旋律。

### 两个通道，而且廉价的那个是准确的那个

这是值得理解的部分，因为它决定了要信任哪个数字。

**意图——每个引擎被告知要播放的内容。**当模型是演奏者时，这不是一个估计值。钢琴和弦不是要进行转录的东西；而是发送的三组音符。这些音符是准确的、直接的和即时的。

**声学——实际发出的声音。**每个引擎可以将它的输出发送到私有分析总线，因此每种乐器都在源头进行测量，没有任何分离和歧义。这个通道是**验证，而不是发现**：它是了解人声偏离时钟、录音被截断或引擎在仍然发送音符时停止播放的方式。

当两者不一致时，这只是关于渲染的事实，而不是对音符的更正。

### 它需要多少资源

观察一种乐器大约需要**9 微秒的音频回调时间**，对应于 42.67 毫秒的音频块，这大约是音频预算的 0.02%，并且在零丢弃样本的情况下进行测量。没有附加观察器的乐器根本不需要任何资源。

### 它不会告诉您什么

声学通道存在延迟，并且会说明延迟了多少：大约 23 毫秒用于音高，70 毫秒用于确认的起音，因为在接收到其后的音频之前，无法确认起音。接近该边缘的起音会被保留而不是报告，然后稍后被撤回。

声学跟踪器一次处理一行，因此它不会命名和弦中的音符——并且它不会假装这样做。它无法解析的和弦是其已知的局限性，而不是一个发现，并且合奏会对此保持沉默，而不是在钢琴演奏的每个和弦时都发出警告。

## 钢琴卷帘

钢琴卷帘是 AI 观察音乐的方式。它将任何歌曲渲染为 SVG 格式——蓝色表示右手，珊瑚色表示左手，并带有节拍网格、动态和乐段边界：

<p align="center">
  <img src="docs/fur-elise-m1-8.svg" alt="Piano roll of Fur Elise measures 1-8, showing right hand (blue) and left hand (coral) notes" width="100%" />
</p>

<p align="center"><em>Für Elise, measures 1–8 — the E5-D#5 trill in blue, bass accompaniment in coral</em></p>

两种颜色模式：**手**（蓝色/珊瑚色）或**音高等级**（彩虹色——每个 C 都是红色，每个 F# 都是青色）。SVG 格式意味着模型既可以查看图像，又可以读取标记以验证音高、节奏和手部独立性。

## 驾驶舱

一个基于浏览器的作曲工作室，位于此存储库中，地址为 [`apps/cockpit`](apps/cockpit)——并且可以在 **[mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit](https://mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit/)** 上实时运行。无需插件、DAW 或安装；所有内容都保留在您的浏览器中（您的工作会自动本地保存）。您更喜欢对其进行修改吗？

```bash
cd apps/cockpit && npm install && npm run dev   # Vite dev server, opens in your browser
```

- **默认情况下，使用采样 Concert Grand**——驾驶舱会加载一个精简的 Salamander Grand 音色包（90 个 OGG 文件，8 MB），该音色包会在您第一次使用时加载，并通过与合成音色相同的输出链播放；在加载之前（或离线状态下），经过调整的振荡器钢琴音色会无缝覆盖。音色由 [Alexander Holm](https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html) 提供，采用 CC-BY 3.0 许可。
- **面板模式——聆听室**——对作曲引擎的音色进行盲目配对 A/B 听力测试，测试对象为真实的库旋律：音量匹配的片段离线渲染，并通过真实的音色路径播放，种子随机试验中包含隐藏的最低标准试验，采用 Bradley-Terry 排名和 Bootstrap 置信区间，并得出诚实的结果（临时结果，直到每对都达到其投票预算；当区分度达到最低标准时，结果将无法解释）。第二个子模式使用本地大型语言模型进行相同的排名，此外还有两种运行方式的历史记录以及一个比较视图（Kendall τ + 引擎排名匹配），用于确定廉价的代理是否跟踪了人类的真实结果。
- **精确的节拍控制**——音符存在于音乐时间中，因此 BPM 控制实际上会重新调整播放时间；一个点击以查找时间标尺，并带有拖动以设置**循环区域**；自动滚动，跟随播放头
- **录音模式**——演奏 QWERTY 键盘、屏幕键盘或 Web MIDI 设备，音符将出现在乐谱中：1 小节的预备音，循环风格的循环周期叠加（或替换模式），原始演奏时间在量化视图下保留，每次演奏都是一个可撤销的单元
- **完整的撤销/重做**——包括“清除”和“导入”在内的所有编辑都可以撤销（Ctrl+Z），拖动手势会合并，就像真实的编辑器一样
- **多选 + 剪贴板**——在“选择/绘制”工具切换下进行区域选择，平台标准的修饰符单击，复制/剪切/粘贴到播放头处，复制
- **触控 + 可访问性**——每个表面的指针事件，点击以重新定位，作为非拖动操作的替代方案，键盘音符编辑，色彩盲安全的分数叠加
- **双模式钢琴卷帘**——在乐器模式（彩虹色音高等级颜色）和人声模式（音符按元音形状着色：/a/ /e/ /i/ /o/ /u/）之间切换
- **虚拟键盘**——从 C4 开始的两个八度音阶，映射到您的 QWERTY 键盘。单击或键入。
- **20 种音色预设**——15 种 Kokoro 映射的音色（Aoede、Heart、Jessica、Sky、Eric、Fenrir、Liam、Onyx、Alice、Emma、Isabella、George、Lewis，以及合唱和合成人声），4 种声道映射的音色，以及一个合成合唱部分
- **10 种乐器预设**——6 种服务器端钢琴音色，以及合成垫音、管风琴、铃铛和弦乐
- **音符检查器**——单击任何音符以编辑力度、元音和柔和度
- **7 种调音系统**——十二平均律、纯律（大调/小调）、毕达哥拉斯音阶、四分音差平均律、韦克迈斯特 III 调式或自定义半音偏移。可调节的 A4 参考音（392–494 Hz）。
- **调音审计**——频率表、带有节拍频率分析的音程测试器，以及调音导出/导入
- **乐谱导入/导出**——将整个乐谱序列化为 JSON 并加载回来
- **面向大型语言模型的 API**——`window.__cockpit` 公开了 `exportScore()`、`importScore()`、`addNote()`、`play()`、`stop()`、`panic()`、`setMode()` 和 `getScore()`，以便大型语言模型可以以编程方式进行作曲、编排和播放

## 学习循环

<p align="center">
  <img src="docs/learning-loop.svg" alt="The learning loop: Read (MIDI + annotations) → Play (six sound engines) → See (piano roll · guitar tab) → Reflect (practice journal), with the journal persisting so the next session picks up where the last left off" width="100%" />
</p>

## 歌曲库

108 首注释歌曲，涵盖 12 个流派，基于真实的 MIDI 文件构建。每个流派都有一首深度注释的示例——包括历史背景、逐小节的和谐分析、关键时刻、教学目标和演奏技巧（包括人声指导）。这些示例充当模板：AI 研究其中一个，然后注释其余的。

**What ships, and what you fetch.** The annotations are ours and ship with every song. The MIDI files were downloaded from public MIDI sites when the library was built, and a per-file provenance audit ([`docs/findings/library-provenance-audit.md`](docs/findings/library-provenance-audit.md)) found that only 14 of them carry a licence that permits redistribution — Bernd Krueger's piano-midi.de arrangements (CC-BY-SA-3.0-DE) and the Mutopia Project's public-domain typesettings. Those 14 are in the npm package. The other 94 are not: their `.json` ships, with a `provenance` block naming the source, its terms and the file's SHA-256, and `ai-jam-sessions library fetch --accept-source-terms` downloads each one from the site that published it, under that site's terms, refusing any file whose hash no longer matches what the annotations were verified against. Twelve files that turned out to be a different piece than their name were quarantined, which is why the count is 108 and not the 120 earlier versions claimed. Versions before this one shipped all 120 MIDI files; that was a mistake, and it is corrected here rather than papered over.

| 类型 | 范例 | 关键 | 它教授的内容 |
|-------|----------|-----|-----------------|
| 布鲁斯 | 《The Thrill Is Gone》（B.B. King） | B 小调 | 小调布鲁斯形式、呼应式，在节拍之后演奏 |
| 古典 | 《致爱丽丝》（贝多芬） | A 小调 | 回旋曲形式、触键差异、踏板技巧 |
| 电影 | 《另一个夏天的圆舞曲》（蒂尔森） | E 小调 | 琶音织体，动态架构，没有和声变化 |
| 民谣 | 《绿袖子》 | E 小调 | 3/4 华尔兹节奏，模态混合，文艺复兴时期的声乐风格 |
| 爵士 | 《秋叶》（科斯马） | G 小调 | ii-V-I 级进行、引导音、摇摆八分音符、无根音和弦 |
| 拉丁 | 《伊帕内玛的女孩》（若比姆） | F 大调 | 波萨诺瓦节奏、半音调制、声乐克制 |
| 新世纪音乐 | 《河流在你心中流淌》（Yiruma） | A 大调 | I-V-vi-IV 识别、流畅的琶音、自由节奏 |
| 流行 | 《Imagine》（列侬） | C 大调 | 琶音伴奏、克制、真诚的声乐 |
| 拉格泰姆 | 《娱乐者》（乔普林） | C 大调 | “砰砰”低音、切分音、多乐段形式、节奏控制 |
| R&B | 《Superstition》（史蒂夫·旺达） | Eb 小调 | 十六分音符放克、打击乐键盘、幽灵音符 |
| 摇滚 | 《Your Song》（埃尔顿·约翰） | Eb 大调 | 钢琴叙事曲的声部进行、转位、对话式的演唱 |
| 灵魂乐 | 《Lean on Me》（比尔·惠瑟斯） | C 大调 | 音阶旋律、福音伴奏、呼应式 |

歌曲从**原始**（仅 MIDI）→**注释**→**准备就绪**（完全可播放，具有音乐语言）的状态发展。人工智能通过研究歌曲并编写注释来推广歌曲，注释内容为 `annotate_song`。

## 声音引擎

六个引擎，以及一个分层组合器，可以同时运行任意两个引擎：

| 引擎 | 类型 | 它的声音 |
|--------|------|---------------------|
| **Oscillator Piano** | 加法合成 | 具有锤击噪音、非谐性、速度感应的亮度、48 声部的复音、立体声成像的多谐钢琴。没有依赖项。 |
| **Sample Piano** | 样本播放 | 萨拉曼德大钢琴——真正的声音。**每当安装一个音色包时，它都是默认引擎**（`samples/AccurateSalamander` 或 `AI_JAM_SAMPLES_DIR`）；npm tarball 保持无样本状态，因此您提供 [Salamander](https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html) 下载。浏览器控制面板自带一个精简的 8 MB 音色包（90 个 OGG 文件，CC-BY 3.0 Alexander Holm）——在网络上无需任何设置。 |
| **Vocal (Sample)** | 音高偏移样本 | 具有滑音和连音模式的持续元音。 |
| **Vocal Tract** | 物理模型 | 粉红色长号——通过 44 个单元的数字波导的低频声门波形。四个预设：女高音、中音、男高音、男低音。 |
| **Vocal Synth** | 加法合成 | 15 个 Kokoro 声音预设，具有音色塑形、柔和度、颤音。确定性（基于种子随机数生成器）。 |
| **Guitar** | 加法合成 | 物理建模的拨弦乐器——4 个预设（钢制原声吉他、尼龙古典吉他、爵士拱顶吉他、十二弦吉他）、8 种调音、17 个可调参数。 |
| **Layered** | 组合器 | 组合两个引擎，并将每个 MIDI 事件都发送到这两个引擎——钢琴+合成器、声乐+合成器等。 |

### 键盘音色

六个可调钢琴音色，每个音色都可以调整每个参数（亮度、衰减、锤击硬度、失谐、立体声宽度等）：

| 音色 | 特性 |
|-------|-----------|
| 音乐会大钢琴 | 丰富、饱满、古典 |
| 立式钢琴 | 温暖、亲切、民谣 |
| 电钢琴 | 丝滑、爵士、芬达 Rhodes 风格 |
| 酒吧钢琴 | 失谐、拉格泰姆、沙龙 |
| 音乐盒 | 水晶般、空灵 |
| 明亮大钢琴 | 锐利、现代、流行 |

### 吉他音色

四个吉他音色预设，具有物理建模的弦合成，每个音色都有 17 个可调参数（亮度、琴体共鸣、拨弦位置、弦阻尼等）：

| 音色 | 特性 |
|-------|-----------|
| 钢制原声吉他 | 明亮、平衡、经典原声 |
| 尼龙古典吉他 | 温暖、柔和、圆润 |
| 爵士拱顶吉他 | 柔和、木质、干净 |
| 十二弦吉他 | 闪烁、双音、合唱效果 |

## 练习日志

每次练习后，服务器都会记录发生的事情——哪首歌曲、速度如何、有多少小节、持续了多长时间。人工智能会添加自己的想法：它注意到什么、它识别出什么模式、接下来应该尝试什么。

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

每天一个 Markdown 文件，存储在 `~/.ai-jam-sessions/journal/` 中。人类可读，仅追加。在下一次练习中，人工智能会读取其日志，并从上次停止的地方继续。

## 训练数据集

**jam-actions-v0**——一个公共数据集，包含基于古典钢琴 MIDI 的多轮 MCP 工具使用轨迹。该数据集基于此服务器所教授的库构建而成，它教导大型语言模型如何对符号音乐进行**基于实际的工具使用**——而不仅仅是文本生成。

每个记录将一个 4 小节的乐句片段与一个带注释的教学目标以及一个 *目标轨迹* 配对——这是一个逐回合的会话，其中助手使用上述 MCP 工具（`get_events_in_measure`、`get_events_in_hand`、`count_distinct_pitch_classes` 以及其余 9 个 MIDI 检查工具）来阅读、分析和讨论该乐句。

| | |
|---|---|
| 版本 | **0.6.0（2026-09-25）——修正版本**（见下文） |
| 记录 | 57（公共子集）：训练集 45，保留的测试集 12（`clair-de-lune`） |
| 乐曲 | 4 首古典钢琴作品：巴赫 BWV 846、莫扎特 K. 545 I、贝多芬《致爱丽丝》、德彪西《月光》 |
| 源 MIDI | piano-midi.de——Bernd Krueger 编曲，每个文件都包含 Krueger 自己的版权声明 |
| 许可 | CC-BY-SA-3.0-DE（编曲），适用于公共领域的乐曲 |
| 位置 | [`mcp-tool-shop/jam-actions-v0`](https://huggingface.co/datasets/mcp-tool-shop/jam-actions-v0) on Hugging Face and on Zenodo; DOIs and citation in the [dataset card](datasets/jam-actions-v0-public/README.md) and [`CITATION.cff`](datasets/jam-actions-v0-public/CITATION.cff) |

**0.6.0 修正版。** 0.4.x 和 0.5.x 版本包含 8 首乐曲共 115 条记录，所有记录均归功于 Bernd Krueger。该归属信息已与 piano-midi.de 网站上的作曲家页面进行了核对，而不是与文件本身进行核对。当从 MIDI 字节中审核乐曲库时，其中四首乐曲——肖邦的《夜曲》Op. 9 No. 2 和《前奏曲》Op. 28 No. 4、贝多芬的《悲怆》II 和舒曼的《梦幻曲》——被发现是从 midiworld.com 和 bitmidi.com 获取的文件中构建的，并且没有明确的编曲许可。它们的 58 条记录逐音地包含了这些编曲，因此 0.6.0 版本将其删除。剩余的 57 条记录与 0.5.0 版本完全相同。请勿从早期版本中重新分发已删除的记录。完整的说明请参见 [`docs/findings/published-dataset-licence-audit.md`](docs/findings/published-dataset-licence-audit.md)。

**证据验证。**打包程序现在会重新读取每首乐曲的库来源信息块——该信息是从 MIDI 字节中重新提取的——并拒绝任何乐曲的记录，如果该乐曲没有可重新分发的编曲许可，或者其源文件的哈希值与证据文件不同。它会采取保守策略。一个测试会重新对每个已提交的已发布包执行相同的检查，因此后续的来源更改会导致已发布集合的构建失败。

**质量评估——7 轴发布门控。**数据集的发布门控区分了基于证据的通过和达到上限的通过。轴 1-6 是阻碍性的（绝对下限、边际复合、工具使用率、工具使用后修正、误解计数、分层下限）；轴 7 是丰富与非丰富报告的对比。其记录的评估结果是在 0.4.x 和 0.5.x 版本的 115 条记录上进行测量的，并且可以从标签 `jam-actions-v0-0.5.0-cut-2026-07-11` 中重现；这些结果尚未在 0.6.0 版本上重新测量。

**可重复性。**任何平台（Windows 原生、macOS、Linux、WSL）上的新贡献者都可以验证该包并重新构建它：

```bash
git clone https://github.com/mcp-tool-shop-org/ai-jam-sessions.git
cd ai-jam-sessions && pnpm install
pnpm exec tsx scripts/verify-public-package-checksums.ts                        # every file accounted for
pnpm exec tsx scripts/package-jam-actions-public.ts --today 2026-09-25 --dry-run # evidence gate runs first
pnpm build && pnpm exec tsx scripts/verify-public-package-execution.ts
# → "VERDICT: PASS" — every frozen tool call replays live (needs an audio device)
```

`.gitattributes` 为 `*.sha256` 和公共数据集树设置了 LF 行尾，以便校验和验证器在所有平台上都能正常工作。

**微调历史。**数据集的声明已通过预先注册的微调进行测试，并与密封的基线进行评分。**v0**（仅 78 个即兴演奏轨迹）返回了一个诚实的否定结果（[报告](docs/finetune-arc-eval-report.md））；**v1** 使基于工具的质量评估提高了 0.202，但未达到其预先注册的指标，只多了一次配对胜（[报告](docs/finetune-arc-v1-eval-report.md））；**B-1** 重新测试了冻结的 v1 适配器，使用了 36 条记录的队列：0.678 → 0.890，36 条记录中有 29 条获得了配对胜，超过了预先设定的 24/34 指标（[报告](docs/finetune-arc-v2-b1-eval-report.md））。这些测量结果按记录的方式保留。**适配器本身已被删除**：它们的训练数据包括来自四首已删除乐曲的记录，因此不能按照此数据集的条款提供。仅使用已获得许可的材料进行训练的适配器会与 `jam-actions-v1` 数据集一起发布。

> MIDI 编曲由 Bernd Krueger（piano-midi.de）提供，采用 CC-BY-SA-3.0-DE 许可。注释、轨迹和评估工件由 AI Jam Sessions 团队提供，采用相同的许可，以确保从头到尾的共享许可链。**许可边界：**仓库的 MIT 许可涵盖代码；所有 `datasets/` 下的内容均采用 CC-BY-SA-3.0-DE 许可。在 `datasets/jam-actions-v0/` 中的工作语料库还包含未发布的记录：两首其来源从未得到验证的乐曲（萨蒂《吉姆诺佩迪》No. 1，德彪西《阿拉伯舞曲》No. 1）以及 0.6.0 版本中删除的四首乐曲——请参见 [`datasets/jam-actions-v0/PROVENANCE-NOTE.md`](datasets/jam-actions-v0/PROVENANCE-NOTE.md)。

### 声学语料库

**jam-actions-acoustic-v0**——这是上述轨迹的对应版本，处理的是**音频**而非符号音乐。包含 108 条记录，每条记录都将一个经过故意扰动的公共领域乐句的合成渲染与分析工具实际返回的判断结果配对，因此，每个标签都针对乐器进行检查，而不仅仅是针对其自身进行检查。

| | |
|---|---|
| 版本 | 1.1.0（2026-09-25）——删除了 1.0.x 版本中的 36 条《梦幻曲》记录，因为其源文件没有明确的编曲许可。 |
| 记录 | 72——2 个乐句（巴赫，《致爱丽丝》）× 9 种扰动类型 × 4 个目标音符 |
| 保留 | 按**乐句**（《致爱丽丝》）划分，而不是按记录划分，因此，相同旋律的扰动版本不会泄露。 |
| 类别 | 匹配、音高错误/警告、时序错误/通过、遗漏、额外、音准颤音、无评级静音 |
| 音频 | 没有分发——每条记录都包含一个确定性的配方和它产生的波形的 SHA-256 校验值。 |
| 模式 | `jam-actions-acoustic-v0/1.0.0` |

这九个类别中有两个是存在的，因为一个简单的模型会自信且错误地回答它们：一个音准颤音，其正确的判断结果是*音准*，以及一段静音，其正确的判断结果是*无需评级*。所有判断结果所依赖的阈值都复制到记录中，因为它们在构建过程中都发生过一次变化。

该语料库可以从这个仓库中重现。重新生成它会生成所有 115 个已发布的文件和一个字节完全相同的 `checksums.sha256`，并且一个测试会精确地验证这一点，而无需写入已发布的树。

**一个需要注意的点，是实际测量而不是假设。** 每个记录都包含 `wav_sha256`，即其配方生成的波形的哈希值，并且渲染器会为每个样本调用 `Math.pow` 和 `Math.sin`。两者都不需要正确地进行四舍五入，并且 V8 的结果在 Node 22 和 Node 24 之间发生了变化：在这 27,869 个不同的 `Math.pow(2, x)` 参数中，有 253 个返回不同的双精度浮点数。其中大部分在 16 位量化下都会消失，但 **108 个记录中的 2 个**——都是《致爱丽丝》的 `extra` 扰动，其主题位于半音比例本身不同的音高——在 Node 24 上的哈希值不同。每个记录的每个其他字段在任何引擎上都会重现，并且仓库会分别测试这两个声明。如果您重新渲染并看到这两个不匹配，那是因为这个原因，而不是下载文件损坏。使波形具有比特可移植性意味着替换超越函数，这将改变每个哈希值，因此需要新的模式版本。

### 构建你自己的

语料库运行的基础框架可供你进行自己的实验。
[`experiments/_template/`](experiments/_template/) 是一个可用的示例，你可以复制它：声明一个任务，你将获得 SFT 格式、按类别评分、基于你声明的判断结果集的简单基准，以及一个检查，以确保没有保留单元跨越分割。

[协议](experiments/_template/README.md) 是值得阅读的部分。真实数据是可构建的，而不是手动编写的，标签会根据工具的测量结果进行验证，你按泄露单元进行分割，并报告基准和基础模型以及任何结果。
这些规则中的每一条都需要付出一定的学习成本。

## 安装

```bash
npm install -g @mcptoolshop/ai-jam-sessions
```

需要 **Node.js 22+**（v2.0.0 提高了最低版本，使用 `node-web-audio-api` 2.0）。无需 MIDI 驱动程序、虚拟端口或外部软件。

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

每次发布都会发布`ghcr.io/mcp-tool-shop-org/ai-jam-sessions`，这是一个精简的镜像，它在标准输入/输出上运行 MCP 服务器。需要注意的是，`/data`是内存：日志、服务器状态、用户歌曲以及任何获取的 MIDI 文件都存储在那里，因此请挂载一个卷，否则它们会随着容器一起消失。

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

该镜像包含 14 个可重新分发的 MIDI 文件；在容器内运行一次`library fetch --accept-source-terms`会将剩余的 94 个文件放入卷中。`docker compose up`对命名卷执行相同的操作，并且`--profile ollama`添加了一个 Ollama 侧边容器。详情、镜像内的 CLI 以及故意不包含的内容：[docs/docker.md](docs/docker.md)。在 Ollama 中运行经过微调的评估器，并衡量 4 位基础模型的成本：[docs/ollama-adapters.md](docs/ollama-adapters.md)。

## MCP 工具

54 个工具和 4 个提示模板，分为八个类别：

### 学习

| 工具 | 它做什么 |
|------|--------------|
| `list_songs` | 按流派、难度或关键字浏览 |
| `song_info` | 完整的音乐分析——结构、关键时刻、教学目标、风格技巧 |
| `registry_stats` | 整个库的统计信息：总乐曲数、流派、难度 |
| `list_measures` | 每个小节的音符、力度和教学说明 |
| `teaching_note` | 深入研究单个小节——指法、力度、上下文 |
| `suggest_song` | 基于流派、难度以及您已演奏的内容进行推荐 |
| `practice_setup` | 推荐的乐曲速度、模式、声音设置和 CLI 命令 |
| `compare_songs` | 跨流派的模式识别——关键关系、音高/音程相似性、共享形式、教学联系 |
| `annotation_progress` | 跟踪整个库中的注释质量——分数、等级和改进建议 |
| `server_info` | 服务器版本、库统计信息、引擎列表、活动会话 |

### 播放

| 工具 | 它做什么 |
|------|--------------|
| `play_song` | 通过扬声器播放——库中的歌曲或原始的 .mid 文件。四个引擎（钢琴、人声、音轨、吉他），任意速度、模式、小节范围——以及一个带有预备音和 `record` 标志的节拍器，用于捕捉会话以进行评分。合成器和分层引擎仅可通过命令行界面 (CLI) 使用。 |
| `stop_playback` | 停止 |
| `pause_playback` | 暂停或恢复 |
| `set_speed` | 在播放过程中更改速度（0.1 倍 – 4.0 倍） |
| `playback_status` | 实时快照：当前小节、速度、速度、键盘音色、状态 |
| `view_piano_roll` | 以 SVG 格式渲染（手部颜色或音高等级色谱彩虹） |
| `score_performance` | 为 MIDI 伴奏进行评分——音高准确性、时值、完整性，并提供分级反馈 |
| `mute_hand` | 在练习期间静音或取消静音左/右手——一次隔离一只手 |
| `detect_chord` | 从当前播放的 MIDI 音符集合中识别和弦（例如，`[60,64,67]` → C） |
| `preview_teaching_cues` | 在播放之前查看所有教学笔记和关键时刻 |

### 练习

| 工具 | 它做什么 |
|------|--------------|
| `practice_loop` | 一位真正的老师布置的练习：循环播放第 5-8 小节，速度放慢，并且只有在*完美*完成之后，速度才会加快（+5%）——每次练习都会被记录、评分和总结。 |
| `practice_status` | 练习进度：当前练习次数、速度，以及上次练习的每个小节的诊断信息 |
| `score_last_take` | 对最近记录的练习进行评分——音高准确性、时值、完整性，以及每个音符的评估结果 |
| `view_scored_piano_roll` | 每位老师都会使用的标记评分：钢琴卷帘叠加每个音符的评估结果，使用对色盲友好的调色板（实线 = 正确，虚线 = 时值，✕ = 遗漏） |

### 唱歌

| 工具 | 它做什么 |
|------|--------------|
| `sing_along` | 可演唱的文本——音符名称、音阶、轮廓或音节。可以带钢琴伴奏，也可以不带。 |
| `ai_jam_sessions` | 生成即兴创作简报——和弦进行、旋律轮廓和风格提示，用于重新诠释 |
| `verify_harmony` | 创作者循环的验证门：平台自身的确定性工具会检查提出的重新和声方案——和弦保真度（和弦引擎必须检测到每个预期的和弦）、旋律和谐度（音/张力/半音）、低音声部进行、调性成员 |
| `auto_reharmonize` | 创作者循环（一次性）：本地模型提出重新和声方案，`verify_harmony` 的确定性门检查每个配音，选择最佳的 n 个方案，直到返回经过验证的诠释方案 |
| `compose_panel` | 对任何歌曲运行声部进行作曲面板：四个系统生成伴奏，盲目交叉家族的 LLM 评判者对其进行排名，Bradley-Terry 聚合——并设置一个区分阈值门，以排除无法解释的运行结果（仅方向信号，绝不提供质量评分）。运行时间长达几分钟，并在运行过程中流式传输进度通知。 |

**时钟上的演唱乐句——人声路径。** 任何库中的歌曲都可以包含一首真实的演唱乐句，并与钢琴同步：一个**乐谱时钟**（`scripts/build-score-clock.mjs`）从歌曲的 MIDI 中提取每个音节的音高、起始时间和持续时间，并将其应用于播放器的自己的时间轴；一个本地的、Apache-2.0 许可的、受乐谱影响的歌手（[SoulX-Singer](https://github.com/Soul-AILab/SoulX-Singer)）根据该时钟进行演唱；并且两个门限会测量音频，然后再将其混合——**时间**：每个元音的起始时间与乐谱的偏差在 40 毫秒以内；**音高**：每个音符的偏差在 50 厘以内，全局偏移在 20 厘以内。音节从一组录音中选择，并且仅在单词边界处使用交叉淡入淡出进行连接。控制参数：`--track`（哪个 MIDI 音轨是旋律；`--list-tracks`用于查看），`--lyrics "A-ma-zing grace …"`（每个音符一个令牌，音节由`-`连接），`--measures`，提示片段（人声），录音数量以及门限值——每个参数都有其引用出处在`scripts/vocal_clock.py`中。路径、控制参数和结果：[手册 → 人声](https://mcp-tool-shop-org.github.io/ai-jam-sessions/handbook/vocals/)，[`docs/vocal-clock.md`](docs/vocal-clock.md)；研究的背景：[`docs/vocal-singing-study-2026-09.md`](docs/vocal-singing-study-2026-09.md)。

### 吉他

| 工具 | 它做什么 |
|------|--------------|
| `view_guitar_tab` | 将交互式吉他谱渲染为 HTML——点击编辑、播放光标、键盘快捷键 |
| `list_guitar_voices` | 可用的吉他音色预设 |
| `list_guitar_tunings` | 可用的吉他调音系统（标准、降 D 调、开放 G 调、DADGAD 调等） |
| `tune_guitar` | 调整任何吉他音色的任何参数。在会话之间保留。 |
| `get_guitar_config` | 当前吉他音色配置与工厂默认值 |
| `reset_guitar` | 重置吉他音色为工厂默认值 |

### 构建

| 工具 | 它做什么 |
|------|--------------|
| `add_song` | 添加新的歌曲，格式为 JSON |
| `import_midi` | 导入带有元数据的 .mid 文件 |
| `annotate_song` | 为原始歌曲编写音乐语言，并将其提升为“已准备好”状态 |
| `save_practice_note` | 带有自动捕获的会话数据的日志条目 |
| `read_practice_journal` | 加载最近的条目以提供上下文 |
| `list_keyboards` | 可用的键盘音色 |
| `tune_keyboard` | 调整任何键盘音色的任何参数。在会话之间保留。 |
| `get_keyboard_config` | 当前配置与工厂默认值 |
| `reset_keyboard` | 重置键盘音色为工厂默认值 |
| `score_annotation` | 跨 5 个维度的评分注释质量——完整性、深度、具体性、教学价值、词汇 |
| `validate_song_entry` | 在添加之前，根据模式验证歌曲 JSON |
| `transpose_song` | 将歌曲向上或向下转调半音——新的调性、新的音符 |
| `list_sections` | 查看歌曲的结构部分（引子、主歌、副歌等） |
| `add_section` | 为歌曲添加一个部分标记，以便进行结构导航 |

### 评分

| 工具 | 它做什么 |
|------|--------------|
| `score_performance` | 对 MIDI 伴奏与库歌曲进行评分——音高、时序、完整性，并提供分级反馈。 |
| `score_annotation` | 对 5 个维度的注释质量进行评分。 |

### 收听

测量录制的音频。单声道：它们一次跟随一条线，因此，和弦或完整的混音会产生令人信服的无意义结果。每个数字都来自信号处理，而不是来自模型读取图像。

| 工具 | 它做什么 |
|------|--------------|
| `analyze_audio` | 测量一个 WAV 文件——起始时间、音高轮廓（以音符名称和半音为单位）和音量。 |
| `transcribe_audio` | 将一个单声道录音转换为音符，并记录每个音符与标准音高的偏差。省略跟踪器无法跟随的音符，而不是猜测。 |
| `score_audio_take` | 通过**听觉**对表演与库歌曲进行评分，然后将结果传递给 `view_scored_piano_roll`。 |
| `view_spectrogram` | 查看声音——在钢琴键盘轴上显示一个恒定 Q 值的声谱图，可以选择叠加预期的音符。默认情况下，会隐藏声音。 |
| `ensemble_now` | 每个乐器**现在正在演奏什么**，在演奏过程中。音符来自已发送的内容，因此它们是精确的，而不是估计的。 |

### MCP 提示

用于结构化教学工作流程的四个提示模板：

| 提示 | 它做什么 |
|--------|--------------|
| `annotate_song` | 引导式注释工作流程——研究一个范例，为原始歌曲编写音乐语言 |
| `practice_plan` | 基于流派、难度和目标构建结构化的练习计划 |
| `performance_review` | 回顾已完成的会话——哪些方面做得好，下一步应该关注什么 |
| `maker_loop` | 执行完整的创作者循环——提出重新和声方案，使用平台的确定性工具对其进行验证，然后添加并播放经过验证的结果 |

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

## 状态

**v2.6.0 — 停止发布其没有授权发布的内容**（参见[CHANGELOG](CHANGELOG.md））。
对歌曲库中的每个文件进行来源审计，发现 108 个 MIDI 乐曲中，有 14 个具有允许重新分发的许可，而 94 个则没有——并且有十二个文件的内容与其文件名不符。现在，每首歌曲都包含一个基于证据的`provenance`块（来源 URL、网站条款、将文件命名为其自身版权事件的编曲者、SHA-256、标题判决）；这十二个文件已被隔离；npm 包包含这 14 个文件，并将剩余的文件标记为*未获取*，并且`ai-jam-sessions library fetch --accept-source-terms`会从发布该文件的网站下载每个文件，并遵守该网站的条款，拒绝任何哈希值不再匹配的文件。早期版本包含所有 120 个文件，并且在 npm 上已被弃用。相同的审计将 jam-actions-v1 数据集重置为 11 首经过验证的乐曲（三首 Krueger CC-BY-SA-3.0-DE，八首 Mutopia Public Domain）；该语料库、其近门探测以及发现所示作品目标的训练弧——一个 3B 秩 16 LoRA，使用一个不变的配方，从一个先验类别开始，在 54/54 个保留样本和 72/72 个近门样本中进行训练，一旦助手完成，它就会写出比较的数字——都位于仓库中的`datasets/`和`experiments/coverage-v1-sft/`中，并将发布到 Hugging Face 和 Zenodo，以供经过验证的语料库使用。此外，在此版本中：`scorePerformance`将正确的窗口限制在调用者的门限处，因此 40 毫秒的规则恰好是判决窗口。

**v2.5.0——模型可以观看乐队演奏的版本（参见 [CHANGELOG](CHANGELOG.md)）。**
`ensemble_now` 报告每个乐器在音乐播放时正在做什么：每个乐器保持的音符、每个音符保持了多长时间以及组合的和弦。它运行在两个通道上，并且廉价的通道是准确的通道——当此服务器执行时，它确切地知道它发送了什么，因此，一个和弦是三个音符，而不是转录问题，而一个单独的声学传感器会测量每个引擎**在源头**进行验证。测量的成本约为**每个音频回调 9 微秒**；延迟是明确说明的，而不是暗示的（~23 毫秒音高，~70 毫秒确认的起始时间）；并且限制已记录，因为它们是可以操作的——跟踪器是单声道的，分层子项是单独跟踪的，而不是作为混合进行跟踪，并且没有传感器的乐器不是静音乐器。
在同一个版本中，数据集机制被转换为一个协议，任何人都可以对其进行声明，并提供了一个可用的模板，因此用户可以构建自己的语料库，并针对相同的标准训练自己的适配器。在此过程中，发现声学语料库的可重现性门控覆盖了其 115 个已发布路径中的 109 个，并且它遗漏的六个路径中的三个根本没有由生成器发出——重新生成会删除它们。现在，完全重新生成可以重现每个文件和校验和清单中的每个字节。实时界面包含**54 个工具和 4 个提示模板**，并且**165 个文件中有 3,389 个测试通过（1 个跳过）**。

之前在 v2.4.0 中——模型获得了“耳朵”的版本。四个工具弥合了音频渲染和音频检查之间的差距：`analyze_audio` 用于起始时间、音高轮廓和音量；
`transcribe_audio` 用于将单声道录音转换为音符；`score_audio_take` 用于通过听觉对表演进行评分，并将结果传递给现有的已评分钢琴卷帘，而无需更改；以及 `view_spectrogram` 用于在恒定 Q 值、钢琴键盘轴上查看声音。所有这些都是无依赖性的信号处理，用这个仓库中的代码编写——它自己的 FFT、窗口、梅尔和恒定 Q 变换、起始时间检测和音高跟踪——因为模型不能可靠地通过眼睛来观察图像，并且确定性查询比推理更适合于具有精确答案的问题。该版本还发布了
**jam-actions-acoustic-v0**，108 条可构建的黄金记录，用于对音频进行工具使用。

**v2.3.0——乐器学会时钟上演唱的发布版本**（请参见[CHANGELOG](CHANGELOG.md)）。现在，任何库中的歌曲都可以包含一首真实的演唱乐句，并与钢琴同步：一个**乐谱时钟**从歌曲的 MIDI 中提取每个音节的音高、起始时间和持续时间，并将其应用于播放器的自己的时间轴；一个本地的、Apache-2.0 许可的、受乐谱影响的歌手（[SoulX-Singer](https://github.com/Soul-AILab/SoulX-Singer)）根据该时钟进行演唱；并且两个门限会测量音频，然后再将其混合——时间（每个元音与乐谱的偏差在 40 毫秒以内）和音高（每个音符的偏差在 50 厘以内）。已发布的《奇异恩典》的测试结果显示，最差时间偏差为 6 毫秒，全局音高偏差为 -2.7 厘，并且已记录结果；着陆页以诚实的状态呈现，并标明了剩余的缺陷（即开头的拼接部分）。路径、控制参数及其背后的研究（五个研究方向，均有引用）均在[手册](https://mcp-tool-shop-org.github.io/ai-jam-sessions/handbook/vocals/)和[`docs/`](docs/)中。现场界面保持不变，为**49 个工具和 4 个提示模板**，并且**3,080 个测试通过（1 个跳过）**，此外还有人声乐器的 pytest 测试套件。**发布状态：**已发布——[`@mcptoolshop/ai-jam-sessions@2.3.0`](https://www.npmjs.com/package/@mcptoolshop/ai-jam-sessions) 在 npm 上，并已证明其来源。

之前在 v2.2.0 中——该版本使乐器真正拥有了耳朵和一个聆听室。驾驶舱的默认钢琴现在是**采样 Concert Grand**——一个经过修剪的 Salamander 音色包，在您进行第一次操作时加载，并在准备就绪之前回退到调谐振荡器合成器——并且服务器会在安装完整的音色包时自动选择采样引擎。在其之上是**作曲面板**：一个盲目、响度匹配的 A/B 聆听室，其中人类对作曲引擎的配音与理论有效和理论无效的锚点进行排名（Bootstrap 置信区间 Bradley-Terry，MUSHRA 风格的区分阈值，PROVISIONAL 和 UNINTERPRETABLE 作为第一类结果），旁边是一个本地模型面板，它使用跨家族的 LLM 评判者运行相同的排名，以及一个比较视图（Kendall τ），用于确定廉价的代理是否跟踪人类的真实结果。

相同的发布版本还包含一个构成引擎，该引擎为面板提供支持（`src/compose/`：一个具有命名风格预设的确定性人声引导门限，基于构建的成员关系的人声规范，一次处理一个乐器的优化器），以及完整的健康检查（修复了 45 个问题——安全性、人性化的字符串、保留视觉效果的视觉修改），来自已记录的 Mutopia 公有领域字节的重新资源化的萨蒂和德彪西库条目，以及一个陌生人测试的强化：描述性的验证错误、结构化的`{code, message, hint}`错误信封、精选的 tarball、长时间工具的进度通知以及 CLI 错误语法。该版本以[`@mcptoolshop/ai-jam-sessions@2.2.0`](https://www.npmjs.com/package/@mcptoolshop/ai-jam-sessions)的形式发布，包含 49 个工具、4 个提示模板和 3,033 个测试。

此前在 v2.1.0 版本中——这个版本标志着分析师转变为**创作者**。创作者循环以产品的形式发布：一个模型会提出对任何音乐库歌曲进行重新编排的方案，并且平台的确定性工具会对该方案进行审核——和弦引擎必须确认每个预期的音符（`verify_harmony`），每个旋律音符都必须与新的和声对应，并且只有经过验证的演绎才能进入 `add_song` → `play_song` → `view_piano_roll`。通过构建来验证生成结果——没有评分标准，没有自我评分；编写即兴演奏概要的 `inferChord` 也是评审者。 `maker_loop` 提示模板指导整个循环。

此前在 v2.0.0 版本中——这个版本证明了数据集的有效性。**重大更新：Node.js 的最低版本现在是 22**（`node-web-audio-api` 2.0）；工具本身没有变化——六个声音引擎、47 个 MCP 工具、3 个提示模板，以及一个**完全注释的库：涵盖 12 个流派的 120/120 首歌曲**（本版本中，12 个关键字段已更正为内容检测到的调）。教学循环是端到端的：节拍器带倒计时 → 实时录音 → 每音符评分 → 标记的钢琴乐谱 → 练习循环，只有在干净地完成之后才会提高速度。浏览器界面是一个真正的作曲工具——精确到节拍的传输，循环区域、录音激活、完整的撤销/重做、多选和剪贴板、触摸支持——[可在网上体验](https://mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit/)。

同时发布 **[jam-actions-v0](#training-dataset)**——一个包含 57 条记录的训练数据集，记录了在古典钢琴音乐中进行的多轮 MCP 工具使用过程，具有 7 轴发布门控、冷启动可重复性以及完整的 Zenodo + CITATION.cff 元数据（CC-BY-SA-3.0-DE），镜像在 [Hugging Face](https://huggingface.co/datasets/mcp-tool-shop/jam-actions-v0) 上，并且现在包含**双向的经过验证的微调结果**：一个诚实的负面结果（v0）和一个经过预注册约束的正向结果，后者只差一个配对胜局就达到了自身的胜利标准（v1）——请参阅[微调结果](#training-dataset)。此版本还修复了巴赫乐曲的原始文件（工作集修订版 r001/r002，包含勘误表），此前 v1 流水线的执行门控检测到已发布的窗口超出了 BWV 846 实际的 62 乐句。MCP 服务器 + 界面 + 数据集打包器 + 评估框架 + 发布门控验证器共通过 2506 个测试。所有 MIDI 文件都已包含，每首歌曲都可以用于教学，并且该学习语料库也随之发布。

## 安全与隐私

**涉及的数据：** 歌曲库（JSON + MIDI）、用户歌曲目录（`~/.ai-jam-sessions/songs/`）、吉他调音配置、练习日志条目、本地音频输出设备。

**未涉及的数据（默认路径）：** MCP 服务器和 CLI 不会进行任何网络调用，不会读取任何凭据，也不会触及用户歌曲目录之外的任何系统文件。不会收集或发送任何遥测数据。与同一软件包中发布的**可选数据集/评估工具**（`scripts/run-llm-eval.ts`，来源验证器）是唯一的例外：当您明确调用它时，它可以调用 LLM API（从您的环境中读取 `ANTHROPIC_API_KEY`，但绝不会存储它）并获取来源 URL。它不会作为服务器、CLI 或安装的一部分运行。

**权限：** MCP 服务器仅使用 stdio 传输（不使用 HTTP）。CLI 访问本地文件系统和音频设备。有关完整策略，请参阅 [SECURITY.md](SECURITY.md)。

## 许可

MIT
