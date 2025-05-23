
// audio-processor.js
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

class AudioRecorderProcessor extends AudioWorkletProcessor {
  // bufferSize defines how many samples are collected before sending data.
  // 128 samples is the default for AudioWorkletProcessor.
  // For a 16000Hz sample rate, 128 samples is 8ms of audio.
  // We can accumulate more if needed before posting.
  // For real-time streaming, smaller chunks are often better.
  
  // No specific constructor options needed for this basic version.
  constructor(options) {
    super(options);
    this.port.onmessage = (event) => {
      // Handle messages from the main thread if needed, e.g., to stop or configure.
      // For example: if (event.data.command === 'stop') { // clean up }
    };
  }

  process(inputs, outputs, parameters) {
    // inputs[0] is an array of channels (Float32Array).
    // inputs[0][0] is the Float32Array for the first channel of the first input.
    const inputChannelData = inputs[0]?.[0];

    // If there's no input data (e.g., microphone not yet ready or stopped),
    // or if the input array is empty, just keep the processor alive.
    if (!inputChannelData || inputChannelData.length === 0) {
      return true; // Keep processor alive
    }

    // Post a copy of the Float32Array data back to the main thread.
    // The main thread will handle converting this to Int16 PCM and base64 encoding.
    this.port.postMessage(inputChannelData.slice(0));

    return true; // Indicate that the processor should continue running.
  }
}

try {
  registerProcessor('audio-recorder-processor', AudioRecorderProcessor);
} catch (e) {
  console.error('Failed to register AudioRecorderProcessor:', e);
  // This error will be caught by the main thread when it tries to create the AudioWorkletNode
  // if the processor is not registered.
}
