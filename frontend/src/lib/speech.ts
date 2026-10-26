export interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
export type RecognitionConstructor = new () => Recognition;
export type RecognitionEvent = {
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

export function speechConstructor(): RecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const browser = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return browser.SpeechRecognition || browser.webkitSpeechRecognition;
}

export function createSpeechSession(
  Constructor: RecognitionConstructor,
  language: string,
  callbacks: {
    transcript: (final: string, interim: string) => void;
    error: (message: string) => void;
    end: () => void;
  },
) {
  const recognition = new Constructor();
  recognition.lang = language;
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.onresult = (event) => {
    const final: string[] = [],
      interim: string[] = [];
    // Results are cumulative: replace the session transcript instead of appending duplicates.
    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i];
      (result.isFinal ? final : interim).push(result[0].transcript.trim());
    }
    callbacks.transcript(final.join(" "), interim.join(" "));
  };
  recognition.onerror = ({ error }) => {
    const messages: Record<string, string> = {
      "not-allowed":
        "Microphone permission was denied. Allow it in your browser or type your message.",
      "service-not-allowed":
        "Your browser does not allow this speech service. You can still type.",
      "audio-capture": "No microphone is available. Check your input device.",
      "no-speech": "No speech detected. Try again or type your message.",
      network:
        "The browser speech service could not connect. Try again or type.",
      "language-not-supported":
        "This speech language is not supported by your browser.",
    };
    if (error !== "aborted")
      callbacks.error(
        messages[error] || "Speech recognition stopped. Try again or type.",
      );
  };
  recognition.onend = callbacks.end;
  return {
    start() {
      try {
        recognition.start();
      } catch {
        callbacks.error(
          "Could not start speech recognition. Check browser permissions.",
        );
        callbacks.end();
      }
    },
    stop() {
      recognition.stop();
    },
    dispose() {
      recognition.onresult = recognition.onerror = recognition.onend = null;
      recognition.abort();
    },
  };
}
