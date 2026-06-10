#!/usr/bin/env python3
"""Parchea modelos Piper ONNX para exponer alineación fonema (tensor w_ceil)."""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path
from typing import Set

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
_LOGGER = logging.getLogger(__name__)


def _detect_ceil_tensor(model: "onnx.ModelProto") -> str | None:
    ceil_names: Set[str] = set()
    for node in model.graph.node:
        if node.op_type != "Ceil":
            continue
        ceil_names.update(node.output)

    if not ceil_names:
        return None
    if len(ceil_names) > 1:
        _LOGGER.error(
            "Varios tensores Ceil: %s. Usa --tensor-name.",
            ceil_names,
        )
        return None
    return next(iter(ceil_names))


def _model_has_alignment_output(model: "onnx.ModelProto", ceil_tensor_name: str) -> bool:
    return any(output.name == ceil_tensor_name for output in model.graph.output)


def patch_model(model_path: Path, tensor_name: str | None = None) -> bool:
    try:
        import onnx
    except ImportError:
        _LOGGER.error("Instala onnx: pip install onnx")
        return False

    if not model_path.is_file():
        _LOGGER.error("Modelo no encontrado: %s", model_path)
        return False

    marker = model_path.with_suffix(model_path.suffix + ".patched")
    model = onnx.load(str(model_path))

    if tensor_name:
        ceil_tensor_name = tensor_name
    else:
        ceil_tensor_name = _detect_ceil_tensor(model)
        if not ceil_tensor_name:
            _LOGGER.error(
                "No se detectó tensor Ceil en %s. Usa --tensor-name manualmente.",
                model_path.name,
            )
            return False
        _LOGGER.info("Tensor Ceil detectado: %s", ceil_tensor_name)

    if _model_has_alignment_output(model, ceil_tensor_name):
        marker.touch()
        _LOGGER.info("Alineación ya presente: %s", model_path.name)
        return True

    if marker.is_file():
        _LOGGER.warning(
            "Marcador .patched obsoleto en %s (modelo sin salida Ceil). Re-parcheando.",
            model_path.name,
        )

    ceil_value_info = onnx.helper.ValueInfoProto()
    ceil_value_info.name = ceil_tensor_name
    model.graph.output.append(ceil_value_info)

    onnx.save(model, str(model_path))
    marker.touch()
    _LOGGER.info("Parcheado: %s", model_path.name)
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Parchea voces Piper para alineación ONNX")
    parser.add_argument(
        "models_dir",
        nargs="?",
        default="src-tauri/models/piper",
        help="Directorio con archivos .onnx",
    )
    parser.add_argument("--tensor-name", help="Nombre manual del tensor Ceil")
    args = parser.parse_args()

    models_dir = Path(args.models_dir)
    if not models_dir.is_dir():
        _LOGGER.error("Directorio inválido: %s", models_dir)
        return 1

    onnx_files = sorted(models_dir.glob("*.onnx"))
    if not onnx_files:
        _LOGGER.error("No hay .onnx en %s", models_dir)
        return 1

    ok = 0
    for model_path in onnx_files:
        if patch_model(model_path, args.tensor_name):
            ok += 1

    if ok == 0:
        return 1

    _LOGGER.info("Listo: %d modelo(s) con alineación fonema.", ok)
    return 0


if __name__ == "__main__":
    sys.exit(main())
