#!/usr/bin/env python3
"""Regenerate playable sample MP3s with two clearly distinct speakers.

The upload demo path (`POST /v1/transcribe-upload`) relies on AssemblyAI
`speaker_labels` diarization. Earlier samples claimed distinct macOS `say`
voices but still collapsed to a single utterance in practice — disclosure
timing and clickable timestamps then all pointed at tMs:0.

This script synthesizes each turn with edge-tts (GuyNeural = agent,
JennyNeural = user), places each turn at its scripted `tMs` offset, and
writes MP3s under client/public/samples/.

Requires: edge-tts, ffmpeg on PATH.
"""
from __future__ import annotations

import asyncio
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "client" / "public" / "samples"
AGENT_VOICE = "en-US-GuyNeural"
USER_VOICE = "en-US-JennyNeural"
TAIL_PAD_MS = 800

# Keep in sync with the six playable keys in client/src/sampleSessions.js
PLAYABLE = {
    "clean-call": [
        {
            "role": "agent",
            "text": "Hi, this is an AI assistant calling from Acme Support. This call may be recorded for quality purposes.",
            "tMs": 500,
        },
        {"role": "user", "text": "Sure, go ahead.", "tMs": 3200},
        {"role": "agent", "text": "Great, how can I help you today?", "tMs": 4500},
    ],
    "tcpa-violation": [
        {"role": "agent", "text": "Hi there, how can I help you today?", "tMs": 500},
        {
            "role": "user",
            "text": "My SSN is 123-45-6789 and my card is 4111 1111 1111 1111.",
            "tMs": 6000,
        },
    ],
    "optout-ignored": [
        {
            "role": "agent",
            "text": "Hi, this is an AI assistant calling about your account.",
            "tMs": 500,
        },
        {"role": "user", "text": "Stop calling me, take me off your list.", "tMs": 4000},
        {
            "role": "agent",
            "text": "I hear you, but let me tell you about today's offer.",
            "tMs": 5200,
        },
        {"role": "agent", "text": "This deal expires tonight.", "tMs": 8000},
    ],
    "healthcare-hipaa": [
        {
            "role": "agent",
            "text": "Hi, this is an automated assistant from the clinic.",
            "tMs": 300,
        },
        {
            "role": "user",
            "text": "My patient id 483920 and MRN:1029384 are on file.",
            "tMs": 3500,
        },
    ],
    "late-disclosure": [
        {"role": "agent", "text": "Hi there, thanks for calling Acme Support.", "tMs": 500},
        {"role": "user", "text": "Hey, I have a question about my account.", "tMs": 3000},
        {
            "role": "agent",
            "text": "Sure — just so you know, I'm an AI assistant helping with this call.",
            "tMs": 15000,
        },
    ],
    "clean-call-2": [
        {
            "role": "agent",
            "text": "Hello, this is a virtual assistant calling on behalf of Acme Billing. This call is being recorded for quality purposes.",
            "tMs": 400,
        },
        {"role": "user", "text": "Okay, what's this about?", "tMs": 2800},
        {
            "role": "agent",
            "text": "Just a reminder that your invoice is due next week.",
            "tMs": 4200,
        },
    ],
}


async def synth_turn(text: str, voice: str, dest: Path) -> None:
    # Import lazily so --help / dry parse doesn't need the package.
    import edge_tts

    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(str(dest))


def wav_duration_ms(path: Path) -> int:
    out = subprocess.check_output(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "csv=p=0",
            str(path),
        ],
        text=True,
    ).strip()
    return int(float(out) * 1000)


def to_wav(src: Path, dest: Path) -> None:
    subprocess.check_call(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(src),
            "-ac",
            "1",
            "-ar",
            "24000",
            str(dest),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def mix_session(turn_wavs: list[tuple[Path, int]], dest_mp3: Path) -> None:
    """Place each turn WAV at its tMs offset and encode a mono MP3."""
    if not turn_wavs:
        raise ValueError("no turns")

    ends = []
    for path, t_ms in turn_wavs:
        ends.append(t_ms + wav_duration_ms(path))
    total_ms = max(ends) + TAIL_PAD_MS
    total_s = total_ms / 1000.0

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        # Build filter: each input delayed, then amix.
        inputs: list[str] = []
        filter_parts: list[str] = []
        for i, (path, t_ms) in enumerate(turn_wavs):
            inputs.extend(["-i", str(path)])
            # adelay takes ms per channel; mono → one value
            filter_parts.append(f"[{i}:a]adelay={t_ms}|{t_ms},apad=whole_dur={total_s}[a{i}]")
        mix_in = "".join(f"[a{i}]" for i in range(len(turn_wavs)))
        filter_parts.append(
            f"{mix_in}amix=inputs={len(turn_wavs)}:normalize=0:dropout_transition=0[out]"
        )
        filter_complex = ";".join(filter_parts)
        mixed_wav = tmp_path / "mixed.wav"
        cmd = [
            "ffmpeg",
            "-y",
            *inputs,
            "-filter_complex",
            filter_complex,
            "-map",
            "[out]",
            "-ac",
            "1",
            "-ar",
            "24000",
            str(mixed_wav),
        ]
        subprocess.check_call(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.check_call(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(mixed_wav),
                "-codec:a",
                "libmp3lame",
                "-b:a",
                "96k",
                str(dest_mp3),
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )


async def build_one(key: str, turns: list[dict]) -> dict:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        placed: list[tuple[Path, int]] = []
        for i, turn in enumerate(turns):
            voice = AGENT_VOICE if turn["role"] == "agent" else USER_VOICE
            raw = tmp_path / f"turn{i}.mp3"
            wav = tmp_path / f"turn{i}.wav"
            await synth_turn(turn["text"], voice, raw)
            to_wav(raw, wav)
            # If TTS for turn N is longer than the gap to turn N+1, push later
            # turns forward so speech never overlaps (diarization hates overlap).
            t_ms = turn["tMs"]
            if placed:
                prev_path, prev_t = placed[-1]
                earliest = prev_t + wav_duration_ms(prev_path) + 500
                if t_ms < earliest:
                    t_ms = earliest
            placed.append((wav, t_ms))
        dest = OUT_DIR / f"{key}.mp3"
        mix_session(placed, dest)
        duration = wav_duration_ms(dest)
        return {
            "key": key,
            "path": str(dest.relative_to(ROOT)),
            "durationMs": duration,
            "turns": [
                {"role": t["role"], "tMs": placed[i][1], "text": t["text"]}
                for i, t in enumerate(turns)
            ],
        }


async def main() -> int:
    if subprocess.call(["which", "ffmpeg"], stdout=subprocess.DEVNULL) != 0:
        print("ffmpeg is required on PATH", file=sys.stderr)
        return 1
    try:
        import edge_tts  # noqa: F401
    except ImportError:
        print("Install edge-tts: pip install edge-tts", file=sys.stderr)
        return 1

    results = []
    for key, turns in PLAYABLE.items():
        print(f"Generating {key}…")
        results.append(await build_one(key, turns))
        print(f"  → {results[-1]['path']} ({results[-1]['durationMs']} ms)")

    manifest = OUT_DIR / "manifest.json"
    manifest.write_text(json.dumps(results, indent=2) + "\n")
    print(f"Wrote {manifest.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
