use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
struct WavFormat {
    sample_rate: u32,
    channels: u16,
    bits_per_sample: u16,
}

#[derive(Debug)]
struct WavPayload {
    format: WavFormat,
    data: Vec<u8>,
}

/// Verifica que un archivo sea un WAV PCM legible (evita cachés corruptos tras cancelaciones).
pub fn is_valid_wav_file(path: &Path) -> bool {
    read_wav_pcm(path).is_ok()
}

/// Duración del WAV en milisegundos (PCM mono/estéreo).
pub fn wav_duration_ms(path: &Path) -> Result<u32, String> {
    let payload = read_wav_pcm(path)?;
    let bytes_per_sample = payload.format.bits_per_sample as u64 / 8;
    if bytes_per_sample == 0 {
        return Err("WAV con bits_per_sample inválido.".to_string());
    }
    let sample_count = payload.data.len() as u64 / bytes_per_sample;
    let channels = payload.format.channels as u64;
    if channels == 0 || payload.format.sample_rate == 0 {
        return Err("WAV con formato inválido.".to_string());
    }
    let frames = sample_count / channels;
    let ms = frames * 1000 / payload.format.sample_rate as u64;
    Ok(ms as u32)
}

/// Concatena archivos WAV PCM (mismo formato) en un solo archivo.
pub fn merge_wav_files(inputs: &[PathBuf], output: &Path) -> Result<(), String> {
    if inputs.is_empty() {
        return Err("No hay archivos WAV para combinar.".to_string());
    }

    let mut merged_data = Vec::new();
    let mut format: Option<WavFormat> = None;

    for input in inputs {
        let payload = read_wav_pcm(input.as_path())?;
        match &format {
            None => format = Some(payload.format.clone()),
            Some(expected) if expected != &payload.format => {
                return Err(
                    "Los chunks de audio tienen formatos distintos; no se pueden combinar."
                        .to_string(),
                );
            }
            _ => {}
        }
        merged_data.extend(payload.data);
    }

  let format = format.expect("al menos un archivo wav");
    write_wav_pcm(output, &format, &merged_data)?;
    Ok(())
}

fn read_wav_pcm(path: &Path) -> Result<WavPayload, String> {
    let bytes = std::fs::read(path)
        .map_err(|e| format!("No se pudo leer {}: {e}", path.display()))?;

    if bytes.len() < 44 {
        return Err(format!("WAV demasiado corto: {}", path.display()));
    }

    if &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return Err(format!("Formato WAV inválido: {}", path.display()));
    }

    let mut cursor = Cursor::new(&bytes);
    cursor.set_position(12);

    let mut format: Option<WavFormat> = None;
    let mut data: Option<Vec<u8>> = None;

    while cursor.position() < bytes.len() as u64 {
        let mut chunk_id = [0u8; 4];
        if cursor.read_exact(&mut chunk_id).is_err() {
            break;
        }

        let mut chunk_size_bytes = [0u8; 4];
        cursor
            .read_exact(&mut chunk_size_bytes)
            .map_err(|e| format!("WAV corrupto: {e}"))?;
        let chunk_size = u32::from_le_bytes(chunk_size_bytes);
        let chunk_start = cursor.position();

        match &chunk_id {
            b"fmt " => {
                let mut fmt = vec![0u8; chunk_size as usize];
                cursor
                    .read_exact(&mut fmt)
                    .map_err(|e| format!("WAV fmt incompleto: {e}"))?;

                if fmt.len() < 16 {
                    return Err("Chunk fmt demasiado corto.".to_string());
                }

                let audio_format = u16::from_le_bytes([fmt[0], fmt[1]]);
                if audio_format != 1 {
                    return Err("Solo se admite PCM sin comprimir.".to_string());
                }

                let channels = u16::from_le_bytes([fmt[2], fmt[3]]);
                let sample_rate = u32::from_le_bytes([fmt[4], fmt[5], fmt[6], fmt[7]]);
                let bits_per_sample = u16::from_le_bytes([fmt[14], fmt[15]]);

                format = Some(WavFormat {
                    sample_rate,
                    channels,
                    bits_per_sample,
                });
            }
            b"data" => {
                let mut chunk_data = vec![0u8; chunk_size as usize];
                cursor
                    .read_exact(&mut chunk_data)
                    .map_err(|e| format!("WAV data incompleto: {e}"))?;
                data = Some(chunk_data);
            }
            _ => {
                cursor.set_position(chunk_start + chunk_size as u64);
            }
        }

        if chunk_size % 2 == 1 {
            cursor.set_position(cursor.position() + 1);
        }
    }

    let format = format.ok_or_else(|| format!("Sin chunk fmt en {}", path.display()))?;
    let data = data.ok_or_else(|| format!("Sin chunk data en {}", path.display()))?;

    Ok(WavPayload { format, data })
}

fn write_wav_pcm(path: &Path, format: &WavFormat, data: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("No se pudo crear directorio de salida: {e}"))?;
    }

    let byte_rate = format.sample_rate * format.channels as u32 * format.bits_per_sample as u32 / 8;
    let block_align = format.channels * format.bits_per_sample / 8;
    let data_size = data.len() as u32;
    let riff_size = 36 + data_size;

    let mut out = Vec::with_capacity(44 + data.len());
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&riff_size.to_le_bytes());
    out.extend_from_slice(b"WAVE");
    out.extend_from_slice(b"fmt ");
    out.extend_from_slice(&16u32.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&format.channels.to_le_bytes());
    out.extend_from_slice(&format.sample_rate.to_le_bytes());
    out.extend_from_slice(&byte_rate.to_le_bytes());
    out.extend_from_slice(&block_align.to_le_bytes());
    out.extend_from_slice(&format.bits_per_sample.to_le_bytes());
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data_size.to_le_bytes());
    out.extend_from_slice(data);

    std::fs::write(path, out)
        .map_err(|e| format!("No se pudo escribir {}: {e}", path.display()))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_wav_path(name: &str) -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("simple-narrator-{name}-{nanos}.wav"))
    }

    fn sample_format() -> WavFormat {
        WavFormat {
            sample_rate: 22050,
            channels: 1,
            bits_per_sample: 16,
        }
    }

    #[test]
    fn merge_two_wav_files() {
        let format = sample_format();
        let data1 = vec![0u8, 1, 2, 3];
        let data2 = vec![4u8, 5, 6, 7];

        let wav1 = temp_wav_path("a");
        let wav2 = temp_wav_path("b");
        let merged = temp_wav_path("merged");

        write_wav_pcm(&wav1, &format, &data1).unwrap();
        write_wav_pcm(&wav2, &format, &data2).unwrap();
        merge_wav_files(&[wav1.clone(), wav2.clone()], &merged).unwrap();

        let payload = read_wav_pcm(&merged).unwrap();
        assert_eq!(payload.data, vec![0, 1, 2, 3, 4, 5, 6, 7]);

        std::fs::remove_file(wav1).ok();
        std::fs::remove_file(wav2).ok();
        std::fs::remove_file(merged).ok();
    }
}
