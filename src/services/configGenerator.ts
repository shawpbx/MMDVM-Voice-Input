import { AlertRule, AudioSettings, MmdvmStatus } from '../types/mmdvm';

export function generateMmdvmIni(
  status: MmdvmStatus,
  settings: AudioSettings,
  rules: AlertRule[]
): string {
  const enabledModes = ['DMR', 'D-Star', 'System Fusion', 'P25', 'NXDN'];
  const rulesConfig = rules
    .map(
      (r) =>
        `# Rule: ${r.label}\nRule_${r.id}_Enabled=${r.enabled ? 1 : 0}\nRule_${r.id}_Voice="${r.voiceTemplate}"\nRule_${r.id}_Beep=${r.beepType || 'none'}`
    )
    .join('\n\n');

  return `; ####################################################################
; # MMDVMHost Configuration with Connected Audio Interface Alerts
; # Reference: https://github.com/g4klx/MMDVM-Host
; ####################################################################

[General]
Callsign=${status.repeaterCallsign || 'W1AW'}
Id=${status.dmrId || '3109999'}
Timeout=180
Duplex=1
Display=OLED
Daemon=1

[Info]
RXFrequency=${status.rxFrequency || '438.800000'}
TXFrequency=${status.txFrequency || '431.200000'}
Power=20
Latitude=40.7128
Longitude=-74.0060
Height=45
Location=Amateur Radio Repeater
Description=Multi-Mode Digital Voice Modem with Audio Interface Alerts
URL=https://github.com/g4klx/MMDVM-Host

[Modem]
Port=${status.port || '/dev/ttyACM0'}
Speed=${status.baudRate || 115200}
RXInvert=0
TXInvert=0
PTTInvert=0
TXDelay=100
DMRDelay=0
RXLevel=50
TXLevel=50
OscOffset=0
Debug=0

; ====================================================================
; [Audio Interface & Voice Alerts]
; Extension for playing voice announcements & status notifications
; directly out of the connected ALSA / USB soundcard (e.g. CM108, USB DAC)
; ====================================================================
[Audio Interface]
EnableAudioAlerts=1
; ALSA Device string: hw:1,0 or plughw:Device,0 or PulseAudio default
AlsaDevice=hw:1,0
AudioVolume=${Math.round(settings.volume * 100)}
BandpassFilter=${settings.radioFilterEnabled ? 1 : 0}
BandpassLowHz=350
BandpassHighHz=3200
PTTMicClick=${settings.micClickEnabled ? 1 : 0}
SquelchTail=${settings.squelchTailEnabled ? 1 : 0}
SquelchTailMs=${settings.squelchTailDurationMs || 90}
PhoneticSpelling=${settings.phoneticCallsigns ? 1 : 0}
SpeechRate=${settings.speechRate.toFixed(2)}
SpeechPitch=${settings.speechPitch.toFixed(2)}
CwSpeedWPM=${settings.cwSpeedWpm || 18}
CwToneHz=${settings.cwToneHz || 750}

[Voice Alerts]
LogSocketPort=7658
BroadcastUDP=127.0.0.1:7658
${rulesConfig}

[DMR]
Enable=1
Beacons=0
BeaconInterval=60
BeaconDuration=3
ColorCode=1
SelfOnly=0

[D-Star]
Enable=1
Module=C
SelfOnly=0

[System Fusion]
Enable=1
LowDeviation=0
SelfOnly=0

[P25]
Enable=1
NAC=293
SelfOnly=0

[CW Id]
Enable=1
Time=10
Callsign=${status.repeaterCallsign || 'W1AW'}
`;
}

