#!/usr/bin/env python3
"""
Sintetiza WAV con Piper 1 (piper-tts) y genera alineación palabra desde w_ceil ONNX.
Requiere modelo parcheado (scripts/patch_piper_models.py).
"""

from __future__ import annotations

import argparse
import json
import sys
import wave
from pathlib import Path
from typing import Any

# Tokens especiales Piper
_SKIP_PHONEMES = frozenset({"^", "$", "_"})


def _phoneme_weight(phoneme: str) -> float:
    if phoneme == " ":
        return 0.08
    if phoneme in {".", "!", "?"}:
        return 2.9
    if phoneme in {",", ";", ":"}:
        return 1.7
    if phoneme in {"ˈ", "ˌ"}:
        return 0.12
    if phoneme in {"ː", "ˑ"}:
        return 0.35
    if phoneme in {"ʰ", "ʲ", "ʷ"}:
        return 0.1
    if not phoneme:
        return 0.2
    c = phoneme[0]
    if c.isalpha() and c.lower() in "aeiouy":
        return 2.75
    if c.isalnum():
        return 2.45
    return 0.25


def _heuristic_word_timings(text: str, duration_ms: int) -> list[dict[str, Any]]:
    words = text.split()
    if not words or duration_ms <= 0:
        return []

    weights = [max(1.0, len(w)) for w in words]
    total = sum(weights)
    cursor = 0
    out: list[dict[str, Any]] = []

    for i, word in enumerate(words):
        start_ms = cursor
        slice_ms = int(round((weights[i] / total) * duration_ms))
        if i == len(words) - 1:
            end_ms = duration_ms
        else:
            cursor += slice_ms
            end_ms = cursor

        out.append({"word": word, "start_ms": start_ms, "end_ms": end_ms})

    return out


def _alignments_to_word_timings(
    text: str,
    alignments: list[Any],
    sample_rate: int,
) -> list[dict[str, Any]]:
    words = text.split()
    if not words or not alignments:
        return []

    results: list[dict[str, Any]] = []
    word_idx = 0
    start_ms = 0
    word_samples = 0

    def flush_word() -> None:
        nonlocal word_idx, start_ms, word_samples
        if word_idx >= len(words) or word_samples <= 0:
            word_samples = 0
            return
        duration_ms = int(round(word_samples * 1000 / sample_rate))
        end_ms = start_ms + duration_ms
        results.append(
            {
                "word": words[word_idx],
                "start_ms": start_ms,
                "end_ms": end_ms,
            }
        )
        start_ms = end_ms
        word_idx += 1
        word_samples = 0

    for entry in alignments:
        phoneme = entry.phoneme
        samples = int(entry.num_samples)
        if samples <= 0:
            continue
        if phoneme in _SKIP_PHONEMES:
            continue
        if phoneme == " ":
            flush_word()
            continue
        word_samples += samples

    flush_word()

    if len(results) != len(words):
        # Fallback proporcional si el conteo de palabras no coincide
        duration_ms = int(
            round(sum(int(a.num_samples) for a in alignments) * 1000 / sample_rate)
        )
        return _heuristic_word_timings(text, duration_ms)

    return results


def _heuristic_from_phonemes(
    text: str,
    phoneme_lists: list[list[str]],
    duration_ms: int,
) -> list[dict[str, Any]]:
    words = text.split()
    if not words:
        return []

    phonemes: list[str] = []
    for sentence in phoneme_lists:
        phonemes.extend(sentence)

    groups: list[list[str]] = []
    current: list[str] = []
    for p in phonemes:
        if p == " ":
            if current:
                groups.append(current)
                current = []
        elif p not in _SKIP_PHONEMES:
            current.append(p)
    if current:
        groups.append(current)

    if not groups:
        return _heuristic_word_timings(text, duration_ms)

    weights = [sum(_phoneme_weight(p) for p in g) for g in groups]
    total = sum(weights) or 1.0
    cursor = 0
    out: list[dict[str, Any]] = []

    for i, group in enumerate(groups):
        word = words[i] if i < len(words) else ""
        if not word:
            break
        start_ms = cursor
        slice_ms = int(round((weights[i] / total) * duration_ms))
        if i == len(groups) - 1:
            end_ms = duration_ms
        else:
            cursor += slice_ms
            end_ms = cursor
        out.append({"word": word, "start_ms": start_ms, "end_ms": end_ms})

    return out


def synthesize(
    model: Path,
    text: str,
    output_wav: Path,
    espeak_data: Path | None,
    source_text: str | None,
) -> dict[str, Any]:
    from piper import PiperVoice

    voice = PiperVoice.load(
        str(model),
        espeak_data_dir=str(espeak_data) if espeak_data else None,
    )
    sample_rate = voice.config.sample_rate

    all_alignments: list[Any] = []
    with wave.open(str(output_wav), "wb") as wav_file:
        first = True
        for chunk in voice.synthesize(text, include_alignments=True):
            if first:
                wav_file.setframerate(chunk.sample_rate)
                wav_file.setsampwidth(chunk.sample_width)
                wav_file.setnchannels(chunk.sample_channels)
                first = False
            wav_file.writeframes(chunk.audio_int16_bytes)
            if chunk.phoneme_alignments:
                all_alignments.extend(chunk.phoneme_alignments)

    if not all_alignments:
        raise RuntimeError(
            "El modelo no devolvió alineación. Ejecuta scripts/patch_piper_models.py"
        )

    with wave.open(str(output_wav), "rb") as wav_file:
        frames = wav_file.getnframes()
        rate = wav_file.getframerate()
        duration_ms = int(round(frames * 1000 / rate)) if rate > 0 else 0

    words = _alignments_to_word_timings(text, all_alignments, sample_rate)
    if not words:
        words = _heuristic_word_timings(text, duration_ms)

    source_words: list[dict[str, Any]] | None = None
    source_trimmed = (source_text or "").strip()
    text_trimmed = text.strip()

    if source_trimmed and source_trimmed != text_trimmed:
        phoneme_lists = voice.phonemize(source_trimmed)
        source_words = _heuristic_from_phonemes(
            source_trimmed, phoneme_lists, duration_ms
        )

    return {
        "duration_ms": duration_ms,
        "words": words,
        "source_words": source_words,
        "alignment_method": "onnx_w_ceil",
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True, type=Path)
    parser.add_argument("--text", required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--source-text", default="")
    parser.add_argument("--espeak-data", type=Path, default=None)
    parser.add_argument("--align-json", type=Path, default=None)
    args = parser.parse_args()

    if not args.model.is_file():
        print(f"Modelo no encontrado: {args.model}", file=sys.stderr)
        return 1

    marker = args.model.with_suffix(args.model.suffix + ".patched")
    if not marker.is_file():
        print(
            f"Modelo sin parche de alineación: {args.model}. "
            "Ejecuta scripts/patch_piper_models.py",
            file=sys.stderr,
        )
        return 2

    args.output.parent.mkdir(parents=True, exist_ok=True)

    try:
        alignment = synthesize(
            args.model,
            args.text,
            args.output,
            args.espeak_data,
            args.source_text or None,
        )
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 3

    align_path = args.align_json or args.output.with_suffix(".align.json")
    align_path.write_text(json.dumps(alignment, ensure_ascii=False, indent=2))
    print(json.dumps({"ok": True, "alignment_path": str(align_path)}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
