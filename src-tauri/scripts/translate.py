"""Traducción offline en↔es vía Argos Translate (stdin → stdout)."""

import sys

from argostranslate.translate import get_translation_from_codes


def main() -> int:
    if len(sys.argv) != 3:
        print("Uso: translate.py <from_code> <to_code>", file=sys.stderr)
        return 1

    from_code, to_code = sys.argv[1], sys.argv[2]
    text = sys.stdin.read()
    if not text.strip():
        return 0

    translation = get_translation_from_codes(from_code, to_code)
    if translation is None:
        print(
            f"No hay paquete Argos para {from_code}→{to_code}. "
            "Ejecuta scripts/setup-local-ai.sh",
            file=sys.stderr,
        )
        return 2

    sys.stdout.write(translation.translate(text))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
