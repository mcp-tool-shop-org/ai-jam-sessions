<p align="center"><a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <strong>हिन्दी</strong> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a></p>

<p align="center">
  <img src="logo.png" alt="PianoAI लोगो" width="180" />
</p>

<h1 align="center">PianoAI</h1>

<p align="center">
  बिल्ट-इन ऑडियो इंजन और 100 गानों की लाइब्रेरी वाला AI पियानो प्लेयर। Claude के लिए MCP सर्वर, इंसानों के लिए CLI।
</p>

[![MCP Tools](https://img.shields.io/badge/MCP_tools-15-purple)](https://github.com/mcp-tool-shop-org/ai_jam_session)
[![Songs](https://img.shields.io/badge/songs-100_built--in-blue)](https://github.com/mcp-tool-shop-org/ai_jam_session)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen)](https://github.com/mcp-tool-shop-org/ai_jam_session)

## यह क्या है?

एक पियानो जिसे Claude बजा सकता है। PianoAI एक MCP सर्वर है जिसमें बिल्ट-इन ऑडियो इंजन है — यह आपके स्पीकर्स से बजता है, किसी बाहरी सॉफ़्टवेयर की ज़रूरत नहीं। Claude 10 शैलियों में फैली 100 गानों की लाइब्रेरी ब्राउज़ करता है, गाने चुनता है, उन्हें सिखाता है, और उन पर जैम करता है। एक स्टैंडअलोन CLI के रूप में भी काम करता है।

## विशेषताएँ

- **बिल्ट-इन पियानो इंजन** — `node-web-audio-api` के ज़रिए सैंपल-आधारित ऑडियो, स्पीकर्स से बजता है
- **100 गानों की लाइब्रेरी** — क्लासिकल, जैज़, पॉप, ब्लूज़, रॉक, R&B, लैटिन, फ़िल्म, रैगटाइम, न्यू-एज
- **AI Jam Session** — Claude किसी गाने के कॉर्ड्स और मेलोडी का विश्लेषण करता है, फिर अपनी खुद की व्याख्या बनाता है
- **MIDI फ़ाइल सपोर्ट** — कोई भी `.mid` फ़ाइल बजाएँ: `ai-jam-session play song.mid`
- **शिक्षण प्रणाली** — हर मापक (measure) के लिए शिक्षण नोट्स, संगीत भाषा विवरण, अभ्यास सुझाव
- **4 प्लेबैक मोड** — full, measure-by-measure, hands separate, loop
- **स्पीड कंट्रोल** — 0.5x धीमे अभ्यास से 4x तेज़ तक
- **रीयल-टाइम कंट्रोल** — प्लेबैक के दौरान पॉज़, रिज़्यूम, स्पीड बदलाव
- **15 MCP टूल्स** — play, browse, teach, jam, import — सब MCP प्रोटोकॉल के ज़रिए
- **अपने खुद के गाने जोड़ें** — `add_song` टूल SongEntry JSON स्वीकार करता है, `import_midi` MIDI फ़ाइलों को कनवर्ट करता है
- **वैकल्पिक MIDI आउटपुट** — `--midi` फ़्लैग से बाहरी सॉफ़्टवेयर में भेजें (loopMIDI + VMPK आवश्यक)

## इंस्टॉल करें

```bash
npm install -g @mcptoolshop/ai_jam_session
```

**Node.js 18+** ज़रूरी है। बस इतना ही — कोई MIDI ड्राइवर नहीं, कोई वर्चुअल पोर्ट नहीं, कोई बाहरी सॉफ़्टवेयर नहीं।

## शुरू करें

```bash
# बिल्ट-इन गाना बजाएँ
ai-jam-session play let-it-be

# MIDI फ़ाइल बजाएँ
ai-jam-session play path/to/song.mid

# आधी स्पीड पर अभ्यास
ai-jam-session play moonlight-sonata-mvt1 --speed 0.5

# सभी बिल्ट-इन गानों की सूची देखें
ai-jam-session list

# गाने की जानकारी + शिक्षण नोट्स देखें
ai-jam-session info autumn-leaves
```

### प्ले ऑप्शन

| फ़्लैग | विवरण |
|------|-------------|
| `--speed <mult>` | स्पीड गुणक: 0.5 = आधी, 1.0 = सामान्य, 2.0 = दोगुनी |
| `--tempo <bpm>` | गाने की डिफ़ॉल्ट टेम्पो ओवरराइड करें (10-400 BPM) |
| `--mode <mode>` | प्लेबैक मोड: `full`, `measure`, `hands`, `loop` |
| `--midi` | बिल्ट-इन इंजन की बजाय बाहरी MIDI सॉफ़्टवेयर में भेजें |

## MCP सर्वर

MCP सर्वर LLM इंटीग्रेशन के लिए 15 टूल्स प्रदान करता है:

| टूल | विवरण |
|------|-------------|
| `list_songs` | शैली, कठिनाई, या क्वेरी से गाने ब्राउज़/खोजें |
| `song_info` | पूर्ण संगीत भाषा, शिक्षण लक्ष्य, अभ्यास सुझाव |
| `registry_stats` | शैली और कठिनाई के अनुसार गानों की गिनती |
| `teaching_note` | हर मापक के लिए शिक्षण नोट, फ़िंगरिंग, डायनामिक्स |
| `suggest_song` | मानदंडों के आधार पर सुझाव |
| `list_measures` | शिक्षण नोट्स के साथ मापकों का अवलोकन |
| `practice_setup` | किसी गाने के लिए स्पीड, मोड, और सेटिंग्स का सुझाव |
| `sing_along` | हर मापक के लिए गाने योग्य टेक्स्ट (नोट नाम, सोलफ़ेज, कंटूर) |
| `play_song` | स्पीकर्स से गाना या MIDI फ़ाइल बजाएँ |
| `pause_playback` | चल रहे गाने को पॉज़ या रिज़्यूम करें |
| `set_speed` | प्लेबैक के दौरान स्पीड बदलें |
| `stop_playback` | चल रहे गाने को रोकें |
| `ai_jam_session` | जैम ब्रीफ़ प्राप्त करें — कॉर्ड्स, मेलोडी, शैली मार्गदर्शन — इम्प्रोवाइज़ेशन के लिए |
| `add_song` | लाइब्रेरी में नया गाना जोड़ें (SongEntry JSON) |
| `import_midi` | MIDI फ़ाइल को SongEntry में बदलें और रजिस्टर करें |

### AI Jam Session

`ai_jam_session` टूल किसी भी गाने से एक संरचित "जैम ब्रीफ़" निकालता है: कॉर्ड प्रोग्रेशन, मेलोडी कंटूर, और शैली-विशिष्ट मार्गदर्शन। Claude इस ब्रीफ़ का उपयोग अपनी खुद की व्याख्या बनाने के लिए करता है।

दो मोड:
- **विशिष्ट गाना:** `ai_jam_session({ songId: "autumn-leaves", style: "blues" })` — Autumn Leaves पर ब्लूज़ शैली में जैम करें
- **रैंडम शैली चयन:** `ai_jam_session({ genre: "jazz" })` — एक रैंडम जैज़ गाना चुनें और उस पर जैम करें

वैकल्पिक पैरामीटर: `mood` (upbeat, melancholic, dreamy, आदि), `difficulty`, `measures` ("1-8" जैसी रेंज)।

### Claude Desktop / Claude Code कॉन्फ़िगरेशन

```json
{
  "mcpServers": {
    "ai_jam_session": {
      "command": "npx",
      "args": ["-y", "-p", "@mcptoolshop/ai_jam_session", "ai-jam-session-mcp"]
    }
  }
}
```

### Claude Code प्लगइन

PianoAI में एक Claude Code प्लगइन शामिल है जो स्लैश कमांड्स और एजेंट व्यक्तित्व जोड़ता है:

| कमांड | विवरण |
|---------|-------------|
| `/ai-jam-session:teach <song>` | एक संरचित शिक्षण सत्र शुरू करें |
| `/ai-jam-session:practice <song>` | स्पीड/मोड सुझावों के साथ अभ्यास योजना प्राप्त करें |
| `/ai-jam-session:explore [query]` | शैली, कठिनाई, या कीवर्ड से गानों की लाइब्रेरी ब्राउज़ करें |
| `/ai-jam-session:jam <song or genre>` | जैम सत्र शुरू करें — Claude अपनी खुद की व्याख्या बनाता है |

दो एजेंट व्यक्तित्व:
- **Piano Teacher** — धैर्यवान, शिक्षाशास्त्रीय, छात्रों के स्तर पर मिलता है
- **Jam Musician** — आरामदेह जैम बैंड माहौल, ग्रूव-प्रधान, प्रयोग को प्रोत्साहित करता है

## गानों की लाइब्रेरी

10 शैलियों और 3 कठिनाई स्तरों में 100 बिल्ट-इन गाने:

| शैली | गाने | उदाहरण |
|-------|-------|---------|
| Classical | 10 | Fur Elise, Clair de Lune, Moonlight Sonata, Bach Prelude in C |
| Jazz | 10 | Autumn Leaves, Take Five, So What, Misty |
| Pop | 10 | Imagine, Hallelujah, Piano Man, Bohemian Rhapsody |
| Blues | 10 | Basic 12-Bar, St. Louis Blues, Stormy Monday, Thrill Is Gone |
| Rock | 10 | Stairway Intro, Hotel California, Rocket Man, Layla Coda |
| R&B | 10 | Superstition, Georgia On My Mind, Lean On Me, My Girl |
| Latin | 10 | Girl from Ipanema, Besame Mucho, Oye Como Va, Wave |
| Film | 11 | Cinema Paradiso, Moon River, Hedwig's Theme, Spirited Away |
| Ragtime | 9 | The Entertainer, Maple Leaf Rag, Elite Syncopations |
| New-Age | 10 | River Flows in You, Snowfall, Crystal Stream, Evening Calm |

## प्रोग्रामैटिक API

```typescript
import { createAudioEngine, parseMidiFile, PlaybackController } from "@mcptoolshop/ai_jam_session";

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

### बिल्ट-इन गाना बजाएँ

```typescript
import { getSong, createSession, createAudioEngine } from "@mcptoolshop/ai_jam_session";

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

## आर्किटेक्चर

```
MIDI files (.mid)          Built-in song library (JSON)
       |                              |
       v                              v
  MIDI Parser ──────────────── Note Parser
       |                              |
       v                              v
 MidiPlaybackEngine            SessionController
       |                              |
       └──────── PlaybackController ──┘
                 (real-time events, hooks)
                        |
          ┌─────────────┼─────────────┐
          v             v             v
     AudioEngine   Teaching Hooks  Progress
     (speakers)    (per-measure)   (callbacks)
          |
          v
    node-web-audio-api (Rust DSP)
```

## लाइसेंस

MIT
