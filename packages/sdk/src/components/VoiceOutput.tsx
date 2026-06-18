// Voice Output — text-to-speech using Web Speech API
import React, { useState, useRef, useCallback } from 'react';

interface VoiceOutputProps {
  text: string;
  disabled?: boolean;
  autoSpeak?: boolean;
}

export function VoiceOutput({ text, disabled, autoSpeak }: VoiceOutputProps) {
  const [speaking, setSpeaking] = useState(false);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  const speak = useCallback(() => {
    if (!text || disabled) return;
    const synth = window.speechSynthesis;
    if (synth.speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    synth.speak(utterance);
    synthRef.current = synth;
  }, [text, disabled]);

  if (!text) return null;

  return (
    <button
      onClick={speak}
      disabled={disabled}
      title={speaking ? 'Stop speaking' : 'Read aloud'}
      style={{
        width: '32px', height: '32px', borderRadius: '50%', border: 'none',
        background: speaking ? '#ef4444' : '#f3f4f6',
        color: speaking ? '#fff' : '#666', cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.9rem', opacity: disabled ? 0.5 : 1,
      }}
    >
      {speaking ? '⏹' : '🔊'}
    </button>
  );
}
