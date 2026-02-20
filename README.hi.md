<p align="center">
  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <strong>हिन्दी</strong> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a>
</p>

<p align="center">
  <img src="logo.svg" alt="PianoAI लोगो" width="180" />
</p>

<h1 align="center">PianoAI</h1>

<p align="center">
  AI-संचालित पियानो शिक्षण के लिए MCP सर्वर + CLI — MIDI के माध्यम से VMPK पर बजाता है और वॉइस फीडबैक देता है।
</p>

[![Tests](https://img.shields.io/badge/tests-163_passing-brightgreen)](https://github.com/mcp-tool-shop-org/pianoai)
[![Smoke](https://img.shields.io/badge/smoke-25_passing-brightgreen)](https://github.com/mcp-tool-shop-org/pianoai)
[![MCP Tools](https://img.shields.io/badge/MCP_tools-8-purple)](https://github.com/mcp-tool-shop-org/pianoai)
[![Songs](https://img.shields.io/badge/songs-10_(via_ai--music--sheets)-blue)](https://github.com/mcp-tool-shop-org/ai-music-sheets)

## यह क्या है?

एक TypeScript CLI और MCP सर्वर जो [ai-music-sheets](https://github.com/mcp-tool-shop-org/ai-music-sheets) से पियानो गाने लोड करता है, उन्हें MIDI में पार्स करता है, और वर्चुअल MIDI पोर्ट के माध्यम से [VMPK](https://vmpk.sourceforge.io/) पर बजाता है। टीचिंग इंजन मेजर बाउंड्री और मुख्य क्षणों पर इंटरजेक्शन फायर करता है, जिससे एक LLM वॉइस और aside फीडबैक के साथ लाइव पियानो शिक्षक की भूमिका निभा सकता है।

## विशेषताएँ

- **4 प्लेबैक मोड** — full, measure-by-measure, hands separate, loop
- **स्पीड कंट्रोल** — 0.5x धीमे अभ्यास से 2x तेज़ प्लेबैक तक, टेम्पो ओवरराइड के साथ स्टैक होता है
- **प्रगति ट्रैकिंग** — प्रतिशत माइलस्टोन या प्रति-मेजर पर कॉन्फ़िगर करने योग्य कॉलबैक
- **8 टीचिंग हुक** — console, silent, recording, callback, voice, aside, sing-along, compose
- **सिंग-अलॉंग नैरेशन** — प्रत्येक मेजर से पहले नोट नाम, सोलफेज, कॉन्टूर, या सिलेबल बोले जाते हैं
- **वॉइस फीडबैक** — mcp-voice-soundboard इंटीग्रेशन के लिए `VoiceDirective` आउटपुट
- **Aside इंटरजेक्शन** — mcp-aside इनबॉक्स के लिए `AsideDirective` आउटपुट
- **सुरक्षित पार्सिंग** — खराब नोट्स एकत्रित `ParseWarning` के साथ सुचारू रूप से स्किप होते हैं
- **8 MCP टूल** — LLM के लिए रजिस्ट्री, टीचिंग नोट्स, सिंग-अलॉंग, और गाने की सिफारिशें उपलब्ध कराते हैं
- **नोट पार्सर** — साइंटिफिक पिच नोटेशन से MIDI और वापस
- **मॉक कनेक्टर** — MIDI हार्डवेयर के बिना पूर्ण टेस्ट कवरेज

## पूर्वापेक्षाएँ

1. **[loopMIDI](https://www.tobias-erichsen.de/software/loopmidi.html)** — एक वर्चुअल MIDI पोर्ट बनाएँ (जैसे, "loopMIDI Port")
2. **[VMPK](https://vmpk.sourceforge.io/)** — MIDI इनपुट को अपने loopMIDI पोर्ट पर सेट करें
3. **Node.js 18+**

## इंस्टॉल

```bash
npm install -g @mcptoolshop/pianoai
```

## त्वरित प्रारंभ

```bash
# सभी गाने सूचीबद्ध करें
pianai list

# गाने का विवरण + टीचिंग नोट्स देखें
pianai info moonlight-sonata-mvt1

# VMPK के माध्यम से गाना बजाएँ
pianai play let-it-be

# टेम्पो ओवरराइड के साथ बजाएँ
pianai play basic-12-bar-blues --tempo 80

# मेजर-दर-मेजर चरणबद्ध तरीके से चलें
pianai play autumn-leaves --mode measure

# आधी गति से अभ्यास
pianai play moonlight-sonata-mvt1 --speed 0.5

# धीमा हैंड्स-सेपरेट अभ्यास
pianai play dream-on --speed 0.75 --mode hands

# सिंग अलॉंग — प्लेबैक के दौरान नोट नाम नैरेट करें
pianai sing let-it-be --mode note-names

# सोलफेज के साथ सिंग अलॉंग, दोनों हाथ
pianai sing fur-elise --mode solfege --hand both
```

## MCP सर्वर

MCP सर्वर LLM इंटीग्रेशन के लिए 8 टूल उपलब्ध कराता है:

| टूल | विवरण |
|------|--------|
| `list_songs` | शैली, कठिनाई, या क्वेरी के अनुसार गाने ब्राउज़/खोजें |
| `song_info` | पूर्ण संगीत भाषा, शिक्षण लक्ष्य, अभ्यास सुझाव प्राप्त करें |
| `registry_stats` | शैली और कठिनाई के अनुसार गानों की गिनती |
| `teaching_note` | प्रति-मेजर टीचिंग नोट, फिंगरिंग, डायनामिक्स |
| `suggest_song` | मानदंडों के आधार पर सिफारिश प्राप्त करें |
| `sing_along` | प्रति-मेजर गाने योग्य टेक्स्ट (नोट नाम, सोलफेज, कॉन्टूर, सिलेबल) प्राप्त करें |
| `list_measures` | टीचिंग नोट्स + पार्स चेतावनियों के साथ मेजर का अवलोकन |
| `practice_setup` | किसी गाने के लिए स्पीड, मोड, और वॉइस सेटिंग्स सुझाएँ |

```bash
# MCP सर्वर शुरू करें (stdio ट्रांसपोर्ट)
pnpm mcp
```

### Claude Desktop कॉन्फ़िगरेशन

```json
{
  "mcpServers": {
    "pianai": {
      "command": "pianai-mcp"
    }
  }
}
```

## CLI कमांड

| कमांड | विवरण |
|--------|--------|
| `list [--genre <genre>]` | उपलब्ध गाने सूचीबद्ध करें, वैकल्पिक रूप से शैली द्वारा फ़िल्टर |
| `info <song-id>` | गाने का विवरण दिखाएँ: संगीत भाषा, टीचिंग नोट्स, संरचना |
| `play <song-id> [opts]` | MIDI के माध्यम से VMPK पर गाना बजाएँ |
| `sing <song-id> [opts]` | सिंग अलॉंग — प्लेबैक के दौरान नोट्स नैरेट करें |
| `stats` | रजिस्ट्री आँकड़े (गाने, शैलियाँ, मेजर) |
| `ports` | उपलब्ध MIDI आउटपुट पोर्ट सूचीबद्ध करें |
| `help` | उपयोग जानकारी दिखाएँ |

### प्ले विकल्प

| फ़्लैग | विवरण |
|--------|--------|
| `--port <name>` | MIDI पोर्ट नाम (डिफ़ॉल्ट: loopMIDI ऑटो-डिटेक्ट) |
| `--tempo <bpm>` | गाने के डिफ़ॉल्ट टेम्पो को ओवरराइड करें (10-400 BPM) |
| `--speed <mult>` | स्पीड मल्टीप्लायर: 0.5 = आधा, 1.0 = सामान्य, 2.0 = दोगुना |
| `--mode <mode>` | प्लेबैक मोड: `full`, `measure`, `hands`, `loop` |

## टीचिंग इंजन

टीचिंग इंजन प्लेबैक के दौरान हुक फायर करता है। 8 हुक इम्प्लीमेंटेशन हर उपयोग मामले को कवर करते हैं:

| हुक | उपयोग मामला |
|------|-------------|
| `createConsoleTeachingHook()` | CLI — कंसोल पर मेजर, मोमेंट्स, कम्प्लीशन लॉग करता है |
| `createSilentTeachingHook()` | टेस्टिंग — नो-ऑप |
| `createRecordingTeachingHook()` | टेस्टिंग — असर्शन के लिए इवेंट रिकॉर्ड करता है |
| `createCallbackTeachingHook(cb)` | कस्टम — किसी भी async कॉलबैक पर रूट करें |
| `createVoiceTeachingHook(sink)` | वॉइस — mcp-voice-soundboard के लिए `VoiceDirective` उत्पन्न करता है |
| `createAsideTeachingHook(sink)` | Aside — mcp-aside इनबॉक्स के लिए `AsideDirective` उत्पन्न करता है |
| `createSingAlongHook(sink, song)` | सिंग-अलॉंग — प्रत्येक मेजर से पहले नोट नाम/सोलफेज/कॉन्टूर नैरेट करता है |
| `composeTeachingHooks(...hooks)` | मल्टी — क्रमिक रूप से कई हुक पर डिस्पैच करता है |

### वॉइस फीडबैक

```typescript
import { createSession, createVoiceTeachingHook } from "@mcptoolshop/pianoai";
import { getSong } from "ai-music-sheets";

const voiceHook = createVoiceTeachingHook(
  async (directive) => {
    // mcp-voice-soundboard के voice_speak पर रूट करें
    console.log(`[Voice] ${directive.text}`);
  },
  { voice: "narrator", speechSpeed: 0.9 }
);

const session = createSession(getSong("moonlight-sonata-mvt1")!, connector, {
  teachingHook: voiceHook,
  speed: 0.5, // आधी गति से अभ्यास
});

await session.play();
// voiceHook.directives → सभी वॉइस निर्देश जो फायर किए गए
```

### हुक कंपोज़ करना

```typescript
import {
  createVoiceTeachingHook,
  createAsideTeachingHook,
  createRecordingTeachingHook,
  composeTeachingHooks,
} from "@mcptoolshop/pianoai";

// तीनों हर इवेंट पर फायर होते हैं
const composed = composeTeachingHooks(
  createVoiceTeachingHook(voiceSink),
  createAsideTeachingHook(asideSink),
  createRecordingTeachingHook()
);
```

### सिंग-अलॉंग नैरेशन

```typescript
import {
  createSingAlongHook,
  createVoiceTeachingHook,
  composeTeachingHooks,
  createSession,
} from "@mcptoolshop/pianoai";
import { getSong } from "@mcptoolshop/ai-music-sheets";

const song = getSong("let-it-be")!;

// प्रत्येक मेजर से पहले सोलफेज नैरेट करें, फिर टीचिंग नोट्स बोलें
const singHook = createSingAlongHook(voiceSink, song, {
  mode: "solfege",
  hand: "right",
});
const teachHook = createVoiceTeachingHook(voiceSink);
const combined = composeTeachingHooks(singHook, teachHook);

const session = createSession(song, connector, { teachingHook: combined });
await session.play();
// singHook.directives → प्रत्येक मेजर से पहले ब्लॉकिंग "Do... Mi... Sol"
```

## प्रोग्रामेटिक API

```typescript
import { getSong } from "ai-music-sheets";
import { createSession, createVmpkConnector } from "@mcptoolshop/pianoai";

const connector = createVmpkConnector({ portName: /loop/i });
await connector.connect();

const song = getSong("autumn-leaves")!;
const session = createSession(song, connector, {
  mode: "measure",
  tempo: 100,
  speed: 0.75,           // अभ्यास के लिए 75% गति
  onProgress: (p) => console.log(p.percent), // "25%", "50%", आदि
});

await session.play();          // एक मेजर बजाता है, रुकता है
session.next();                // अगले मेजर पर आगे बढ़ें
await session.play();          // अगला मेजर बजाएँ
session.setSpeed(1.0);         // सामान्य गति पर वापस
await session.play();          // पूर्ण गति पर अगला मेजर बजाएँ
session.stop();                // रोकें और रीसेट करें

// किसी भी पार्स चेतावनी की जाँच करें (गाने के डेटा में खराब नोट्स)
if (session.parseWarnings.length > 0) {
  console.warn("कुछ नोट्स पार्स नहीं हो सके:", session.parseWarnings);
}

await connector.disconnect();
```

## आर्किटेक्चर

```
ai-music-sheets (लाइब्रेरी)       pianai (रनटाइम)
┌──────────────────────┐         ┌────────────────────────────────┐
│ SongEntry (हाइब्रिड) │────────→│ Note Parser (सुरक्षित + सख्त) │
│ Registry (खोज)       │         │ Session Engine (स्पीड+प्रगति)  │
│ 10 गाने, 10 शैलियाँ  │         │ Teaching Engine (8 हुक)        │
└──────────────────────┘         │ VMPK Connector (JZZ)          │
                                 │ MCP Server (8 टूल)            │
                                 │ CLI (प्रोग्रेस बार + वॉइस)    │
                                 └─────────┬──────────────────────┘
                                           │ MIDI
                                           ▼
                                 ┌─────────────────┐
                                 │ loopMIDI → VMPK │
                                 └─────────────────┘

टीचिंग हुक रूटिंग:
  Session → TeachingHook → VoiceDirective → mcp-voice-soundboard
                         → AsideDirective → mcp-aside इनबॉक्स
                         → Console log    → CLI टर्मिनल
                         → Recording      → टेस्ट असर्शन
```

## टेस्टिंग

```bash
pnpm test       # 163 Vitest टेस्ट (पार्सर + सेशन + टीचिंग + वॉइस + aside + सिंग-अलॉंग)
pnpm smoke      # 25 स्मोक टेस्ट (इंटीग्रेशन, MIDI आवश्यक नहीं)
pnpm typecheck  # tsc --noEmit
```

मॉक VMPK कनेक्टर (`createMockVmpkConnector`) हार्डवेयर के बिना सभी MIDI इवेंट रिकॉर्ड करता है, जिससे पूर्ण टेस्ट कवरेज संभव होता है। सुरक्षित पार्सिंग फ़ंक्शन (`safeParseMeasure`) थ्रो करने के बजाय `ParseWarning` ऑब्जेक्ट एकत्र करते हैं, ताकि अगर किसी गाने में गलत नोट्स हों तो प्लेबैक सुचारू रूप से जारी रहे।

## संबंधित

- **[ai-music-sheets](https://github.com/mcp-tool-shop-org/ai-music-sheets)** — गानों की लाइब्रेरी: 10 शैलियाँ, हाइब्रिड फॉर्मेट (मेटाडेटा + संगीत भाषा + कोड-रेडी मेजर)

## लाइसेंस

MIT
