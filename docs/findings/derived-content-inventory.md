# Derived content of uncleared songs in the tracked tree

Inventory date: 2026-09-25. Base: `main` at `46ce824`. The machine-readable companion is `derived-content-inventory.json` beside this file; it lists every file, every uncleared song and every value quoted here. This is a measurement for a decision, not legal advice.

## Headline

The public tree held **note-level content of 86 compositions that may still be in copyright**. All of it sits in seven files:

| File | What it holds | Uncleared songs (possibly in copyright) | Note units (possibly in copyright) |
|---|---|---:|---:|
| `experiments/maker-arc/implied-chord-snapshot.json` | the left hand of every measure of every library song, as hand strings | 94 (80) | 71,400 (66,267) |
| `experiments/rollout-arc/p3/runs/er-items.json` | eight-measure right-hand melodies | 41 (36) | 1,819 (1,707) |
| `experiments/rollout-arc/p3/runs/er-prompts.jsonl` | the same melodies inside prompts, plus ABC | 41 (36) | 1,983 (1,851) |
| `experiments/rollout-arc/p3/runs/er-g8.jsonl` | model generations that re-emit the melody (181 of 293 melody measures verbatim) | 41 (36) | 6,338 (5,716) |
| `experiments/rollout-arc/p3/runs/smoke.jsonl` | two items of the same kind | 2 (2) | 549 (549) |
| `experiments/maker-arc/er-gate/items.json` | eight-measure right-hand melodies | 20 (17) | 1,113 (972) |
| `experiments/maker-arc/implied-chord-bass-aware-shifts.json` | one measure's left hand per relabelled chord | 38 (30) | 865 (718) |

That makes 77,780 note units keyed to possibly-in-copyright compositions. The rest of what this PR removes or redacts, 42,177 units in 183 files, concerns compositions in the public domain: the four withdrawn works (Chopin Op. 9/2 and Op. 28/4, Beethoven Op. 13 II, Schumann Op. 15/7), the pre-Mutopia Satie and Debussy files, folk tunes and Joplin rags. There only the arrangement layer is at issue, as the 2026-09-25 audit found.

Counts:
- 238 tracked files carried note- or measurement-level content of an uncleared song or an unevidenced record. This PR deletes, filters or redacts 221 of them (the 30 Satie/Debussy piano rolls included), keeps 11 as not derived and holds 6.
- 475 more files name an uncleared song without carrying notes: metadata only.
- 103 of the 106 uncleared songs had note-level content somewhere in the tree. 89 of the 106 compositions may be in copyright. The composition table below gives dates, authors, sources and confidence for every one.

**Beyond the tree.** One published surface outside the brief carries measurement-level content of an uncleared arrangement. The GitHub Pages landing page plays `site/public/audio/amazing-grace-vocal-route-2026-09-05.mp3`. Its piano bed renders measures 1-10 of the library's Amazing Grace arrangement (bitmidi, licence unknown), and both mp3s take their sung timing from that file's melody track. The composition, New Britain (1829) with Newton's words (1779), is in the public domain. This PR does **not** touch that bundle (the two mp3s, `scores/amazing-grace.score-clock.v1.json` and five receipts); the decision is the owner's. `src/dataset/derived-content-exceptions.json` lists these files as held.

## Classification

- **Cleared** reuses the packager's gate; nothing here redefines it. A song is cleared when a record built from exactly the evidenced file passes `evidenceRefusal` (`src/dataset/package-public.ts`): `arrangement_license` in `REDISTRIBUTABLE_ARRANGEMENT_LICENSES` (`CC-BY-SA-3.0-DE`, `Public-Domain`) and `title_verdict` not `contradicts`. Fourteen songs are cleared. A v0 window record is judged by `evidenceRefusal` on itself, sidecar hash included. The 30 Satie/Debussy records fail that way: their songs are cleared today, but they were built from the files replaced from Mutopia on 2026-08-19.
- **Note-level**: an encoding from which individual pitches can be read. That covers hand strings (`D4+F4:h`), runs of four or more pitch names, REMI `Pitch_NN` tokens, ABC tunes, piano-roll rectangles, MIDI-number arrays, and note fields and events.
- **Measurement-level**: values measured on a take of the song, such as f0, cents off target and onset offsets. Only data files are judged for these.
- **Metadata-only**: ids, titles, chord symbols, labels, counts, prose, and single pitches.
- **Floors**: in a data file (`.json`, `.jsonl`, `.log`, `.svg`) one unit keyed to an uncleared song is a finding. In prose and code a finding needs four note units, so a named chord or a single pitch is commentary. Bare pitch runs ignore octaves 7 and up, so a blues progression written as `C7 F7 G7` does not read as a melody.
- **Keyed to**: the owning object's `songId`/`song_id`/`scope.song_id`, an id whose first segment is a song id, a training line's `_meta`, a tab-separated snapshot line, or an object keyed by song id. A one-word id (`wave`, `misty`, `respect`) counts in text only in identifier form (quoted, in a path, or as a record-id prefix).

The scanner is `src/dataset/derived-content.ts`, and the same code runs the CI guard. `pnpm exec tsx scripts/derived-content-scan.ts --ref 46ce824 --json` reproduces the 1,054 pre-sweep findings behind this inventory.

## What the PR does, per class of file

- **Deleted (177)**: the 88 v0 working-corpus records the evidence gate refuses (58 from the four works, 30 Satie/Debussy built from pre-Mutopia files), their 88 piano rolls, and `experiments/rollout-arc/p3/runs/smoke.jsonl`, whose every line is uncleared.
- **Lines or items filtered (18 files)**: training data, prompts, predictions and E-R items. A line or item that carries any note or measurement unit keyed to an uncleared song or an unevidenced record is dropped. Prose-only lines about those songs stay. Counts that describe a filtered list (`itemCount`, `briefCount`) follow the list.
- **Redacted in place (25 files)**: results and receipts whose ids, scores and aggregates are the record. Note-bearing strings become `[removed 2026-09-25: note content of an arrangement outside the cleared set]`, note arrays become `[]`, note events leave their arrays, and measured values become `null`. In the snapshot and the bass-aware shift receipt only the left-hand field changes; song, measure and chord labels stay. That keeps the snapshot at 108 songs, so its regression test is unchanged.
- **Doc excerpts redacted (1)**: `docs/jam-actions-v0-slice9c-local-lora.md`, twelve REMI/ABC excerpts of the withdrawn and pre-Mutopia examples.
- **Kept, not derived (11)**, each reviewed and listed in `src/dataset/derived-content-exceptions.json` with the songs it covers and a unit ceiling:
  - model voicings of chord symbols;
  - continuations the ceiling model composed, whose longest shared pitch run with the real targets is 2 to 6;
  - per-measure voicings, where none of the 162 E-R melody measures appears;
  - one five-note chord named in an annotation;
  - four prose passages naming pitch-only fragments of public-domain works.
- **Held for the owner (6)**: the Amazing Grace vocal-route inputs described above.

## Note-level hits on compositions that may be in copyright

Ordered by note units (derived content only; composite keys count toward each song). "Where" names the files. The composition columns come from the table further down.

