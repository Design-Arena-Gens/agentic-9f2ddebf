'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence?: number;
}

interface SpeechRecognitionResult {
  readonly 0: SpeechRecognitionAlternative;
  readonly isFinal: boolean;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResult[];
}

interface SpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives?: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: Event) => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

type Role = "user" | "assistant";

interface Message {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
}

interface StatusFlags {
  listening: boolean;
  speaking: boolean;
}

const INITIAL_MESSAGES: Message[] = [
  {
    id: "assistant-welcome",
    role: "assistant",
    content: "Hi. I'm here with you. Whenever you're ready, tell me what's on your mind.",
    createdAt: Date.now(),
  },
];

const createMessage = (role: Role, content: string): Message => ({
  id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  role,
  content,
  createdAt: Date.now(),
});

const calmPalette = {
  assistant: "bg-slate-800/80 border border-white/10",
  user: "bg-cyan-500/20 border border-cyan-400/40",
};

const EmotionKeywords = {
  stress: [
    "stress",
    "stressed",
    "overwhelm",
    "overwhelmed",
    "anxious",
    "anxiety",
    "pressure",
    "worried",
    "panic",
  ],
  confusion: [
    "confused",
    "unclear",
    "not sure",
    "don't know",
    "lost",
    "unsure",
    "uncertain",
  ],
  decision: [
    "decide",
    "decision",
    "choose",
    "choice",
    "pick",
    "options",
    "option",
    "vs",
    "versus",
    "tradeoff",
    "trade-off",
  ],
  planning: [
    "plan",
    "timeline",
    "schedule",
    "organize",
    "next step",
    "roadmap",
    "map",
    "arrange",
  ],
  blockers: [
    "stuck",
    "blocked",
    "can't",
    "cannot",
    "problem",
    "issue",
    "barrier",
    "hangup",
  ],
  timeline: [
    "today",
    "tonight",
    "tomorrow",
    "deadline",
    "due",
    "week",
    "soon",
    "urgent",
    "rush",
  ],
  assumptions: [
    "obviously",
    "clearly",
    "must be",
    "has to",
    "no way",
    "always",
    "never",
  ],
};

const normalize = (value: string) => value.trim().toLowerCase();

const containsKeyword = (haystack: string, needles: string[]) =>
  needles.some((needle) => haystack.includes(needle));

const generateResponse = (userMessage: string, history: Message[]): string => {
  const text = normalize(userMessage);
  const stressed = containsKeyword(text, EmotionKeywords.stress);
  const confused = containsKeyword(text, EmotionKeywords.confusion);
  const decisionFocused = containsKeyword(text, EmotionKeywords.decision);
  const planningFocused = containsKeyword(text, EmotionKeywords.planning);
  const blockerPresent = containsKeyword(text, EmotionKeywords.blockers);
  const underDeadline = containsKeyword(text, EmotionKeywords.timeline);
  const assumptionFlag = containsKeyword(text, EmotionKeywords.assumptions);

  const isQuestion = /\?|^\s*(how|what|why|should|could|would|when|where|is|are|do|does|can)\b/.test(
    userMessage.toLowerCase(),
  );

  const sentences: string[] = [];

  if (stressed) {
    sentences.push("I can hear the pressure in that.");
  } else if (confused) {
    sentences.push("Alright, let's bring this into focus.");
  } else {
    sentences.push("Thanks for trusting me with that.");
  }

  if (decisionFocused) {
    sentences.push("Let's line up the real choices and weigh what matters most.");
  } else if (planningFocused) {
    sentences.push("We can map the next steps so each one feels manageable.");
  } else if (blockerPresent) {
    sentences.push("We'll isolate the blocker and loosen it one piece at a time.");
  } else if (isQuestion) {
    sentences.push("We'll reason through it so you can move forward with confidence.");
  } else {
    sentences.push("We'll walk through this steadily and keep it grounded.");
  }

  if (assumptionFlag) {
    sentences.push("If any assumption feels shaky, we'll test it instead of leaning on it.");
  }

  if (underDeadline) {
    sentences.push("We'll keep an eye on timing so clarity and pace move together.");
  }

  const needsClarifier =
    confused ||
    (!isQuestion && !decisionFocused && !planningFocused && history.filter((m) => m.role === "user").length === 1);

  let followUp = "What part would you like us to untangle first?";

  if (decisionFocused) {
    followUp = "Which outcome matters most for you right now?";
  } else if (planningFocused) {
    followUp = "What's the next step that would make everything else easier?";
  } else if (blockerPresent) {
    followUp = "What's the single snag that feels heaviest at this moment?";
  } else if (isQuestion) {
    followUp = "What facts do we already have that can anchor the answer?";
  }

  if (needsClarifier) {
    sentences.push(followUp);
  } else if (!sentences[sentences.length - 1].endsWith("?")) {
    sentences.push(followUp);
  }

  return sentences.join(" ");
};