export function generatePythonDaemonScript(
  status: MmdvmStatus,
  settings: AudioSettings
): string {
  return `#!/usr/bin/env python3
"""
MMDVM Audio Interface Voice Alert Daemon
Monitors MMDVMHost logs/UDP broadcasts and plays voice notifications
and roger beeps directly through the connected USB/ALSA audio interface.

Reference: https://github.com/g4klx/MMDVM-Host
Dependencies: pip install pyalsaaudio pyttsx3
Usage: python3 mmdvm_audio_alert.py --alsa-device hw:1,0
"""

import sys
import re
import socket
import time
import subprocess
import argparse
import pyttsx3

# Configuration
DEFAULT_ALSA_DEVICE = "hw:1,0"  # Typically CM108 or USB audio interface
REPEATER_CALL = "${status.repeaterCallsign || 'W1AW'}"
PHONETIC_ENABLED = ${settings.phoneticCallsigns ? 'True' : 'False'}
RADIO_FILTER = ${settings.radioFilterEnabled ? 'True' : 'False'}

NATO = {
    'A': 'Alpha', 'B': 'Bravo', 'C': 'Charlie', 'D': 'Delta', 'E': 'Echo',
    'F': 'Foxtrot', 'G': 'Golf', 'H': 'Hotel', 'I': 'India', 'J': 'Juliett',
    'K': 'Kilo', 'L': 'Lima', 'M': 'Mike', 'N': 'November', 'O': 'Oscar',
    'P': 'Papa', 'Q': 'Quebec', 'R': 'Romeo', 'S': 'Sierra', 'T': 'Tango',
    'U': 'Uniform', 'V': 'Victor', 'W': 'Whiskey', 'X': 'X-ray', 'Y': 'Yankee',
    'Z': 'Zulu', '0': 'Zero', '1': 'One', '2': 'Two', '3': 'Three', '4': 'Four',
    '5': 'Five', '6': 'Six', '7': 'Seven', '8': 'Eight', '9': 'Nine'
}

def callsign_to_phonetic(call):
    return " ".join([NATO.get(c.upper(), c) for c in call])

class MMDVMAudioAnnouncer:
    def __init__(self, alsa_dev=DEFAULT_ALSA_DEVICE):
        self.alsa_dev = alsa_dev
        print(f"[*] Initializing Voice Alert Output on Audio Interface: {self.alsa_dev}")
        self.tts = pyttsx3.init()
        self.tts.setProperty('rate', int(150 * ${settings.speechRate.toFixed(2)}))
        self.tts.setProperty('volume', ${settings.volume.toFixed(2)})

    def speak(self, text):
        print(f"[VOICE ALERT] -> Audio Out: {text}")
        # Option A: Python pyttsx3 direct
        self.tts.say(text)
        self.tts.runAndWait()
        
        # Option B: Or use espeak with ALSA device routing:
        # cmd = f'espeak-ng -d alsa:{self.alsa_dev} "{text}"'
        # subprocess.run(cmd, shell=True)

    def play_roger_beep(self, style="motorola"):
        print(f"[AUDIO BEEP] Playing {style} courtesy tone on {self.alsa_dev}")
        # Uses sox or aplay to synthesize dual-tone roger beeps on the audio device
        if style == "motorola":
            cmd = f'play -q -n synth 0.05 sin 885 : synth 0.06 sin 1050 norm -6'
            try:
                subprocess.run(cmd, shell=True, timeout=1)
            except Exception:
                pass

    def handle_line(self, line):
        line = line.strip()
        if not line:
            return

        # 1. RF Voice Header (Transmission start)
        m = re.search(r'DMR, received RF header from ([A-Z0-9/]+) to (TG [0-9]+)', line)
        if m:
            call = m.group(1)
            tg = m.group(2)
            spoken_call = callsign_to_phonetic(call) if PHONETIC_ENABLED else call
            self.speak(f"Call from {spoken_call} on {tg}")
            return

        # 2. RF End of Transmission
        if "received RF end of transmission" in line:
            self.play_roger_beep("motorola")
            return

        # 3. High BER detection
        m_ber = re.search(r'BER: ([0-9.]+)%', line)
        if m_ber:
            ber_val = float(m_ber.group(1))
            if ber_val > 2.0:
                self.speak(f"Warning. High bit error rate: {ber_val} percent.")

        # 4. Mode activation
        if "YSF, connecting to" in line:
            self.speak("System Fusion connected to room.")
        elif "DMR, Voice header received" in line:
            pass

def main():
    parser = argparse.ArgumentParser(description="MMDVM Audio Voice Alert Daemon")
    parser.add_argument("--alsa-device", default=DEFAULT_ALSA_DEVICE, help="ALSA output audio device (e.g. hw:1,0)")
    parser.add_argument("--log-file", default="/var/log/pi-star/MMDVM-latest.log", help="Path to MMDVM log file to tail")
    parser.add_argument("--udp-port", type=int, default=7658, help="UDP port for MMDVM broadcast messages")
    args = parser.parse_args()

    announcer = MMDVMAudioAnnouncer(alsa_dev=args.alsa_device)
    announcer.speak("MMDVM voice alert system active on connected audio interface.")

    # UDP receiver loop
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind(("0.0.0.0", args.udp_port))
    print(f"[*] Listening for MMDVM broadcast packets on UDP port {args.udp_port}...")

    while True:
        try:
            data, _ = sock.recvfrom(2048)
            msg = data.decode('utf-8', errors='ignore')
            announcer.handle_line(msg)
        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"Error handling event: {e}", file=sys.stderr)

if __name__ == "__main__":
    main()
`;
}

