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
  109 annotated songs across 12 genres. Six sound engines. Interactive guitar tablature.<br/>
  A browser cockpit with vocal synthesizer. A practice journal that remembers everything.
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-jam-sessions/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-jam-sessions/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://codecov.io/gh/mcp-tool-shop-org/ai-jam-sessions"><img src="https://codecov.io/gh/mcp-tool-shop-org/ai-jam-sessions/graph/badge.svg" alt="Coverage"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/ai-jam-sessions"><img src="https://img.shields.io/npm/v/@mcptoolshop/ai-jam-sessions" alt="npm"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-jam-sessions"><img src="https://img.shields.io/badge/songs-109_across_12_genres-blue" alt="Songs"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-jam-sessions"><img src="https://img.shields.io/badge/annotated-109%2F109-green" alt="Ready"></a>
  <a href="datasets/jam-actions-v0-public/README.md"><img src="https://img.shields.io/badge/dataset-jam--actions--v0%20(57_records)-8b5cf6" alt="Training dataset"></a>
  <a href="https://doi.org/10.5281/zenodo.20279918"><img src="https://zenodo.org/badge/DOI/10.5281/zenodo.20279918.svg" alt="DOI"></a>
</p>

---

## Primero, escuche: tres himnos, cantados acompasados

**[Amazing Grace, America the Beautiful y el Himno de Batalla de la República](https://mcp-tool-shop-org.github.io/ai-jam-sessions/#listen)**,
cada estrofa, cantada por una voz sintética sobre un arreglo de piano escrito para cada himno. La página de inicio los reproduce con una partitura en 3D que sigue la voz y las palabras, que se iluminan a medida que se cantan.

Cada interpretación se ensambló a partir de dieciséis tomas de un cantante condicionado por la partitura:
- una toma por frase, elegida por un oyente local y un rastreador de tono;
- colocada en la partitura mediante la manipulación del tiempo, para que no se corte nada dentro de una frase;
- verificada por dos instrumentos de medición del tiempo y dos rastreadores de tono;
- aprobada a oído, con cada problema marcado en una revisión de escucha que lo rastrea hasta su causa.

Una prueba de sonido antes de cada canción mide la huella temporal de la voz y indica cuántas tomas necesitará la canción.

Cómo se hizo: [manual → Voces](https://mcp-tool-shop-org.github.io/ai-jam-sessions/handbook/vocals/).

| | Amazing Grace | America the Beautiful | Himno de Batalla |
|---|---|---|---|
| sílabas dentro de los 40 ms de la partitura | 107 de 112 | 217 de 224 | 283 de 414 |
| notas dentro de 50 céntimos | 135 de 140 | 218 de 224 | 360 de 424 |

Las rápidas notas punteadas del Himno de Batalla se dejan al ritmo del propio cantante, que es de donde provienen la mayoría de sus errores de sincronización.

La voz es sintética: [SoulX-Singer](https://github.com/Soul-AILab/SoulX-Singer) (Apache-2.0), con su propio timbre de ejemplo,
imitando a ningún cantante real. Los arreglos de piano fueron escritos para este proyecto por Kimi-K3 y están dedicados al
dominio público (CC0). Los tres himnos están en el dominio público.

## ¿Qué es esto?

Un piano y una guitarra que la IA aprende a tocar. No es un sintetizador, no es una biblioteca MIDI, sino un instrumento de enseñanza.

Un LLM puede leer y escribir texto, pero no puede experimentar la música de la manera en que lo hacemos nosotros. No tiene oídos, ni dedos, ni memoria muscular. AI Jam Sessions cierra esa brecha al darle al modelo sentidos que realmente puede usar:

- **Lectura:** partituras MIDI reales con anotaciones musicales profundas. No son aproximaciones escritas a mano, sino que están analizadas, explicadas y procesadas.
- **Audición:** seis motores de audio (piano oscilador, piano de muestra, muestras vocales, tracto vocal físico, sintetizador vocal aditivo, guitarra modelada físicamente) que se reproducen a través de sus altavoces, de modo que los humanos en la sala se convierten en los oídos de la IA. Y ahora el modelo tiene oídos propios, dos veces más: puede medir una grabación después del hecho (ver [Escucha](#listening)) y puede observar a la banda **mientras la música aún está sonando** (ver [El conjunto en vivo](#the-live-ensemble)).
- **Visión:** un piano roll que renderiza lo que se tocó como SVG, que el modelo puede leer y verificar. Un editor interactivo de tablaturas de guitarra. Un panel de control del navegador con un teclado visual, un editor de notas de doble modo y un laboratorio de afinación.
- **Memoria:** un diario de práctica que persiste entre sesiones, para que el aprendizaje se acumule con el tiempo.
- **Canto:** síntesis del tracto vocal con 20 preajustes de voz, desde soprano operística hasta coro electrónico. Modo de canto con solfeo, contorno y narración de sílabas. Y canciones completas cantadas al ritmo del piano: un cantante condicionado por la partitura, impulsado por la disposición de la canción, ensamblado frase por frase a partir de muchas tomas y controlado en el tiempo (40 ms) y el tono (50 céntimos) antes de que lo escuche, como se ve en [Canto](#sing).

Cada una de las 109 canciones ahora está completamente anotada: contexto histórico, análisis estructural barra por barra, momentos clave, objetivos de enseñanza y consejos de interpretación, en los 12 géneros. Una versión anterior de este archivo README decía que las canciones originales estaban "esperando a que la IA absorbiera los patrones, tocara la música y escribiera sus propias anotaciones". Eso es exactamente lo que sucedió: las anotaciones fueron escritas por la IA basándose en un análisis determinista por canción (acordes, estructura de repetición, límites de sección, claves verificadas por contenido), controladas por una rúbrica de calidad y verificadas de forma adversaria, afirmación por afirmación, para garantizar su exactitud: los números de compás, las ventanas de acordes y los recuentos estructurales se verificaron con el MIDI real antes de que se publicara algo.

A partir de este mismo trabajo, también publicamos **[jam-actions-v0](#training-dataset)**: un conjunto de datos público de 57 trazas de uso de herramientas MCP en múltiples turnos sobre piano clásico real. Enseña a los LLM a realizar *un uso de herramientas fundamentado sobre música simbólica*, no solo la generación de texto, y se entrega con una puerta de liberación de 7 ejes que distingue "transmitir evidencia" de "transmitir porque la tarea es trivial". Consulte [Conjunto de datos de entrenamiento](#training-dataset) a continuación para obtener la historia completa.

## Escuchando

Durante mucho tiempo, este servidor podía producir sonido, pero nunca analizarlo. El modelo tocaba, un humano
escuchaba y el modelo aceptaba su opinión. Esa brecha ahora se ha cerrado.

Si se le proporciona un archivo WAV, mide lo que hay en él. No mirando una imagen y adivinando, sino
procesando la señal a través del mismo tipo de herramientas que ya utiliza en la partitura:

- **`analyze_audio`** — inicios, el contorno de la afinación y el nivel. La afinación vuelve a aparecer como nombres de notas con desviaciones de centavos, nunca como frecuencias brutas. Nivel significa los números reales ahora: BS.1770-4, la sonoridad integrada en LUFS, el pico de la muestra en dBFS y un recuento de muestras recortadas, más una verificación de integridad que informa sobre cortes y ráfagas de ruido: la mitad de la verificación de calidad de renderizado que se ocupa de los clics y los fallos. Una sección de equilibrio indica dónde se encuentra la energía, desde los graves hasta los agudos: la proporción de cada banda en relación con el ruido rosa, el brillo y la inclinación.
- **`transcribe_audio`** — la grabación como notas: afinación, inicio, duración y la distancia de cada nota a la afinación de concierto.
- **`score_audio_take`** — calificar una interpretación en comparación con una canción de la biblioteca **de oído**. Transcribe la grabación, la compara con la partitura e informa qué notas se tocaron correctamente, cuáles se desviaron y cuáles se omitieron. Luego, `view_scored_piano_roll` dibuja el resultado sobre la partitura, exactamente como lo hace para una grabación MIDI. Así es como se califica un instrumento real, una interpretación cantada o cualquier cosa en la que no haya MIDI para capturar.
- **`view_spectrogram`** — ver el sonido. Un espectrograma de Q constante con un teclado de piano en el borde izquierdo, de modo que la afinación se pueda leer de un vistazo, y las notas previstas de la canción se dibujan sobre él cuando se solicita.
- **`check_loop_seam`** — evaluar un renderizado en bucle en el punto de unión: el paso de la forma de onda después de extrapolar la pendiente de la cola, la energía en forma de ráfaga en la unión y el cambio de nivel en la costura. Un bucle con una fase perfecta se reproduce limpiamente, incluso cuando la muestra del límite bruto salta.
- **`compare_balance`** — el timbre de un renderizado en comparación con una referencia que se sabe que es correcta, banda por banda en dB. Una pista que debería sonar como sus hermanas, un renderizado que debería coincidir con la grabación que reemplaza. La sonoridad se anula, por lo que solo se compara el timbre.

**Lo que no le dirá.** La imagen sirve para encontrar *dónde* hay un problema; cada número
proviene del procesamiento de la señal, nunca de un modelo que lee una imagen. El transcriptor sigue una
línea a la vez, por lo que un acorde o una mezcla completa producirán algo seguro pero incorrecto, y lo indica. La detección de inicio funciona con una precisión de alrededor de 0,88 en el estado actual de la técnica, por lo que una nota "perdida" puede ser una que el
transcriptor no pudo escuchar en lugar de una que no tocaste; las herramientas incluyen esta advertencia en su
propia salida en lugar de ocultarla aquí.

Toda la estructura es independiente: la transformación, el rastreador de tono, el detector de inicio, el
decodificador WAV y el codificador PNG están todos en este repositorio, y producen números idénticos en Node
y en el navegador.

## El Conjunto en Vivo

La función de "Listening" evalúa una grabación una vez que ha terminado. Esta es la otra mitad: preguntar qué está haciendo
cada instrumento **en este momento**, durante la interpretación.

```
ensemble_now()
```

Responde con las notas sostenidas de cada instrumento, cuánto tiempo se han sostenido y el acorde combinado
en todo el conjunto. Durante un dúo, las dos voces se informan por separado, para que pueda ver el
piano sosteniendo una tríada mientras el sintetizador lleva la melodía sobre ella.

### Dos canales, y el más barato es el más preciso

Esta es la parte que vale la pena entender, porque decide en qué número confiar.

**Intención: lo que se le indicó a cada motor que tocara.** Cuando el modelo es el que interpreta, esto no
es una estimación. Un acorde de piano no es algo que se deba transcribir; son tres notas que se enviaron. Las
notas son exactas, libres e inmediatas.

**Acústico: lo que realmente salió.** Cada motor puede dirigir su salida a un bus de análisis privado,
de modo que cada instrumento se mida en la fuente sin separación ni ambigüedad. Este canal es
**verificación, no descubrimiento**: es cómo aprende que una voz se desvió del reloj, que una toma
se cortó o que un motor se silenció mientras aún se le enviaban notas.

Cuando los dos no coinciden, eso es un hecho sobre la renderización, no una corrección de las notas.

### Qué cuesta

Observar un instrumento cuesta aproximadamente **9 microsegundos por llamada de retorno de audio**, en comparación con un bloque de 42,67 ms,
lo que representa aproximadamente el 0,02% del presupuesto de audio, medido con cero muestras descartadas. Un instrumento sin un observador adjunto no cuesta nada.

### Qué no le dirá

El canal acústico tiene un retraso y indica cuánto: aproximadamente 23 ms para el tono y 70 ms para un inicio confirmado, porque un inicio no se puede confirmar hasta que haya llegado el audio posterior. Los inicios cerca de ese
borde se retienen en lugar de informarse y luego retractarse.

El rastreador acústico sigue una línea a la vez, por lo que no identificará las notas de un acorde, y
no pretende hacerlo. Un acorde que no puede resolver es su limitación conocida, en lugar de un hallazgo, y
el conjunto se mantiene en silencio al respecto en lugar de dar falsas alarmas en cada acorde que toca el piano.

## El piano roll

El piano roll es la forma en que la IA ve la música. Renderiza cualquier canción como SVG: azul para la mano derecha, coral para la izquierda, con cuadrículas de compás, dinámica y límites de compás:

<p align="center">
  <img src="docs/fur-elise-m1-8.svg" alt="Piano roll of Fur Elise measures 1-8, showing right hand (blue) and left hand (coral) notes" width="100%" />
</p>

<p align="center"><em>Für Elise, measures 1–8 — the E5-D#5 trill in blue, bass accompaniment in coral</em></p>

Dos modos de color: **mano** (azul/coral) o **clase de afinación** (arco iris cromático: cada Do es rojo, cada Fa# es cian). El formato SVG significa que el modelo puede ver la imagen y leer el marcado para verificar la afinación, el ritmo y la independencia de las manos.

## La cabina de mando

Un estudio de composición basado en el navegador que se encuentra en este repositorio en [`apps/cockpit`](apps/cockpit) y se ejecuta en vivo en **[mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit](https://mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit/)**. No hay complementos, ni DAW, ni instalación; todo permanece en su navegador (su trabajo se guarda automáticamente localmente). ¿Prefiere modificarlo?

```bash
cd apps/cockpit && npm install && npm run dev   # Vite dev server, opens in your browser
```

- **Un piano de concierto muestreado por defecto** — la cabina de mando incluye un paquete Salamander Grand recortado (90 archivos OGG, 8 MB) que se carga en su primera interacción y se reproduce a través de la misma cadena de salida que las voces del sintetizador; antes de que se cargue (o sin conexión), el piano de oscilador afinado cubre sin problemas. Muestras de [Alexander Holm](https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html), CC-BY 3.0.
- **Modo de panel: la sala de escucha** — audiciones ciegas por pares de las voces del motor de composición sobre melodías reales de la biblioteca: clips con sonoridad igualada renderizados sin conexión a través de la ruta de voz real, pruebas aleatorias con semillas ocultas y pruebas de control de umbral, clasificaciones de Bradley-Terry con intervalos de confianza bootstrap y resultados honestos (PROVISIONALES hasta que cada par alcance su presupuesto de votos; NO INTERPRETABLES cuando el umbral de discriminación falla). Un segundo submodo ejecuta la misma clasificación con jueces LLM locales, además del historial de ambos tipos de ejecuciones y una vista de comparación (Kendall τ + coincidencia de clasificación del motor) que pregunta si la pista de sustitución barata rastrea la verdad humana.
- **Transporte preciso al compás** — las notas se encuentran en el tiempo musical, por lo que el control de BPM realmente reajusta la reproducción; una regla de tiempo con clic para buscar y arrastrar para establecer **regiones de bucle**; desplazamiento automático que sigue la cabeza de reproducción
- **Captura con grabación activada** — toque las teclas QWERTY, el teclado en pantalla o un dispositivo Web MIDI y se grabará en la partitura: conteo de 1 compás, sobregrabación de estilo de bucle en los ciclos de bucle (o modo de reemplazo), la sincronización de la interpretación original se conserva bajo una vista cuantificada, cada pasada es una unidad que se puede deshacer
- **Deshacer/rehacer completo** — cada edición, incluida Borrar e Importar, es reversible (Ctrl+Z), con gestos de arrastre que se combinan de la manera en que lo hacen los editores reales
- **Selección múltiple + portapapeles** — selección con recuadro bajo un interruptor de herramienta Seleccionar/Dibujar, clics con modificadores estándar de la plataforma, copiar/cortar/pegar en la cabeza de reproducción, Duplicar
- **Accesibilidad y compatibilidad con pantalla táctil** — eventos de puntero con captura en cada superficie, tocar para relocalizar como una alternativa que no requiere arrastrar, edición de notas con el teclado, superposiciones de partituras seguras para personas con daltonismo
- **Piano roll de doble modo** — cambie entre el modo de instrumento (colores de clase de afinación cromática) y el modo de voz (notas coloreadas por forma de vocal: /a/ /e/ /i/ /o/ /u/)
- **Teclado visual** — dos octavas desde Do4, asignadas a su teclado QWERTY. Haga clic o escriba.
- **20 preajustes de voz** — 15 voces mapeadas por Kokoro (Aoede, Heart, Jessica, Sky, Eric, Fenrir, Liam, Onyx, Alice, Emma, Isabella, George, Lewis, más un coro y una voz de sintetizador), 4 voces mapeadas por tracto y una sección de coro sintético
- **10 preajustes de instrumento** — las 6 voces de piano del lado del servidor más un sintetizador, un órgano, una campana y cuerdas
- **Inspector de notas** — haga clic en cualquier nota para editar la velocidad, la vocal y la suavidad
- **7 sistemas de afinación** — afinación temperada, afinación justa (mayor/menor), pitagórica, afinación de coma de cuarto, Werckmeister III o desplazamientos de centavos personalizados. Referencia A4 ajustable (392–494 Hz).
- **Auditoría de afinación** — tabla de frecuencias, probador de intervalos con análisis de frecuencia de batimiento y exportación/importación de afinación
- **Importación/exportación de partituras** — serialice toda la partitura como JSON y cárguela de nuevo
- **API orientada a LLM** — `window.__cockpit` expone `exportScore()`, `importScore()`, `addNote()`, `play()`, `stop()`, `panic()`, `setMode()` y `getScore()` para que un LLM pueda componer, organizar y reproducir de forma programática

## El ciclo de aprendizaje

<p align="center">
  <img src="docs/learning-loop.svg" alt="The learning loop: Read (MIDI + annotations) → Play (six sound engines) → See (piano roll · guitar tab) → Reflect (practice journal), with the journal persisting so the next session picks up where the last left off" width="100%" />
</p>

## La biblioteca de canciones

109 canciones anotadas de 12 géneros diferentes, creadas a partir de archivos MIDI reales. Cada género tiene un ejemplo con anotaciones detalladas, que incluye contexto histórico, análisis armónico por compás, momentos clave, objetivos de enseñanza y consejos para la interpretación (incluida la guía vocal). Estos ejemplos sirven como plantillas: la IA estudia uno y luego anota el resto. El ejemplo del género folk es **America the Beautiful** (Samuel A. Ward, 1882, dominio público): un himno en Fa mayor, arreglado en este repositorio, con una melodía de F4–C5.

**Qué archivos se incluyen y qué se obtiene.** Las anotaciones son nuestras y se incluyen con cada canción. Los archivos MIDI se descargaron de sitios MIDI públicos cuando se creó la biblioteca, y una auditoría de la procedencia de cada archivo ([`docs/findings/library-provenance-audit.md`](docs/findings/library-provenance-audit.md)) reveló que solo 14 de esas descargas tienen una licencia que permite la redistribución: los arreglos de Bernd Krueger para piano-midi.de (CC-BY-SA-3.0-DE) y las versiones de dominio público del proyecto Mutopia. Estos 14 archivos están en el paquete npm. Los otros 94 archivos no lo están: sus `.json` se incluyen, con un `provenance` que indica la fuente, sus términos y el hash SHA-256 del archivo, y `ai-jam-sessions library fetch --accept-source-terms` descarga cada uno de ellos del sitio que lo publicó, bajo los términos de ese sitio, rechazando cualquier archivo cuyo hash ya no coincida con lo que se verificó en las anotaciones. Doce archivos que resultaron ser piezas diferentes a las que indicaba su nombre se pusieron en cuarentena, por lo que la biblioteca descargada contiene 108 canciones y no las 120 que se afirmaba en las versiones anteriores. **America the Beautiful** es la canción número 109 y el MIDI número quince que se incluye en el paquete: el arreglo se realizó aquí y se dedicó al dominio público. Las versiones anteriores a la 2.6.0 incluían los 120 archivos MIDI; fue un error, y se corrige aquí en lugar de ocultarlo.

| Género | Ejemplo | Tonalidad | Qué enseña |
|-------|----------|-----|-----------------|
| Blues | The Thrill Is Gone (B.B. King) | La menor | Forma de blues menor, llamada y respuesta, tocar después del ritmo |
| Clásica | Für Elise (Beethoven) | La menor | Forma de rondó, diferenciación del tacto, disciplina del pedal |
| Cine | Comptine d'un autre été (Tiersen) | Mi menor | Texturas en arpegio, arquitectura dinámica sin cambio armónico |
| Folk | America the Beautiful (Ward) | Fa mayor | Armonía de himno tónico-dominante, fraseo patriótico, melodía en F4–C5 |
| Jazz | Autumn Leaves (Kosma) | Sol menor | Progresiones ii-V-I, tonos guía, corcheas con swing, acordes sin fundamental |
| Latino | The Girl from Ipanema (Jobim) | Fa mayor | Ritmo de bossa nova, modulación cromática, moderación vocal |
| New-Age | River Flows in You (Yiruma) | La mayor | Reconocimiento de I-V-vi-IV, arpegios fluidos, rubato |
| Pop | Imagine (Lennon) | Do mayor | Acompañamiento en arpegio, moderación, sinceridad vocal |
| Ragtime | The Entertainer (Joplin) | Do mayor | Bajo "oom-pah", síncopa, forma multiestrófica, disciplina del tempo |
| R&B | Superstition (Stevie Wonder) | Mi bemol menor | Funk en semicorcheas, teclado percusivo, notas fantasma |
| Rock | Your Song (Elton John) | Mi bemol mayor | Conducción de la voz en balada para piano, inversiones, canto conversacional |
| Soul | Lean on Me (Bill Withers) | Do mayor | Melodía diatónica, acompañamiento gospel, llamada y respuesta |

Las canciones progresan de **cruda** (solo MIDI) → **anotada** → **lista** (totalmente reproducible con lenguaje musical). La IA promueve las canciones estudiándolas y escribiendo anotaciones con `annotate_song`.

## Motores de sonido

Seis motores, más un combinador en capas que ejecuta dos de ellos simultáneamente:

| Motor | Tipo | Cómo suena |
|--------|------|---------------------|
| **Oscillator Piano** | Síntesis aditiva | Piano multiharmónico con ruido de martillo, inarmonicidad, brillo con forma de velocidad, polifonía de 48 voces, imagen estéreo. Cero dependencias. |
| **Sample Piano** | Reproducción de muestras | Salamander Grand Piano: el sonido real. **El motor predeterminado cuando se instala un paquete** (`samples/AccurateSalamander` o `AI_JAM_SAMPLES_DIR`); el archivo tar de npm no contiene muestras, por lo que usted proporciona la descarga de [Salamander](https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html). El panel de control del navegador incluye su propio paquete recortado de 8 MB (90 archivos OGG, CC-BY 3.0 Alexander Holm); no requiere configuración en la web. |
| **Vocal (Sample)** | Muestras con cambio de tono | Tonos vocales sostenidos con portamento y modo legato. |
| **Vocal Tract** | Modelo físico | Pink Trombone: forma de onda glotal de baja frecuencia a través de una guía de ondas digital de 44 celdas. Cuatro preajustes: soprano, alto, tenor, bajo. |
| **Vocal Synth** | Síntesis aditiva | 15 preajustes de voz Kokoro con modelado de formantes, aspereza, vibrato. Determinista (RNG con semilla). |
| **Guitar** | Síntesis aditiva | Cuerda pulsada modelada físicamente: 4 preajustes (dreadnought de acero, clásica de nailon, archtop de jazz, de doce cuerdas), 8 afinaciones, 17 parámetros ajustables. |
| **Layered** | Combinador | Envuelve dos motores y envía cada evento MIDI a ambos: piano+sintetizador, voz+sintetizador, etc. |

### Voces de teclado

Seis voces de piano ajustables, cada una con parámetros ajustables (brillo, decaimiento, dureza del martillo, desafinación, amplitud estéreo y más):

| Voz | Carácter |
|-------|-----------|
| Concert Grand | Rico, completo, clásico |
| Upright | Cálido, íntimo, folk |
| Electric Piano | Sonido suave, con toques de jazz, similar al Fender Rhodes |
| Honky-Tonk | Desafinada, estilo ragtime, de salón |
| Caja de música | Cristalina, etérea |
| Gran piano brillante | Con fuerza, contemporánea, pop |

### Voces de guitarra

Cuatro preajustes de voces de guitarra con síntesis de cuerdas modelada físicamente, cada uno con 17 parámetros ajustables (brillo, resonancia del cuerpo, posición de pulsación, amortiguación de la cuerda y más):

| Voz | Carácter |
|-------|-----------|
| Dreadnought de acero | Brillante, equilibrada, acústica clásica |
| Clásica de nailon | Cálida, suave, redonda |
| Jazz Archtop | Suave, con sonido de madera, limpia |
| De doce cuerdas | Resplandeciente, duplicada, con efecto de coro |

## El diario de práctica

Después de cada sesión, el servidor registra lo que sucedió: qué canción, qué velocidad, cuántas medidas, cuánto duró. La IA añade sus propias reflexiones: lo que notó, qué patrones reconoció, qué probar a continuación.

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

Un archivo Markdown por día, almacenado en `~/.ai-jam-sessions/journal/`. Legible para humanos, solo se pueden añadir entradas. En la siguiente sesión, la IA lee su diario y continúa donde lo dejó.

## Conjunto de datos de entrenamiento

**jam-actions-v0**: un conjunto de datos público de trazas de uso de herramientas MCP de múltiples turnos, basado en MIDI de piano clásico. Creado a partir de la misma biblioteca que utiliza este servidor para enseñar, el conjunto de datos enseña a los LLM a realizar **un uso de herramientas fundamentado en música simbólica**, no solo en la generación de texto.

Cada registro empareja una ventana de frase de 4 medidas con un objetivo de enseñanza anotado y una *traza objetivo*: una sesión paso a paso en la que un asistente utiliza las herramientas MCP anteriores (`get_events_in_measure`, `get_events_in_hand`, `count_distinct_pitch_classes` y el resto de la superficie del inspector MIDI de 9 herramientas) para leer, analizar y discutir la frase.

| | |
|---|---|
| Versión | **0.6.0 (25 de septiembre de 2026): versión de corrección** (ver más abajo) |
| Registros | 57 (subconjunto público): 45 para entrenamiento, 12 para pruebas (`clair-de-lune`) |
| Composiciones | 4 obras de piano clásico: Bach BWV 846, Mozart K. 545 I, Beethoven "Für Elise", Debussy "Clair de Lune" |
| MIDI de origen | piano-midi.de: arreglos de Bernd Krueger, cada archivo lleva el crédito de derechos de autor de Krueger |
| Licencia | CC-BY-SA-3.0-DE (arreglos) sobre composiciones de dominio público |
| Dónde | [`mcp-tool-shop/jam-actions-v0`](https://huggingface.co/datasets/mcp-tool-shop/jam-actions-v0) on Hugging Face and on Zenodo; DOIs and citation in the [dataset card](datasets/jam-actions-v0-public/README.md) and [`CITATION.cff`](datasets/jam-actions-v0-public/CITATION.cff) |

**La corrección de la versión 0.6.0.** Las versiones 0.4.x y 0.5.x contenían 115 registros de 8 obras, todos atribuidos a Bernd Krueger. Esta atribución se verificó con las páginas de compositores de piano-midi.de, no con los archivos. Cuando se auditó la biblioteca de canciones a partir de los bytes MIDI, se descubrió que cuatro de esas canciones (Nocturno de Chopin Op. 9 No. 2 y Preludio Op. 28 No. 4, "Patética" II de Beethoven y "Träumerei" de Schumann) se habían creado a partir de archivos obtenidos de midiworld.com y bitmidi.com, sin una licencia de arreglo establecida. Sus 58 registros contenían esos arreglos nota por nota, por lo que la versión 0.6.0 los retira. Los 57 registros restantes son idénticos a los de la versión 0.5.0. Por favor, no redistribuya los registros retirados de las versiones anteriores. El relato completo se encuentra en [`docs/findings/published-dataset-licence-audit.md`](docs/findings/published-dataset-licence-audit.md).

**La puerta de evidencia.** El empaquetador ahora vuelve a leer el bloque de procedencia de la biblioteca de cada canción (rederivado de los bytes MIDI) y rechaza cualquier registro cuya canción no tenga una licencia de arreglo redistribuible, o cuyo hash del archivo de origen difiera del archivo evidenciado. Falla de forma segura. Una prueba vuelve a ejecutar la misma comprobación en cada paquete publicado, por lo que un cambio posterior en la procedencia hace que la compilación se marque en rojo en los conjuntos publicados.

**Historia de la calidad: la puerta de liberación de 7 ejes.** La puerta de liberación del conjunto de datos distingue entre el cumplimiento basado en la evidencia y el cumplimiento que alcanza el máximo. Los ejes 1 a 6 son de bloqueo (umbral absoluto, compuesto de margen, tasa de uso de herramientas, corrección después del uso de herramientas, recuento de interpretaciones erróneas, umbral de estrato); el eje 7 es de enriquecimiento frente a la no información. Sus resultados registrados se midieron en la composición de 115 registros de las versiones 0.4.x y 0.5.x y siguen siendo reproducibles a partir de la etiqueta `jam-actions-v0-0.5.0-cut-2026-07-11`; no se han vuelto a medir en la versión 0.6.0.

**Reproducibilidad.** Un colaborador nuevo en cualquier plataforma (Windows nativo, macOS, Linux, WSL) puede verificar el paquete y volver a compilarlo:

```bash
git clone https://github.com/mcp-tool-shop-org/ai-jam-sessions.git
cd ai-jam-sessions && pnpm install
pnpm exec tsx scripts/verify-public-package-checksums.ts                        # every file accounted for
pnpm exec tsx scripts/package-jam-actions-public.ts --today 2026-09-25 --dry-run # evidence gate runs first
pnpm build && pnpm exec tsx scripts/verify-public-package-execution.ts
# → "VERDICT: PASS" — every frozen tool call replays live (needs an audio device)
```

`.gitattributes` fija los finales de línea LF para `*.sha256` y el árbol public-dataset para que el verificador de sumas de comprobación funcione en todas las plataformas.

**Historial de ajuste fino.** Las afirmaciones del conjunto de datos se probaron con ajustes finos preregistrados, puntuados en comparación con líneas de base selladas. **v0** (las 78 trazas de jam solas) devolvió un resultado negativo honesto ([informe](docs/finetune-arc-eval-report.md)); **v1** mejoró la calidad de las preguntas basadas en herramientas en +0,202, pero no cumplió con su barra preregistrada por una victoria emparejada ([informe](docs/finetune-arc-v1-eval-report.md)); **B-1** volvió a probar los adaptadores congelados v1 en una cohorte de 36 registros: 0,678 → 0,890, 29/36 victorias emparejadas frente a la barra ex ante de 24/34 ([informe](docs/finetune-arc-v2-b1-eval-report.md)). Esas mediciones se mantienen como se registraron. **Los adaptadores en sí se retiran**: sus datos de entrenamiento incluían registros de las cuatro canciones retiradas, por lo que no se pueden ofrecer bajo los términos de este conjunto de datos. Los adaptadores entrenados solo con material con licencia clara se publican con los conjuntos de datos `jam-actions-v1`.

Las adaptaciones MIDI son de Bernd Krueger (piano-midi.de), con licencia CC-BY-SA-3.0-DE. Las anotaciones, trazas y artefactos de evaluación son del equipo de AI Jam Sessions, publicadas bajo la misma licencia para preservar la cadena de intercambio de principio a fin. **Límite de la licencia:** la licencia MIT del repositorio cubre el código; todo lo que esté en `datasets/` tiene licencia CC-BY-SA-3.0-DE. El corpus de trabajo en `datasets/jam-actions-v0/` también contiene registros que no se han publicado: dos obras cuya procedencia nunca se verificó (Satie Gymnopédie No. 1, Debussy Arabesque No. 1) y las cuatro que se retiraron en la versión 0.6.0; consulte [`datasets/jam-actions-v0/PROVENANCE-NOTE.md`](datasets/jam-actions-v0/PROVENANCE-NOTE.md).

### El corpus acústico

**jam-actions-acoustic-v0**: la contraparte de las trazas anteriores, pero sobre **audio** en lugar de música simbólica. 72 registros, cada uno de los cuales empareja una representación sintética deliberadamente alterada de una frase de dominio público con el veredicto que realmente devuelven las herramientas de análisis, de modo que se comprueba cada etiqueta con el instrumento y no solo con sí mismo.

| | |
|---|---|
| Versión | 1.1.0 (25 de septiembre de 2026): se retiraron los 36 registros de "Träumerei" de la versión 1.0.x, cuyo archivo de origen no tiene una licencia de adaptación establecida. |
| Registros | 72: 2 frases (Bach, Für Elise) × 9 tipos de perturbación × 4 notas objetivo |
| Reservado | por **frase** (Für Elise), no por grabación, por lo que una copia perturbada de la misma melodía no puede filtrarse. |
| Clases | coincidencia, fallo/advertencia de tono, fallo/éxito de sincronización, nota perdida, nota extra, vibrato afinado, silencio sin nada que evaluar. |
| Audio | ninguno distribuido: cada grabación contiene una receta determinista y el SHA-256 de la forma de onda que produce. |
| Esquema | `jam-actions-acoustic-v0/1.0.0` |

Dos de las nueve clases están ahí porque un modelo ingenuo las responde con confianza y de forma incorrecta: una
nota de vibrato cuyo veredicto correcto es *afinada* y el silencio cuyo veredicto correcto es *nada que
evaluar*. Cada umbral del que depende el veredicto se copia en la grabación, porque ambos cambiaron una vez durante la compilación.

El corpus se puede reproducir a partir de este repositorio. Volver a generarlo produce los 79 archivos publicados y un `checksums.sha256` idéntico en bytes, y una prueba confirma exactamente eso sin escribir el árbol publicado.

**Una advertencia, medida en lugar de asumida.** Cada registro contiene `wav_sha256`, el hash de la forma de onda que produce su receta, y el renderizador llama a `Math.pow` y `Math.sin` una vez por muestra. Ninguno de los dos debe redondearse correctamente, y los resultados de V8 cambiaron entre Node 22 y Node 24: de los 27 869 argumentos distintos `Math.pow(2, x)` que evaluó el corpus original, 253 devuelven un valor double diferente. Casi todo eso desaparece con la cuantificación de 16 bits, pero **2 de los 72 registros** (ambos la perturbación `extra` de Für Elise, cuyo motivo se encuentra en la única nota donde la relación de semitono en sí es diferente) tienen un hash diferente en Node 24. Todos los demás campos de cada registro se reproducen en cualquier motor, y el repositorio prueba ambas afirmaciones por separado. Si vuelve a renderizar y ve esos dos errores, es esto, no una descarga corrupta. Hacer que la forma de onda sea portable a nivel de bits implica reemplazar las funciones trascendentes, lo que cambia cada hash y, por lo tanto, requiere una nueva versión del esquema.

### Cree el suyo propio

La estructura sobre la que se ejecuta el corpus está disponible para sus propios experimentos.
[`experiments/_template/`](experiments/_template/) es un ejemplo funcional que puede copiar: declare una
tarea y obtendrá el formato SFT, la puntuación por clase, líneas de base triviales sobre su conjunto de veredictos declarado y una verificación de que ninguna unidad de reserva se superponga con la división.

El [contrato](experiments/_template/README.md) es la parte que vale la pena leer. La verdad fundamental se puede construir en lugar de escribirse a mano, las etiquetas se verifican con lo que miden las herramientas, se divide por la unidad que presenta fallos y se informan los valores de referencia y el modelo base junto con cualquier resultado. Cada una de estas reglas implica un costo de aprendizaje.

## Instalación

```bash
npm install -g @mcptoolshop/ai-jam-sessions
```

Requiere **Node.js 22+** (la versión v2.0.0 elevó el requisito mínimo con `node-web-audio-api` 2.0). No se necesitan controladores MIDI, puertos virtuales ni software externo.

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

Cada versión también publica `ghcr.io/mcp-tool-shop-org/ai-jam-sessions`, una imagen ligera que ejecuta el servidor MCP en stdio. Lo único que hay que saber es que `/data` es la memoria: el diario, el estado del servidor, las canciones del usuario y cualquier MIDI que se obtenga, se almacenan allí, por lo que debe montar un volumen o dejarán de funcionar con el contenedor.

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

La imagen incluye los 14 archivos MIDI redistribuibles; ejecutar `library fetch --accept-source-terms` una vez dentro del contenedor coloca los otros 94 en el volumen. `docker compose up` hace lo mismo con un volumen con nombre, y `--profile ollama` agrega un contenedor secundario de Ollama. Detalles, la CLI dentro de la imagen y lo que se excluye deliberadamente: [docs/docker.md](docs/docker.md). Ejecutar los evaluadores ajustados en Ollama, con el costo medido de una base de 4 bits: [docs/ollama-adapters.md](docs/ollama-adapters.md).

## Herramientas MCP

56 herramientas y 4 plantillas de indicaciones en ocho categorías:

### Aprender

| Herramienta | Qué hace |
|------|--------------|
| `list_songs` | Navegar por género, dificultad o palabra clave |
| `song_info` | Análisis musical completo: estructura, momentos clave, objetivos de enseñanza, consejos de estilo |
| `registry_stats` | Estadísticas de toda la biblioteca: número total de canciones, géneros, dificultades |
| `list_measures` | Notas, dinámica y notas de enseñanza de cada compás |
| `teaching_note` | Análisis en profundidad de un solo compás: digitación, dinámica, contexto |
| `suggest_song` | Recomendación basada en el género, la dificultad y lo que ha tocado |
| `practice_setup` | Velocidad, modo, configuración de voz y comando CLI recomendados para una canción |
| `compare_songs` | Reconocimiento de patrones entre géneros: relaciones clave, similitud de tono/intervalo, formas compartidas, conexiones de enseñanza |
| `annotation_progress` | Seguimiento de la calidad de la anotación en toda la biblioteca: puntuaciones, calificaciones y sugerencias de mejora |
| `server_info` | Versión del servidor, estadísticas de la biblioteca, lista de motores, sesión activa |

### Reproducir

| Herramienta | Qué hace |
|------|--------------|
| `play_song` | Reproducir a través de los altavoces: canciones de la biblioteca o archivos .mid sin procesar. Cuatro motores (piano, vocal, tracto, guitarra), cualquier velocidad, modo, rango de compases, además de un metrónomo con conteo y una marca `record` que captura la sesión para la puntuación. Los motores de síntesis y capas solo están disponibles en la CLI. |
| `stop_playback` | Detener |
| `pause_playback` | Pausar o reanudar |
| `set_speed` | Cambiar la velocidad durante la reproducción (0,1×–4,0×) |
| `playback_status` | Instantánea en tiempo real: compás actual, tempo, velocidad, voz del teclado, estado |
| `view_piano_roll` | Renderizar como SVG (color de la mano o arco iris cromático de clase de tono) |
| `score_performance` | Puntuar una interpretación MIDI: precisión del tono, sincronización, integridad, con comentarios graduados |
| `mute_hand` | Silenciar o reactivar la mano izquierda/derecha durante la práctica: aislar una mano a la vez |
| `detect_chord` | Nombrar el acorde a partir de un conjunto de notas MIDI que suenan actualmente (por ejemplo, `[60,64,67]` → C) |
| `preview_teaching_cues` | Ver todas las notas de enseñanza y los momentos clave antes de tocar |

### Practicar

| Herramienta | Qué hace |
|------|--------------|
| `practice_loop` | El ejercicio que asignaría un profesor real: repetir los compases 5 a 8 más lentamente, y el tempo aumenta (+5%) solo después de una interpretación *limpia*; cada interpretación se registra, se puntúa y se resume |
| `practice_status` | Estado del ejercicio: interpretación actual, velocidad y un diagnóstico por compás de la última interpretación |
| `score_last_take` | Puntuar la interpretación registrada más reciente: precisión del tono, sincronización, integridad, veredictos por nota |
| `view_scored_piano_roll` | La partitura anotada que utiliza cada profesor: la partitura de piano superpuesta con evaluaciones por nota en una paleta segura para personas con daltonismo (sólido = correcto, discontinuo = ritmo, ✕ = nota fallada) |

### Cantar

| Herramienta | Qué hace |
|------|--------------|
| `sing_along` | Texto cantable: nombres de notas, solfeo, contorno o sílabas. Con o sin acompañamiento de piano. |
| `ai_jam_sessions` | Generar un resumen de improvisación: progresión de acordes, esquema de melodía e indicaciones de estilo para la reinterpretación. |
| `verify_harmony` | La puerta de verificación del ciclo de creación: una rearmonización propuesta es verificada por las herramientas deterministas de la plataforma: fidelidad de los acordes (el motor de acordes debe detectar cada acorde previsto), consonancia de la melodía (tono/tensión/cromaticismo), conducción de la voz del bajo, pertenencia a la tonalidad. |
| `auto_reharmonize` | El ciclo de creación en una sola llamada: un modelo local propone una rearmonización, la puerta determinista de `verify_harmony` verifica cada voz, la mejor de n hasta que se obtiene una interpretación verificada. |
| `compose_panel` | Ejecutar el panel de composición de conducción de voces en cualquier canción: cuatro sistemas crean acompañamientos, un LLM ciego de diferentes familias los evalúa y los clasifica, y se realiza una agregación de Bradley-Terry, con una puerta de discriminación que invalida las ejecuciones no interpretables (solo señal direccional, nunca una puntuación de calidad). Se ejecuta durante minutos y muestra notificaciones de progreso mientras trabaja. |

**Una canción completa en tiempo real: la ruta vocal.** Cualquier canción puede tener una voz cantada real que se proyecta en el piano.
- **El reloj.** Un reloj de partitura (`scripts/build-score-clock.mjs`) deriva el tono, el inicio y la duración de cada sílaba a partir de la disposición de la canción, en la propia línea de tiempo del intérprete.
- **La prueba de sonido.** Antes de que se renderice una canción, la misma voz canta una frase de calibración de dieciséis palabras al tempo de la canción (`scripts/soundcheck.py`). Su huella temporal, por grupo de consonantes y para las notas largas frente a las cortas, indica cuántas tomas necesita la canción y qué palabras son arriesgadas, antes de que se invierta tiempo de GPU en la canción en sí.
- **El cantante.** Un cantante condicionado por la partitura ([SoulX-Singer](https://github.com/Soul-AILab/SoulX-Singer), Apache-2.0) renderiza dieciséis tomas a partir de ese reloj, localmente o en una GPU alquilada a través de offrig.
- **La selección.** `scripts/sing_clock.py --by-phrase --warp` elige una toma por frase. Un transcripto de un oyente local y el tono FCPE deciden, y la frase se ajusta temporalmente a la partitura.
- **Las puertas.** **Ritmo:** un detector de energía, verificado por un alineador de canto forzado, coloca cada vocal dentro de 40 ms. **Tono:** FCPE, con pYIN volviendo a leer lo que marca, coloca cada nota dentro de 50 centavos.
- **El oído.** La revisión auditiva (`scripts/review_marks.py`) permite a una persona presionar **M** donde algo suene mal, con una categoría y una nota. El informe rastrea cada marca hasta su toma, su unión y las puertas, y la pondera según el nivel del revisor: el oído de un oyente determina *dónde* suena mal, mientras que nombrar *qué* es, tiene más peso en el entrenamiento. Hoy es una página de escucha local; se está moviendo al panel de control. Ruta, palancas y recibos: [manual → Vocales](https://mcp-tool-shop-org.github.io/ai-jam-sessions/handbook/vocals/), [`docs/vocal-clock.md`](docs/vocal-clock.md); la investigación detrás de las elecciones: [`docs/vocal-singing-study-2026-09.md`](docs/vocal-singing-study-2026-09.md).

### Guitarra

| Herramienta | Qué hace |
|------|--------------|
| `view_guitar_tab` | Renderizar tablatura de guitarra interactiva como HTML: hacer clic para editar, cursor de reproducción, atajos de teclado. |
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
| `annotate_song` | Escribir lenguaje musical para una canción sin procesar y promoverla a lista para usar |
| `save_practice_note` | Entrada de diario con datos de sesión capturados automáticamente |
| `read_practice_journal` | Cargar entradas recientes para obtener contexto |
| `list_keyboards` | Voces de teclado disponibles |
| `tune_keyboard` | Ajustar cualquier parámetro de cualquier voz de teclado. Persiste entre sesiones. |
| `get_keyboard_config` | Configuración actual frente a la configuración predeterminada de fábrica |
| `reset_keyboard` | Restablecer a la configuración de fábrica una voz de teclado |
| `score_annotation` | Calidad de la anotación de la partitura en 5 dimensiones: integridad, profundidad, especificidad, valor didáctico, vocabulario |
| `validate_song_entry` | Validar un archivo JSON de canción contra el esquema antes de agregarlo |
| `transpose_song` | Transponer una canción hacia arriba o hacia abajo por semitonos: nueva tonalidad, nuevas notas |
| `list_sections` | Ver las secciones estructurales de una canción (Intro, Verso, Coro, etc.) |
| `add_section` | Agregar un marcador de sección a una canción para la navegación estructural |

### Puntuación

| Herramienta | Qué hace |
|------|--------------|
| `score_performance` | Evaluar una interpretación MIDI en comparación con una canción de la biblioteca: afinación, ritmo, integridad, con comentarios graduados. |
| `score_annotation` | Evaluar la calidad de la anotación en cinco dimensiones. |

### Escuchar

Medir el audio grabado. Monofónico: siguen una línea a la vez, por lo que un acorde o una mezcla completa producen un sinsentido evidente. Cada número proviene del procesamiento de señales, nunca de un modelo que lee una imagen.

| Herramienta | Qué hace |
|------|--------------|
| `analyze_audio` | Medir un archivo WAV: tiempos de inicio, el contorno del tono como nombres de notas con centavos, nivel (BS.1770-4 LUFS, pico dBFS, muestras recortadas), equilibrio espectral por banda y una verificación de integridad (interrupciones, ráfagas de ruido, clics) |
| `transcribe_audio` | Convertir una grabación monofónica en notas, indicando la desviación de cada nota con respecto a la afinación estándar. Se omiten las notas que el rastreador no pudo seguir en lugar de adivinarlas. |
| `score_audio_take` | Evaluar una interpretación en comparación con una canción de la biblioteca **de oído** y luego entregar el resultado a `view_scored_piano_roll`. |
| `view_spectrogram` | Ver el sonido: un espectrograma de Q constante en un eje de teclado de piano, opcionalmente superpuesto con las notas previstas. Oculto por defecto. |
| `check_loop_seam` | Determinar dónde el final de un bucle se conecta con su inicio: paso de forma de onda extrapolado, energía de ráfaga en la unión, cambio de nivel en ella |
| `compare_balance` | Comparar el equilibrio tonal de un renderizado con una referencia, banda por banda en dB, con el cambio en el brillo y la inclinación. La sonoridad se anula. |
| `ensemble_now` | Qué está tocando **cada instrumento en este momento**, a mitad de la interpretación. Las notas provienen de lo que se envió, por lo que son exactas en lugar de estimadas. |

### Indicaciones de MCP

Cuatro plantillas de indicaciones para flujos de trabajo de enseñanza estructurados:

| Indicación | Qué hace |
|--------|--------------|
| `annotate_song` | Flujo de trabajo de anotación guiada: estudiar un ejemplo, escribir lenguaje musical para una canción sin procesar |
| `practice_plan` | Crear un plan de práctica estructurado basado en el género, la dificultad y los objetivos |
| `performance_review` | Revisar una sesión completada: qué salió bien, en qué enfocarse a continuación |
| `maker_loop` | Recorrer todo el ciclo de creación: proponer una rearmonización, verificarla con las herramientas deterministas de la plataforma y luego agregar y reproducir el resultado verificado |

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

**v2.8.0: dos himnos, interpretados.** Amazing Grace y America the Beautiful se interpretan completos, cada verso, en el reloj del piano: dieciséis tomas, una toma por frase, ajuste de la posición, sincronización de dos instrumentos y umbrales de tono, y una persona escuchando al final. Ambos fueron validados auditivamente, y la [página de inicio](https://mcp-tool-shop-org.github.io/ai-jam-sessions/) los presenta. La versión de America the Beautiful de la biblioteca es ahora la melodía Materna de Ward. Consulte [CHANGELOG](CHANGELOG.md).

**v2.7.0 — America the Beautiful.** La biblioteca contiene 109 canciones anotadas. Se incluyen quince archivos MIDI; 94 se obtienen aún de sus fuentes originales. La nueva es una adaptación de dominio público creada en este repositorio (melodía de Samuel A. Ward, 1882), en Fa mayor, y es el ejemplo folclórico. Una ruta de SoulX-Singer la interpreta: los umbrales de sincronización y tono se aplican, y la página de inicio mantiene las tres advertencias de tono. Consulte [CHANGELOG](CHANGELOG.md).

**v2.6.0 — la versión que deja de incluir contenido para el cual no tenía licencia** (consulte [CHANGELOG](CHANGELOG.md)).

Una auditoría de procedencia por archivo de la biblioteca de canciones reveló que, de las 108 adaptaciones MIDI, 14 tienen una licencia que permite la redistribución y 94 no; y que doce archivos eran piezas diferentes a las que indicaba su nombre. Ahora, cada canción incluye un bloque `provenance` respaldado por pruebas (URL de origen, los términos del sitio, el arreglista como el nombre del evento de derechos de autor del archivo, SHA-256, veredicto del título); las doce se han puesto en cuarentena; el paquete npm incluye las 14 y marca el resto como *no descargado*, y `ai-jam-sessions library fetch --accept-source-terms` descarga cada una del sitio que la publicó, según los términos de ese sitio, rechazando cualquier archivo cuyo hash ya no coincida. Las versiones anteriores incluían los 120 archivos y están obsoletas en npm. La misma auditoría restableció el conjunto de datos jam-actions-v1 a las once canciones cuyas adaptaciones están verificadas (tres Krueger CC-BY-SA-3.0-DE, ocho Mutopia Public Domain); el corpus, su sonda de umbral y el arco de entrenamiento que encontró el objetivo de la obra mostrada (un LoRA de 3B con rango 16 y una receta sin cambios que va desde una clase anterior a 54/54 y 72/72 cerca del umbral, una vez que el asistente escribió los dígitos de la comparación) se encuentran en el repositorio en `datasets/` y `experiments/coverage-v1-sft/`, y su publicación en Hugging Face y Zenodo seguirá a partir del corpus verificado. También en esta versión: `scorePerformance` limita la ventana correcta en el umbral del llamador, de modo que la regla de la casa de 40 ms sea exactamente la ventana de veredicto.

Anteriormente, en la v2.5.0 — la versión en la que el modelo puede observar a la banda tocar.
`ensemble_now` informa sobre lo que está haciendo cada instrumento mientras la música sigue sonando: notas sostenidas por instrumento, cuánto tiempo se han sostenido y el acorde combinado. Se ejecuta en dos canales, y el más económico es el más preciso; cuando este servidor lo ejecuta, sabe exactamente lo que envió, por lo que un acorde es tres notas en lugar de un problema de transcripción, mientras que una toma acústica separada mide cada motor **en la fuente** para su verificación. El costo medido es de aproximadamente **9 microsegundos por llamada de retorno de audio**; la latencia se indica en lugar de implicarse (~23 ms de tono, ~70 ms de inicio confirmado); y los límites se documentan porque son aplicables: el rastreador es monofónico, los elementos secundarios se miden individualmente y nunca como una mezcla, y un instrumento sin medición no es un instrumento silencioso.

La misma versión convierte la maquinaria del conjunto de datos en un contrato contra el que cualquiera puede declarar, con una plantilla elaborada, para que los usuarios puedan crear sus propios corpus y entrenar sus propios adaptadores utilizando la misma disciplina. En el proceso, se descubrió que el umbral de reproducibilidad del corpus acústico cubre 109 de sus 115 rutas publicadas, y tres de las seis que faltaban nunca fueron emitidas por el generador; regenerarlas las eliminó. Una regeneración completa ahora reproduce cada archivo y el manifiesto de suma de comprobación byte por byte. La superficie activa es de **54 herramientas y 4 plantillas de indicaciones**, con **3.389 pruebas superadas en 165 archivos (1 omitida)**.

Anteriormente en la versión 2.4.0: la versión en la que el modelo "escuchó". Cuatro herramientas redujeron la brecha entre la reproducción de audio y su análisis: `analyze_audio` para los inicios, el contorno de la afinación y el nivel; `transcribe_audio` para una grabación monofónica como notas; `score_audio_take` para evaluar una interpretación de oído y entregar el resultado al piano roll existente sin modificarlo; y `view_spectrogram` para ver el sonido en un eje de Q constante y teclado de piano. Todo esto es procesamiento de señales sin dependencias, escrito en este repositorio: su propia FFT, ventanas, transformadas mel y de Q constante, detección de inicios y seguimiento de la afinación, porque un modelo no puede evaluar de manera confiable una imagen y las consultas deterministas superan la inferencia para preguntas con respuestas exactas. Esa versión también publicó **jam-actions-acoustic-v0**, 108 registros de oro construibles del uso de herramientas sobre audio.

Anteriormente, en la v2.3.0 — la versión en la que el instrumento aprendió a cantar en el reloj (consulte [CHANGELOG](CHANGELOG.md)). Ahora, cualquier canción de la biblioteca puede incluir una línea cantada real que se sincronice con el piano: un **reloj de partitura** deriva el tono, el inicio y la duración de cada sílaba del MIDI de la canción en la línea de tiempo del reproductor; un cantante local, con licencia Apache-2.0 y condicionado por la partitura ([SoulX-Singer](https://github.com/Soul-AILab/SoulX-Singer)), lo interpreta; y dos umbrales miden el artefacto antes de que se considere una mezcla: sincronización (cada vocal dentro de 40 ms de la partitura) y tono (cada nota dentro de 50 centavos). La ejecución de Amazing Grace incluida mide un máximo de 6 ms de sincronización y -2,7 centavos de tono global, con registros adjuntos; la página de inicio lo presenta como un estado honesto, con el único defecto restante identificado (el empalme de apertura). La ruta, sus palancas y la investigación detrás de cada elección (cinco líneas de estudio, citadas) se encuentran en el [manual](https://mcp-tool-shop-org.github.io/ai-jam-sessions/handbook/vocals/) y [`docs/`](docs/). La superficie activa no ha cambiado, con **49 herramientas y 4 plantillas de indicaciones**, y **3.080 pruebas superadas (1 omitida)**, además del propio conjunto de pruebas pytest del instrumento vocal. **Estado de publicación:** publicado — [`@mcptoolshop/ai-jam-sessions@2.3.0`](https://www.npmjs.com/package/@mcptoolshop/ai-jam-sessions) en npm, con verificación de procedencia.

Anteriormente, en la versión 2.2.0, la versión en la que el instrumento obtuvo "oídos" reales y una sala de escucha. El piano predeterminado de la cabina de mando es ahora un **"Concert Grand" con sonido grabado** (sampled), un paquete Salamander optimizado que se carga en el primer gesto y vuelve al sintetizador oscilador afinado hasta que esté listo, y el servidor selecciona automáticamente el motor de sonido cada vez que se instala un paquete completo. Encima se encuentra el **"Panel de composición"**: una sala de escucha A/B ciega, con niveles de volumen iguales, donde un humano clasifica las opciones del motor de composición en función de criterios teóricos válidos e inválidos (Bradley-Terry con intervalos de confianza bootstrap, un umbral de discriminación de estilo MUSHRA, PROVISIONAL e INTERPRETABLE como resultados de primer nivel), junto con un panel de modelos locales que ejecuta la misma clasificación con jueces LLM de diferentes familias y una vista de comparación (Kendall τ) que pregunta si el "proxy" económico refleja la verdad humana.

La misma versión incluye el motor de composición que alimenta el panel (`src/compose/`: una puerta de paso de melodía determinista con ajustes de estilo predefinidos, especificaciones de melodía basadas en la construcción, un refinador que procesa una parte a la vez), una revisión completa de la salud (45 problemas solucionados: seguridad, frases más humanas, una mejora visual que conserva el aspecto), entradas de la biblioteca de Satie y Debussy obtenidas de archivos Mutopia de dominio público con comprobante de origen, y una revisión de seguridad: errores de validación descriptivos, envolventes de errores estructuradas `{code, message, hint}`, un archivo tar curado, notificaciones de progreso en herramientas que tardan mucho, y gramática de errores para la CLI. Esta versión se lanzó como [`@mcptoolshop/ai-jam-sessions@2.2.0`](https://www.npmjs.com/package/@mcptoolshop/ai-jam-sessions) con 49 herramientas, 4 plantillas de indicaciones y 3033 pruebas.

Anteriormente, en la versión 2.1.0, la versión en la que el analista se convirtió en un **"creador"**. El ciclo de creación se ofrece como producto: un modelo propone una rearmonización de cualquier canción de la biblioteca, y las herramientas deterministas de la plataforma la validan: el motor de acordes debe confirmar cada opción de melodía prevista (`verify_harmony`), cada nota de la melodía se etiqueta en relación con la nueva armonía, y solo una interpretación verificada se utiliza en `add_song` → `play_song` → `view_piano_roll`. La generación se verifica mediante la construcción: no hay rúbrica, no hay autoevaluación; el mismo `inferChord` que escribe los resúmenes de las sesiones de improvisación es el juez. La plantilla de indicaciones `maker_loop` guía todo el ciclo.

Anteriormente, en la versión 2.0.0, la versión en la que el conjunto de datos demostró su utilidad. **Importante: la versión mínima de Node.js ahora es 22** (`node-web-audio-api` 2.0); la superficie de la herramienta en sí no ha cambiado: seis motores de sonido, 47 herramientas MCP, 3 plantillas de indicaciones y una **biblioteca totalmente anotada: 120/120 canciones de 12 géneros** (12 campos clave corregidos para que coincidan con las tonalidades detectadas en el contenido en esta versión). El ciclo de enseñanza está cerrado de principio a fin: metrónomo con conteo inicial → grabación en vivo → puntuación por nota → el piano con la partitura marcada → ciclos de práctica que aumentan el tempo solo después de que se completen las pruebas. La cabina de mando del navegador es una herramienta de composición real: transporte preciso al ritmo con regiones de bucle, captura con el botón de grabación activado, deshacer/rehacer completo, selección múltiple y portapapeles, soporte táctil: [disponible en la web](https://mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit/).

También se publica **[jam-actions-v0](#training-dataset)**: un conjunto de datos de entrenamiento de 57 registros de trazas de uso de herramientas MCP en varias etapas sobre piano clásico, con una puerta de paso de 7 ejes, reproducibilidad en condiciones iniciales frías y metadatos completos de Zenodo + CITATION.cff (CC-BY-SA-3.0-DE), que se pueden encontrar en [Hugging Face](https://huggingface.co/datasets/mcp-tool-shop/jam-actions-v0), y ahora incluye **resultados de ajuste fino con comprobante de origen en ambas direcciones**: un resultado negativo honesto (v0) y un resultado positivo disciplinado por preregistro que se detuvo a una victoria de su propio objetivo (v1); consulte los [comprobantes de ajuste fino](#training-dataset). Esta versión también corrige los registros de Bach en la fuente (revisiones del conjunto de trabajo r001/r002 con erratas) después de que la puerta de paso de la canalización v1 detectara que la ventana publicada excedía las 62 medidas reales de BWV 846. 2506 pruebas superadas en el servidor MCP + cabina de mando + paquetes de conjuntos de datos + arneses de evaluación + validador de la puerta de paso. El MIDI está todo ahí, cada canción puede enseñar y el corpus de ese aprendizaje se incluye con ella.

## Seguridad y privacidad

**Datos accedidos:** biblioteca de canciones (JSON + MIDI), directorio de canciones del usuario (`~/.ai-jam-sessions/songs/`), configuraciones de afinación de guitarra, entradas del diario de práctica, dispositivo de salida de audio local.

**Datos NO accedidos (rutas predeterminadas):** el servidor MCP y la CLI no realizan llamadas de red, no leen credenciales y no acceden a archivos del sistema fuera del directorio de canciones del usuario. No se recopila ni se envía ninguna telemetría. La **herramienta de conjunto de datos/evaluación opcional** que se incluye en el mismo paquete (`scripts/run-llm-eval.ts`, verificador de procedencia) es la única excepción: cuando la invoca explícitamente, puede llamar a las API de LLM (lee `ANTHROPIC_API_KEY` de su entorno, nunca lo almacena) y obtener URL de procedencia. Nunca se ejecuta como parte del servidor, la CLI o la instalación.

**Permisos:** el servidor MCP utiliza solo el transporte stdio (sin HTTP). La CLI accede al sistema de archivos local y a los dispositivos de audio. Consulte [SECURITY.md](SECURITY.md) para obtener la política completa.

## Licencia

MIT
