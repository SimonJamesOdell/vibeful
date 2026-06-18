// Voice Input — speech-to-text via Web Speech API (browser-native)
import React, { useState, useRef, useCallback } from 'react';

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

export function VoiceInput({ onTranscript, disabled }: VoiceInputProps) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const recognitionRef = useRef<any>(null);

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser. Use Chrome or Edge.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      if (event.results[0]?.isFinal) {
        onTranscript(transcript);
        setListening(false);
        setInterim('');
      } else {
        setInterim(transcript);
      }
    };

    recognition.onerror = () => {
      setListening(false);
      setInterim('');
    };

    recognition.onend = () => {
      setListening(false);
      if (!interim) setInterim('');
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [onTranscript, interim]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
      <button
        onClick={listening ? stopListening : startListening}
        disabled={disabled}
        title={listening ? 'Stop listening' : 'Start voice input'}
        style={{
          width: '36px', height: '36px', borderRadius: '50%', border: 'none',
          background: listening ? '#ef4444' : 'var(--vibeful-send-bg, #2563eb)',
          color: '#fff', cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1rem', opacity: disabled ? 0.5 : 1,
        }}
      >
        {listening ? '⏹' : '🎤'}
      </button>
      {interim && (
        <span style={{ fontSize: '0.8rem', color: '#999', fontStyle: 'italic', maxWidth: '200px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
          {interim}
        </span>
      )}
    </div>
  );
}