/**
 * Generate Analog_Bridge.ini for DMR Talkgroup Audio Injection via USRP audio socket
 * Used by DVSwitch / MMDVM_Bridge to inject audio into DMR Talkgroups
 */
export function generateAnalogBridgeConfig(
  status: MmdvmStatus,
  targetTg: number = 91,
  slot: number = 1
): string {
  return `; ####################################################################
; # Analog_Bridge Configuration for DMR Talkgroup Audio Injection
; # Bridging PCM / USRP audio streams into DMR Talkgroup ${targetTg} (TS ${slot})
; # Reference: https://github.com/DVSwitch/Analog_Bridge
; ####################################################################

[GENERAL]
logLevel = 2                            ; 0=none, 1=errors, 2=warnings, 3=info, 4=detail
maxProgAge = 0                          ; Program run duration (0 = unlimited)

; ====================================================================
; [AMBE_AUDIO] - Encodes PCM audio into DMR AMBE+2 vocoder frames
; ====================================================================
[AMBE_AUDIO]
address = 127.0.0.1                     ; IP of md380-emu or AMBE-3000 server
port = 2470                             ; Port for software vocoder emulator
minAudioLevels = 0                      ; Log audio stats
fromAmbe = 1                            ; AMBE to PCM
toAmbe = 1                              ; PCM to AMBE

; ====================================================================
; [USRP] - Audio Socket for injecting PCM Audio Stream into Talkgroup
; Audio can be fed via ffmpeg, Python, SIP, or ALSA Line-In
; ====================================================================
[USRP]
address = 127.0.0.1
txPort = 12345                          ; Transmit USRP audio to Talkgroup
rxPort = 12346                          ; Receive DMR audio from Talkgroup
aspeex = 0                              ; 0 = Linear PCM (8kHz 16-bit mono)
usrpGain = 1.0                          ; Audio input gain multiplier

; ====================================================================
; [DMR] - Target Talkgroup & Radio ID Routing
; ====================================================================
[DMR]
callsign = ${status.repeaterCallsign || 'W1AW'}
dmrId = ${status.dmrId || '3109999'}
repeaterId = ${status.dmrId || '3109999'}
txTg = ${targetTg}                      ; Audio will be injected into this TG!
txTs = ${slot}                          ; DMR Time Slot 1 or 2
colorCode = 1
callType = 0                            ; 0 = Group Call (Talkgroup), 1 = Private Call
hangTime = 3000                         ; Call hang time in milliseconds
`;
}

/**
 * Standalone Python DMR Audio Streamer script
 * Streams audio files or TTS directly into USRP / MMDVM_Bridge for Talkgroup broadcast
 */
