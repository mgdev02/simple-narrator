# Simple Narrator

Aplicación de escritorio para **narrar PDFs en voz local**: abres un documento, eliges el idioma del audio y la app sintetiza el texto con [Piper](https://github.com/rhasspy/piper), sincroniza la palabra activa en el visor y opcionalmente muestra subtítulos en el idioma opuesto (traducción offline).

Todo el procesamiento de voz y traducción ocurre en tu máquina; no se envían datos a servicios en la nube.

## Características

- **Visor PDF continuo** con [PDF.js](https://mozilla.github.io/pdf.js/): scroll por todas las páginas, miniaturas laterales y barra de progreso al abrir archivos grandes.
- **Narración local** con Piper: varias voces ES/EN en el catálogo y **descarga desde la app** (Hugging Face) sin salir del programa.
- **Selector de voz** por idioma (español e inglés por separado), con preescucha antes de usar.
- **Detección de idioma** del PDF (`whatlang`) y selector de idioma del audio (español / inglés).
- **Traducción offline** en↔es con [Argos Translate](https://github.com/argosopentech/argos-translate) para subtítulos en el idioma opuesto al audio.
- **Sincronización palabra a palabra** en el PDF (resaltado + indicador) y en la banda de subtítulos, vía alineación fonema y módulo Rust/WASM `narration-sync`.
- **Preparación en segundo plano**: mientras escuchas una página, la siguiente se sintetiza y alinea por adelantado.
- **Interfaz nativa** con Tauri v2 (ventana con barra overlay en macOS, arrastre de ventana, tamaño mínimo 1200×800).

## Requisitos

| Herramienta | Versión recomendada |
|-------------|---------------------|
| Node.js | 20+ |
| Rust | stable (via [rustup](https://rustup.rs/)) |
| [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/) | latest |
| Python | 3.9+ (solo para el script de configuración) |
| curl | para descargar Piper y modelos |

**Plataformas:** macOS (Apple Silicon / Intel) y Linux x86_64 / aarch64. En Windows el script de setup no está automatizado; hay que instalar Piper manualmente (ver [releases de Piper](https://github.com/rhasspy/piper/releases)).

En Apple Silicon, el binario oficial de Piper puede ser x86_64; si falla la síntesis, instala Rosetta:

```bash
softwareupdate --install-rosetta --agree-to-license
```

## Instalación

```bash
git clone https://github.com/mgdev02/simple-narrator.git
cd simple-narrator

npm install

# Instala Piper, modelos ES/EN, phonemize, Argos Translate y parchea modelos ONNX
./scripts/setup-local-ai.sh

# Desarrollo (frontend + app Tauri)
npm run tauri dev
```

El script `setup-local-ai.sh` descarga ~200 MB (binarios Piper, librerías, dos modelos por defecto y paquetes de traducción). Instala además el venv `piper-tts`, necesario para **parchear** modelos ONNX (sincronización palabra a palabra). Voces adicionales del catálogo se pueden descargar después desde la app.

Los archivos grandes **no** se versionan en git; cada desarrollador debe ejecutar el script al menos una vez.

### Build de producción

```bash
npm run tauri build
```

El instalador (.dmg en macOS, etc.) se genera en `src-tauri/target/release/bundle/`.

### Releases en GitHub

Al pushear un tag semver (`v0.1.0`, `v1.2.3`, …), el workflow [`.github/workflows/release.yml`](.github/workflows/release.yml) compila la app con [tauri-action](https://github.com/tauri-apps/tauri-action) para macOS (Apple Silicon), Linux y Windows, e crea un **release draft** en GitHub con los instaladores.

```bash
git tag v0.1.0
git push origin v0.1.0
```

El pipeline instala Piper, modelos por defecto y dependencias Python (igual que `setup-local-ai.sh`) antes del build, así quien descarga el release no necesita Rust ni wasm-pack.

Requisitos en el repositorio: **Settings → Actions → General → Workflow permissions → Read and write permissions**.

## Uso

1. **Abrir un PDF**: arrastra el archivo al visor o usa **Abrir PDF** en la pantalla inicial.
2. Elige **Idioma del audio** (español o inglés). Si el idioma del PDF difiere, el texto se traduce antes de sintetizar.
3. Pulsa **Play** cuando el indicador de preparación indique que el primer fragmento está listo.
4. La narración avanza por página; al terminar una página puede continuar en la siguiente automáticamente.
5. Opcional: activa **Subtítulos · [idioma opuesto]** para leer la traducción sincronizada con el audio.

### Voces Piper

El catálogo incluye (por defecto en `src-tauri/voice-catalog.json`):

| Voz | Idioma | Modelo |
|-----|--------|--------|
| Sharvard | Español (España) | `es_ES-sharvard-medium` |
| Daniela | Español (Argentina) | `es_AR-daniela-high` |
| Lessac | Inglés (EE. UU.) | `en_US-lessac-medium` |
| Amy | Inglés (EE. UU.) | `en_US-amy-medium` |
| Ryan | Inglés (EE. UU.) | `en_US-ryan-medium` |

**Abrir el gestor de voces:**

- Botón con icono de voz en el **header derecho** (solo con un PDF abierto), a la derecha de los subtítulos.
- En macOS: menú **Voces → Gestionar voces Piper…** (barra de menú del sistema; disponible también sin documento).

En el diálogo puedes **descargar** modelos que falten, **preescuchar** una muestra y marcar la voz **activa** para cada idioma. La preferencia se guarda en el navegador (localStorage). Al cambiar de voz, el audio de la página actual se vuelve a preparar.

Si la descarga falla al parchear el modelo, ejecuta `./scripts/setup-local-ai.sh` para instalar el entorno `piper-tts`.

### Controles en la interfaz

| Elemento | Ubicación | Acción |
|----------|-----------|--------|
| **Abrir PDF** | Pantalla vacía | Selector de archivo |
| Arrastrar PDF | Visor | Abre el documento |
| **Página anterior / siguiente** | Centro del header | Navega sin reiniciar la preparación de audio |
| **Play / Pausa** | Centro del header | Reproduce o pausa la narración |
| Indicador circular | Junto al reproductor | Progreso de síntesis/alineación de la página actual |
| **Voces Piper** | Header derecho (solo con PDF abierto) | Abre el catálogo: descargar, preescuchar y elegir voz activa por idioma |
| Ajuste ancho / página | Icono junto al reproductor | Alterna entre ver el PDF a ancho completo o página entera |
| **Idioma del audio** | Header derecho | Cambia idioma de narración y traducción (reprepara el audio) |
| **Subtítulos · ES/EN** | Header derecho | Muestra u oculta subtítulos en el idioma opuesto |
| Icono basura | Junto al nombre del PDF | Cierra el documento y vuelve al inicio |
| Miniaturas | Columna izquierda | Salta a una página (actualiza vista; la reproducción sigue su propia página hasta que navegas o das play) |
| Scroll en el visor | Área central | Desplaza el documento; actualiza el contador de página visible |

### Atajos de teclado

| Tecla | Acción |
|-------|--------|
| `Espacio`, `P` | Play / Pausa |
| `Escape` | Pausa |
| `←`, `Page Up` | Página anterior |
| `→`, `Page Down` | Página siguiente |
| `S` | Mostrar / ocultar subtítulos |

Los atajos no actúan mientras el foco está en un campo de texto o con modificadores (Cmd/Ctrl/Alt).

## Tecnologías

### Frontend

- **React 19** + **TypeScript**
- **Vite 7**
- **Tailwind CSS v4**
- **Radix UI** (diálogos, scroll, progreso)
- **Lucide** (iconos)
- **pdfjs-dist** (visor PDF)
- **WASM** (`wasm-pack`, crate `narration-sync-wasm`) para sincronización en el cliente

### Backend / escritorio

- **Tauri v2** (Rust)
- **pdf-extract** — extracción de texto del PDF
- **whatlang** — detección de idioma
- **Piper** — síntesis de voz local (sidecar `bin/piper`)
- **reqwest** — descarga de modelos desde Hugging Face desde la app
- **piper-phonemize** + script Python — alineación fonema para sync
- **Argos Translate** (venv Python) — traducción offline
- Crate **`narration-sync`** — lógica de sincronización compartida Rust/WASM

### Herramientas de desarrollo

- `@tauri-apps/cli` — build y dev de la app nativa
- Scripts en `scripts/` — setup de IA local, parche de modelos ONNX, fix de libs en macOS

## Estructura del proyecto

```
simple-narrator/
├── src/                    # UI React (visor, reproductor, header)
├── src-tauri/              # Backend Tauri + binarios Piper + modelos
│   ├── src/                # Comandos Rust (PDF, TTS, traducción, voces)
│   ├── voice-catalog.json  # Catálogo de voces (UI + descargas)
│   ├── bin/                # Piper (generado por setup-local-ai.sh)
│   └── models/piper/       # Modelos ONNX (setup o descarga desde la app)
├── crates/
│   ├── narration-sync/     # Sync palabra-a-palabra (Rust)
│   └── narration-sync-wasm/ # Bindings WASM para el frontend
├── scripts/
│   └── setup-local-ai.sh   # Configuración de Piper + Argos
└── public/                 # Iconos y assets estáticos
```

## Scripts npm

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Solo frontend Vite (sin Tauri) |
| `npm run tauri dev` | App completa en desarrollo |
| `npm run build` | Build frontend + WASM |
| `npm run tauri build` | Instalador nativo |
| `npm run build:wasm` | Compila solo el módulo WASM |
| `npm run icons` | Regenera iconos de app desde `public/icon.png` |

## Caché y datos locales

Los audios generados y metadatos de alineación se guardan en la carpeta de caché del sistema bajo `simple-narrator` (ver `APP_CACHE_FOLDER` en el código).

## Licencia

MIT — ver [LICENSE](LICENSE).

## Créditos

- Voces Piper: [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices)
- Piper TTS: [rhasspy/piper](https://github.com/rhasspy/piper)
- Argos Translate: [argosopentech/argos-translate](https://github.com/argosopentech/argos-translate)