const StatusChip = ({ label, active }: { label: string; active: boolean }) => (
  <span
    className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium tracking-wide transition-colors ${
      active ? "bg-cyan-500/20 text-cyan-200" : "bg-white/5 text-slate-400"
    }`}
  >
    <span
      className={`h-2 w-2 rounded-full ${active ? "bg-cyan-300" : "bg-slate-500"}`}
      aria-hidden
    />
    {label}
  </span>
);

const MessageBubble = ({ message }: { message: Message }) => (
  <li className={`flex w-full ${message.role === "user" ? "justify-end" : "justify-start"}`}>
    <div
      className={`max-w-xl rounded-2xl px-5 py-4 text-sm leading-relaxed shadow-lg backdrop-blur ${
        message.role === "assistant" ? calmPalette.assistant : calmPalette.user
      }`}
    >
      <p className="whitespace-pre-line text-slate-100">{message.content}</p>
    </div>
  </li>
);

export default function Home() {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [listeningTranscript, setListeningTranscript] = useState("");
  const [micSupported, setMicSupported] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [status, setStatus] = useState<StatusFlags>({ listening: false, speaking: false });
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const lastSpokenId = useRef<string | null>(null);

  const processUserInput = useCallback((raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;

    setMessages((prev) => {
      const userMessage = createMessage("user", trimmed);
      const withUser = [...prev, userMessage];
      const assistantReply = generateResponse(trimmed, withUser);
      const assistantMessage = createMessage("assistant", assistantReply);
      return [...withUser, assistantMessage];
    });
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !window.speechSynthesis) {
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.volume = 0.9;

      if (voiceRef.current) {
        utterance.voice = voiceRef.current;
      }

      utterance.onstart = () => setStatus((prev) => ({ ...prev, speaking: true }));
      utterance.onend = () => setStatus((prev) => ({ ...prev, speaking: false }));
      utterance.onerror = () => setStatus((prev) => ({ ...prev, speaking: false }));

      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    },
    [setStatus],
  );

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    const timeoutId = window.setTimeout(() => setVoiceSupported(true), 0);

    const selectVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      if (!voices.length) return;

      const preferred =
        voices.find((voice) => voice.name.toLowerCase().includes("alloy")) ||
        voices.find((voice) => voice.name.toLowerCase().includes("nova")) ||
        voices.find((voice) => voice.lang.startsWith("en"));

      voiceRef.current = preferred ?? voices[0];
    };

    selectVoice();
    window.speechSynthesis.onvoiceschanged = selectVoice;

    return () => {
      window.clearTimeout(timeoutId);
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const RecognitionClass =
      (window.SpeechRecognition ?? window.webkitSpeechRecognition) as
        | SpeechRecognitionConstructor
        | undefined;

    if (!RecognitionClass) {
      return;
    }

    const recognition = new RecognitionClass();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setStatus((prev) => ({ ...prev, listening: true }));
      setListeningTranscript("");
    };

    recognition.onend = () => {
      setStatus((prev) => ({ ...prev, listening: false }));
      setListeningTranscript("");
    };

    recognition.onerror = () => {
      setStatus((prev) => ({ ...prev, listening: false }));
      setListeningTranscript("");
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let finalTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcriptPiece = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcriptPiece;
        } else {
          interim += transcriptPiece;
        }
      }

      setListeningTranscript(interim.trim());

      if (finalTranscript.trim()) {
        recognition.stop();
        processUserInput(finalTranscript);
      }
    };

    recognitionRef.current = recognition;
    const readyTimeout = window.setTimeout(() => setMicSupported(true), 0);

    return () => {
      window.clearTimeout(readyTimeout);
      recognition.stop();
      recognitionRef.current = null;
    };
  }, [processUserInput]);

  useEffect(() => {
    if (!messages.length) return;
    const last = messages[messages.length - 1];

    if (last.role === "assistant" && last.id !== lastSpokenId.current) {
      lastSpokenId.current = last.id;
      speak(last.content);
    }
  }, [messages, speak]);

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = input.trim();
      if (!trimmed) return;
      processUserInput(trimmed);
      setInput("");
    },
    [input, processUserInput],
  );

  const toggleMicrophone = useCallback(() => {
    if (!micSupported || !recognitionRef.current) {
      return;
    }

    if (status.listening) {
      recognitionRef.current.stop();
    } else {
      if (typeof window !== "undefined" && window.speechSynthesis?.speaking) {
        window.speechSynthesis.cancel();
      }
      try {
        recognitionRef.current.start();
      } catch {
        // Prevent crashing when rapid toggles occur.
      }
    }
  }, [micSupported, status.listening]);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis?.speaking) {
      window.speechSynthesis.cancel();
      setStatus((prev) => ({ ...prev, speaking: false }));
    }
  }, []);

  const headerStatus = useMemo(() => {
    if (!micSupported) {
      return "Voice capture unavailable in this browser.";
    }
    if (status.listening) {
      return "I'm listening.";
    }
    if (status.speaking) {
      return "Speaking.";
    }
    return "Ready when you are.";
  }, [micSupported, status.listening, status.speaking]);

  return (
    <div className="min-h-screen w-full px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <header className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-slate-900/50 p-6 shadow-2xl backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-slate-100 sm:text-2xl">Horizon Guide</h1>
              <p className="text-sm text-slate-300">A calm voice in your corner, focused on clarity.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip label="Listening" active={status.listening} />
              <StatusChip label="Speaking" active={status.speaking} />
              <StatusChip label="Voice Ready" active={voiceSupported} />
            </div>
          </div>
          <p className="text-sm text-slate-400">{headerStatus}</p>
        </header>

        <main className="flex flex-1 flex-col gap-6 rounded-3xl border border-white/10 bg-slate-950/60 p-6 shadow-2xl backdrop-blur">
          <section className="flex-1 overflow-hidden">
            <ul className="flex h-full flex-col gap-4 overflow-y-auto pr-2">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </ul>
          </section>

          <section className="flex flex-col gap-4 rounded-2xl border border-white/5 bg-slate-900/70 p-5 shadow-inner">
            {status.listening && (
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
                {listeningTranscript ? (
                  <p>{listeningTranscript}</p>
                ) : (
                  <p>Listening... you can speak now.</p>
                )}
              </div>
            )}

            {!micSupported && (
              <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                Microphone features need a browser with the Web Speech API. You can still type below.
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <label htmlFor="user-input" className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Your words
              </label>
              <textarea
                id="user-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Speak or type what you'd like to work through."
                rows={3}
                className="min-h-[120px] w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
              />
              <div className="flex flex-col items-stretch gap-3 sm:flex-row">
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-300/70"
                >
                  Send Message
                </button>
                <button
                  type="button"
                  onClick={toggleMicrophone}
                  className={`inline-flex items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-cyan-300/70 ${
                    status.listening
                      ? "bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/30"
                      : "bg-white/5 text-slate-200 hover:bg-white/10"
                  } ${micSupported ? "" : "opacity-60"}`}
                  disabled={!micSupported}
                >
                  {status.listening ? "Stop Listening" : "Talk Instead"}
                </button>
                <button
                  type="button"
                  onClick={stopSpeaking}
                  className="inline-flex items-center justify-center rounded-2xl bg-white/5 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-300/70"
                >
                  Quiet Voice
                </button>
              </div>
            </form>
          </section>
        </main>
      </div>
    </div>
  );
}
