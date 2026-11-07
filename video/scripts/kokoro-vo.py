"""Generate the voiceover with Kokoro-82M (Apache-2.0 code and weights), voice `af_heart`.

One WAV per caption cue of docs/media/devpost-demo.srt (cues 1-6 = explainer scenes,
7-13 = live segment of the Devpost demo). Cues 8, 9 and 13 are read slightly faster so
they fit their slot. Normalise to about -20 LUFS and convert to MP3 afterwards, e.g.
  ffmpeg -i cue-01.wav -af loudnorm=I=-20.3:TP=-1.5 -c:a libmp3lame -b:a 128k ../public/audio/vo-01-title.mp3

Setup (Python 3.10-3.13):
  pip install "kokoro>=0.9.2" soundfile
  pip install https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl
  brew install espeak-ng   # macOS; apt-get install espeak-ng on Linux
Run:
  python video/scripts/kokoro-vo.py docs/media/devpost-demo.srt <out-dir>
"""
import os, re, sys

import numpy as np
import soundfile as sf

# macOS: the espeak-ng bundled with espeakng-loader points at a CI build path; use Homebrew's.
if sys.platform == "darwin" and os.path.exists("/opt/homebrew/lib/libespeak-ng.dylib"):
    import espeakng_loader
    espeakng_loader.get_library_path = lambda: "/opt/homebrew/lib/libespeak-ng.dylib"
    espeakng_loader.get_data_path = lambda: "/opt/homebrew/share/espeak-ng-data"

from kokoro import KPipeline

VOICE = "af_heart"
SPEED = {8: 1.08, 9: 1.06, 13: 1.13}

srt_path, out_dir = sys.argv[1], sys.argv[2]
os.makedirs(out_dir, exist_ok=True)
cues = [re.sub(r"\s+", " ", c.split("\n", 2)[2]).strip()
        for c in open(srt_path, encoding="utf-8").read().strip().split("\n\n")]
pipe = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
for i, text in enumerate(cues, 1):
    audio = np.concatenate([a.numpy() for _, _, a in pipe(text, voice=VOICE, speed=SPEED.get(i, 1.0))])
    sf.write(os.path.join(out_dir, f"cue-{i:02d}.wav"), audio, 24000)
    print(i, round(len(audio) / 24000, 2), text[:60])
