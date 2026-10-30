import React, { useState, useEffect } from 'react';
import {
  Volume2,
  Speaker,
  Sliders,
  Radio,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  Zap,
} from 'lucide-react';
import { AudioDevice, AudioSettings } from '../types/mmdvm';
import { audioEngine } from '../services/audioEngine';

interface AudioDeviceManagerProps {
  settings: AudioSettings;
  setSettings: React.Dispatch<React.SetStateAction<AudioSettings>>;
  devices: AudioDevice[];
  refreshDevices: () => Promise<void>;
  onTriggerTestAlert: () => void;
}

export const AudioDeviceManager: React.FC<AudioDeviceManagerProps> = ({
  settings,
  setSettings,
  devices,
  refreshDevices,
  onTriggerTestAlert,
}) => {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPlayingTestTone, setIsPlayingTestTone] = useState(false);
  const [activeTest, setActiveTest] = useState<string | null>(null);

  useEffect(() => {
    const loadVoices = () => {
      const v = audioEngine.getVoices();
      setVoices(v);
      if (!settings.selectedVoiceURI && v.length > 0) {
        // Find English voice or default
        const enVoice = v.find((voice) => voice.lang.startsWith('en')) || v[0];
        setSettings((prev) => ({ ...prev, selectedVoiceURI: enVoice.voiceURI }));
      }
    };

    loadVoices();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, [settings.selectedVoiceURI, setSettings]);

  const handleDeviceChange = async (deviceId: string) => {
    setSettings((prev) => ({ ...prev, selectedDeviceId: deviceId }));
    await audioEngine.setAudioOutputDevice(deviceId);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshDevices();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleTestTone = async (freq = 1000) => {
    setIsPlayingTestTone(true);
    setActiveTest(`tone_${freq}`);
    await audioEngine.playTone(freq, 0.75, 'sine', 0.4);
    setIsPlayingTestTone(false);
    setActiveTest(null);
  };

  const handleTestSquelch = async () => {
    setActiveTest('squelch');
    await audioEngine.playSquelchTail(settings.squelchTailDurationMs);
    setActiveTest(null);
  };

  const handleTestMicClick = async () => {
    setActiveTest('click');
    await audioEngine.playMicClick();
    setActiveTest(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Card: Audio Output Interface Selector */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <Speaker className="w-4 h-4 text-amber-400" />
              Connected Audio Output Interface
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Select the physical soundcard or USB interface (e.g. CM108, radio discriminator, DAC, or default audio device)
            </p>
          </div>

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-md border border-slate-700 transition-colors cursor-pointer w-fit"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Scan Interfaces</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-5">
          <div className="md:col-span-2 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Target Audio Interface (Sink ID)
              </label>
              <select
                value={settings.selectedDeviceId}
                onChange={(e) => handleDeviceChange(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-md px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
              >
                {devices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Device ${device.deviceId.slice(0, 10)}...`}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2 mt-2 text-xs text-slate-400 font-mono">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Status: Interface active and ready for low-latency transmission</span>
              </div>
            </div>

            {/* Volume Control */}
            <div>
              <div className="flex items-center justify-between text-xs text-slate-300 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                  Alert Master Volume
                </span>
                <span className="font-mono tabular-nums text-slate-200 font-medium">
                  {Math.round(settings.volume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={settings.volume}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    volume: parseFloat(e.target.value),
                  }))
                }
                className="w-full accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>
          </div>

          {/* Quick Hardware Diagnostic Bar */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-md p-3.5 space-y-2.5 text-xs">
            <span className="text-slate-300 font-medium block border-b border-slate-800/80 pb-1.5">
              Interface Diagnostics
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleTestTone(1000)}
                disabled={isPlayingTestTone}
                className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded text-slate-300 transition-colors text-left flex items-center justify-between cursor-pointer"
              >
                <span>1 kHz Tone</span>
                {activeTest === 'tone_1000' && <Zap className="w-3 h-3 text-amber-400 animate-pulse" />}
              </button>
              <button
                onClick={() => handleTestTone(1750)}
                disabled={isPlayingTestTone}
                className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded text-slate-300 transition-colors text-left flex items-center justify-between cursor-pointer"
              >
                <span>1750 Hz Tone</span>
                {activeTest === 'tone_1750' && <Zap className="w-3 h-3 text-amber-400 animate-pulse" />}
              </button>
              <button
                onClick={handleTestMicClick}
                className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded text-slate-300 transition-colors text-left flex items-center justify-between cursor-pointer"
              >
                <span>PTT Click</span>
                {activeTest === 'click' && <Zap className="w-3 h-3 text-amber-400 animate-pulse" />}
              </button>
              <button
                onClick={handleTestSquelch}
                className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded text-slate-300 transition-colors text-left flex items-center justify-between cursor-pointer"
              >
                <span>Squelch Tail</span>
                {activeTest === 'squelch' && <Zap className="w-3 h-3 text-amber-400 animate-pulse" />}
              </button>
            </div>
            <button
              onClick={onTriggerTestAlert}
              className="w-full mt-1 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded font-medium transition-colors text-center cursor-pointer"
            >
              Play Full Voice Test Alert
            </button>
          </div>
        </div>
      </div>

      {/* Grid: Radio Acoustics & Speech Synthesis Tuning */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column: Radio Acoustic Processing */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
            <Radio className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-slate-100">
              Radio Acoustic Filter & Effects
            </h3>
          </div>

          {/* Bandpass filter toggle */}
          <div className="flex items-start justify-between gap-4 py-1.5">
            <div>
              <span className="text-xs font-medium text-slate-200 block">
                300 Hz – 3.2 kHz Transceiver Bandpass
              </span>
              <p className="text-xs text-slate-400 mt-0.5">
                Simulates standard ham radio communications audio response by cutting low rumblings and ultra-high hiss.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.radioFilterEnabled}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    radioFilterEnabled: e.target.checked,
                  }))
                }
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>

          {/* Squelch Tail toggle */}
          <div className="flex items-start justify-between gap-4 py-1.5 border-t border-slate-800/80">
            <div>
              <span className="text-xs font-medium text-slate-200 block">
                Repeater Squelch Tail Burst
              </span>
              <p className="text-xs text-slate-400 mt-0.5">
                Injects an authentic VHF/UHF squelch noise burst at the conclusion of speech alerts.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.squelchTailEnabled}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    squelchTailEnabled: e.target.checked,
                  }))
                }
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>

          {/* Squelch Tail Duration */}
          {settings.squelchTailEnabled && (
            <div className="pl-2 border-l-2 border-amber-500/40 space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Burst Duration</span>
                <span className="font-mono tabular-nums text-slate-200">
                  {settings.squelchTailDurationMs} ms
                </span>
              </div>
              <input
                type="range"
                min="40"
                max="250"
                step="10"
                value={settings.squelchTailDurationMs}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    squelchTailDurationMs: parseInt(e.target.value),
                  }))
                }
                className="w-full accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>
          )}

          {/* Mic click toggle */}
          <div className="flex items-start justify-between gap-4 py-1.5 border-t border-slate-800/80">
            <div>
              <span className="text-xs font-medium text-slate-200 block">
                PTT Key-Up Mic Click
              </span>
              <p className="text-xs text-slate-400 mt-0.5">
                Plays a mechanical transient switch click before initiating speech.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.micClickEnabled}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    micClickEnabled: e.target.checked,
                  }))
                }
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>
        </div>

        {/* Right Column: Speech Synthesis Configuration */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
            <Sliders className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-slate-100">
              Voice Annunciation & Pronunciation
            </h3>
          </div>

          {/* Voice selector */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Synthesizer Voice Profile
            </label>
            <select
              value={settings.selectedVoiceURI}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  selectedVoiceURI: e.target.value,
                }))
              }
              className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            >
              {voices.map((voice) => (
                <option key={voice.voiceURI} value={voice.voiceURI}>
                  {voice.name} ({voice.lang})
                </option>
              ))}
            </select>
          </div>

          {/* NATO phonetic callsigns */}
          <div className="flex items-start justify-between gap-4 py-1.5 border-t border-slate-800/80">
            <div>
              <span className="text-xs font-medium text-slate-200 block">
                Phonetic Call-Sign Pronunciation
              </span>
              <p className="text-xs text-slate-400 mt-0.5">
                Spells amateur radio callsigns using NATO phonetic alphabet (e.g. &ldquo;Whiskey One Alpha Whiskey&rdquo;).
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.phoneticCallsigns}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    phoneticCallsigns: e.target.checked,
                  }))
                }
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>

          {/* Speech Rate */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>Speech Rate (Speed)</span>
              <span className="font-mono tabular-nums text-slate-200">
                {settings.speechRate.toFixed(2)}x
              </span>
            </div>
            <input
              type="range"
              min="0.75"
              max="1.4"
              step="0.05"
              value={settings.speechRate}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  speechRate: parseFloat(e.target.value),
                }))
              }
              className="w-full accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>

          {/* Speech Pitch */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>Voice Pitch</span>
              <span className="font-mono tabular-nums text-slate-200">
                {settings.speechPitch.toFixed(2)}x
              </span>
            </div>
            <input
              type="range"
              min="0.7"
              max="1.3"
              step="0.05"
              value={settings.speechPitch}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  speechPitch: parseFloat(e.target.value),
                }))
              }
              className="w-full accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
