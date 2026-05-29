"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Browser speech-to-text via the Web Speech API. Lets a rider dictate a
 * route request — "create me a two hour ride with a few rolling hills and
 * quiet lanes" — instead of typing. Free, on-device, no server round-trip.
 *
 * Support is good on Chrome/Edge/Safari; absent on Firefox. Callers should
 * check `supported` and fall back to the textarea.
 */

// The Web Speech API isn't in the TS DOM lib by default.
interface SpeechRecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface VoiceInput {
  supported: boolean;
  listening: boolean;
  error: string | null;
  /** Begin listening. `onTranscript` fires with the running transcript. */
  start: (onTranscript: (text: string) => void) => void;
  stop: () => void;
}

export function useVoiceInput(lang = "en-IE"): VoiceInput {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseTextRef = useRef("");

  useEffect(() => {
    setSupported(getRecognitionCtor() !== null);
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(
    (onTranscript: (text: string) => void) => {
      const Ctor = getRecognitionCtor();
      if (!Ctor) {
        setError("Voice input isn't supported in this browser.");
        return;
      }

      const recognition = new Ctor();
      recognition.lang = lang;
      recognition.continuous = true;
      recognition.interimResults = true;
      baseTextRef.current = "";

      recognition.onresult = (e) => {
        let transcript = "";
        for (let i = 0; i < e.results.length; i++) {
          transcript += e.results[i][0].transcript;
        }
        onTranscript(transcript.trim());
      };

      recognition.onerror = (e) => {
        if (e.error === "no-speech" || e.error === "aborted") return;
        setError(
          e.error === "not-allowed"
            ? "Microphone access was blocked. Allow it in your browser settings."
            : `Voice input error: ${e.error}`
        );
        setListening(false);
      };

      recognition.onend = () => setListening(false);

      recognitionRef.current = recognition;
      setError(null);
      setListening(true);
      recognition.start();
    },
    [lang]
  );

  return { supported, listening, error, start, stop };
}