export function generateDmrAudioInjectorPy(
  status: MmdvmStatus,
  targetTg: number = 91,
  slot: number = 1
): string {
  return `#!/usr/bin/env python3
"""
DMR Talkgroup Audio Injector Client
Streams 8000Hz 16-bit linear PCM audio into Analog_Bridge / USRP socket
for real-time transmission into DMR Talkgroup ${targetTg} (TS ${slot}).

Requirements:
    pip install pyttsx3 soundfile numpy

Usage:
    python3 dmr_audio_injector.py --tg ${targetTg} --slot ${slot} --voice "Calling all stations on Talkgroup ${targetTg}"
    python3 dmr_audio_injector.py --tg ${targetTg} --slot ${slot} --file bulletin.wav
"""

import sys
import socket
import struct
import time
import argparse
import numpy as np

USRP_IP = "127.0.0.1"
USRP_PORT = 12345                       # Analog_Bridge USRP TX port
SAMPLE_RATE = 8000                      # DMR uses 8 kHz PCM
FRAME_SIZE = 160                        # 20ms audio frame (160 samples @ 8kHz)

def create_usrp_packet(pcm_bytes, seq=0):
    """
    Encapsulates raw 16-bit mono PCM into a standard USRP audio packet
    """
    # Header format: "USRP" (4 bytes) + Seq (4 bytes) + Memory (4 bytes) + Eye (4 bytes)
    header = struct.pack("!4sIII", b"USRP", seq, 0, 0)
    return header + pcm_bytes

def stream_pcm_to_dmr(pcm_data, ip=USRP_IP, port=USRP_PORT):
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    total_samples = len(pcm_data)
    num_frames = total_samples // FRAME_SIZE
    
    print(f"[*] Transmitting {num_frames} audio frames ({num_frames * 0.02:.1f}s) to DMR USRP at {ip}:{port}...")

    # Key up PTT
    seq = 0
    start_time = time.time()

    for i in range(0, total_samples - FRAME_SIZE, FRAME_SIZE):
        chunk = pcm_data[i:i + FRAME_SIZE]
        packet = create_usrp_packet(chunk.tobytes(), seq)
        sock.sendto(packet, (ip, port))
        seq += 1

        # Real-time pacing: 20ms per DMR AMBE frame
        expected_time = start_time + (seq * 0.020)
        delay = expected_time - time.time()
        if delay > 0:
            time.sleep(delay)

    print("[+] Audio injection into DMR Talkgroup complete. Unkeyed PTT.")
    sock.close()

def main():
    parser = argparse.ArgumentParser(description="DMR Talkgroup Audio Injector")
    parser.add_argument("--tg", type=int, default=${targetTg}, help="Target DMR Talkgroup ID")
    parser.add_argument("--slot", type=int, default=${slot}, choices=[1, 2], help="DMR Time Slot")
    parser.add_argument("--voice", type=str, help="Text string to speak via TTS into Talkgroup")
    parser.add_argument("--file", type=str, help="Path to WAV audio file to transmit")
    args = parser.parse_args()

    if args.voice:
        import pyttsx3
        import wave
        print(f"[*] Generating TTS audio for DMR TG {args.tg}: '{args.voice}'")
        engine = pyttsx3.init()
        engine.save_to_file(args.voice, "/tmp/dmr_temp.wav")
        engine.runAndWait()
        args.file = "/tmp/dmr_temp.wav"

    if args.file:
        import soundfile as sf
        print(f"[*] Loading audio file: {args.file}")
        data, sr = sf.read(args.file)
        # Convert stereo to mono if needed
        if len(data.shape) > 1:
            data = data.mean(axis=1)
        # Resample to 8000Hz for DMR vocoder
        if sr != SAMPLE_RATE:
            num_resampled = int(len(data) * SAMPLE_RATE / sr)
            data = np.interp(
                np.linspace(0, len(data), num_resampled),
                np.arange(len(data)),
                data
            )
        # Normalize and convert to 16-bit PCM integer
        pcm_16 = np.int16(data / np.max(np.abs(data)) * 32767 * 0.8)
        stream_pcm_to_dmr(pcm_16)
    else:
        print("Please specify --voice 'text' or --file audio.wav")

if __name__ == "__main__":
    main()
`;
}

