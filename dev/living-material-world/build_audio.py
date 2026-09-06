"""Original, seamless ambient bed; no external samples."""
from pathlib import Path
import math
import wave
from array import array

rate = 22050
duration = 24
samples = array('h')
for i in range(rate * duration):
    t = i / rate
    swell = 0.65 + 0.25 * math.sin(math.tau * t / duration)
    value = sum(math.sin(math.tau*f*t+p)*a for f,a,p in [(55,0.12,0),(82.5,0.07,0.3),(110,0.04,1.2),(165,0.025,0.5),(220,0.012,2)])
    air = sum(math.sin(math.tau*(301+j*17)*t+j)*0.0008 for j in range(15))
    samples.append(round(32767 * (value*swell+air)))
path = Path(__file__).parent / 'assets' / 'living-ambient.wav'
with wave.open(str(path), 'wb') as out:
    out.setnchannels(1)
    out.setsampwidth(2)
    out.setframerate(rate)
    out.writeframes(samples.tobytes())
print(path)