| Song | Composition | First published | Authors (died) | US PD | EU PD | Confidence | Note units | Where |
|---|---|---|---|---|---|---|---:|---|
| blue-bossa | Blue Bossa | 1963 | Kenny Dorham (1972) | no | no | high | 2330 | snapshot, E-R generations, E-R items, E-R prompts |
| lets-stay-together | Let's Stay Together (Al Green song) | 1971 | Al Green (living); Willie Mitchell (2010); Al Jackson Jr. (1975) | no | no | high | 1898 | snapshot |
| besame-mucho | Bésame Mucho | 1932 | Consuelo Velázquez (2005) | no | no | high | 1735 | E-R gate items, snapshot, E-R generations, E-R items, E-R prompts |
| mas-que-nada | Mas que Nada | 1963 | Jorge Ben Jor (living) | no | no | high | 1706 | bass-aware shifts, snapshot |
| desafinado | Desafinado | 1959 | Antônio Carlos Jobim (1994); Newton Mendonça (1960) | no | no | high | 1687 | bass-aware shifts, snapshot |
| baba-oriley | Baba O'Riley | 1971 | Pete Townshend (living) | no | no | high | 1641 | E-R gate items, snapshot, E-R generations, E-R items, E-R prompts |
| rocket-man | Rocket Man (song) | 1972 | Elton John (living); Bernie Taupin (living) | no | no | high | 1565 | bass-aware shifts, snapshot |
| clocks | Clocks (song) | 2002 | Coldplay (band) | no | ? | medium | 1552 | bass-aware shifts, snapshot, E-R generations, E-R items, E-R prompts |
| crossroad-blues | Cross Road Blues | 1936 | Robert Johnson (1938) | ? | yes | low | 1531 | snapshot, E-R generations, E-R items, E-R prompts |
| tiny-dancer | Tiny Dancer | 1971 | Elton John (living); Bernie Taupin (living) | no | no | high | 1521 | bass-aware shifts, snapshot |
| halo | Halo (Beyoncé song) | 2008 | Ryan Tedder (living); Evan Bogart (living); Beyoncé (living) | no | no | high | 1495 | E-R gate items, snapshot, E-R generations, E-R items, E-R prompts |
| superstition | Superstition (song) | 1972 | Stevie Wonder (living) | no | no | high | 1492 | snapshot |
| st-louis-blues | St. Louis Blues (song) | 1914 | W. C. Handy (1958) | yes | no | high | 1451 | bass-aware shifts, snapshot, E-R generations, E-R items, E-R prompts |
| una-mattina | Una Mattina | 2004 | Ludovico Einaudi (living) | no | no | high | 1441 | snapshot |
| hedwigs-theme | Hedwig's Theme | 2001 | John Williams (living) | no | no | medium | 1436 | bass-aware shifts, snapshot, E-R generations, E-R items, E-R prompts |
| stairway-to-heaven | Stairway to Heaven | 1971 | Jimmy Page (living); Robert Plant (living) | no | no | high | 1427 | snapshot |
| stormy-monday | Call It Stormy Monday | 1948 | T-Bone Walker (1975) | no | no | high | 1402 | bass-aware shifts, snapshot |
| the-thrill-is-gone | The Thrill Is Gone (1951 song) | 1951 | Roy Hawkins (1974); Rick Darnell (?) | no | ? | medium | 1385 | snapshot |
| a-change-is-gonna-come | A Change Is Gonna Come | 1964 | Sam Cooke (1964) | no | no | high | 1350 | E-R gate items, snapshot, E-R generations, E-R items, E-R prompts |
| bennie-and-the-jets | Bennie and the Jets | 1973 | Elton John (living); Bernie Taupin (living) | no | no | high | 1328 | E-R gate items, snapshot, E-R generations, E-R items, E-R prompts |
| bohemian-rhapsody | Bohemian Rhapsody | 1975 | Freddie Mercury (1991) | no | no | high | 1280 | bass-aware shifts, snapshot, E-R generations, E-R items, E-R prompts |
| black-orpheus | Manhã de Carnaval | 1959 | Luiz Bonfá (2001); Antônio Maria (1964) | no | no | medium | 1279 | bass-aware shifts, snapshot, E-R generations, E-R items, E-R prompts |
| dock-of-the-bay | (Sittin' On) The Dock of the Bay | 1968 | Otis Redding (1967); Steve Cropper (2025) | no | no | high | 1249 | snapshot, E-R generations, E-R items, E-R prompts |
| layla-unplugged | Layla | 1970 | Eric Clapton (living); Jim Gordon (2023) | no | no | high | 1229 | snapshot |
| girl-from-ipanema | The Girl from Ipanema | 1962 | Antônio Carlos Jobim (1994); Vinicius de Moraes (1980); Norman Gimbel (2018) | no | no | high | 1210 | bass-aware shifts, snapshot |
| corcovado | Corcovado (song) | 1960 | Antônio Carlos Jobim (1994) | no | no | high | 1196 | bass-aware shifts, snapshot, E-R generations, E-R items, E-R prompts |
| a-thousand-years | A Thousand Years (Christina Perri song) | 2011 | Christina Perri (living); David Hodges (living) | no | no | high | 1187 | E-R gate items, snapshot, E-R generations, E-R items, E-R prompts |
| whats-going-on | What's Going On (song) | 1971 | Marvin Gaye (1984); Al Cleveland (1996); Renaldo Benson (2005) | no | no | high | 1132 | snapshot |
| november-rain | November Rain | 1991 | Axl Rose (living) | no | no | high | 1109 | snapshot |
| dont-stop-believin | Don't Stop Believin' | 1981 | Jonathan Cain (living); Steve Perry (living); Neal Schon (living) | no | no | high | 1081 | snapshot, E-R generations, E-R items, E-R prompts |
| ribbon-in-the-sky | Ribbon in the Sky | 1982 | Stevie Wonder (living) | no | no | high | 1070 | snapshot |
| sweet-home-chicago | Sweet Home Chicago | 1936 | Robert Johnson (1938) | ? | yes | low | 1067 | bass-aware shifts, snapshot |
| killing-me-softly | Killing Me Softly with His Song | 1972 | Charles Fox (living); Norman Gimbel (2018) | no | no | high | 1026 | bass-aware shifts, snapshot |
| i-got-you | I Got You (I Feel Good) | 1964 | James Brown (2006) | no | no | high | 1019 | snapshot, E-R generations, E-R items, E-R prompts |
| everyday-i-have-the-blues | Every Day I Have the Blues | 1935 | Aaron "Pinetop" Sparks (1935); Milton Sparks (?); Peter Chatman (1988) | ? | ? | low | 1014 | bass-aware shifts, snapshot, E-R generations, E-R items, E-R prompts |
| misty | Misty (song) | 1954 | Erroll Garner (1977); Johnny Burke (1964) | no | no | high | 993 | bass-aware shifts, snapshot |
| isnt-she-lovely | Isn't She Lovely | 1976 | Stevie Wonder (living) | no | no | high | 979 | snapshot |
| take-the-a-train | Take the "A" Train | 1941 | Billy Strayhorn (1967) | no | no | medium | 952 | bass-aware shifts, snapshot |
| autumn-leaves | Autumn Leaves (1945 song) | 1945 | Joseph Kosma (1969); Jacques Prévert (1977); Johnny Mercer (1976) | no | no | high | 942 | E-R gate items, snapshot, E-R generations, E-R items, E-R prompts, E-R smoke |
| your-song | Your Song | 1970 | Elton John (living); Bernie Taupin (living) | no | no | high | 891 | bass-aware shifts, snapshot |
| nuvole-bianche-na | Una Mattina | 2004 | Ludovico Einaudi (living) | no | no | high | 887 | bass-aware shifts, snapshot, E-R generations, E-R items, E-R prompts |
| lean-on-me | Lean on Me (song) | 1972 | Bill Withers (2020) | no | no | high | 886 | snapshot |
| if-i-aint-got-you | If I Ain't Got You | 2003 | Alicia Keys (living) | no | no | high | 854 | snapshot, E-R generations, E-R items, E-R prompts |
| aint-no-sunshine | Ain't No Sunshine | 1971 | Bill Withers (2020) | no | no | high | 847 | E-R gate items, snapshot, E-R generations, E-R items, E-R prompts |
| mia-and-sebastians-theme | La La Land (soundtrack) | 2016 | Justin Hurwitz (living) | no | no | high | 822 | snapshot, E-R generations, E-R items, E-R prompts |
| fly-me-to-the-moon | Fly Me to the Moon | 1954 | Bart Howard (2004) | no | no | high | 812 | snapshot, E-R generations, E-R items, E-R prompts |
| all-the-things-you-are | All the Things You Are | 1939 | Jerome Kern (1945); Oscar Hammerstein II (1960) | no | no | high | 799 | E-R gate items, snapshot, E-R generations, E-R items, E-R prompts, E-R smoke |
| nuvole-bianche | Una Mattina | 2004 | Ludovico Einaudi (living) | no | no | high | 793 | bass-aware shifts, snapshot |
| all-of-me | All of Me (John Legend song) | 2013 | John Legend (living); Toby Gad (living) | no | no | high | 790 | E-R gate items, snapshot, E-R generations, E-R items, E-R prompts |
| perfidia | Perfidia | 1939 | Alberto Domínguez (1975) | no | no | high | 767 | snapshot |
| let-it-be | Let It Be (song) | 1970 | Paul McCartney (living); John Lennon (1980) | no | no | high | 759 | snapshot |
| i-will-always-love-you | I Will Always Love You | 1974 | Dolly Parton (2026) | no | no | high | 726 | snapshot, E-R generations, E-R items, E-R prompts |
| dream-on | Dream On (Aerosmith song) | 1973 | Steven Tyler (living) | no | no | high | 713 | snapshot, E-R generations, E-R items, E-R prompts |
| respect | Respect (song) | 1965 | Otis Redding (1967) | no | no | high | 713 | snapshot |
| moon-river | Moon River | 1961 | Henry Mancini (1994); Johnny Mercer (1976) | no | no | high | 674 | snapshot |
| hoochie-coochie-man | Hoochie Coochie Man | 1954 | Willie Dixon (1992) | no | no | high | 648 | snapshot, E-R generations, E-R items, E-R prompts |
| metamorphosis-two | Solo Piano (Philip Glass album) | 1989 | Philip Glass (living) | no | no | high | 638 | snapshot, E-R generations, E-R items, E-R prompts |
| stand-by-me | Stand by Me (Ben E. King song) | 1961 | Ben E. King (2015); Jerry Leiber (2011); Mike Stoller (living) | no | no | high | 635 | bass-aware shifts, snapshot |
| pink-panther | The Pink Panther Theme | 1963 | Henry Mancini (1994) | no | no | high | 630 | snapshot |
| my-funny-valentine | My Funny Valentine | 1937 | Richard Rodgers (1979); Lorenz Hart (1943) | no | no | high | 615 | snapshot |
| no-one | No One (Alicia Keys song) | 2007 | Alicia Keys (living); Kerry Brothers Jr. (?); George M. Harry (?) | no | no | high | 604 | snapshot |
| river-flows-in-you | River Flows in You | 2001 | Yiruma (living) | no | no | high | 596 | bass-aware shifts, snapshot, E-R generations, E-R items, E-R prompts |
| my-girl | My Girl (The Temptations song) | 1964 | Smokey Robinson (living); Ronald White (1995) | no | no | high | 596 | bass-aware shifts, snapshot |
| my-heart-will-go-on | My Heart Will Go On | 1997 | James Horner (2015); Will Jennings (2024) | no | no | high | 594 | bass-aware shifts, snapshot |
| comptine-dun-autre-ete | Amélie (soundtrack) | 2001 | Yann Tiersen (living) | no | no | high | 581 | E-R gate items, snapshot, E-R generations, E-R items, E-R prompts |
| viva-la-vida | Viva la Vida | 2008 | Coldplay (band) | no | ? | high | 562 | snapshot |
| agua-de-beber | Água de Beber | 1963 | Antônio Carlos Jobim (1994); Vinicius de Moraes (1980) | no | no | high | 541 | E-R gate items, snapshot, E-R generations, E-R items, E-R prompts |
| round-midnight | 'Round Midnight (song) | 1943 | Thelonious Monk (1982); Cootie Williams (1985); Bernie Hanighen (1976) | no | no | high | 539 | snapshot |
| georgia-on-my-mind | Georgia on My Mind | 1930 | Hoagy Carmichael (1981); Stuart Gorrell (1963) | yes | no | high | 504 | snapshot |
| may-be | Yiruma | 2001 | Yiruma (living) | no | no | medium | 504 | bass-aware shifts, snapshot, E-R generations, E-R items, E-R prompts |
| imagine | Imagine (John Lennon song) | 1971 | John Lennon (1980); Yoko Ono (living) | no | no | high | 476 | snapshot |
| someone-like-you | Someone like You (Adele song) | 2011 | Adele (living); Dan Wilson (living) | no | no | high | 475 | snapshot |
| wave | Wave (Antônio Carlos Jobim song) | 1967 | Antônio Carlos Jobim (1994) | no | no | high | 406 | snapshot |
| piano-man | Piano Man (song) | 1973 | Billy Joel (living) | no | no | high | 376 | snapshot |
| fallin | Fallin' (Alicia Keys song) | 2001 | Alicia Keys (living) | no | no | high | 356 | E-R gate items, snapshot, E-R generations, E-R items, E-R prompts |
| summertime | Summertime (George Gershwin song) | 1935 | George Gershwin (1937); DuBose Heyward (1940) | no | yes | medium | 307 | snapshot |
| watermark | Watermark (Enya album) | 1988 | Enya (living) | no | no | high | 306 | bass-aware shifts, snapshot |
| schindlers-list-theme | Schindler's List (soundtrack) | 1993 | John Williams (living) | no | no | high | 304 | bass-aware shifts, snapshot |
| el-condor-pasa | El Cóndor Pasa (song) | 1913 | Daniel Alomía Robles (1942) | ? | yes | low | 301 | snapshot |
| forrest-gump | Forrest Gump (soundtrack) | 1994 | Alan Silvestri (living) | no | no | high | 275 | snapshot, E-R generations, E-R items, E-R prompts |
| blues-in-the-night | file is "Blowing Kisses in the Wind" (Paula Abdul, 1991), not Arlen/Mercer | 1991 | Peter Lord (?); V. Jeffrey Smith (?) | no | no | high | 77 | E-R gate items, bass-aware shifts |
| experience | file is "Scheming at Igros" from Final Fantasy Tactics (1997), not Einaudi | 1997 | Hitoshi Sakimoto (living); Masaharu Iwata (living) | no | no | high | 64 | E-R gate items |
| divenire | file is an unidentified piece carrying a Hades quotation and a hotmail credit, not Einaudi | ? | unidentified (band) | ? | ? | low | 52 | E-R gate items |
| opening-glassworks | file is "Livre pra Viver" as recorded by Pedro Mariano, not Philip Glass | ? | unidentified (band) | ? | ? | low | 42 | bass-aware shifts |
| born-under-a-bad-sign | file is a 1994 Tune 1000 karaoke file with an EMI copyright credit, not Jones/Bell | 1994 | unidentified (band) | no | ? | low | 35 | E-R gate items |
| kiss-the-rain | file is Depeche Mode's "Just Can't Get Enough" (1981), not Yiruma | 1981 | Vince Clarke (living) | no | no | high | 21 | bass-aware shifts |

## Note-level hits on public-domain compositions

Here the exposure is the arrangement file, not the composition.

| Song | Composition | First published | Authors (died) | Note units | Files |
|---|---|---|---|---:|---:|
| pathetique-mvt2 | Piano Sonata No. 8 (Beethoven) | 1799 | Ludwig van Beethoven (1827) | 12000 | 65 |
| chopin-nocturne-op9-no2 | Nocturnes, Op. 9 (Chopin) | 1832 | Frédéric Chopin (1849) | 10856 | 68 |
| schumann-traumerei | Träumerei | 1838 | Robert Schumann (1856) | 5085 | 57 |
| chopin-prelude-e-minor | Prelude, Op. 28, No. 4 (Chopin) | 1839 | Frédéric Chopin (1849) | 4520 | 48 |
| amazing-grace | Amazing Grace | 1779 | John Newton (1807); anonymous (tune New Britain, 1829) | 829 | 14 |
| gladiolus-rag | Scott Joplin | 1907 | Scott Joplin (1917) | 806 | 6 |
| auld-lang-syne | Auld Lang Syne | 1788 | Robert Burns (1796); traditional | 735 | 6 |
| danny-boy | Danny Boy | 1913 | Frederic Weatherly (1929); traditional (Londonderry Air) | 722 | 6 |
| weeping-willow | Weeping Willow (rag) | 1903 | Scott Joplin (1917) | 654 | 3 |
| house-of-the-rising-sun | The House of the Rising Sun | 1933 | traditional | 627 | 2 |
| shenandoah | Oh Shenandoah | 1882 | traditional | 360 | 3 |
| sakura-sakura | Sakura Sakura | 1888 | traditional | 213 | 2 |
| cinema-paradiso | file is Chopin's Étude Op. 10 No. 5 (Krueger, 1999), not Morricone | 1833 | Frédéric Chopin (1849) | 97 | 1 |
| greensleeves | Greensleeves | 1580 | traditional | 82 | 5 |
| simple-gifts | Simple Gifts | 1848 | Joseph Brackett (1882) | 62 | 2 |
| scarborough-fair | file is "Greensleeves" (traditional; sequenced by Jim Paterson) | 1580 | traditional | 54 | 2 |
| the-water-is-wide | file is Stephen Foster's "The Glendy Burk" (1860) | 1860 | Stephen Foster (1864) | 0 | 1 |

The four withdrawn works also appear in the finetune data and eval traces, the LoRA training lines, the e2-gate briefs, the enrichment overrides, the e3 grounding results and the live-demo Space data. Those rows are in the per-file table.

## Per file

Every tracked file with note- or measurement-level content of an uncleared song or an unevidenced record at `46ce824`, and what this PR does with it. "Composition risk" is the worst status among the file's songs.

| Path | Class | Songs | Note units | Composition risk | Disposition |
|---|---|---|---:|---|---|
| `datasets/jam-actions-v0/records/*` (88 files: v0 working-corpus records) | note-level | chopin-nocturne-op9-no2, chopin-prelude-e-minor, debussy-arabesque-no1, pathetique-mvt2, satie-gymnopedie-no1, schumann-traumerei | 11750 | public-domain; public-domain (cleared song, unevidenced bytes) | delete (88) |
| `datasets/jam-actions-v0/pianoroll/*` (88 files: v0 working-corpus piano rolls) | note-level | chopin-nocturne-op9-no2, chopin-prelude-e-minor, debussy-arabesque-no1, pathetique-mvt2, satie-gymnopedie-no1, schumann-traumerei | 2876 | public-domain; public-domain (cleared song, unevidenced bytes) | delete (88) |
| `datasets/jam-actions-v0/enrichment-overrides.json` | note-level | chopin-nocturne-op9-no2, pathetique-mvt2, schumann-traumerei | 34 | public-domain | filter-items: 6 removed, 3 kept |
| `datasets/jam-actions-v0/evals/e3-annotation-grounding-results.json` | note-level | chopin-nocturne-op9-no2, chopin-prelude-e-minor, debussy-arabesque-no1, pathetique-mvt2, satie-gymnopedie-no1, schumann-traumerei | 120 | public-domain | redact: 30 payloads |
| `docs/handoffs/audio-inspector-12-grok-to-claude.md` | note-level | schumann-traumerei | 4 | public-domain | kept (not derived) |
| `docs/jam-actions-v0-slice11-record-quality-enrichment.md` | note-level | schumann-traumerei | 8 | public-domain | kept (not derived) |
| `docs/jam-actions-v0-slice16-rubric-guided-enrichment.md` | note-level | chopin-nocturne-op9-no2 | 26 | public-domain | kept (not derived) |
| `docs/jam-actions-v0-slice21-schumann-remediation.md` | note-level | schumann-traumerei | 4 | public-domain | kept (not derived) |
| `docs/jam-actions-v0-slice9c-local-lora.md` | note-level | chopin-prelude-e-minor, pathetique-mvt2, schumann-traumerei | 57 | public-domain | redact: 12 excerpts |
| `experiments/coverage-v1-sft/data-bare/sft-test.jsonl` | note-level | amazing-grace, scarborough-fair, schumann-traumerei, shenandoah, simple-gifts … (7) | 178 | public-domain | filter-lines: 31 removed, 59 kept |
| `experiments/coverage-v1-sft/data-bare/sft-train.jsonl` | note-level | amazing-grace, auld-lang-syne, chopin-nocturne-op9-no2, chopin-prelude-e-minor, danny-boy … (10) | 559 | public-domain | filter-lines: 58 removed, 120 kept |
| `experiments/coverage-v1-sft/runs/preds-base-fair.jsonl` | measurement-level | scarborough-fair, schumann-traumerei, the-water-is-wide, weeping-willow | 22 fields | public-domain | filter-lines: 7 removed, 93 kept |
| `experiments/coverage-v1-sft/runs/preds-lora-epoch3.jsonl` | note-level | scarborough-fair, schumann-traumerei | 8 | public-domain | filter-lines: 2 removed, 98 kept |
| `experiments/finetune-arc-b2/data/sft-train-b2.jsonl` | note-level | chopin-nocturne-op9-no2, pathetique-mvt2, schumann-traumerei | 5835 | public-domain | filter-lines: 220 removed, 528 kept |
| `experiments/finetune-arc-b2/data/sft-val-abstention.jsonl` | note-level | chopin-prelude-e-minor | 375 | public-domain | filter-lines: 9 removed, 15 kept |
| `experiments/finetune-arc-b2/data/sft-val-grounding.jsonl` | note-level | chopin-prelude-e-minor | 197 | public-domain | filter-lines: 19 removed, 31 kept |
| `experiments/finetune-arc-b2/data/transfer-slice-b2.jsonl` | note-level | chopin-prelude-e-minor | 491 | public-domain | filter-lines: 12 removed, 12 kept |
| `experiments/finetune-arc-b2/evals/b2-baseline-results.json` | note-level | chopin-nocturne-op9-no2, chopin-prelude-e-minor, pathetique-mvt2, schumann-traumerei | 649 | public-domain | redact: 376 payloads |
| `experiments/finetune-arc-b2/evals/b2-seed1024-results.json` | note-level | chopin-nocturne-op9-no2, chopin-prelude-e-minor, pathetique-mvt2, schumann-traumerei | 486 | public-domain | redact: 213 payloads |
| `experiments/finetune-arc-b2/evals/b2-seed13-results.json` | note-level | chopin-nocturne-op9-no2, chopin-prelude-e-minor, pathetique-mvt2, schumann-traumerei | 579 | public-domain | redact: 286 payloads |
| `experiments/finetune-arc-b2/evals/b2-seed271-results.json` | note-level | chopin-nocturne-op9-no2, chopin-prelude-e-minor, pathetique-mvt2, schumann-traumerei | 490 | public-domain | redact: 217 payloads |
| `experiments/finetune-arc-b2/evals/b2-seed42-results.json` | note-level | chopin-nocturne-op9-no2, chopin-prelude-e-minor, pathetique-mvt2, schumann-traumerei | 493 | public-domain | redact: 220 payloads |
| `experiments/finetune-arc-b2/evals/b2-seed512-results.json` | note-level | chopin-nocturne-op9-no2, chopin-prelude-e-minor, pathetique-mvt2, schumann-traumerei | 515 | public-domain | redact: 242 payloads |
| `experiments/finetune-arc-v1/data/sft-train-v1.jsonl` | note-level | chopin-nocturne-op9-no2, pathetique-mvt2, schumann-traumerei | 1145 | public-domain | filter-lines: 97 removed, 397 kept |
| `experiments/finetune-arc-v1/data/sft-val-grounding.jsonl` | note-level | chopin-prelude-e-minor | 197 | public-domain | filter-lines: 19 removed, 31 kept |
| `experiments/finetune-arc-v1/evals/ft-v1-seed1024-results.json` | note-level | chopin-nocturne-op9-no2, pathetique-mvt2, schumann-traumerei | 321 | public-domain | redact: 132 payloads |
| `experiments/finetune-arc-v1/evals/ft-v1-seed13-results.json` | note-level | chopin-nocturne-op9-no2, pathetique-mvt2, schumann-traumerei | 307 | public-domain | redact: 118 payloads |
| `experiments/finetune-arc-v1/evals/ft-v1-seed271-results.json` | note-level | chopin-nocturne-op9-no2, pathetique-mvt2, schumann-traumerei | 321 | public-domain | redact: 132 payloads |
| `experiments/finetune-arc-v1/evals/ft-v1-seed42-results.json` | note-level | chopin-nocturne-op9-no2, pathetique-mvt2, schumann-traumerei | 320 | public-domain | redact: 131 payloads |
| `experiments/finetune-arc-v1/evals/ft-v1-seed512-results.json` | note-level | chopin-nocturne-op9-no2, pathetique-mvt2, schumann-traumerei | 320 | public-domain | redact: 131 payloads |
| `experiments/finetune-arc-v2/evals/b1-baseline-results.json` | note-level | chopin-nocturne-op9-no2, chopin-prelude-e-minor, pathetique-mvt2, schumann-traumerei | 568 | public-domain | redact: 295 payloads |
| `experiments/finetune-arc-v2/evals/b1-seed1024-results.json` | note-level | chopin-nocturne-op9-no2, chopin-prelude-e-minor, pathetique-mvt2, schumann-traumerei | 493 | public-domain | redact: 220 payloads |
| `experiments/finetune-arc-v2/evals/b1-seed13-results.json` | note-level | chopin-nocturne-op9-no2, chopin-prelude-e-minor, pathetique-mvt2, schumann-traumerei | 474 | public-domain | redact: 201 payloads |
| `experiments/finetune-arc-v2/evals/b1-seed271-results.json` | note-level | chopin-nocturne-op9-no2, chopin-prelude-e-minor, pathetique-mvt2, schumann-traumerei | 513 | public-domain | redact: 240 payloads |
| `experiments/finetune-arc-v2/evals/b1-seed42-results.json` | note-level | chopin-nocturne-op9-no2, chopin-prelude-e-minor, pathetique-mvt2, schumann-traumerei | 491 | public-domain | redact: 218 payloads |
| `experiments/finetune-arc-v2/evals/b1-seed512-results.json` | note-level | chopin-nocturne-op9-no2, chopin-prelude-e-minor, pathetique-mvt2, schumann-traumerei | 492 | public-domain | redact: 219 payloads |
| `experiments/finetune-arc/evals/ft-seed1024-results.json` | note-level | chopin-nocturne-op9-no2, pathetique-mvt2, schumann-traumerei | 457 | public-domain | redact: 268 payloads |
| `experiments/finetune-arc/evals/ft-seed13-results.json` | note-level | chopin-nocturne-op9-no2, pathetique-mvt2, schumann-traumerei | 399 | public-domain | redact: 210 payloads |
| `experiments/finetune-arc/evals/ft-seed271-results.json` | note-level | chopin-nocturne-op9-no2, pathetique-mvt2, schumann-traumerei | 378 | public-domain | redact: 189 payloads |
| `experiments/finetune-arc/evals/ft-seed42-results.json` | note-level | chopin-nocturne-op9-no2, pathetique-mvt2, schumann-traumerei | 328 | public-domain | redact: 139 payloads |
| `experiments/finetune-arc/evals/ft-seed512-results.json` | note-level | chopin-nocturne-op9-no2, pathetique-mvt2, schumann-traumerei | 344 | public-domain | redact: 155 payloads |
| `experiments/jam-actions-v0-lora/train.jsonl` | note-level | chopin-nocturne-op9-no2, chopin-prelude-e-minor, debussy-arabesque-no1, pathetique-mvt2, satie-gymnopedie-no1, schumann-traumerei | 1410 | public-domain | filter-lines: 15 removed, 5 kept |
| `experiments/maker-arc/e2-gate/inputs/build-claude-ceiling-responses.mjs` | note-level | chopin-nocturne-op9-no2, schumann-traumerei | 8 | public-domain | kept (not derived) |
| `experiments/maker-arc/e2-gate/inputs/claude-ceiling-briefs.json` | note-level | chopin-nocturne-op9-no2, chopin-prelude-e-minor, debussy-arabesque-no1, pathetique-mvt2, satie-gymnopedie-no1, schumann-traumerei | 766 | public-domain | filter-items: 15 removed, 7 kept |
| `experiments/maker-arc/e2-gate/inputs/claude-ceiling-responses.json` | note-level | chopin-nocturne-op9-no2, chopin-prelude-e-minor, debussy-arabesque-no1, pathetique-mvt2, satie-gymnopedie-no1, schumann-traumerei | 582 | public-domain | kept (not derived) |
| `experiments/maker-arc/er-gate/inputs/claude-ceiling-responses.json` | note-level | a-change-is-gonna-come, a-thousand-years, agua-de-beber, aint-no-sunshine, all-of-me … (20) | 464 | possibly-in-copyright | kept (not derived) |
| `experiments/maker-arc/er-gate/items.json` | note-level | a-change-is-gonna-come, a-thousand-years, agua-de-beber, aint-no-sunshine, all-of-me … (20) | 1113 | possibly-in-copyright | filter-items: 20 removed, 2 kept |
| `experiments/maker-arc/implied-chord-bass-aware-shifts.json` | note-level | amazing-grace, black-orpheus, blues-in-the-night, bohemian-rhapsody, chopin-nocturne-op9-no2 … (38) | 865 | possibly-in-copyright | redact-fields: 133 payloads |
| `experiments/maker-arc/implied-chord-snapshot.json` | note-level | a-change-is-gonna-come, a-thousand-years, agua-de-beber, aint-no-sunshine, all-of-me … (94) | 71400 | possibly-in-copyright | redact-fields: 10291 payloads |
| `experiments/rollout-arc/p3/runs/er-g8.jsonl` | note-level | a-change-is-gonna-come, a-thousand-years, agua-de-beber, aint-no-sunshine, all-of-me … (41) | 6338 | possibly-in-copyright | filter-lines: 41 removed, 3 kept |
| `experiments/rollout-arc/p3/runs/er-items.json` | note-level | a-change-is-gonna-come, a-thousand-years, agua-de-beber, aint-no-sunshine, all-of-me … (41) | 1819 | possibly-in-copyright | filter-items: 41 removed, 3 kept |
| `experiments/rollout-arc/p3/runs/er-prompts.jsonl` | note-level | a-change-is-gonna-come, a-thousand-years, agua-de-beber, aint-no-sunshine, all-of-me … (41) | 1983 | possibly-in-copyright | filter-lines: 41 removed, 3 kept |
| `experiments/rollout-arc/p3/runs/smoke.jsonl` | note-level | all-the-things-you-are, autumn-leaves | 549 | possibly-in-copyright | delete |
| `experiments/rollout-arc/p4/runs/smoke.jsonl` | note-level | chopin-nocturne-op9-no2 | 256 | public-domain | kept (not derived) |
| `experiments/rollout-arc/p4/runs/vl-g8.jsonl` | note-level | all-the-things-you-are, autumn-leaves, blue-bossa, chopin-nocturne-op9-no2, chopin-prelude-e-minor … (13) | 3390 | possibly-in-copyright | kept (not derived) |
| `experiments/rollout-arc/p4/runs/vl-prompts.jsonl` | note-level | a-change-is-gonna-come, a-thousand-years, agua-de-beber, aint-no-sunshine, all-of-me … (93) | 744 | possibly-in-copyright | kept (not derived) |
| `scores/amazing-grace.score-clock.v1.json` | note-level | amazing-grace | 14 | public-domain | **held for owner** |
| `scores/receipts/amazing-grace/piano-bed.render-receipt.json` | note-level | amazing-grace | 33 | public-domain | **held for owner** |
| `scores/receipts/amazing-grace/soulx-01/pitch-local.json` | note-level | amazing-grace | 14 | public-domain | **held for owner** |
| `scores/receipts/amazing-grace/soulx-01/pitch-placed.json` | note-level | amazing-grace | 14 | public-domain | **held for owner** |
| `scores/receipts/amazing-grace/soulx-01/pitch.json` | note-level | amazing-grace | 14 | public-domain | **held for owner** |
| `scores/receipts/amazing-grace/soulx-syllables/pitch.json` | note-level | amazing-grace | 14 | public-domain | **held for owner** |
| `songs/library/jazz/take-the-a-train.json` | note-level | take-the-a-train | 9 | possibly-in-copyright | kept (not derived) |
| `spaces/jam-actions-live/demo_data.json` | note-level | chopin-nocturne-op9-no2, chopin-prelude-e-minor, pathetique-mvt2, schumann-traumerei | 154 | public-domain | filter-items: 4 removed, 4 kept |

## Composition status of every uncleared song

As of 2026, the US public domain covers works first published in 1930 or earlier, and the EU public domain covers works whose every author died in 1955 or earlier. **Composition (what the file holds)** follows the file: for the twelve quarantined songs the bytes are a different piece than the catalogue names, shown in bold. **First published** is the composition's first publication or release, taken from the English Wikipedia summary where it states one. Authors' death years come from Wikidata (P570), and all 137 named-author entries matched. **Confidence** means:
- high: the year and every author's death date confirmed;
- medium: one of them rests on knowledge rather than a source;
- low: the status turns on facts not established here (starred rows are explained below the table).

Source URLs for every row are in the JSON.

| Song | Shelf | Composition (what the file holds) | First published | Authors | US PD | EU PD | Status | Confidence |
|---|---|---|---|---|---|---|---|---|
| a-change-is-gonna-come | library | A Change Is Gonna Come | 1964 | Sam Cooke (1964) | no | no | possibly-in-copyright | high |
| a-thousand-years | library | A Thousand Years (Christina Perri song) | 2011 | Christina Perri (living); David Hodges (living) | no | no | possibly-in-copyright | high |
| agua-de-beber | library | Água de Beber | 1963 | Antônio Carlos Jobim (1994); Vinicius de Moraes (1980) | no | no | possibly-in-copyright | high |
| aint-no-sunshine | library | Ain't No Sunshine | 1971 | Bill Withers (2020) | no | no | possibly-in-copyright | high |
| all-of-me | library | All of Me (John Legend song) | 2013 | John Legend (living); Toby Gad (living) | no | no | possibly-in-copyright | high |
| all-the-things-you-are | library | All the Things You Are | 1939 | Jerome Kern (1945); Oscar Hammerstein II (1960) | no | no | possibly-in-copyright | high |
| amazing-grace | library | Amazing Grace | 1779 | John Newton (1807); anonymous (tune New Britain, 1829) | yes | yes | public-domain | high |
| auld-lang-syne | library | Auld Lang Syne | 1788 | Robert Burns (1796); traditional | yes | yes | public-domain | medium |
| autumn-leaves | library | Autumn Leaves (1945 song) | 1945 | Joseph Kosma (1969); Jacques Prévert (1977); Johnny Mercer (1976) | no | no | possibly-in-copyright | high |
| baba-oriley | library | Baba O'Riley | 1971 | Pete Townshend (living) | no | no | possibly-in-copyright | high |
| bennie-and-the-jets | library | Bennie and the Jets | 1973 | Elton John (living); Bernie Taupin (living) | no | no | possibly-in-copyright | high |
| besame-mucho | library | Bésame Mucho | 1932 | Consuelo Velázquez (2005) | no | no | possibly-in-copyright | high |
| black-orpheus | library | Manhã de Carnaval | 1959 | Luiz Bonfá (2001); Antônio Maria (1964) | no | no | possibly-in-copyright | medium |
| blue-bossa | library | Blue Bossa | 1963 | Kenny Dorham (1972) | no | no | possibly-in-copyright | high |
| blues-in-the-night | quarantine | **"Blowing Kisses in the Wind" (Paula Abdul, 1991), not Arlen/Mercer** | 1991 | Peter Lord (death ?); V. Jeffrey Smith (death ?) | no | no | possibly-in-copyright | high |
| bohemian-rhapsody | library | Bohemian Rhapsody | 1975 | Freddie Mercury (1991) | no | no | possibly-in-copyright | high |
| born-under-a-bad-sign | quarantine | **a 1994 Tune 1000 karaoke file with an EMI copyright credit, not Jones/Bell** | 1994 | unidentified (Spanish karaoke file, Tune 1000, EMI credit 1994) | no | ? | possibly-in-copyright | low* |
| chopin-nocturne-op9-no2 | library | Nocturnes, Op. 9 (Chopin) | 1832 | Frédéric Chopin (1849) | yes | yes | public-domain | high |
| chopin-prelude-e-minor | library | Prelude, Op. 28, No. 4 (Chopin) | 1839 | Frédéric Chopin (1849) | yes | yes | public-domain | medium |
| cinema-paradiso | quarantine | **Chopin's Étude Op. 10 No. 5 (Krueger, 1999), not Morricone** | 1833 | Frédéric Chopin (1849) | yes | yes | public-domain | high |
| clocks | library | Clocks (song) | 2002 | Coldplay (band) | no | ? | possibly-in-copyright | medium* |
| comptine-dun-autre-ete | library | Amélie (soundtrack) | 2001 | Yann Tiersen (living) | no | no | possibly-in-copyright | high |
| corcovado | library | Corcovado (song) | 1960 | Antônio Carlos Jobim (1994) | no | no | possibly-in-copyright | high |
| crossroad-blues | library | Cross Road Blues | 1936 | Robert Johnson (1938) | ? | yes | possibly-in-copyright | low* |
| danny-boy | library | Danny Boy | 1913 | Frederic Weatherly (1929); traditional (Londonderry Air) | yes | yes | public-domain | high |
| desafinado | library | Desafinado | 1959 | Antônio Carlos Jobim (1994); Newton Mendonça (1960) | no | no | possibly-in-copyright | high |
| divenire | quarantine | **an unidentified piece carrying a Hades quotation and a hotmail credit, not Einaudi** | ? | unidentified | ? | ? | possibly-in-copyright | low* |
| dock-of-the-bay | library | (Sittin' On) The Dock of the Bay | 1968 | Otis Redding (1967); Steve Cropper (2025) | no | no | possibly-in-copyright | high |
| dont-stop-believin | library | Don't Stop Believin' | 1981 | Jonathan Cain (living); Steve Perry (living); Neal Schon (living) | no | no | possibly-in-copyright | high |
| dream-on | library | Dream On (Aerosmith song) | 1973 | Steven Tyler (living) | no | no | possibly-in-copyright | high |
| el-condor-pasa | library | El Cóndor Pasa (song) | 1913 | Daniel Alomía Robles (1942) | ? | yes | possibly-in-copyright | low* |
| everyday-i-have-the-blues | library | Every Day I Have the Blues | 1935 | Aaron "Pinetop" Sparks (1935); Milton Sparks (death ?); Peter Chatman (1988) | ? | ? | possibly-in-copyright | low* |
| experience | quarantine | **"Scheming at Igros" from Final Fantasy Tactics (1997), not Einaudi** | 1997 | Hitoshi Sakimoto (living); Masaharu Iwata (living) | no | no | possibly-in-copyright | high |
| fallin | library | Fallin' (Alicia Keys song) | 2001 | Alicia Keys (living) | no | no | possibly-in-copyright | high |
| fly-me-to-the-moon | library | Fly Me to the Moon | 1954 | Bart Howard (2004) | no | no | possibly-in-copyright | high |
| forrest-gump | library | Forrest Gump (soundtrack) | 1994 | Alan Silvestri (living) | no | no | possibly-in-copyright | high |
| georgia-on-my-mind | library | Georgia on My Mind | 1930 | Hoagy Carmichael (1981); Stuart Gorrell (1963) | yes | no | possibly-in-copyright | high* |
| girl-from-ipanema | library | The Girl from Ipanema | 1962 | Antônio Carlos Jobim (1994); Vinicius de Moraes (1980); Norman Gimbel (2018) | no | no | possibly-in-copyright | high |
| gladiolus-rag | library | Scott Joplin | 1907 | Scott Joplin (1917) | yes | yes | public-domain | medium |
| greensleeves | library | Greensleeves | 1580 | traditional | yes | yes | public-domain | high |
| halo | library | Halo (Beyoncé song) | 2008 | Ryan Tedder (living); Evan Bogart (living); Beyoncé (living) | no | no | possibly-in-copyright | high |
| hedwigs-theme | library | Hedwig's Theme | 2001 | John Williams (living) | no | no | possibly-in-copyright | medium |
| hoochie-coochie-man | library | Hoochie Coochie Man | 1954 | Willie Dixon (1992) | no | no | possibly-in-copyright | high |
| house-of-the-rising-sun | library | The House of the Rising Sun | 1933 | traditional | yes | yes | public-domain | medium* |
| i-got-you | library | I Got You (I Feel Good) | 1964 | James Brown (2006) | no | no | possibly-in-copyright | high |
| i-will-always-love-you | library | I Will Always Love You | 1974 | Dolly Parton (2026) | no | no | possibly-in-copyright | high |
| if-i-aint-got-you | library | If I Ain't Got You | 2003 | Alicia Keys (living) | no | no | possibly-in-copyright | high |
| imagine | library | Imagine (John Lennon song) | 1971 | John Lennon (1980); Yoko Ono (living) | no | no | possibly-in-copyright | high |
| isnt-she-lovely | library | Isn't She Lovely | 1976 | Stevie Wonder (living) | no | no | possibly-in-copyright | high |
| killing-me-softly | library | Killing Me Softly with His Song | 1972 | Charles Fox (living); Norman Gimbel (2018) | no | no | possibly-in-copyright | high |
| kiss-the-rain | quarantine | **Depeche Mode's "Just Can't Get Enough" (1981), not Yiruma** | 1981 | Vince Clarke (living) | no | no | possibly-in-copyright | high |
| layla-unplugged | library | Layla | 1970 | Eric Clapton (living); Jim Gordon (2023) | no | no | possibly-in-copyright | high |
| lean-on-me | library | Lean on Me (song) | 1972 | Bill Withers (2020) | no | no | possibly-in-copyright | high |
| let-it-be | library | Let It Be (song) | 1970 | Paul McCartney (living); John Lennon (1980) | no | no | possibly-in-copyright | high |
| lets-stay-together | library | Let's Stay Together (Al Green song) | 1971 | Al Green (living); Willie Mitchell (2010); Al Jackson Jr. (1975) | no | no | possibly-in-copyright | high |
| mas-que-nada | library | Mas que Nada | 1963 | Jorge Ben Jor (living) | no | no | possibly-in-copyright | high |
| may-be | library | Yiruma | 2001 | Yiruma (living) | no | no | possibly-in-copyright | medium |
| metamorphosis-two | library | Solo Piano (Philip Glass album) | 1989 | Philip Glass (living) | no | no | possibly-in-copyright | high |
| mia-and-sebastians-theme | library | La La Land (soundtrack) | 2016 | Justin Hurwitz (living) | no | no | possibly-in-copyright | high |
| misty | library | Misty (song) | 1954 | Erroll Garner (1977); Johnny Burke (1964) | no | no | possibly-in-copyright | high |
| moon-river | library | Moon River | 1961 | Henry Mancini (1994); Johnny Mercer (1976) | no | no | possibly-in-copyright | high |
| my-funny-valentine | library | My Funny Valentine | 1937 | Richard Rodgers (1979); Lorenz Hart (1943) | no | no | possibly-in-copyright | high |
| my-girl | library | My Girl (The Temptations song) | 1964 | Smokey Robinson (living); Ronald White (1995) | no | no | possibly-in-copyright | high |
| my-heart-will-go-on | library | My Heart Will Go On | 1997 | James Horner (2015); Will Jennings (2024) | no | no | possibly-in-copyright | high |
| no-one | library | No One (Alicia Keys song) | 2007 | Alicia Keys (living); Kerry Brothers Jr. (death ?); George M. Harry (death ?) | no | no | possibly-in-copyright | high |
| november-rain | library | November Rain | 1991 | Axl Rose (living) | no | no | possibly-in-copyright | high |
| nuvole-bianche | library | Una Mattina | 2004 | Ludovico Einaudi (living) | no | no | possibly-in-copyright | high |
| nuvole-bianche-na | library | Una Mattina | 2004 | Ludovico Einaudi (living) | no | no | possibly-in-copyright | high |
| opening-glassworks | quarantine | **"Livre pra Viver" as recorded by Pedro Mariano, not Philip Glass** | ? | unidentified ("Livre pra Viver", recorded by Pedro Mariano) | ? | ? | possibly-in-copyright | low* |
| ordinary-people | quarantine | **Chuck Berry's "Johnny B. Goode" (1958), not John Legend** | 1958 | Chuck Berry (2017) | no | no | possibly-in-copyright | high |
| pathetique-mvt2 | library | Piano Sonata No. 8 (Beethoven) | 1799 | Ludwig van Beethoven (1827) | yes | yes | public-domain | high |
| perfidia | library | Perfidia | 1939 | Alberto Domínguez (1975) | no | no | possibly-in-copyright | high |
| piano-man | library | Piano Man (song) | 1973 | Billy Joel (living) | no | no | possibly-in-copyright | high |
| pink-panther | library | The Pink Panther Theme | 1963 | Henry Mancini (1994) | no | no | possibly-in-copyright | high |
| red-house | quarantine | **"Jailhouse Rock" (Leiber and Stoller, 1957), not Hendrix** | 1957 | Jerry Leiber (2011); Mike Stoller (living) | no | no | possibly-in-copyright | high |
| respect | library | Respect (song) | 1965 | Otis Redding (1967) | no | no | possibly-in-copyright | high |
| ribbon-in-the-sky | library | Ribbon in the Sky | 1982 | Stevie Wonder (living) | no | no | possibly-in-copyright | high |
| river-flows-in-you | library | River Flows in You | 2001 | Yiruma (living) | no | no | possibly-in-copyright | high |
| rocket-man | library | Rocket Man (song) | 1972 | Elton John (living); Bernie Taupin (living) | no | no | possibly-in-copyright | high |
| round-midnight | library | 'Round Midnight (song) | 1943 | Thelonious Monk (1982); Cootie Williams (1985); Bernie Hanighen (1976) | no | no | possibly-in-copyright | high |
| sakura-sakura | library | Sakura Sakura | 1888 | traditional | yes | yes | public-domain | medium |
| scarborough-fair | quarantine | **"Greensleeves" (traditional; sequenced by Jim Paterson)** | 1580 | traditional | yes | yes | public-domain | high |
| schindlers-list-theme | library | Schindler's List (soundtrack) | 1993 | John Williams (living) | no | no | possibly-in-copyright | high |
| schumann-traumerei | library | Träumerei | 1838 | Robert Schumann (1856) | yes | yes | public-domain | high |
| shenandoah | library | Oh Shenandoah | 1882 | traditional | yes | yes | public-domain | medium |
| simple-gifts | library | Simple Gifts | 1848 | Joseph Brackett (1882) | yes | yes | public-domain | high |
| someone-like-you | library | Someone like You (Adele song) | 2011 | Adele (living); Dan Wilson (living) | no | no | possibly-in-copyright | high |
| someone-you-loved | quarantine | **Freddie Mercury's "Living on My Own" (1985), not Capaldi** | 1985 | Freddie Mercury (1991) | no | no | possibly-in-copyright | high |
| st-louis-blues | library | St. Louis Blues (song) | 1914 | W. C. Handy (1958) | yes | no | possibly-in-copyright | high* |
| stairway-to-heaven | library | Stairway to Heaven | 1971 | Jimmy Page (living); Robert Plant (living) | no | no | possibly-in-copyright | high |
| stand-by-me | library | Stand by Me (Ben E. King song) | 1961 | Ben E. King (2015); Jerry Leiber (2011); Mike Stoller (living) | no | no | possibly-in-copyright | high |
| stormy-monday | library | Call It Stormy Monday | 1948 | T-Bone Walker (1975) | no | no | possibly-in-copyright | high |
| summertime | library | Summertime (George Gershwin song) | 1935 | George Gershwin (1937); DuBose Heyward (1940) | no | yes | possibly-in-copyright | medium* |
| superstition | library | Superstition (song) | 1972 | Stevie Wonder (living) | no | no | possibly-in-copyright | high |
| sweet-home-chicago | library | Sweet Home Chicago | 1936 | Robert Johnson (1938) | ? | yes | possibly-in-copyright | low* |
| take-the-a-train | library | Take the "A" Train | 1941 | Billy Strayhorn (1967) | no | no | possibly-in-copyright | medium |
| the-thrill-is-gone | library | The Thrill Is Gone (1951 song) | 1951 | Roy Hawkins (1974); Rick Darnell (death ?) | no | ? | possibly-in-copyright | medium* |
| the-water-is-wide | quarantine | **Stephen Foster's "The Glendy Burk" (1860)** | 1860 | Stephen Foster (1864) | yes | yes | public-domain | high |
| tiny-dancer | library | Tiny Dancer | 1971 | Elton John (living); Bernie Taupin (living) | no | no | possibly-in-copyright | high |
| una-mattina | library | Una Mattina | 2004 | Ludovico Einaudi (living) | no | no | possibly-in-copyright | high |
| viva-la-vida | library | Viva la Vida | 2008 | Coldplay (band) | no | ? | possibly-in-copyright | high* |
| watermark | library | Watermark (Enya album) | 1988 | Enya (living) | no | no | possibly-in-copyright | high |
| wave | library | Wave (Antônio Carlos Jobim song) | 1967 | Antônio Carlos Jobim (1994) | no | no | possibly-in-copyright | high |
| weeping-willow | library | Weeping Willow (rag) | 1903 | Scott Joplin (1917) | yes | yes | public-domain | high |
| whats-going-on | library | What's Going On (song) | 1971 | Marvin Gaye (1984); Al Cleveland (1996); Renaldo Benson (2005) | no | no | possibly-in-copyright | high |
| your-song | library | Your Song | 1970 | Elton John (living); Bernie Taupin (living) | no | no | possibly-in-copyright | high |

- **crossroad-blues**: Recorded 1936, released 1937; Johnson died 1938. Under 17 U.S.C. §303 a pre-1978 record release did not publish the composition, and the songs were registered decades later, so a US term running to 2047 is plausible. EU: public domain since 2009.
- **everyday-i-have-the-blues**: First recorded 1935 by the Sparks brothers (Milton Sparks' death year not found); the catalogue credits Memphis Slim's 1948 version (Chatman died 1988).
- **st-louis-blues**: Published 1914: US public domain. Handy died 1958, so the EU term runs to the end of 2028.
- **sweet-home-chicago**: Same position as Cross Road Blues (Robert Johnson, recorded 1936, died 1938).
- **the-thrill-is-gone**: 1951 (Roy Hawkins, died 1974, and Rick Darnell, death year not found).
- **house-of-the-rising-sun**: Traditional; the composition is public domain. The widely known 1964 arrangement is protected, and the library file's arrangement is of unknown origin.
- **georgia-on-my-mind**: Published 1930: US public domain since 1 January 2026. Carmichael died 1981, so the EU term runs to 2051.
- **summertime**: Published 1935: US term runs to the end of 2030. EU: George Gershwin died 1937 and DuBose Heyward 1940; the EU verdict assumes Heyward is the song's only lyricist, as credited.
- **el-condor-pasa**: Composed 1913 by Robles (died 1942), so EU public domain since 2013. The US status turns on a 1933 registration and its renewal, which was not verified here.
- **clocks**: Credited to the members of Coldplay (2002). Deaths were not checked member by member; the US term alone makes it possibly in copyright.
- **viva-la-vida**: Credited to the members of Coldplay (2008). Deaths were not checked member by member; the US term alone makes it possibly in copyright.
- **born-under-a-bad-sign**: The file is a 1994 Tune 1000 karaoke file carrying an EMI copyright credit, not Jones/Bell; the song was not identified.
- **divenire**: The file is an unidentified piece (a Hades quotation and a personal e-mail credit in its text events), not Einaudi's Divenire.
- **opening-glassworks**: The file is "Livre pra Viver" as recorded by Pedro Mariano; its writers were not identified. Treated as possibly in copyright.

## Cleared songs with derivations from superseded files

`satie-gymnopedie-no1` and `debussy-arabesque-no1` are cleared today (Mutopia, Public Domain). The 30 v0 records, their piano rolls, the six LoRA lines and the Satie/Debussy entries of the 2026-07-22 bass-aware shift receipt were built from the files replaced on 2026-08-19 (`03a005a`). Those files' sidecar hashes match no evidenced library file. All of it is removed or redacted here. The implied-chord snapshot was regenerated on 2026-09-09 from the Mutopia bytes, and its regression test confirms that, so its Satie/Debussy lines stay.

## Metadata-only files

475 files name an uncleared song id without carrying notes. The list is in the JSON; by directory:

| Directory | Files |
|---|---:|
| `songs/library` | 94 |
| `scores/receipts` | 51 |
| `experiments/rollout-arc/p4` | 43 |
| `docs` | 31 |
| `experiments/coverage-v1-sft/runs` | 28 |
| `scripts` | 25 |
| `src/dataset` | 15 |
| `experiments/maker-arc/e2-gate` | 14 |
| `docs/handoffs` | 13 |
| `experiments/maker-arc/e2v2-gate` | 13 |
| `experiments/maker-arc/er-gate` | 13 |
| `experiments/maker-arc/phase-c-experiments` | 13 |
| `songs/quarantine` | 12 |
| `experiments/finetune-arc-b2/evals` | 8 |
| `experiments/finetune-arc-v2/evals` | 8 |
| `experiments/finetune-arc-v1/evals` | 7 |
| `experiments/finetune-arc/evals` | 7 |
| `src` | 5 |
| `atlas` | 4 |
| `experiments/finetune-arc/data` | 4 |
| `docs/findings` | 3 |
| `experiments/finetune-arc-b2/data` | 3 |
| `experiments/finetune-arc-b2/scripts` | 3 |
| `experiments/finetune-arc-v1/scripts` | 3 |
| `experiments/finetune-arc/artifacts` | 3 |
| `site/src` | 3 |
| `spaces/jam-actions-live` | 3 |
| `src/compose` | 3 |
| `(root)` | 2 |
| `datasets/jam-actions-v0/evals` | 2 |
| `experiments/finetune-arc-v1/artifacts` | 2 |
| `experiments/finetune-arc-v1/data` | 2 |
| `experiments/finetune-arc/scripts` | 2 |
| `src/vocal` | 2 |
| `datasets/jam-actions-acoustic-v0/README.md` | 1 |
| `datasets/jam-actions-v0-public/KNOWN_LIMITATIONS.md` | 1 |
| `datasets/jam-actions-v0-public/publication-receipt.json` | 1 |
| `datasets/jam-actions-v0-public/README.md` | 1 |
| `datasets/jam-actions-v0-public/RELEASE_NOTES.md` | 1 |
| `datasets/jam-actions-v0/manifest.json` | 1 |
| `datasets/jam-actions-v0/provenance-scan.json` | 1 |
| `datasets/jam-actions-v0/provenance-verification.json` | 1 |
| `datasets/jam-actions-v0/splits.json` | 1 |
| `docs/hf-cards` | 1 |
| `experiments/acoustic-sft/data` | 1 |
| `experiments/analysis-arc/reference-changes.json` | 1 |
| `experiments/analysis-arc/validation-results.json` | 1 |
| `experiments/coverage-v1-sft/data-bare` | 1 |
| `experiments/finetune-arc-b2/artifacts` | 1 |
| `experiments/finetune-arc-b2/P0-LOCK.md` | 1 |
| `experiments/finetune-arc-v1/P0-LOCK.md` | 1 |
| `experiments/finetune-arc-v2/data` | 1 |
| `experiments/finetune-arc-v2/scripts` | 1 |
| `experiments/finetune-arc/P0-LOCK.md` | 1 |
| `experiments/jam-actions-v0-lora/README.md` | 1 |
| `experiments/jam-actions-v0-lora/train_lora.py` | 1 |
| `experiments/maker-arc/E2V2-LOCK.md` | 1 |
| `experiments/maker-arc/e2v2-premeasure` | 1 |
| `experiments/rollout-arc/p3` | 1 |
| `plugin` | 1 |
| `plugin/skills` | 1 |
| `src/analysis` | 1 |
| `src/maker` | 1 |
| `src/midi` | 1 |
| `src/songs` | 1 |

## Published surfaces checked

- **npm and Docker.** Both ship `dist` (non-test `src`), `songs/library` and `samples/vocal`. The only song-keyed notes in `src` are the Amazing Grace tune in `src/vocal/tunes.ts`, entered by hand from the public-domain hymn (New Britain) and not derived from the library file. Tool-schema examples use Für Elise (cleared) and a synthetic Am7. Song JSONs carry analysis prose; the one pitch list is the Take the A Train chord above.
- **GitHub Pages**: the Amazing Grace audio described in the headline (held). The cockpit bundle carries no song data.
- **Hugging Face.** `jam-rollout-arc-evals` holds chord-symbol prompts and model completions. Two sampled trained-model outputs had no pitches. The base-model probe outputs contain pitch runs of the base model's own invention (the prompts carried only chord symbols and titles), so they are not derived from a library file. The other public repos are the v1 line and the corrected v0/acoustic sets the audit cleared.
- **GitHub releases**: only `v2.6.0` has assets (the v1 adapters, cleared).
- **Zenodo**: the six records cite the repository by URL, two release tags by name and the audit by path; they cite no commit id. See the runbook for what a history rewrite does to those references.

## Receipts whose pinned inputs change

Experiment receipts pin sha256 prefixes of their inputs. This PR rewrites no receipt. The receipts below pin a file this PR filters, so the pin no longer matches the file in the tree. **The inputs as pinned remain in git history as of this PR**: `git show 46ce824:<path>` returns the pinned bytes, and until any history rewrite so does every earlier commit.

| Receipt | Pinned input(s) this PR changes |
|---|---|
| `experiments/coverage-v1-sft/runs/ab/run-config-B.json` | `experiments/coverage-v1-sft/data-bare/sft-train.jsonl` |
| `experiments/finetune-arc-b2/artifacts/run-config-seed1024.json` | `experiments/finetune-arc-b2/data/sft-train-b2.jsonl` |
| `experiments/finetune-arc-b2/artifacts/run-config-seed13.json` | `experiments/finetune-arc-b2/data/sft-train-b2.jsonl` |
| `experiments/finetune-arc-b2/artifacts/run-config-seed271.json` | `experiments/finetune-arc-b2/data/sft-train-b2.jsonl` |
| `experiments/finetune-arc-b2/artifacts/run-config-seed42.json` | `experiments/finetune-arc-b2/data/sft-train-b2.jsonl` |
| `experiments/finetune-arc-b2/artifacts/run-config-seed512.json` | `experiments/finetune-arc-b2/data/sft-train-b2.jsonl` |
| `experiments/finetune-arc-b2/artifacts/selection-report.json` | `experiments/finetune-arc-v1/data/sft-val-grounding.jsonl`, `experiments/finetune-arc-b2/data/sft-val-abstention.jsonl`, `experiments/finetune-arc-b2/data/sft-val-grounding.jsonl` |
| `experiments/finetune-arc-b2/data/P1b2-gate-report.json` | `experiments/finetune-arc-v1/data/sft-val-grounding.jsonl`, `experiments/finetune-arc-b2/data/sft-train-b2.jsonl`, `experiments/finetune-arc-b2/data/sft-val-abstention.jsonl`, `experiments/finetune-arc-b2/data/sft-val-grounding.jsonl` |
| `experiments/finetune-arc-v1/artifacts/podA/run-config-seed13.json` | `experiments/finetune-arc-v1/data/sft-train-v1.jsonl` |
| `experiments/finetune-arc-v1/artifacts/podA/run-config-seed271.json` | `experiments/finetune-arc-v1/data/sft-train-v1.jsonl` |
| `experiments/finetune-arc-v1/artifacts/podA/run-config-seed42.json` | `experiments/finetune-arc-v1/data/sft-train-v1.jsonl` |
| `experiments/finetune-arc-v1/artifacts/podA/selection-report.json` | `experiments/finetune-arc-v1/data/sft-val-grounding.jsonl`, `experiments/finetune-arc-b2/data/sft-val-grounding.jsonl` |
| `experiments/finetune-arc-v1/artifacts/podB/run-config-seed1024.json` | `experiments/finetune-arc-v1/data/sft-train-v1.jsonl` |
| `experiments/finetune-arc-v1/artifacts/podB/run-config-seed512.json` | `experiments/finetune-arc-v1/data/sft-train-v1.jsonl` |
| `experiments/finetune-arc-v1/artifacts/podB/selection-report.json` | `experiments/finetune-arc-v1/data/sft-val-grounding.jsonl`, `experiments/finetune-arc-b2/data/sft-val-grounding.jsonl` |
| `experiments/finetune-arc-v1/data/P1v1-gate-report.json` | `experiments/finetune-arc-v1/data/sft-train-v1.jsonl`, `experiments/finetune-arc-v1/data/sft-val-grounding.jsonl`, `experiments/finetune-arc-b2/data/sft-val-grounding.jsonl` |

`atlas/` also hashes file contents; it is regenerated in this PR and is not a historical receipt.

## Limits

- The guard keys content to song ids, as specified. Content that names a song only by title (for example "Träumerei" in prose) is found here by reading, not by the guard.
- A derivation from a superseded file of a cleared song is caught only through a v0 record id or sidecar, or the piano-roll rule. A song-keyed copy of old Satie/Debussy bytes with no record id would pass. None remains.
- Composition dates come from Wikipedia and Wikidata. Where the status turns on registration and renewal (Robert Johnson, El Cóndor Pasa) or on who counts as an author (Summertime), this inventory says so and does not decide.
- History: every file above is still in git history, along with older versions of files that are clean today. Examples are the 58 withdrawn records in the public package's `records.jsonl` before 0.6.0, Claude-written arrangements under `songs/builtin/` (2026-02), and the pre-reset v1 records. `history-rewrite-runbook.md` measures what a rewrite would remove and what it would break.
