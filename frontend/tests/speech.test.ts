import { test } from "node:test";
import assert from "node:assert/strict";
import { createSpeechSession } from "../src/lib/speech.ts";
import type { RecognitionEvent } from "../src/lib/speech.ts";

class BrowserSpeech {
  static instance: BrowserSpeech;
  lang = ""; continuous = false; interimResults = false;
  onresult: ((event: RecognitionEvent) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  stopped = false; aborted = false;
  constructor() { BrowserSpeech.instance = this; }
  start() {}
  stop() { this.stopped = true; this.onend?.(); }
  abort() { this.aborted = true; }
}

test("cumulative results do not duplicate words; interim text stays separate", () => {
  const transcripts: string[][] = [];
  const session = createSpeechSession(BrowserSpeech, "hi-IN", { transcript: (...words) => transcripts.push(words), error() {}, end() {} });
  session.start();
  const speech = BrowserSpeech.instance;
  assert.equal(speech.lang, "hi-IN");
  speech.onresult?.({ results: [{ isFinal: true, 0: { transcript: "hello" } }, { isFinal: false, 0: { transcript: "world" } }] });
  speech.onresult?.({ results: [{ isFinal: true, 0: { transcript: "hello" } }, { isFinal: true, 0: { transcript: "world" } }] });
  assert.deepEqual(transcripts, [["hello", "world"], ["hello world", ""]]);
});

test("permission errors are actionable; cleanup detaches events and aborts capture", () => {
  const errors: string[] = []; let ended = false;
  const session = createSpeechSession(BrowserSpeech, "en-IN", { transcript() {}, error: (text) => errors.push(text), end: () => { ended = true; } });
  const speech = BrowserSpeech.instance;
  speech.onerror?.({ error: "not-allowed" });
  assert.match(errors[0], /permission was denied/);
  speech.onerror?.({ error: "aborted" });
  assert.equal(errors.length, 1);
  session.stop(); assert.equal(ended, true);
  session.dispose(); assert.equal(speech.aborted, true); assert.equal(speech.onresult, null); assert.equal(speech.onend, null);
});

test("synchronous browser start failure reports error and restores idle state", () => {
  class BlockedSpeech extends BrowserSpeech { start() { throw new Error("blocked"); } }
  let message = "", ended = false;
  const session = createSpeechSession(BlockedSpeech, "en-IN", { transcript() {}, error: (text) => { message = text; }, end: () => { ended = true; } });
  session.start(); assert.match(message, /Could not start/); assert.equal(ended, true);
});
