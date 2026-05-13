# Transcribe WhatsApp .opus voice notes (Hebrew) using openai-whisper.
# - Skips files already transcribed (idempotent / resumable).
# - Output: one JSON per input next to the audio in transcripts/.
# - Index file: transcribe-index.json (filename -> transcript path).
# Run: python transcribe.py [audio_folder]

import os, json, sys, time, io
from pathlib import Path

# Force UTF-8 on stdout so Hebrew / arrows don't crash on Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# add ffmpeg to PATH for whisper
FFMPEG_DIR = r"C:\Users\avraham\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.1-full_build\bin"
os.environ["PATH"] = FFMPEG_DIR + os.pathsep + os.environ.get("PATH", "")

import whisper

if len(sys.argv) > 1:
    AUDIO_DIR = sys.argv[1]
else:
    # read from a file to avoid Hebrew literal issues
    # PowerShell may write a BOM — strip it
    AUDIO_DIR = Path(r"C:\Users\avraham\meatfish-app\audio-dir.txt").read_text(encoding='utf-8').strip().lstrip('﻿')
OUT_DIR   = Path(r"C:\Users\avraham\meatfish-app\transcripts")
INDEX     = Path(r"C:\Users\avraham\meatfish-app\transcribe-index.json")
MODEL     = os.environ.get("WHISPER_MODEL", "small")  # tiny/base/small/medium/large
OUT_DIR.mkdir(exist_ok=True, parents=True)

idx = {}
if INDEX.exists():
    idx = json.loads(INDEX.read_text(encoding='utf-8'))

audio_files = []
for ext in ('opus','ogg','m4a','mp3','wav'):
    audio_files.extend(Path(AUDIO_DIR).glob(f'*.{ext}'))
audio_files.sort()
print(f"[init] {AUDIO_DIR}: {len(audio_files)} audio files, already done: {len(idx)}", flush=True)

todo = [f for f in audio_files if f.name not in idx]
print(f"[init] To transcribe: {len(todo)}", flush=True)
if not todo:
    print("[init] Done.")
    sys.exit(0)

print(f"[init] Loading whisper model '{MODEL}' on CPU...", flush=True)
t0 = time.time()
model = whisper.load_model(MODEL)
print(f"[init] Model loaded in {time.time()-t0:.1f}s", flush=True)

start = time.time()
for i, f in enumerate(todo, 1):
    try:
        t_start = time.time()
        # condition_on_previous_text=False reduces hallucination on short clips
        result = model.transcribe(
            str(f),
            language="he",
            fp16=False,
            condition_on_previous_text=False,
            verbose=False,
        )
        out = {
            "file": f.name,
            "duration": round(float(result.get("duration", 0) or sum(s["end"]-s["start"] for s in result["segments"])), 2),
            "language": result.get("language", "he"),
            "text": result["text"].strip(),
            "segments": [{"start": round(s["start"],2), "end": round(s["end"],2), "text": s["text"].strip()} for s in result["segments"]],
        }
        out_path = OUT_DIR / (f.stem + '.json')
        out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding='utf-8')
        idx[f.name] = str(out_path)
        if i % 5 == 0:
            INDEX.write_text(json.dumps(idx, ensure_ascii=False, indent=2), encoding='utf-8')
        elapsed = time.time() - t_start
        total_elapsed = time.time() - start
        avg = total_elapsed / i
        eta = avg * (len(todo) - i)
        snippet = out["text"][:60].replace("\n", " ")
        print(f"[{i}/{len(todo)}] {f.name} {out['duration']:.1f}s in {elapsed:.1f}s | ETA {eta/60:.0f}m | {snippet}", flush=True)
    except Exception as e:
        print(f"[err] {f.name}: {e}", flush=True)
        idx[f.name] = {"error": str(e)}

INDEX.write_text(json.dumps(idx, ensure_ascii=False, indent=2), encoding='utf-8')
print(f"\n[done] {len(todo)} files in {(time.time()-start)/60:.1f} min", flush=True)
