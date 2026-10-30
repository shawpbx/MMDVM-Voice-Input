import React, { useState } from 'react';
import { Volume2, Play, Music, Radio, Sparkles, Sliders } from 'lucide-react';
import { AudioSettings, RogerBeepType } from '../types/mmdvm';
import { audioEngine } from '../services/audioEngine';

interface RogerBeepDesignerProps {
  settings: AudioSettings;
  setSettings: React.Dispatch<React.SetStateAction<AudioSettings>>;
  repeaterCallsign: string;
}

export const RogerBeepDesigner: React.FC<RogerBeepDesignerProps> = ({
  settings,
  setSettings,
  repeaterCallsign,
}) => {
  const [playingBeep, setPlayingBeep] = useState<string | null>(null);
  const [cwText, setCwText] = useState(`DE ${repeaterCallsign || 'W1AW'}/R`);
  const [isPlayingCw, setIsPlayingCw] = useState(false);

  // Custom dual tone testing
  const [customTone1, setCustomTone1] = useState(880);
  const [customTone2, setCustomTone2] = useState(1200);
  const [customDur, setCustomDur] = useState(60);

  const beeps: {
    type: RogerBeepType;
    name: string;
    description: string;
    frequencies: string;
  }[] = [
    {
      type: 'motorola_classic',
      name: 'Motorola Dual Tone',
      description: 'Classic commercial repeater roger beep with two sequential punchy tones',
      frequencies: '885 Hz (50ms) -> 1050 Hz (60ms)',
    },
    {
      type: 'kenwood_courtesy',
      name: 'Kenwood Courtesy Tone',
      description: 'High-pitch clean tone typical of amateur VHF/UHF repeaters',
      frequencies: '1750 Hz (75ms)',
    },
    {
      type: 'nasa_quindar',
      name: 'NASA Apollo Quindar Tone',
      description: 'Historic NASA space communication intro/outro signalling tone',
      frequencies: '2525 Hz (180ms)',
    },
    {
      type: 'pistar_chime',
      name: 'Pi-Star Digital Chime',
      description: 'Pleasant ascending two-note chime used on modern digital hotspots',
      frequencies: '660 Hz -> 880 Hz',
    },
    {
      type: 'dual_tone_burst',
      name: 'Dual Tone Burst (DTMF)',
      description: 'Simultaneous dual frequency burst mimicking telecom signaling',
      frequencies: '1209 Hz + 697 Hz',
    },
    {
      type: 'soft_chirp',
      name: 'Soft Chirp',
      description: 'Exponential pitch sweep for subtle repeater unkeying',
      frequencies: '1200 Hz down to 750 Hz',
    },
  ];

  const handlePlayBeep = async (type: RogerBeepType) => {
    setPlayingBeep(type);
    await audioEngine.playRogerBeep(type);
    setPlayingBeep(null);
  };

  const handlePlayCw = async () => {
    setIsPlayingCw(true);
    await audioEngine.playMorseBeacon(cwText, settings.cwSpeedWpm, settings.cwToneHz);
    setIsPlayingCw(false);
  };

  const handlePlayCustom = async () => {
    setPlayingBeep('custom');
    await audioEngine.playTone(customTone1, customDur / 1000, 'sine', 0.35);
    await new Promise((r) => setTimeout(r, 20));
    await audioEngine.playTone(customTone2, customDur / 1000, 'sine', 0.35);
    setPlayingBeep(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <Music className="w-4 h-4 text-amber-400" />
              Repeater Courtesy Tones & Roger Beeps
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Acoustic signaling tones played directly across the audio interface at the end of digital voice transmissions
            </p>
          </div>
        </div>

        {/* Beep Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-4">
          {beeps.map((b) => {
            const isPlaying = playingBeep === b.type;
            return (
              <div
                key={b.type}
                className="bg-slate-950/70 border border-slate-800 hover:border-slate-700 rounded-lg p-4 flex flex-col justify-between transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-100">
                      {b.name}
                    </span>
                    <button
                      onClick={() => handlePlayBeep(b.type)}
                      disabled={isPlaying}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-950 bg-amber-400 hover:bg-amber-300 rounded transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Play className={`w-3 h-3 ${isPlaying ? 'animate-spin' : ''}`} />
                      <span>{isPlaying ? 'Playing' : 'Audition'}</span>
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                    {b.description}
                  </p>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-900 text-[11px] font-mono text-cyan-400">
                  {b.frequencies}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2-Column: CW Morse ID Beacon Generator & Custom Tone Synthesizer */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: Morse Code CW ID Beacon */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-slate-100">
                Morse Code (CW) Station ID Synthesizer
              </h3>
            </div>
          </div>

          <p className="text-xs text-slate-400">
            Complies with amateur radio station identification regulations (FCC Part 97 / IARU) by transmitting CW audio beacons across the connected interface.
          </p>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Station Beacon Text
            </label>
            <input
              type="text"
              value={cwText}
              onChange={(e) => setCwText(e.target.value.toUpperCase())}
              placeholder="DE W1AW/R"
              className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-amber-500 uppercase"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>Speed</span>
                <span className="font-mono tabular-nums text-slate-200">
                  {settings.cwSpeedWpm} WPM
                </span>
              </div>
              <input
                type="range"
                min="12"
                max="28"
                step="1"
                value={settings.cwSpeedWpm}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    cwSpeedWpm: parseInt(e.target.value),
                  }))
                }
                className="w-full accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>Tone Pitch</span>
                <span className="font-mono tabular-nums text-slate-200">
                  {settings.cwToneHz} Hz
                </span>
              </div>
              <input
                type="range"
                min="500"
                max="950"
                step="25"
                value={settings.cwToneHz}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    cwToneHz: parseInt(e.target.value),
                  }))
                }
                className="w-full accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>
          </div>

          <button
            onClick={handlePlayCw}
            disabled={isPlayingCw}
            className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 rounded-md text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            <Play className={`w-3.5 h-3.5 ${isPlayingCw ? 'animate-spin text-amber-400' : ''}`} />
            <span>{isPlayingCw ? 'Transmitting Morse Code...' : 'Transmit CW ID Beacon'}</span>
          </button>
        </div>

        {/* Right: Custom Dual-Tone Courtesy Tone Synthesizer */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-slate-100">
                Custom Courtesy Tone Synthesizer
              </h3>
            </div>
          </div>

          <p className="text-xs text-slate-400">
            Design your own dual-frequency repeater courtesy tone signature with customizable frequencies and note durations.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>Tone 1 Frequency</span>
                <span className="font-mono tabular-nums text-slate-200">
                  {customTone1} Hz
                </span>
              </div>
              <input
                type="range"
                min="400"
                max="2500"
                step="20"
                value={customTone1}
                onChange={(e) => setCustomTone1(parseInt(e.target.value))}
                className="w-full accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>Tone 2 Frequency</span>
                <span className="font-mono tabular-nums text-slate-200">
                  {customTone2} Hz
                </span>
              </div>
              <input
                type="range"
                min="400"
                max="2500"
                step="20"
                value={customTone2}
                onChange={(e) => setCustomTone2(parseInt(e.target.value))}
                className="w-full accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>Tone Note Duration</span>
              <span className="font-mono tabular-nums text-slate-200">
                {customDur} ms
              </span>
            </div>
            <input
              type="range"
              min="30"
              max="150"
              step="5"
              value={customDur}
              onChange={(e) => setCustomDur(parseInt(e.target.value))}
              className="w-full accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>

          <button
            onClick={handlePlayCustom}
            disabled={playingBeep === 'custom'}
            className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 rounded-md text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            <Play className={`w-3.5 h-3.5 ${playingBeep === 'custom' ? 'animate-spin text-amber-400' : ''}`} />
            <span>{playingBeep === 'custom' ? 'Playing...' : 'Audition Custom Courtesy Tone'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
