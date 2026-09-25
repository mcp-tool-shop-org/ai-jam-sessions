<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

## ¿Qué es esto?

Un piano y una guitarra que la IA aprende a tocar. No es un sintetizador, ni una biblioteca MIDI, sino un instrumento de enseñanza.

Un LLM puede leer y escribir texto, pero no puede experimentar la música de la manera en que lo hacemos nosotros. No tiene oídos, ni dedos, ni memoria muscular. AI Jam Sessions cierra esa brecha al darle al modelo sentidos que realmente puede utilizar:

- **Lectura:** Partituras MIDI reales con anotaciones musicales detalladas. No son aproximaciones escritas a mano, sino que se analizan, se interpretan y se explican.
- **Audición:** Seis motores de audio (piano oscilador, piano de muestras, muestras vocales, tracto vocal físico, sintetizador vocal aditivo, guitarra modelada físicamente) que se reproducen a través de sus altavoces, de modo que las personas en la sala se convierten en los "oídos" de la IA. Y ahora el modelo tiene sus propios oídos, y en doble medida: puede medir una grabación después de los hechos (ver [Audición](#audición)) y puede observar a la banda **mientras la música sigue sonando** (ver [El conjunto en vivo](#el-conjunto-en-vivo)).
- **Visualización:** Un piano roll que muestra lo que se tocó como SVG, y que el modelo puede leer y verificar. Un editor interactivo de tablaturas de guitarra. Un panel de control del navegador con un teclado visual, un editor de notas de doble modo y un laboratorio de afinación.
- **Memorización:** Un diario de práctica que se mantiene a lo largo de las sesiones, de modo que el aprendizaje se acumula con el tiempo.
- **Canto:** Síntesis del tracto vocal con 20 preajustes de voz, desde soprano de ópera hasta coro electrónico. Modo de canto con solfeo, contorno y narración silábica. Y una melodía vocal real en el reloj del piano: una partitura que condiciona al cantante y que se basa en el MIDI de la canción, con una limitación en el tiempo (40 ms) y en el tono (50 centésimos) antes de que la escuche (ver [Canto](#canto)).

Cada una de las 108 canciones ahora está completamente anotada: contexto histórico, análisis estructural barra por barra, momentos clave, objetivos de enseñanza y consejos de interpretación, en los 12 géneros. Una versión anterior de este archivo README decía que las canciones originales estaban "esperando a que la IA absorbiera los patrones, tocara la música y escribiera sus propias anotaciones". Eso es exactamente lo que sucedió: las anotaciones fueron escritas por la IA basándose en un análisis determinista por canción (acordes, estructura de repetición, límites de sección, tonalidades verificadas por contenido), con una rúbrica de calidad que las guía y una verificación adversarial de cada afirmación (números de compás, ventanas de acordes y recuentos estructurales, todo verificado con el MIDI real antes de que se publique nada).

A partir de este mismo trabajo, también publicamos **[jam-actions-v0](#training-dataset)**: un conjunto de datos público de 57 secuencias de uso de herramientas MCP en múltiples turnos sobre piano clásico real. Enseña a los LLM a realizar *un uso de herramientas fundamentado sobre música simbólica*, no solo a generar texto, y se entrega con una puerta de liberación de 7 ejes que distingue entre "transmitir evidencia" y "transmitir porque la tarea es trivial". Consulte [Conjunto de datos de entrenamiento](#training-dataset) a continuación para obtener la información completa.

## Audición

Durante mucho tiempo, este servidor podía producir sonido, pero nunca analizarlo. El modelo tocaba, una persona escuchaba y el modelo aceptaba su opinión. Esa brecha ahora se ha cerrado.

Si se le proporciona un archivo WAV, mide lo que hay en él. No mirando una imagen y adivinando, sino ejecutando la señal a través del mismo tipo de herramientas que ya utiliza en la partitura:

- **`analyze_audio`:** inicios, el contorno del tono y el nivel. El tono se devuelve como nombres de notas con desviaciones en centésimos, nunca como frecuencias brutas.
- **`transcribe_audio`:** la grabación como notas: tono, inicio, duración y la distancia de cada nota al tono de referencia.
- **`score_audio_take`:** califica una interpretación en comparación con una canción de la biblioteca **de oído**. Transcribe la grabación, la compara con la partitura e informa qué notas se tocaron correctamente, cuáles se desviaron y cuáles se omitieron. Luego, `view_scored_piano_roll` dibuja el resultado sobre la partitura, exactamente como lo hace con una grabación MIDI. Así es como se califica un instrumento real, una interpretación cantada o cualquier cosa en la que no haya MIDI para grabar.
- **`view_spectrogram`:** vea el sonido. Un espectrograma de Q constante con un teclado de piano en el borde izquierdo, de modo que el tono sea legible de un vistazo, y las notas previstas de la canción se dibujen sobre él a petición.

**Lo que no le dirá.** La imagen sirve para encontrar *dónde* hay un problema; cada número proviene del procesamiento de la señal, nunca de un modelo que lee una imagen. El transcriptor sigue una línea a la vez, por lo que un acorde o una mezcla completa producirán algo seguro pero incorrecto, y lo indicará. La detección de inicios tiene una precisión de alrededor del 88 % en el estado actual de la técnica, por lo que una nota "omitida" puede ser una que el transcriptor no pudo escuchar, en lugar de una que usted no tocó; las herramientas incluyen esta advertencia en su propia salida en lugar de ocultarla aquí.

Toda la superficie es independiente: la transformación, el rastreador de tono, el detector de inicios, el decodificador WAV y el codificador PNG están todos en este repositorio, y producen los mismos números en Node y en el navegador.

## El conjunto en vivo

La audición califica una grabación una vez que ha terminado. Esta es la otra mitad: preguntar qué está haciendo cada instrumento **en este momento**, a mitad de la interpretación.

```
ensemble_now()
```

Responde con las notas sostenidas de cada instrumento, el tiempo que cada una se ha mantenido y el acorde combinado en todo el conjunto. Durante un dúo, las dos voces se informan por separado, para que pueda ver cómo el piano sostiene una tríada mientras el sintetizador lleva la melodía sobre ella.

### Dos canales, y el más barato es el más preciso

Esta es la parte que vale la pena entender, porque decide qué número confiar.

**Intención: lo que se le indicó a cada motor que tocara.** Cuando el modelo es el que interpreta, esto no es una estimación. Un acorde de piano no es algo que se deba transcribir; son tres notas que se enviaron. Las notas son exactas, libres e inmediatas.

**Acústico: lo que realmente salió.** Cada motor puede dirigir su salida a un bus de análisis privado, de modo que cada instrumento se mida en la fuente sin separación ni ambigüedad. Este canal es **verificación, no descubrimiento**: es cómo aprende que una voz se desvió del reloj, que una grabación se cortó o que un motor se silenció mientras seguía recibiendo notas.

Cuando los dos no coinciden, eso es un hecho sobre la renderización, no una corrección de las notas.

### Lo que cuesta

Observar un instrumento cuesta aproximadamente **9 microsegundos por llamada de retorno de audio**, en comparación con un bloque de 42,67 ms, lo que representa aproximadamente el 0,02 % del presupuesto de audio, medido con cero muestras descartadas. Un instrumento sin un observador adjunto no cuesta nada.

### Lo que no le dirá

El canal acústico tiene un retraso y indica cuánto: aproximadamente 23 ms para el tono y 70 ms para un inicio confirmado, porque un inicio no se puede confirmar hasta que haya llegado el audio posterior. Los inicios cerca de ese límite se retienen en lugar de informarse y luego retractarse.

El rastreador acústico sigue una línea a la vez, por lo que no nombrará las notas de un acorde, y no pretende hacerlo. Un acorde que no puede resolver es su limitación conocida, en lugar de un descubrimiento, y el conjunto se mantiene en silencio al respecto en lugar de dar falsas alarmas en cada acorde que toca el piano.

## El piano roll

El piano roll es la forma en que la IA ve la música. Representa cualquier canción como SVG: azul para la mano derecha, coral para la izquierda, con cuadrículas de compás, dinámica y límites de compás:

<p align="center">
  <img src="docs/fur-elise-m1-8.svg" alt="Piano roll of Fur Elise measures 1-8, showing right hand (blue) and left hand (coral) notes" width="100%" />
</p>

<p align="center"><em>Für Elise, measures 1–8 — the E5-D#5 trill in blue, bass accompaniment in coral</em></p>

Dos modos de color: **mano** (azul/coral) o **clase de tono** (arcoíris cromático: cada Do es rojo, cada Fa# es cian). El formato SVG significa que el modelo puede ver la imagen y leer el marcado para verificar el tono, el ritmo y la independencia de las manos.

## La cabina de mando

Un estudio de composición basado en el navegador que se encuentra en este repositorio en [`apps/cockpit`](apps/cockpit) y se ejecuta en vivo en **[mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit](https://mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit/)**. No hay complementos, ni DAW, ni instalación; todo permanece en su navegador (su trabajo se guarda automáticamente localmente). ¿Prefiere modificarlo?

```bash
cd apps/cockpit && npm install && npm run dev   # Vite dev server, opens in your browser
```

- **Un piano de concierto muestreado por defecto**: la cabina de mando incluye un paquete Salamander Grand recortado (90 archivos OGG, 8 MB) que se carga en su primera interacción y se reproduce a través de la misma cadena de salida que las voces del sintetizador; antes de que se cargue (o esté desconectado), el piano de oscilador afinado cubre sin problemas. Muestras de [Alexander Holm](https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html), CC-BY 3.0.
- **Modo de panel: la sala de escucha**: audiciones ciegas por pares A/B de las voces del motor de composición sobre melodías reales de la biblioteca: clips con el mismo volumen, renderizados fuera de línea a través de la ruta de voz real, pruebas aleatorias con pruebas ocultas de umbral, clasificaciones de Bradley-Terry con intervalos de confianza bootstrap y resultados honestos (PROVISIONALES hasta que cada par alcance su presupuesto de votos; NO INTERPRETABLES cuando el umbral de discriminación falla). Un segundo submodo ejecuta la misma clasificación con jueces LLM locales, además del historial de ambos tipos de ejecuciones y una vista de comparación (Kendall τ + coincidencia de clasificación del motor) que pregunta si las pistas proxy baratas reflejan la verdad humana.
- **Transporte preciso al compás**: las notas existen en el tiempo musical, por lo que el control de BPM realmente reajusta la reproducción; una regla de tiempo con clic para buscar y arrastrar para establecer **regiones de bucle**; desplazamiento automático que sigue la cabeza de reproducción
- **Captura con grabación activada**: toque las teclas QWERTY, el teclado en pantalla o un dispositivo Web MIDI y se grabará en la partitura: conteo de 1 compás, sobregrabación de estilo de bucle en los ciclos de bucle (o modo de reemplazo), la sincronización de la interpretación original se conserva en una vista cuantificada, cada pasada es una unidad que se puede deshacer
- **Deshacer/rehacer completo**: cada edición, incluida Borrar e Importar, es reversible (Ctrl+Z), con gestos de arrastre que se combinan de la manera en que lo hacen los editores reales
- **Selección múltiple + portapapeles**: selección con forma de recuadro bajo un interruptor de herramienta Seleccionar/Dibujar, clics con modificadores estándar de la plataforma, copiar/cortar/pegar en la cabeza de reproducción, Duplicar
- **Accesibilidad y compatibilidad con pantalla táctil**: eventos de puntero con captura en cada superficie, tocar para relocalizar como alternativa no de arrastre, edición de notas con el teclado, superposiciones de partituras seguras para personas con daltonismo
- **Piano roll de doble modo**: cambie entre el modo Instrumento (colores de clase de tono cromático) y el modo Vocal (notas coloreadas por forma de vocal: /a/ /e/ /i/ /o/ /u/)
- **Teclado visual**: dos octavas desde C4, asignadas a su teclado QWERTY. Haga clic o escriba.
- **20 preajustes de voz**: 15 voces mapeadas por Kokoro (Aoede, Heart, Jessica, Sky, Eric, Fenrir, Liam, Onyx, Alice, Emma, Isabella, George, Lewis, más coro y voz de sintetizador), 4 voces mapeadas por tracto y una sección de coro sintético
- **10 preajustes de instrumento**: las 6 voces de piano del lado del servidor más sintetizador, órgano, campana y cuerdas
- **Inspector de notas**: haga clic en cualquier nota para editar la velocidad, la vocal y la suavidad
- **7 sistemas de afinación**: afinación temperada, afinación justa (mayor/menor), pitagórica, afinación de coma de cuarto, Werckmeister III o desplazamientos de centavos personalizados. Referencia A4 ajustable (392-494 Hz).
- **Auditoría de afinación**: tabla de frecuencias, probador de intervalos con análisis de frecuencia de batido y exportación/importación de afinación
- **Importación/exportación de partituras**: serialice toda la partitura como JSON y cárguela
- **API orientada a LLM**: `window.__cockpit` expone `exportScore()`, `importScore()`, `addNote()`, `play()`, `stop()`, `panic()`, `setMode()` y `getScore()` para que un LLM pueda componer, organizar y reproducir de forma programática

## El ciclo de aprendizaje

<p align="center">
  <img src="docs/learning-loop.svg" alt="The learning loop: Read (MIDI + annotations) → Play (six sound engines) → See (piano roll · guitar tab) → Reflect (practice journal), with the journal persisting so the next session picks up where the last left off" width="100%" />
</p>

## La biblioteca de canciones

108 canciones anotadas de 12 géneros, creadas a partir de archivos MIDI reales. Cada género tiene un ejemplo profundamente anotado, con contexto histórico, análisis armónico barra por barra, momentos clave, objetivos de enseñanza y consejos de interpretación (incluida la guía vocal). Estos ejemplos sirven como plantillas: la IA estudia uno y luego anota el resto.

**Qué archivos se incluyen y qué se obtiene.** Las anotaciones son nuestras y se incluyen con cada canción. Los archivos MIDI se descargaron de sitios MIDI públicos cuando se creó la biblioteca, y una auditoría de procedencia por archivo ([`docs/findings/library-provenance-audit.md`](docs/findings/library-provenance-audit.md)) reveló que solo 14 de ellos tienen una licencia que permite la redistribución: los arreglos de piano-midi.de de Bernd Krueger (CC-BY-SA-3.0-DE) y las ediciones de dominio público del Proyecto Mutopia. Estos 14 se incluyen en el paquete npm. Los otros 94 no: sus `.json` se incluyen, con un `provenance` que indica el origen, sus términos y el SHA-256 del archivo, y `ai-jam-sessions library fetch --accept-source-terms` descarga cada uno de ellos del sitio que lo publicó, bajo los términos de ese sitio, rechazando cualquier archivo cuyo hash ya no coincida con lo que se verificó en las anotaciones. Doce archivos que resultaron ser piezas diferentes a las que indicaba su nombre se pusieron en cuarentena, por lo que el recuento es de 108 y no de los 120 que se afirmaba en las versiones anteriores. Las versiones anteriores a esta incluían los 120 archivos MIDI; fue un error, y se corrige aquí en lugar de ocultarlo.

| Género | Ejemplo | Clave | Qué enseña |
|-------|----------|-----|-----------------|
| Blues | The Thrill Is Gone (B.B. King) | Si menor | Forma de blues menor, llamada y respuesta, tocar después del ritmo |
| Clásico | Für Elise (Beethoven) | La menor | Forma de rondó, diferenciación del tacto, disciplina del pedal |
| Cine | Comptine d'un autre été (Tiersen) | Mi menor | Texturas en arpegio, arquitectura dinámica sin cambio armónico |
| Folclórico | Greensleeves | Mi menor | Sensación de vals en 3/4, mezcla modal, estilo vocal renacentista |
| Jazz | Autumn Leaves (Kosma) | Sol menor | Progresiones ii-V-I, tonos guía, corcheas con swing, acordes sin fundamental |
| Latino | The Girl from Ipanema (Jobim) | Fa mayor | Ritmo de bossa nova, modulación cromática, moderación vocal |
| New-Age | River Flows in You (Yiruma) | La mayor | Reconocimiento I-V-vi-IV, arpegios fluidos, rubato |
| Pop | Imagine (Lennon) | Do mayor | Acompañamiento en arpegio, moderación, sinceridad vocal |
| Ragtime | The Entertainer (Joplin) | Do mayor | Bajo "oom-pah", síncopa, forma multi-estrofa, disciplina del tempo |
| R&B | Superstition (Stevie Wonder) | Mi bemol menor | Funk en semicorcheas, teclado percusivo, notas fantasma |
| Rock | Your Song (Elton John) | Mi bemol mayor | Conducción de la voz en balada para piano, inversiones, canto conversacional |
| Soul | Lean on Me (Bill Withers) | Do mayor | Melodía diatónica, acompañamiento gospel, llamada y respuesta |

Las canciones progresan desde **crudo** (solo MIDI) → **anotado** → **listo** (totalmente reproducible con lenguaje musical). La IA promueve las canciones estudiándolas y escribiendo anotaciones con `annotate_song`.

## Motores de sonido

Seis motores, más un combinador en capas que ejecuta dos de ellos simultáneamente:

| Motor | Tipo | Cómo suena |
|--------|------|---------------------|
| **Oscillator Piano** | Síntesis aditiva | Piano multi-armónico con ruido de martillo, inarmonicidad, brillo con forma de velocidad, polifonía de 48 voces, imagen estéreo. Cero dependencias. |
| **Sample Piano** | Reproducción de muestras | Salamander Grand Piano: el sonido real. **El motor predeterminado cada vez que se instala un paquete** (`samples/AccurateSalamander` o `AI_JAM_SAMPLES_DIR`); el archivo tar de npm permanece libre de muestras, por lo que usted proporciona la descarga de [Salamander](https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html). La cabina del navegador incluye su propio paquete recortado de 8 MB (90 archivos OGG, CC-BY 3.0 Alexander Holm); no requiere configuración en la web. |
| **Vocal (Sample)** | Muestras con cambio de tono | Tonos vocales sostenidos con portamento y modo legato. |
| **Vocal Tract** | Modelo físico | Pink Trombone: forma de onda glotal de baja frecuencia a través de una guía de ondas digital de 44 celdas. Cuatro preajustes: soprano, alto, tenor, bajo. |
| **Vocal Synth** | Síntesis aditiva | 15 preajustes de voz Kokoro con modelado de formantes, respiración, vibrato. Determinista (RNG con semilla). |
| **Guitar** | Síntesis aditiva | Cuerda pulsada modelada físicamente: 4 preajustes (dreadnought de acero, clásico de nailon, jazz archtop, de doce cuerdas), 8 afinaciones, 17 parámetros ajustables. |
| **Layered** | Combinador | Envuelve dos motores y envía cada evento MIDI a ambos: piano+sintetizador, vocal+sintetizador, etc. |

### Voces de teclado

Seis voces de piano ajustables, cada una ajustable por parámetro (brillo, decaimiento, dureza del martillo, desafinación, amplitud estéreo y más):

| Voz | Carácter |
|-------|-----------|
| Concert Grand | Rico, completo, clásico |
| Upright | Cálido, íntimo, folclórico |
| Electric Piano | Sedoso, jazzístico, con la sensación de un Fender Rhodes |
| Honky-Tonk | Desafinada, ragtime, de salón |
| Music Box | Cristalina, etérea |
| Bright Grand | Impactante, contemporánea, pop |

### Voces de guitarra

Cuatro preajustes de voz de guitarra con síntesis de cuerdas modelada físicamente, cada uno con 17 parámetros ajustables (brillo, resonancia del cuerpo, posición de pulsación, amortiguación de la cuerda y más):

| Voz | Carácter |
|-------|-----------|
| Steel Dreadnought | Brillante, equilibrada, acústica clásica |
| Nylon Classical | Cálida, suave, redondeada |
| Jazz Archtop | Suave, amaderada, limpia |
| Twelve-String | Brillante, duplicada, con efecto de coro |

## El diario de práctica

Después de cada sesión, el servidor captura lo que sucedió: qué canción, qué velocidad, cuántas medidas, cuánto duró. La IA añade sus propias reflexiones: lo que notó, qué patrones reconoció, qué probar a continuación.

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

Un archivo markdown por día, almacenado en `~/.ai-jam-sessions/journal/`. Legible por humanos, solo se añaden datos. En la siguiente sesión, la IA lee su diario y continúa donde lo dejó.

## Conjunto de datos de entrenamiento

**jam-actions-v0**: un conjunto de datos público de trazas de uso de herramientas MCP de múltiples turnos, basado en MIDI de piano clásico. Creado a partir de la misma biblioteca con la que este servidor enseña, el conjunto de datos enseña a los LLM a realizar **un uso de herramientas fundamentado en música simbólica**, no solo en la generación de texto.

Cada registro asocia una ventana de frase de 4 compases con un objetivo de enseñanza anotado y un *registro objetivo*, una sesión paso a paso en la que un asistente utiliza las herramientas MCP mencionadas anteriormente (`get_events_in_measure`, `get_events_in_hand`, `count_distinct_pitch_classes` y el resto de la interfaz MIDI de 9 herramientas) para leer, analizar y comentar la frase.

| | |
|---|---|
| Versión | **0.6.0 (25 de septiembre de 2026) — versión de corrección** (ver más abajo) |
| Registros | 57 (subconjunto público): 45 para entrenamiento, 12 para pruebas (`clair-de-lune`) |
| Composiciones | 4 obras clásicas para piano: Bach BWV 846, Mozart K. 545 I, Beethoven "Für Elise", Debussy "Clair de Lune" |
| MIDI de origen | piano-midi.de — arreglos de Bernd Krueger, cada archivo lleva el crédito de derechos de autor de Krueger |
| Licencia | CC-BY-SA-3.0-DE (arreglos) sobre composiciones de dominio público |
| Dónde | [`mcp-tool-shop/jam-actions-v0`](https://huggingface.co/datasets/mcp-tool-shop/jam-actions-v0) on Hugging Face and on Zenodo; DOIs and citation in the [dataset card](datasets/jam-actions-v0-public/README.md) and [`CITATION.cff`](datasets/jam-actions-v0-public/CITATION.cff) |

**La corrección 0.6.0.** Las versiones 0.4.x y 0.5.x contenían 115 registros de 8 obras, todos atribuidos a Bernd Krueger. Esta atribución se verificó con las páginas de compositores de piano-midi.de, no con los archivos. Cuando se realizó una auditoría de la biblioteca de canciones a partir de los bytes MIDI, se descubrió que cuatro de esas canciones —Nocturno de Chopin Op. 9 No. 2 y Preludio Op. 28 No. 4, "Pathétique" II de Beethoven y "Träumerei" de Schumann— se habían creado a partir de archivos obtenidos de midiworld.com y bitmidi.com, sin una licencia de arreglo establecida. Sus 58 registros contenían esos arreglos nota por nota, por lo que 0.6.0 los retira. Los 57 registros restantes son idénticos a los de 0.5.0. Por favor, no redistribuya los registros retirados de las versiones anteriores. La información completa se encuentra en [`docs/findings/published-dataset-licence-audit.md`](docs/findings/published-dataset-licence-audit.md).

**La puerta de control de evidencia.** El empaquetador ahora vuelve a leer el bloque de procedencia de la biblioteca de cada canción (rederivado de los bytes MIDI) y rechaza cualquier registro cuya canción no tenga una licencia de arreglo redistribuible, o cuyo hash del archivo de origen difiera del archivo evidenciado. Funciona de forma restrictiva. Una prueba vuelve a ejecutar la misma comprobación en cada paquete publicado, por lo que un cambio posterior en la procedencia hace que la compilación se marque como fallida en los conjuntos publicados.

**Historia de la calidad: la puerta de lanzamiento de 7 ejes.** La puerta de lanzamiento del conjunto de datos distingue entre la aprobación basada en la evidencia y la aprobación que alcanza el máximo nivel. Los ejes 1 a 6 son de bloqueo (umbral absoluto, compuesto de margen, tasa de uso de herramientas, corrección después del uso de la herramienta, recuento de interpretaciones erróneas, umbral de estrato); el eje 7 es de enriquecimiento frente a la no información. Sus resultados registrados se midieron en la composición de 115 registros de 0.4.x y 0.5.x y siguen siendo reproducibles a partir de la etiqueta `jam-actions-v0-0.5.0-cut-2026-07-11`; no se han vuelto a medir en 0.6.0.

**Reproducibilidad.** Un colaborador nuevo en cualquier plataforma (Windows nativo, macOS, Linux, WSL) puede verificar el paquete y volver a compilarlo:

```bash
git clone https://github.com/mcp-tool-shop-org/ai-jam-sessions.git
cd ai-jam-sessions && pnpm install
pnpm exec tsx scripts/verify-public-package-checksums.ts                        # every file accounted for
pnpm exec tsx scripts/package-jam-actions-public.ts --today 2026-09-25 --dry-run # evidence gate runs first
pnpm build && pnpm exec tsx scripts/verify-public-package-execution.ts
# → "VERDICT: PASS" — every frozen tool call replays live (needs an audio device)
```

`.gitattributes` fija los finales de línea LF para `*.sha256` y el árbol del conjunto de datos público para que el verificador de sumas de comprobación funcione en todas las plataformas.

**Historial de ajuste fino.** Las afirmaciones del conjunto de datos se probaron con ajustes finos preregistrados, puntuados en comparación con líneas de base selladas. **v0** (solo las 78 trazas de jam) devolvió un resultado negativo honesto ([informe](docs/finetune-arc-eval-report.md)); **v1** mejoró la calidad de la evaluación basada en herramientas en +0,202, pero no cumplió con su objetivo preregistrado por una victoria en una pareja ([informe](docs/finetune-arc-v1-eval-report.md)); **B-1** volvió a probar los adaptadores congelados v1 en una cohorte de 36 registros: 0,678 → 0,890, 29/36 victorias en parejas frente al objetivo inicial de 24/34 ([informe](docs/finetune-arc-v2-b1-eval-report.md)). Esas mediciones se mantienen como se registraron. **Los adaptadores en sí se retiran**: sus datos de entrenamiento incluían registros de las cuatro canciones retiradas, por lo que no se pueden ofrecer bajo los términos de este conjunto de datos. Los adaptadores entrenados solo con material con licencia se publican con los conjuntos de datos `jam-actions-v1`.

> Los arreglos MIDI son de Bernd Krueger (piano-midi.de), con licencia CC-BY-SA-3.0-DE. Las anotaciones, trazas y artefactos de evaluación son del equipo de AI Jam Sessions, que se publican bajo la misma licencia para que se conserve la cadena de compartir por igual de principio a fin. **Límite de licencia:** la licencia MIT del repositorio cubre el código; todo lo que se encuentra en `datasets/` tiene licencia CC-BY-SA-3.0-DE. El corpus de trabajo en `datasets/jam-actions-v0/` también contiene registros que no se publican: dos obras cuya procedencia nunca se verificó (Satie Gymnopédie No. 1, Debussy Arabesque No. 1) y las cuatro que se retiraron en 0.6.0; consulte [`datasets/jam-actions-v0/PROVENANCE-NOTE.md`](datasets/jam-actions-v0/PROVENANCE-NOTE.md).

### El corpus acústico

**jam-actions-acoustic-v0**: la contraparte de las trazas anteriores, aplicada al **audio** en lugar de a la música simbólica. 108 registros, cada uno de los cuales empareja una representación sintética deliberadamente alterada de una frase de dominio público con el veredicto que las herramientas de análisis realmente devuelven, de modo que se verifica cada etiqueta en relación con el instrumento y no solo consigo misma.

| | |
|---|---|
| Versión | 1.1.0 (25 de septiembre de 2026) — se retiraron los 36 registros de "Träumerei" de 1.0.x, cuyo archivo de origen no tiene una licencia de arreglo establecida. |
| Registros | 72: 2 frases (Bach, Für Elise) × 9 tipos de perturbación × 4 notas objetivo |
| Reservado | por **frase** (Für Elise), no por registro, por lo que una copia alterada de la misma melodía no puede filtrarse. |
| Clases | coincidencia, error/advertencia de tono, error/acierto de tiempo, nota omitida, nota adicional, vibrato afinado, silencio sin nada que calificar |
| Audio | ninguno distribuido: cada registro contiene una receta determinista y el SHA-256 de la forma de onda que produce |
| Esquema | `jam-actions-acoustic-v0/1.0.0` |

Dos de las nueve clases están ahí porque un modelo ingenuo las responde con confianza y de forma incorrecta: una nota de vibrato cuyo veredicto correcto es *afinado*, y silencio cuyo veredicto correcto es *nada que calificar*. Cada umbral del que depende el veredicto se copia en el registro, porque ambos se modificaron una vez durante la compilación.

El corpus se puede reproducir a partir de este repositorio. Volver a generarlo produce todos los 115 archivos publicados y un `checksums.sha256` idéntico en bytes, y una prueba confirma exactamente eso sin escribir el árbol publicado.

**Una advertencia, medida en lugar de asumida.** Cada registro contiene `wav_sha256`, el hash de la forma de onda que produce su receta, y el renderizador llama a `Math.pow` y `Math.sin` una vez por muestra. Ninguno de los dos debe estar correctamente redondeado, y los resultados de V8 cambiaron entre Node 22 y Node 24: de los 27.869 argumentos `Math.pow(2, x)` distintos que evalúa este conjunto de datos, 253 devuelven un valor double diferente. Casi todo eso desaparece con la cuantificación de 16 bits, pero **2 de los 108 registros** —ambos la `extra` perturbación de Für Elise, cuyo motivo se encuentra en la única nota donde la relación de semitono en sí difiere— tienen un hash diferente en Node 24. Todos los demás campos de cada registro se reproducen en cualquier motor, y el repositorio prueba ambas afirmaciones por separado. Si vuelve a renderizar y ve que esos dos no coinciden, es esto, no una descarga corrupta. Hacer que la forma de onda sea portable a nivel de bits implica reemplazar las funciones trascendentes, lo que cambia cada hash y, por lo tanto, requiere una nueva versión del esquema.

### Crea el tuyo propio

La estructura sobre la que se ejecuta el corpus está disponible para tus propios experimentos.
`experiments/_template/` (experiments/_template/) es un ejemplo funcional que puedes copiar: declara una tarea y obtendrás el formato SFT, la puntuación por clase, líneas de base triviales sobre el conjunto de veredictos declarado y una verificación de que ninguna unidad reservada se superponga con la división.

El [contrato](experiments/_template/README.md) es la parte que vale la pena leer. La verdad fundamental es construible en lugar de escrita a mano, las etiquetas se verifican en función de lo que miden las herramientas, divides por la unidad que se filtra y comunicas las líneas de base y el modelo base junto con cualquier resultado. Cada una de esas reglas tiene un costo de aprendizaje.

## Instalar

```bash
npm install -g @mcptoolshop/ai-jam-sessions
```

Requiere **Node.js 22+** (v2.0.0 elevó el umbral con `node-web-audio-api` 2.0). No se necesitan controladores MIDI, puertos virtuales ni software externo.

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

Cada versión también publica `ghcr.io/mcp-tool-shop-org/ai-jam-sessions`, una imagen ligera que ejecuta el servidor MCP en stdio. Lo único que hay que saber es que `/data` es la memoria: el diario, el estado del servidor, las canciones del usuario y cualquier MIDI descargado se almacenan allí, por lo que debe montar un volumen o se perderán con el contenedor.

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

La imagen incluye los 14 archivos MIDI redistribuibles; la ejecución de `library fetch --accept-source-terms` una vez dentro del contenedor coloca los otros 94 en el volumen. `docker compose up` hace lo mismo con un volumen con nombre, y `--profile ollama` agrega un contenedor secundario de Ollama. Detalles, la CLI dentro de la imagen y lo que se excluye deliberadamente: [docs/docker.md](docs/docker.md). Ejecutar los evaluadores ajustados en Ollama, con el costo medido de una base de 4 bits: [docs/ollama-adapters.md](docs/ollama-adapters.md).

## Herramientas MCP

54 herramientas y 4 plantillas de indicaciones en ocho categorías:

### Aprender

| Herramienta | Qué hace |
|------|--------------|
| `list_songs` | Navegar por género, dificultad o palabra clave |
| `song_info` | Análisis musical completo: estructura, momentos clave, objetivos de enseñanza, consejos de estilo |
| `registry_stats` | Estadísticas de toda la biblioteca: número total de canciones, géneros, niveles de dificultad |
| `list_measures` | Notas, dinámicas y notas de enseñanza de cada compás |
| `teaching_note` | Análisis detallado de un solo compás: digitación, dinámicas, contexto |
| `suggest_song` | Recomendación basada en el género, la dificultad y lo que has tocado |
| `practice_setup` | Velocidad, modo, configuración de voz y comando CLI recomendados para una canción |
| `compare_songs` | Reconocimiento de patrones entre géneros: relaciones clave, similitud de tono/intervalo, formas compartidas, conexiones de enseñanza |
| `annotation_progress` | Calidad de las anotaciones de las pistas en toda la biblioteca: puntuaciones, calificaciones y sugerencias de mejora |
| `server_info` | Versión del servidor, estadísticas de la biblioteca, lista de motores, sesión activa |

### Reproducir

| Herramienta | Qué hace |
|------|--------------|
| `play_song` | Reproducir a través de los altavoces: canciones de la biblioteca o archivos .mid sin procesar. Cuatro motores (piano, vocal, tracto, guitarra), cualquier velocidad, modo, rango de compases, además de un metrónomo con conteo inicial y una bandera `record` que captura la sesión para la evaluación. Los motores de sintetizador y capas solo están disponibles a través de la línea de comandos. |
| `stop_playback` | Detener |
| `pause_playback` | Pausar o reanudar |
| `set_speed` | Cambiar la velocidad durante la reproducción (0,1×–4,0×) |
| `playback_status` | Instantánea en tiempo real: compás actual, tempo, velocidad, voz del teclado, estado |
| `view_piano_roll` | Renderizar como SVG (color de la mano o arco iris cromático de clase de tono) |
| `score_performance` | Evaluar una pieza MIDI para tocarla junto con la música: precisión del tono, ritmo, integridad, con retroalimentación gradual |
| `mute_hand` | Silenciar o reactivar la mano izquierda/derecha durante la práctica: aislar una mano a la vez |
| `detect_chord` | Identificar el acorde a partir de un conjunto de notas MIDI que suenan actualmente (por ejemplo, `[60,64,67]` → C) |
| `preview_teaching_cues` | Ver todas las notas de enseñanza y los momentos clave antes de tocar |

### Practicar

| Herramienta | Qué hace |
|------|--------------|
| `practice_loop` | El ejercicio que un profesor real asignaría: repetir los compases 5-8 más lentamente, y el tempo aumenta (+5%) solo después de una ejecución *limpia*; cada ejecución se registra, se evalúa y se resume. |
| `practice_status` | Estado del ejercicio: ejecución actual, velocidad y un diagnóstico por compás de la última ejecución |
| `score_last_take` | Evaluar la ejecución más reciente registrada: precisión del tono, ritmo, integridad, veredictos por nota |
| `view_scored_piano_roll` | La partitura marcada que utiliza todo profesor: el piano roll superpuesto con veredictos por nota en una paleta segura para personas con daltonismo (sólido = correcto, punteado = ritmo, ✕ = falta) |

### Cantar

| Herramienta | Qué hace |
|------|--------------|
| `sing_along` | Texto cantable: nombres de notas, solfeo, contorno o sílabas. Con o sin acompañamiento de piano. |
| `ai_jam_sessions` | Generar una guía para improvisar: progresión de acordes, esquema de la melodía y sugerencias de estilo para la reinterpretación |
| `verify_harmony` | La puerta de verificación del bucle de creación: una rearmonización propuesta es verificada por las herramientas deterministas de la plataforma: fidelidad del acorde (el motor de acordes debe detectar cada acorde previsto), consonancia de la melodía (tono/tensión/cromaticismo), conducción de la voz del bajo, pertenencia a la tonalidad |
| `auto_reharmonize` | El bucle de creación en una sola llamada: un modelo local propone una rearmonización, la puerta determinista de `verify_harmony` verifica cada voz, la mejor de n hasta que se obtiene una interpretación verificada |
| `compose_panel` | Ejecutar el panel de composición de conducción de voces en cualquier canción: cuatro sistemas crean acompañamientos, los jueces LLM ciegos de diferentes familias los clasifican, Bradley-Terry los agrega, con una puerta de discriminación que invalida las ejecuciones no interpretables (solo señal direccional, nunca una puntuación de calidad). Se ejecuta durante minutos y transmite notificaciones de progreso mientras trabaja. |

**Una línea cantada sincronizada con el reloj: la ruta vocal.** Cualquier canción de la biblioteca puede llevar una línea vocal real que se sincronice con el piano: un **reloj de partitura** (`scripts/build-score-clock.mjs`) deriva el tono, el inicio y la duración de cada sílaba del MIDI de la canción en la línea de tiempo del reproductor; un cantante local, Apache-2.0, condicionado por la partitura ([SoulX-Singer](https://github.com/Soul-AILab/SoulX-Singer)) canta a partir de ese reloj en su GPU; y dos compuertas miden el resultado antes de que se considere una mezcla: **tiempo**: cada inicio de vocal dentro de los 40 ms de la partitura; **tono**: cada nota dentro de los 50 centavos, con un desplazamiento global de 20. Las palabras se seleccionan de un conjunto de tomas y se unen solo en los límites de las palabras con fundidos cruzados. Controles: `--track` (qué pista MIDI es la melodía; `--list-tracks` para ver), `--lyrics "A-ma-zing grace …"` (un token por nota, sílabas unidas por `-`), `--measures`, el clip de indicación (la voz), cuántas tomas y los umbrales de la compuerta, cada uno con su cita en `scripts/vocal_clock.py`. Ruta, controles y comprobantes: [manual → Vocales](https://mcp-tool-shop-org.github.io/ai-jam-sessions/handbook/vocals/), [`docs/vocal-clock.md`](docs/vocal-clock.md); la investigación detrás de las elecciones: [`docs/vocal-singing-study-2026-09.md`](docs/vocal-singing-study-2026-09.md).

### Guitarra

| Herramienta | Qué hace |
|------|--------------|
| `view_guitar_tab` | Renderizar una tablatura de guitarra interactiva como HTML: hacer clic para editar, cursor de reproducción, atajos de teclado |
| `list_guitar_voices` | Presets de voz de guitarra disponibles |
| `list_guitar_tunings` | Sistemas de afinación de guitarra disponibles (estándar, Drop-D, Open G, DADGAD, etc.) |
| `tune_guitar` | Ajustar cualquier parámetro de cualquier voz de guitarra. Persiste entre sesiones. |
| `get_guitar_config` | Configuración actual de la voz de guitarra frente a la configuración predeterminada de fábrica |
| `reset_guitar` | Restablecer a la configuración de fábrica una voz de guitarra |

### Crear

| Herramienta | Qué hace |
|------|--------------|
| `add_song` | Agregar una nueva canción como JSON |
| `import_midi` | Importar un archivo .mid con metadatos |
| `annotate_song` | Escribir lenguaje musical para una canción sin procesar y prepararla |
| `save_practice_note` | Entrada de diario con datos de sesión capturados automáticamente |
| `read_practice_journal` | Cargar entradas recientes para obtener contexto |
| `list_keyboards` | Voces de teclado disponibles |
| `tune_keyboard` | Ajustar cualquier parámetro de cualquier voz de teclado. Persiste entre sesiones. |
| `get_keyboard_config` | Configuración actual frente a la configuración predeterminada de fábrica |
| `reset_keyboard` | Restablecer a la configuración de fábrica una voz de teclado |
| `score_annotation` | Calidad de la anotación de la partitura en cinco dimensiones: integridad, profundidad, especificidad, valor de enseñanza, vocabulario |
| `validate_song_entry` | Validar un archivo JSON de canción con respecto al esquema antes de agregarlo |
| `transpose_song` | Transponer una canción hacia arriba o hacia abajo en semitonos: nueva tonalidad, nuevas notas |
| `list_sections` | Ver las secciones estructurales de una canción (Intro, Verso, Coro, etc.) |
| `add_section` | Agregar un marcador de sección a una canción para la navegación estructural |

### Puntuación

| Herramienta | Qué hace |
|------|--------------|
| `score_performance` | Puntúa una interpretación MIDI junto con una canción de la biblioteca: tono, tiempo, integridad, con retroalimentación graduada |
| `score_annotation` | Puntúa la calidad de la anotación en 5 dimensiones |

### Escucha

Mide el audio grabado. Monofónico: siguen una línea a la vez, por lo que un acorde o una mezcla completa producen tonterías. Cada número proviene del procesamiento de señales, nunca de un modelo que lee una imagen.

| Herramienta | Qué hace |
|------|--------------|
| `analyze_audio` | Mide un archivo WAV: tiempos de inicio, el contorno del tono como nombres de notas con céntimos y nivel |
| `transcribe_audio` | Convierte una grabación monofónica en notas, con la desviación de cada nota del tono de afinación. Las notas que el rastreador no pudo seguir se omiten en lugar de adivinarse |
| `score_audio_take` | Califica una interpretación junto con una canción de la biblioteca **de oído**, y luego entrega el resultado a `view_scored_piano_roll` |
| `view_spectrogram` | Ve el sonido: un espectrograma de Q constante en un eje de teclado de piano, opcionalmente superpuesto con las notas previstas. Por defecto, está oculto. |
| `ensemble_now` | Qué está tocando **cada instrumento en este momento**, a mitad de la interpretación. Las notas provienen de lo que se envió, por lo que son exactas en lugar de estimadas |

### Indicaciones de MCP

Cuatro plantillas de indicaciones para flujos de trabajo de enseñanza estructurados:

| Indicación | Qué hace |
|--------|--------------|
| `annotate_song` | Flujo de trabajo de anotación guiada: estudiar un ejemplo, escribir lenguaje musical para una canción sin procesar |
| `practice_plan` | Crear un plan de práctica estructurado basado en el género, la dificultad y los objetivos |
| `performance_review` | Revisar una sesión completada: qué salió bien, en qué enfocarse a continuación |
| `maker_loop` | Realizar el bucle de creación completo: proponer una rearmonización, verificarla con las herramientas deterministas de la plataforma y luego agregar y reproducir el resultado verificado |

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

## Estado

**v2.6.0: la versión que deja de incluir contenido para el que no tenía licencia** (ver [CHANGELOG](CHANGELOG.md)).
Una auditoría de procedencia por archivo de la biblioteca de canciones reveló que, de las 108 arreglos MIDI, 14 tienen una
licencia que permite la redistribución y 94 no; además, se descubrió que doce archivos eran piezas
diferentes a lo que indicaba su nombre. Ahora, cada canción incluye un bloque `provenance` respaldado por pruebas (URL de origen,
los términos del sitio, el arreglista como el nombre del evento de derechos de autor del archivo, SHA-256, veredicto del título);
los doce archivos se han puesto en cuarentena; el paquete npm incluye los 14 y marca el resto como *no descargados*, y
`ai-jam-sessions library fetch --accept-source-terms` descarga cada uno del sitio que lo publicó,
bajo los términos de ese sitio, rechazando cualquier archivo cuyo hash ya no coincida. Las versiones anteriores incluían
los 120 archivos y están obsoletas en npm. La misma auditoría restableció el conjunto de datos jam-actions-v1 a las
once canciones cuyos arreglos se han verificado (tres Krueger CC-BY-SA-3.0-DE, ocho Mutopia Public
Domain); el corpus, su sonda de puerta de enlace y el arco de entrenamiento que encontró el objetivo de la obra mostrada (un
LoRA de 3B con rango 16 y una receta sin cambios que va desde una clase anterior a 54/54 y 72/72 cerca de la puerta
una vez que el asistente escribió los dígitos de la comparación) se encuentran en el repositorio en
`datasets/` y `experiments/coverage-v1-sft/`, y su publicación en Hugging Face y Zenodo
se realizará a partir del corpus verificado. También en esta versión: `scorePerformance` limita la ventana correcta
en la puerta de enlace del llamador, por lo que la regla de la casa de 40 ms es exactamente la ventana de veredicto.

**v2.5.0: la versión en la que el modelo puede ver a la banda tocar** (consulta [CHANGELOG](CHANGELOG.md)).
`ensemble_now` informa de lo que está haciendo cada instrumento mientras la música sigue sonando: notas sostenidas por instrumento, cuánto tiempo se han sostenido y el acorde combinado. Se ejecuta en dos canales, y el más barato es el más preciso: cuando este servidor lo ejecuta, sabe exactamente lo que envió, por lo que un acorde son tres notas en lugar de un problema de transcripción, mientras que una toma acústica separada mide cada motor **en la fuente** para su verificación. El costo medido es de aproximadamente **9 microsegundos por llamada de retorno de audio**: la latencia se indica en lugar de implicarse (~23 ms de tono, ~70 ms de inicio confirmado); y los límites se documentan porque se pueden aplicar: el rastreador es monofónico, los elementos secundarios se miden individualmente y nunca como una mezcla, y un instrumento sin toma no es un instrumento silencioso.
La misma versión convierte la maquinaria del conjunto de datos en un contrato que cualquiera puede declarar, con una plantilla funcional, para que los usuarios puedan crear sus propios corpus y entrenar sus propios adaptadores utilizando la misma disciplina. En el camino, se descubrió que la puerta de reproducibilidad del corpus acústico cubre 109 de sus 115 rutas publicadas, y tres de las seis que faltaban nunca fueron emitidas por el generador: volver a generarlas las eliminó. Una regeneración completa ahora reproduce cada archivo y el manifiesto de suma de comprobación byte por byte. La superficie activa es de **54 herramientas y 4 plantillas de indicaciones**, con **3.389 pruebas superadas en 165 archivos (1 omitida)**.

Anteriormente, en la v2.4.0: la versión en la que el modelo adquirió oídos. Cuatro herramientas cerraron la brecha entre la renderización de audio y su examen: `analyze_audio` para inicios, contorno de tono y nivel; `transcribe_audio` para una grabación monofónica como notas; `score_audio_take` para calificar una interpretación de oído y entregar el resultado al piano roll existente sin cambios; y `view_spectrogram` para ver el sonido en un eje de Q constante, teclado de piano. Todo ello es procesamiento de señales sin dependencias, escrito en este repositorio: su propia FFT, ventanas, transformaciones mel y de Q constante, detección de inicio y seguimiento de tono, porque un modelo no puede examinar de forma fiable una imagen y las consultas deterministas superan a la inferencia para las preguntas con respuestas exactas. Esa versión también publicó **jam-actions-acoustic-v0**, 108 registros de oro construibles del uso de herramientas sobre audio.

**v2.3.0: la versión en la que el instrumento aprendió a cantar sincronizado con el reloj** (consulte [CHANGELOG](CHANGELOG.md)). Ahora, cualquier canción de la biblioteca puede llevar una línea vocal real que se sincronice con el piano: un **reloj de partitura** deriva el tono, el inicio y la duración de cada sílaba del MIDI de la canción en la línea de tiempo del reproductor; un cantante local, Apache-2.0, condicionado por la partitura ([SoulX-Singer](https://github.com/Soul-AILab/SoulX-Singer)) canta a partir de él; y dos compuertas miden el resultado antes de que se considere una mezcla: tiempo (cada vocal dentro de los 40 ms de la partitura) y tono (cada nota dentro de los 50 centavos). La ejecución de Amazing Grace incluida mide un máximo de 6 ms de desfase de tiempo y -2,7 centavos de tono global, con comprobantes registrados; la página de inicio la presenta como un estado honesto, con el único defecto restante identificado (el empalme de apertura). La ruta, sus controles y la investigación detrás de cada elección (cinco líneas de estudio, citadas) se encuentran en el [manual](https://mcp-tool-shop-org.github.io/ai-jam-sessions/handbook/vocals/) y [`docs/`](docs/). La interfaz en vivo no ha cambiado y sigue teniendo **49 herramientas y 4 plantillas de indicación**, con **3080 pruebas superadas (1 omitida)**, además de su propia suite de pruebas pytest para el instrumento vocal. **Estado de publicación:** publicado: [`@mcptoolshop/ai-jam-sessions@2.3.0`](https://www.npmjs.com/package/@mcptoolshop/ai-jam-sessions) en npm, con trazabilidad verificada.

Anteriormente, en la v2.2.0: la versión en la que el instrumento obtuvo oídos reales y una sala de escucha. El piano predeterminado del panel de control ahora es un **Concert Grand muestreado**, un paquete Salamander recortado que se carga en el primer gesto y vuelve al sintetizador oscilador afinado hasta que esté listo; y el servidor selecciona automáticamente el motor de muestreo cada vez que se instala un paquete completo. En la parte superior se encuentra el **Panel de composición**: una sala de escucha A/B ciega y con el volumen igualado, donde un humano clasifica las voces del motor de composición en comparación con anclas teóricamente válidas e inválidas (Bradley-Terry con intervalos de confianza bootstrap, un umbral de discriminación de estilo MUSHRA, PROVISIONAL y NO INTERPRETABLE como resultados de primer nivel), junto con un panel de modelos locales que ejecuta la misma clasificación con jueces LLM de diferentes familias y una vista de comparación (Kendall τ) que pregunta si el proxy económico rastrea la verdad humana.

La misma versión incluye el motor de composición que alimenta el panel (`src/compose/`: una compuerta determinista de conducción de voces con preajustes de estilo nombrados, especificaciones de voz por construcción, un refinador parte por parte), una revisión completa de la salud (45 problemas solucionados: moneda de seguridad, cadenas humanizadas, una modificación visual que conserva el aspecto), entradas de la biblioteca de Satie y Debussy re-obtenidas de bytes de dominio público de Mutopia con comprobantes, y una fase de endurecimiento de pruebas con extraños: errores de validación descriptivos, envolventes de errores estructurados `{code, message, hint}`, un archivo tar curado, notificaciones de progreso en herramientas largas y gramática de errores de CLI. Esta versión se lanzó como [`@mcptoolshop/ai-jam-sessions@2.2.0`](https://www.npmjs.com/package/@mcptoolshop/ai-jam-sessions) con 49 herramientas, 4 plantillas de indicación y 3033 pruebas.

Anteriormente, en la v2.1.0: la versión en la que el analista se convirtió en un **creador**. El ciclo de creación se incluye como producto: un modelo propone una rearmonización de cualquier canción de la biblioteca, y las herramientas deterministas de la plataforma lo validan: el motor de acordes debe confirmar cada voz prevista (`verify_harmony`), cada nota de la melodía se etiqueta en relación con la nueva armonía, y solo una interpretación verificada continúa hacia `add_song` → `play_song` → `view_piano_roll`. Generación verificada por construcción: sin rúbrica, sin autoevaluación; el mismo `inferChord` que escribe los resúmenes de jam es el juez. La plantilla `maker_loop` guía todo el ciclo.

Anteriormente, en la v2.0.0: la versión en la que el conjunto de datos demostró su disciplina. **Importante: el umbral de Node.js ahora es 22** (`node-web-audio-api` 2.0); la superficie de la herramienta en sí no ha cambiado: seis motores de sonido, 47 herramientas MCP, 3 plantillas y una **biblioteca totalmente anotada: 120/120 canciones de 12 géneros** (12 campos clave corregidos a las tonalidades detectadas en el contenido en esta versión). El ciclo de enseñanza está cerrado de principio a fin: metrónomo con conteo → grabación en vivo → puntuación por nota → el piano roll puntuado con anotaciones → ciclos de práctica que aumentan el tempo solo después de que se completen las pruebas. El panel de control del navegador es una herramienta de composición real: transporte preciso al ritmo con regiones de bucle, captura con el botón de grabación activado, deshacer/rehacer completo, selección múltiple y portapapeles, soporte táctil: [disponible en la web](https://mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit/).

También se publica **[jam-actions-v0](#training-dataset)**: un conjunto de datos de entrenamiento de 57 registros de trazas de uso de herramientas MCP en múltiples turnos sobre piano clásico, con una puerta de enlace de 7 ejes, reproducibilidad de inicio en frío y metadatos completos de Zenodo + CITATION.cff (CC-BY-SA-3.0-DE), que se reflejan en [Hugging Face](https://huggingface.co/datasets/mcp-tool-shop/jam-actions-v0), y ahora incluyen **resultados de ajuste fino verificados en ambos sentidos**: un resultado negativo honesto (v0) y un resultado positivo disciplinado por preregistro que se detuvo a una victoria de su propia meta (v1); consulte los [recibos de ajuste fino](#training-dataset). Esta versión también corrige los registros de Bach en la fuente (revisiones del conjunto de trabajo r001/r002 con erratas) después de que la puerta de enlace de la canalización v1 detectara que la ventana publicada excedía las 62 medidas reales de BWV 846. 2506 pruebas superadas en el servidor MCP + panel de control + paquetes de conjuntos de datos + arneses de evaluación + validador de puerta de enlace. El MIDI está todo ahí, cada canción puede enseñar y el corpus de ese aprendizaje se incluye con ella.

## Seguridad y privacidad

**Datos afectados:** biblioteca de canciones (JSON + MIDI), directorio de canciones del usuario (`~/.ai-jam-sessions/songs/`), configuraciones de afinación de guitarra, entradas del diario de práctica, dispositivo de salida de audio local.

**Datos NO afectados (rutas predeterminadas):** el servidor MCP y la CLI no realizan llamadas de red, no leen credenciales y no tocan ningún archivo del sistema fuera del directorio de canciones del usuario. No se recopila ni se envía ninguna telemetría. La **herramienta de conjunto de datos/evaluación opcional** incluida en el mismo paquete (`scripts/run-llm-eval.ts`, verificador de procedencia) es la única excepción: cuando la invoca explícitamente, puede llamar a las API de LLM (lee `ANTHROPIC_API_KEY` de su entorno, nunca lo almacena) y obtener URL de procedencia. Nunca se ejecuta como parte del servidor, la CLI o la instalación.

**Permisos:** el servidor MCP utiliza solo el transporte stdio (sin HTTP). La CLI accede al sistema de archivos local y a los dispositivos de audio. Consulte [SECURITY.md](SECURITY.md) para obtener la política completa.

## Licencia

MIT
