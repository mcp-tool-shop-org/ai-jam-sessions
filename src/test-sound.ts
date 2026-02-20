#!/usr/bin/env node --import tsx
// Quick test: play middle C through the sample engine.
// Run: node --import tsx src/test-sound.ts

import { createSampleEngine } from "./sample-engine.js";

async function main() {
  const piano = createSampleEngine({
    samplesDir: "samples/AccurateSalamander",
  });

  console.error("Connecting (loading samples)...");
  await piano.connect();

  console.error("Playing C4 (middle C) at velocity 80...");
  piano.noteOn(60, 80);
  await sleep(2000);
  piano.noteOff(60);
  await sleep(1500); // let release ring

  console.error("Playing C major chord (C4-E4-G4) at velocity 100...");
  piano.noteOn(60, 100);
  piano.noteOn(64, 95);
  piano.noteOn(67, 90);
  await sleep(3000);
  piano.noteOff(60);
  piano.noteOff(64);
  piano.noteOff(67);
  await sleep(1500);

  console.error("Playing scale C4 to C5...");
  const scale = [60, 62, 64, 65, 67, 69, 71, 72];
  for (const note of scale) {
    piano.noteOn(note, 70);
    await sleep(350);
    piano.noteOff(note);
    await sleep(50);
  }
  await sleep(2000);

  console.error("Done. Disconnecting...");
  await piano.disconnect();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch(console.error);
