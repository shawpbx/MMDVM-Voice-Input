import React, { useState } from 'react';
import {
  Bell,
  Play,
  RotateCcw,
  Sliders,
  Plus,
  Radio,
  AlertTriangle,
  RadioTower,
  Cpu,
} from 'lucide-react';
import { AlertRule, AudioSettings, RogerBeepType } from '../types/mmdvm';
import { audioEngine } from '../services/audioEngine';
import { callsignToPhonetic } from '../services/phonetics';

interface VoiceAlertMatrixProps {
  rules: AlertRule[];
  setRules: React.Dispatch<React.SetStateAction<AlertRule[]>>;
  settings: AudioSettings;
  repeaterCallsign: string;
}

export const VoiceAlertMatrix: React.FC<VoiceAlertMatrixProps> = ({
  rules,
  setRules,
  settings,
  repeaterCallsign,
}) => {
  const [filter, setFilter] = useState<'all' | 'system' | 'traffic' | 'alarm' | 'beacon'>('all');
  const [testingId, setTestingId] = useState<string | null>(null);

  const rogerBeepOptions: { value: RogerBeepType; label: string }[] = [
    { value: 'none', label: 'None' },
    { value: 'motorola_classic', label: 'Motorola Dual Tone' },
    { value: 'kenwood_courtesy', label: 'Kenwood 1750 Hz' },
    { value: 'nasa_quindar', label: 'NASA Quindar (2525 Hz)' },
    { value: 'pistar_chime', label: 'Pi-Star Ascending Chime' },
    { value: 'dual_tone_burst', label: 'Dual Tone Burst' },
    { value: 'soft_chirp', label: 'Soft Chirp' },
  ];

  const handleToggle = (id: string) => {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r))
    );
  };

  const handleTemplateChange = (id: string, text: string) => {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, voiceTemplate: text } : r))
    );
  };

  const handleBeepChange = (id: string, beep: RogerBeepType) => {
    setRules((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              beepType: beep,
              playRogerBeep: beep !== 'none',
            }
          : r
      )
    );
  };

  const testRule = async (rule: AlertRule) => {
    setTestingId(rule.id);

    // Format sample variables
    const sampleCall = 'K1ABC';
    const spokenCall = settings.phoneticCallsigns
      ? callsignToPhonetic(sampleCall)
      : sampleCall;

    let text = rule.voiceTemplate
      .replace('{callsign}', spokenCall)
      .replace('{talkgroup}', 'Talkgroup 91 Worldwide')
      .replace('{mode}', 'DMR')
      .replace('{ber}', '3.4')
      .replace('{temperature}', '58')
      .replace('{time}', '1600')
      .replace('{port}', '/dev/ttyACM0');

    if (rule.id === 'cw_id') {
      await audioEngine.playMorseBeacon(
        `DE ${repeaterCallsign || 'W1AW'}/R`,
        settings.cwSpeedWpm,
        settings.cwToneHz
      );
    } else {
      await audioEngine.triggerNotification(text, settings, rule.beepType || 'none');
    }

    setTestingId(null);
  };

  const filteredRules = rules.filter((r) =>
    filter === 'all' ? true : r.category === filter
  );

  return (
    <div className="space-y-6">
      {/* Header with Category Filter Buttons */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-400" />
              MMDVM Event Voice Alert Matrix
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Configure spoken notifications, variables, and courtesy tones dispatched to the connected audio interface
            </p>
          </div>

          {/* Interactive filter tabs (functional buttons) */}
          <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg shrink-0">
            {(
              [
                { id: 'all', label: 'All Rules' },
                { id: 'system', label: 'System' },
                { id: 'traffic', label: 'Traffic' },
                { id: 'alarm', label: 'Alarms' },
                { id: 'beacon', label: 'Beacons' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  filter === tab.id
                    ? 'bg-slate-800 text-amber-400 font-semibold shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Legend of Variables */}
        <div className="mt-3 text-xs text-slate-400 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="text-slate-300 font-medium">Available Template Tokens:</span>
          <code className="text-amber-400/90 bg-slate-950 px-1 py-0.5 rounded border border-slate-800">
            {'{callsign}'}
          </code>
          <code className="text-amber-400/90 bg-slate-950 px-1 py-0.5 rounded border border-slate-800">
            {'{talkgroup}'}
          </code>
          <code className="text-amber-400/90 bg-slate-950 px-1 py-0.5 rounded border border-slate-800">
            {'{mode}'}
          </code>
          <code className="text-amber-400/90 bg-slate-950 px-1 py-0.5 rounded border border-slate-800">
            {'{ber}'}
          </code>
          <code className="text-amber-400/90 bg-slate-950 px-1 py-0.5 rounded border border-slate-800">
            {'{temperature}'}
          </code>
          <code className="text-amber-400/90 bg-slate-950 px-1 py-0.5 rounded border border-slate-800">
            {'{time}'}
          </code>
        </div>
      </div>

      {/* Rules Table / Cards */}
      <div className="space-y-3">
        {filteredRules.map((rule) => {
          const isTesting = testingId === rule.id;
          return (
            <div
              key={rule.id}
              className={`bg-slate-900/80 border rounded-lg p-4 transition-colors ${
                rule.enabled
                  ? 'border-slate-800 hover:border-slate-700'
                  : 'border-slate-800/40 opacity-70'
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                {/* Left: Title, Category, Toggle */}
                <div className="flex items-start gap-3 min-w-[240px]">
                  <label className="relative inline-flex items-center cursor-pointer mt-0.5">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={() => handleToggle(rule.id)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                  </label>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-100">
                        {rule.label}
                      </span>
                    </div>
                    {/* Unboxed metadata without pills (§1.A Zero-Pill discipline) */}
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5 font-mono">
                      <span>Category: {rule.category}</span>
                      <span aria-hidden="true">·</span>
                      <span>Priority: {rule.priority}</span>
                      <span aria-hidden="true">·</span>
                      <span>Cooldown: {rule.cooldownSeconds}s</span>
                    </div>
                  </div>
                </div>

                {/* Center: Template text input */}
                <div className="flex-1">
                  <div className="relative">
                    <input
                      type="text"
                      disabled={!rule.enabled}
                      value={rule.voiceTemplate}
                      onChange={(e) => handleTemplateChange(rule.id, e.target.value)}
                      placeholder={
                        rule.id === 'cw_id'
                          ? 'Generates audio CW Morse code'
                          : 'No voice message (tone only)'
                      }
                      className="w-full bg-slate-950 border border-slate-700/80 rounded-md px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-500 disabled:bg-slate-900 disabled:text-slate-600"
                    />
                  </div>
                </div>

                {/* Right: Roger Beep selector & Test Trigger Button */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className="w-40">
                    <select
                      disabled={!rule.enabled}
                      value={rule.beepType || 'none'}
                      onChange={(e) =>
                        handleBeepChange(rule.id, e.target.value as RogerBeepType)
                      }
                      className="w-full bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-amber-500 disabled:text-slate-600"
                    >
                      {rogerBeepOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={() => testRule(rule)}
                    disabled={isTesting}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    <Play className={`w-3.5 h-3.5 ${isTesting ? 'text-amber-400 animate-spin' : 'text-slate-400'}`} />
                    <span>{isTesting ? 'Playing...' : 'Test'}</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
