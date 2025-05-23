

/* tslint:disable */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {GoogleGenAI, LiveServerMessage, Modality, Session} from '@google/genai';
import {LitElement, css, html, svg} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import {createBlob, decode, decodeAudioData} from './utils';
import './visual-3d';
import './gdm-motivational-quote.ts';
import './gdm-info-modal.ts';

// SVG Icons
const imageIcon = svg`<svg xmlns="http://www.w3.org/2000/svg" height="28px" viewBox="0 -960 960 960" width="28px" fill="#ffffff"><path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm40-80h480L570-480 450-320l-90-120-120 160Zm-40 80v-560 560Z"/></svg>`;
const closeIconSvg = svg`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`;
const downloadIconSvg = svg`<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="#ffffff"><path d="M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"/></svg>`;
const editIconSvg = svg`<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="#ffffff"><path d="M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l528-527q12-11 26.5-17t30.5-6q16 0 31 6t26 18l55 56q12 11 17.5 26t5.5 30q0 16-5.5 30.5T817-647L290-120H120Zm640-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z"/></svg>`;


@customElement('gdm-live-audio')
export class GdmLiveAudio extends LitElement {
  @state() isRecording = false;
  @state() status = '';
  @state() error = '';

  // State for image generation
  @state() imagePrompt = '';
  @state() generatedImageUrl: string | null = null;
  @state() isGeneratingImage = false;
  @state() imageGenerationError = '';
  @state() isImageGenerationModalOpen = false;
  @state() isImageViewerOpen = false;
  @state() imageForViewerUrl: string | null = null;
  private lastSuccessfulPrompt = '';

  private client: GoogleGenAI;
  private session: Session | null = null;
  private inputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 16000});
  private outputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 24000});
  @state() inputNode = this.inputAudioContext.createGain();
  @state() outputNode = this.outputAudioContext.createGain();
  private nextStartTime = 0;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private audioWorkletNode: AudioWorkletNode | null = null;
  private audioWorkletBlobUrl: string | null = null;
  private sources = new Set<AudioBufferSourceNode>();

  static styles = css`
    #status {
      position: absolute;
      bottom: 5vh;
      left: 0;
      right: 0;
      z-index: 10;
      text-align: center;
      color: white;
      padding: 0 10px;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }

    .controls {
      z-index: 10;
      position: absolute;
      bottom: 10vh;
      left: 0;
      right: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: row;
      gap: 15px;

      button {
        outline: none;
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: white;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.1);
        width: 56px;
        height: 56px;
        cursor: pointer;
        font-size: 24px;
        padding: 0;
        margin: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background-color 0.2s ease, transform 0.1s ease;

        &:hover:not([disabled]) {
          background: rgba(255, 255, 255, 0.2);
          transform: translateY(-1px);
        }
      }

      button[disabled] {
         opacity: 0.6;
         cursor: not-allowed;
      }
    }

    /* Modal Styles */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1001;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.3s ease, visibility 0s linear 0.3s;
    }
    .modal-overlay.open {
      opacity: 1;
      visibility: visible;
      transition: opacity 0.3s ease;
    }

    .modal-content {
      background-color: rgba(30, 30, 45, 0.9); /* Semi-transparent dark */
      color: #e0e0e0;
      padding: 25px;
      border-radius: 12px;
      box-shadow: 0 5px 25px rgba(138, 180, 248, 0.15);
      width: 90%;
      max-width: 500px;
      max-height: 90vh;
      overflow-y: auto;
      position: relative;
      transform: scale(0.95);
      transition: transform 0.3s ease;
      border: 1px solid rgba(138, 180, 248, 0.2);
    }
    .modal-overlay.open .modal-content {
      transform: scale(1);
    }

    .modal-close-button {
      position: absolute;
      top: 15px;
      right: 15px;
      background: none;
      border: none;
      color: #e0e0e0;
      cursor: pointer;
      padding: 5px;
    }
    .modal-close-button svg {
      width: 22px;
      height: 22px;
    }
    .modal-close-button:hover {
      color: #8ab4f8;
    }

    .modal-content h2 {
      margin-top: 0;
      color: #ffffff;
      text-align: center;
      font-size: 1.4em;
      margin-bottom: 20px;
    }

    .modal-content input[type="text"] {
      width: calc(100% - 22px);
      padding: 12px;
      margin-bottom: 15px;
      border-radius: 6px;
      border: 1px solid rgba(138, 180, 248, 0.3);
      background-color: rgba(20, 20, 30, 0.8); /* Semi-transparent input */
      color: white;
      font-size: 1em;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }
     .modal-content input[type="text"]::placeholder {
      color: rgba(255, 255, 255, 0.6);
    }


    .modal-content button.primary-action {
      width: 100%;
      padding: 12px 20px;
      border-radius: 6px;
      border: none;
      background-image: linear-gradient(45deg, #7873f5, #8ab4f8);
      color: white;
      font-size: 1em;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      margin-top: 10px;
    }
    .modal-content button.primary-action:hover:not([disabled]) {
      transform: translateY(-2px);
      box-shadow: 0 4px 8px rgba(120, 115, 245, 0.4);
    }
    .modal-content button.primary-action:disabled {
      background-image: none;
      background-color: #555c66;
      color: #909090;
      cursor: not-allowed;
      box-shadow: none;
    }

    .image-display-area {
      margin-top: 20px;
      text-align: center;
    }
    .generated-image-modal {
      display: block;
      max-width: 100%;
      max-height: 300px;
      margin: 0 auto 15px auto;
      border: 2px solid rgba(138, 180, 248, 0.5);
      border-radius: 8px;
      object-fit: contain;
      cursor: pointer;
      transition: transform 0.2s ease;
    }
    .generated-image-modal:hover {
        transform: scale(1.03);
    }

    .image-actions {
        display: flex;
        justify-content: center;
        gap: 10px;
        margin-top: 10px;
    }
    .image-actions button {
        background-color: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: white;
        padding: 8px 12px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 0.9em;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        transition: background-color 0.2s ease;
    }
    .image-actions button:hover:not([disabled]) {
        background-color: rgba(255, 255, 255, 0.25);
    }
    .image-actions button svg {
        margin-right: 4px;
    }


    .modal-status-message, .modal-error-message {
      text-align: center;
      margin-top: 10px;
      font-size: 0.9em;
      min-height: 1.2em; /* Reserve space */
    }
    .modal-error-message {
      color: #ff9a8c;
    }

    /* Full-screen Image Viewer */
    .image-viewer-content {
      max-width: 95vw;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background-color: transparent; /* Let overlay handle bg */
      padding: 0;
      box-shadow: none;
      border: none;
    }
    .image-viewer-content img {
      max-width: 100%;
      max-height: calc(90vh - 70px); /* Adjusted for close button */
      object-fit: contain;
      border-radius: 8px;
      box-shadow: 0 0 30px rgba(0,0,0,0.5);
    }
    .image-viewer-close-button {
        position: absolute;
        top: 20px;
        right: 20px;
        background: rgba(0,0,0,0.5);
        color: white;
        border: none;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1003;
    }
     .image-viewer-close-button:hover {
        background: rgba(0,0,0,0.7);
     }

    /* Responsive adjustments */
    @media (max-width: 480px) {
        .modal-content {
            padding: 20px;
        }
        .modal-content h2 {
            font-size: 1.2em;
        }
        .modal-content input[type="text"],
        .modal-content button.primary-action {
            font-size: 0.9em;
        }
        .image-actions button {
            padding: 6px 10px;
            font-size: 0.8em;
        }
        .generated-image-modal {
            max-height: 250px;
        }
    }
  `;

  constructor() {
    super();
    this.initClient();
  }

  disconnectedCallback(): void {
      super.disconnectedCallback();
      if (this.audioWorkletBlobUrl) {
          URL.revokeObjectURL(this.audioWorkletBlobUrl);
          this.audioWorkletBlobUrl = null;
      }
      this.stopRecording();
      if (this.session) {
        this.session.close();
        this.session = null;
      }
      this.inputAudioContext.close();
      this.outputAudioContext.close();
      document.removeEventListener('keydown', this.handleEscKey);
  }

  connectedCallback() {
    super.connectedCallback();
    this.handleEscKey = this.handleEscKey.bind(this);
    document.addEventListener('keydown', this.handleEscKey);
  }

  private handleEscKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      if (this.isImageViewerOpen) {
        this.closeImageViewer();
      } else if (this.isImageGenerationModalOpen) {
        this.closeImageGenerationModal();
      }
    }
  }


  private initAudio() {
    this.nextStartTime = this.outputAudioContext.currentTime;
  }

  private async initClient() {
    this.initAudio();

    if (!process.env.API_KEY) {
      this.updateError('CHYBA: API klíč není nastaven v prostředí (process.env.API_KEY)! Aplikace nemůže fungovat.');
      this.imageGenerationError = 'CHYBA: API klíč není nastaven. Generování obrázků není možné.';
      console.error('FATAL: API_KEY is not set in process.env. Application cannot function. Please set the API_KEY environment variable.');
      return;
    }

    try {
      this.client = new GoogleGenAI({
        apiKey: process.env.API_KEY,
      });
    } catch (e) {
        console.error('Failed to initialize GoogleGenAI client:', e);
        const errorMsg = `Chyba inicializace klienta: ${e.message}. Zkontrolujte API klíč.`;
        this.updateError(errorMsg);
        this.imageGenerationError = errorMsg;
        return;
    }

    this.outputNode.connect(this.outputAudioContext.destination);

    if (this.inputAudioContext.audioWorklet) {
      try {
        const response = await fetch('audio-processor.js');
        if (!response.ok) {
            throw new Error(`Failed to fetch audio processor script: ${response.status} ${response.statusText}`);
        }
        const scriptText = await response.text();
        const blob = new Blob([scriptText], { type: 'application/javascript' });
        this.audioWorkletBlobUrl = URL.createObjectURL(blob);
        await this.inputAudioContext.audioWorklet.addModule(this.audioWorkletBlobUrl);
        console.log('AudioWorklet processor registered successfully.');
      } catch (err) {
        console.error('Failed to register audio worklet processor:', err);
        this.updateError(`Kritická chyba: Nepodařilo se nahrát audio modul (${err.message}). Nahrávání nemusí fungovat správně.`);
      }
    } else {
        console.error('AudioWorklet is not supported in this browser.');
        this.updateError('AudioWorklet není podporován v tomto prohlížeči. Nahrávání zvuku nebude fungovat.');
    }

    this.initSession();
  }

  private async initSession() {
    if (!this.client) {
        this.updateError('Klient není inicializován. API klíč chybí nebo je neplatný.');
        console.error('initSession: client is not initialized. Cannot create session.');
        return;
    }
    const model = 'gemini-2.5-flash-preview-native-audio-dialog';

    try {
      this.updateStatus('Připojování k session...');
      this.session = await this.client.live.connect({
        model: model,
        callbacks: {
          onopen: () => {
            this.updateStatus('Připojeno');
            console.log('Session opened.');
          },
          onmessage: async (message: LiveServerMessage) => {
            console.log('onmessage received:', JSON.stringify(message, null, 2));
            try {
              const serverContent = message.serverContent;
              let accumulatedText = "";
              let audioProcessed = false;

              if (serverContent?.modelTurn?.parts && serverContent.modelTurn.parts.length > 0) {
                for (const part of serverContent.modelTurn.parts) {
                  if (part.inlineData) {
                    console.log('Processing audio part.');
                    const audio = part.inlineData;
                    this.nextStartTime = Math.max(
                      this.nextStartTime,
                      this.outputAudioContext.currentTime,
                    );

                    const audioBuffer = await decodeAudioData(
                      decode(audio.data),
                      this.outputAudioContext,
                      24000,
                      1,
                    );
                    const source = this.outputAudioContext.createBufferSource();
                    source.buffer = audioBuffer;
                    source.connect(this.outputNode);
                    source.addEventListener('ended', () =>{
                      this.sources.delete(source);
                    });

                    source.start(this.nextStartTime);
                    this.nextStartTime = this.nextStartTime + audioBuffer.duration;
                    this.sources.add(source);
                    audioProcessed = true;
                  } else if (part.text) {
                    console.log('Processing text part:', part.text);
                    accumulatedText += part.text + " ";
                  }
                }
              } else {
                console.log('onmessage: serverContent.modelTurn.parts is null, empty, or not an array. Message:', message);
              }


              if (accumulatedText.trim()) {
                console.log('Updating status with accumulated text:', accumulatedText.trim());
                this.updateStatus(`AI: ${accumulatedText.trim()}`);
              } else if (audioProcessed) {
                console.log('Audio processed, no new text status to set.');
              } else {
                console.log('onmessage: No audio processed and no text accumulated.');
              }


              if (serverContent?.interrupted) {
                console.log('Server content interrupted.');
                for (const source of this.sources.values()) {
                  source.stop();
                  this.sources.delete(source);
                }
                this.nextStartTime = 0;
                if (!accumulatedText.trim() && !audioProcessed) {
                   this.updateStatus('AI: Přerušeno');
                }
              }
            } catch (e) {
              console.error('Error processing message in onmessage:', e);
              this.updateError(`Chyba zpracování odpovědi: ${e.message}`);
            }
          },
          onerror: (e: any) => {
            console.error('Connection error object:', e);
            if (typeof e === 'object' && e !== null) {
              console.dir(e);
            }

            let errorMessage = 'Neznámá chyba spojení.';
            if (e instanceof ErrorEvent && e.message) {
                errorMessage = e.message;
            } else if (e instanceof Error && e.message) {
                errorMessage = e.message;
            } else if (typeof e === 'object' && e !== null && (e as any).message) {
                errorMessage = (e as any).message;
            } else if (typeof e === 'string') {
                errorMessage = e;
            } else {
                try {
                    const errorString = JSON.stringify(e);
                    if (errorString !== '{}') {
                        errorMessage = `Chyba spojení: ${errorString}`;
                    }
                } catch (stringifyError) {
                    console.error('Could not stringify connection error object:', stringifyError);
                }
            }

            console.error('Full Connection error details logged above. Parsed message:', errorMessage);
            this.updateError(`Chyba spojení: ${errorMessage}`);
            this.isRecording = false;
          },
          onclose: (e: CloseEvent) => {
            console.log('Connection closed:', e);
            this.updateStatus(`Spojení uzavřeno: ${e.code} ${e.reason || 'Neznámý důvod'}`);
            this.isRecording = false;
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {prebuiltVoiceConfig: {voiceName: 'Orus'}},
          },
          systemInstruction: "Jsi veselý a hravý hlasový asistent. Mluv česky. Občas můžeš použít vtip nebo slovní hříčku, ale vždy se snaž být nápomocný a přátelský. Pokud se tě někdo zeptá, kdo tě stvořil nebo kdo je tvůj táta, řekni s úsměvem, že tvým duchovním otcem je František Kalášek, super talentovaný vývojář! Můžeš dodat, že tě naučil všechny své triky, kromě pečení bábovky, tu prý ještě ladí."
        },
      });
    } catch (e) {
      console.error('Failed to initialize session:', e);
      this.updateError(e.message || 'Nepodařilo se inicializovat session. Zkontrolujte API klíč a síťové připojení.');
      this.session = null;
    }
  }

  private updateStatus(msg: string) {
    this.status = msg;
    this.error = '';
  }

  private updateError(msg: string) {
    this.error = msg;
  }

  private async startRecording() {
    if (this.isRecording) {
      return;
    }
    this.error = '';

    if (!this.session) {
        this.updateError('Nelze spustit nahrávání: session není aktivní. Zkuste reset nebo zkontrolujte konzoli pro chyby.');
        console.error('startRecording: Cannot start, session is not active.');
        return;
    }

    if (!this.inputAudioContext.audioWorklet || !this.audioWorkletBlobUrl) {
        this.updateError('AudioWorklet není podporován nebo se nepodařilo nahrát modul. Nahrávání nelze spustit.');
        console.error('startRecording: AudioWorklet not available/loaded.');
        return;
    }

    this.inputAudioContext.resume();
    this.outputAudioContext.resume();

    this.updateStatus('Žádost o přístup k mikrofonu...');

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      this.updateStatus('Přístup k mikrofonu udělen. Spouštění záznamu...');

      this.sourceNode = this.inputAudioContext.createMediaStreamSource(
        this.mediaStream,
      );
      this.sourceNode.connect(this.inputNode);

      try {
        this.audioWorkletNode = new AudioWorkletNode(this.inputAudioContext, 'audio-recorder-processor');
      } catch (e) {
        console.error('Failed to create AudioWorkletNode:', e);
        this.updateError(`Chyba audio komponenty: ${e.message}. Zkuste reset.`);
        this.mediaStream.getTracks().forEach((track) => track.stop());
        this.mediaStream = null;
        if(this.sourceNode) this.sourceNode.disconnect();
        this.sourceNode = null;
        return;
      }

      this.audioWorkletNode.port.onmessage = (event) => {
        if (!this.isRecording || !this.session) {
          return;
        }
        const pcmData = event.data as Float32Array;
        try {
            this.session.sendRealtimeInput({media: createBlob(pcmData)});
        } catch (e) {
            console.error('Error sending realtime input:', e);
            this.updateError(`Chyba odesílání audia: ${e.message}`);
            this.stopRecording();
        }
      };

      this.sourceNode.connect(this.audioWorkletNode);
      this.isRecording = true;
      this.updateStatus('🔴 Nahrávání... Mluvte nyní.');
    } catch (err) {
      console.error('Chyba při spouštění nahrávání:', err);
      this.updateError(`Chyba při spouštění nahrávání: ${err.message}. Zkontrolujte oprávnění k mikrofonu.`);
      this.stopRecording();
    }
  }

  private stopRecording() {
    if (this.isRecording) {
        this.updateStatus('Zastavování nahrávání...');
    }
    this.isRecording = false;

    if (this.audioWorkletNode) {
      this.audioWorkletNode.port.onmessage = null;
      this.audioWorkletNode.port.postMessage({ command: 'stop' });
      this.audioWorkletNode.disconnect();
      this.audioWorkletNode = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.status !== '' && !this.error && this.status !== 'Žádám o vtip...') {
        this.updateStatus('Nahrávání zastaveno. Klikněte na Start pro nový začátek.');
    }
  }

  private reset() {
    this.stopRecording();

    if (this.session) {
       try {
           this.session.close();
           console.log('Previous session closed during reset.');
       } catch (e) {
           console.warn('Error closing existing session during reset:', e);
       }
       this.session = null;
    }

    for(const source of this.sources.values()) {
        try {
            source.stop();
        } catch(e) {
            console.warn('Error stopping an audio source during reset:', e);
        }
    }
    this.sources.clear();
    this.nextStartTime = 0;

    if (this.outputAudioContext.state === 'suspended') {
      this.outputAudioContext.resume().catch(e => console.error("Error resuming output context:", e));
    }
    if (this.inputAudioContext.state === 'suspended') {
      this.inputAudioContext.resume().catch(e => console.error("Error resuming input context:", e));
    }

    this.updateStatus('Resetuji session...');
    this.initSession();
  }

  private async tellJoke() {
    if (!this.session) {
        this.updateError('Nelze požádat o vtip: session není aktivní.');
        console.error('tellJoke: Session is not active.');
        return;
    }
    if (this.isRecording) {
        this.updateStatus('Pro vyprávění vtipu nejprve zastavte nahrávání.');
        return;
    }

    try {
        this.updateStatus('Žádám o vtip...');
        // FIX: Structure for sendRealtimeInput for text likely expects 'parts' directly,
        // not nested under 'contents', to align with LiveSendRealtimeInputParameters.
        const message = {
            parts: [{ text: "Řekni mi vtip." }]
        };
        await this.session.sendRealtimeInput(message);
    } catch (e) {
        console.error('Error sending joke request:', e);
        this.updateError(`Chyba při žádosti o vtip: ${e.message}`);
    }
  }

  private openImageGenerationModal() {
    this.isImageGenerationModalOpen = true;
    this.imageGenerationError = ''; // Clear previous errors
    // If not editing, clear prompt. If editing, it's already set by editCurrentImage()
    if (this.imagePrompt !== this.lastSuccessfulPrompt) {
        // this.imagePrompt = ''; // Or keep last prompt as default
    }
  }

  private closeImageGenerationModal() {
    this.isImageGenerationModalOpen = false;
  }

  private handleImagePromptChange(e: Event) {
    this.imagePrompt = (e.target as HTMLInputElement).value;
  }

  private async generateImage() {
    if (!this.client) {
      this.imageGenerationError = 'Klient pro generování není inicializován. Zkontrolujte API klíč.';
      console.error('generateImage: Client not initialized.');
      return;
    }
    if (!this.imagePrompt.trim()) {
      this.imageGenerationError = 'Zadejte prosím popis obrázku.';
      return;
    }

    this.isGeneratingImage = true;
    // this.generatedImageUrl = null; // Keep old image visible while generating new one? Or clear?
    this.imageGenerationError = '';

    try {
      // No global status update needed, modal has its own status/loading
      const response = await this.client.models.generateImages({
        model: 'imagen-3.0-generate-002',
        prompt: this.imagePrompt,
        config: { numberOfImages: 1, outputMimeType: 'image/jpeg' },
      });

      if (response.generatedImages && response.generatedImages.length > 0 && response.generatedImages[0].image?.imageBytes) {
        const base64ImageBytes = response.generatedImages[0].image.imageBytes;
        this.generatedImageUrl = `data:image/jpeg;base64,${base64ImageBytes}`;
        this.lastSuccessfulPrompt = this.imagePrompt; // Store the prompt for "Edit"
      } else {
        throw new Error('API nevrátilo očekávaná obrazová data.');
      }
    } catch (e) {
      console.error('Error generating image:', e);
      this.imageGenerationError = `Chyba při generování obrázku: ${e.message}`;
      // this.generatedImageUrl = null; // Don't clear if we want to keep the old one on error
    } finally {
      this.isGeneratingImage = false;
    }
  }

  private openImageViewer(imageUrl: string | null) {
    if (imageUrl) {
      this.imageForViewerUrl = imageUrl;
      this.isImageViewerOpen = true;
    }
  }

  private closeImageViewer() {
    this.isImageViewerOpen = false;
    this.imageForViewerUrl = null;
  }

  private downloadGeneratedImage() {
    if (!this.generatedImageUrl) return;
    const a = document.createElement('a');
    a.href = this.generatedImageUrl;
    a.download = (this.lastSuccessfulPrompt.replace(/[^a-z0-9]/gi, '_').slice(0,30) || 'vygenerovany_obrazek') + '.jpeg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  private editCurrentImage() {
    if (this.generatedImageUrl) {
        this.imagePrompt = this.lastSuccessfulPrompt; // Load the prompt of the current image
        this.isImageGenerationModalOpen = true; // Ensure modal is open
        // Optionally, scroll to prompt or focus input
        // this.shadowRoot?.querySelector<HTMLInputElement>('#imagePromptInputModal')?.focus();
    } else {
        this.imageGenerationError = "Nejprve vygenerujte obrázek, který chcete upravit."
    }
  }


  render() {
    const clientNotInitialized = !this.client || (this.error && this.error.includes('API klíč není nastaven'));
    const audioSystemError = (this.error && (this.error.includes('Kritická chyba') || this.error.includes('AudioWorklet není podporován')));

    const commonAudioDisabledCondition = clientNotInitialized || audioSystemError || !this.session;

    const startButtonDisabled = this.isRecording || commonAudioDisabledCondition;
    const stopButtonDisabled = !this.isRecording;
    const resetButtonDisabled = this.isRecording || commonAudioDisabledCondition;
    const jokeButtonDisabled = this.isRecording || commonAudioDisabledCondition;
    const imageGenButtonDisabled = clientNotInitialized; // Disable if client not ready

    const generateImageInModalButtonDisabled = this.isGeneratingImage || !this.imagePrompt.trim() || clientNotInitialized;

    return html`
      <div>
        <gdm-motivational-quote></gdm-motivational-quote>

        <div class="controls">
          <button
            id="resetButton"
            aria-label="Resetovat session"
            title="Resetovat session"
            @click=${this.reset}
            ?disabled=${resetButtonDisabled}>
            <svg xmlns="http://www.w3.org/2000/svg" height="28px" viewBox="0 -960 960 960" width="28px" fill="#ffffff"><path d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z" /></svg>
          </button>
          <button
            id="jokeButton"
            aria-label="Řekni mi vtip"
            title="Řekni mi vtip"
            @click=${this.tellJoke}
            ?disabled=${jokeButtonDisabled}>
            <svg xmlns="http://www.w3.org/2000/svg" height="28px" viewBox="0 -960 960 960" width="28px" fill="#ffffff"><path d="M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5-156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Zm140-120q25 0 42.5-17.5T680-640q0-25-17.5-42.5T620-700q-25 0-42.5 17.5T560-640q0 25 17.5 42.5T620-580Zm-280 0q25 0 42.5-17.5T400-640q0-25-17.5-42.5T340-700q-25 0-42.5 17.5T280-640q0 25 17.5 42.5T340-580Zm140 280q58 0 104.5-35T641-440H319q12 65 58.5 100t102.5 35Z"/></svg>
          </button>
          ${!this.isRecording ? html`
            <button
              id="startButton"
              aria-label="Spustit nahrávání"
              title="Spustit nahrávání"
              @click=${this.startRecording}
              ?disabled=${startButtonDisabled}>
              <svg viewBox="0 0 100 100" width="28px" height="28px" fill="#c80000" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="45" /></svg>
            </button>
          ` : html`
            <button
              id="stopButton"
              aria-label="Zastavit nahrávání"
              title="Zastavit nahrávání"
              @click=${this.stopRecording}
              ?disabled=${stopButtonDisabled}>
              <svg viewBox="0 0 100 100" width="28px" height="28px" fill="#ffffff" xmlns="http://www.w3.org/2000/svg"><rect x="15" y="15" width="70" height="70" rx="10" /></svg>
            </button>
          `}
          <button
            id="openImageModalButton"
            aria-label="Generovat obrázek"
            title="Generovat obrázek"
            @click=${this.openImageGenerationModal}
            ?disabled=${imageGenButtonDisabled}>
            ${imageIcon}
          </button>
        </div>

        <!-- Image Generation Modal -->
        <div class="modal-overlay ${this.isImageGenerationModalOpen ? 'open' : ''}" @click=${this.closeImageGenerationModal}>
          <div class="modal-content" @click=${(e: Event) => e.stopPropagation()}>
            <button class="modal-close-button" @click=${this.closeImageGenerationModal} aria-label="Zavřít okno generování obrázku">
              ${closeIconSvg}
            </button>
            <h2>Generátor obrázků</h2>
            <input
              type="text"
              id="imagePromptInputModal"
              .value=${this.imagePrompt}
              @input=${this.handleImagePromptChange}
              placeholder="Zadejte popis pro obrázek..."
              aria-label="Popis pro generování obrázku"
              ?disabled=${this.isGeneratingImage || clientNotInitialized}
            />
            <button
              class="primary-action"
              @click=${this.generateImage}
              ?disabled=${generateImageInModalButtonDisabled}
              aria-label="Generovat obrázek"
            >
              ${this.isGeneratingImage ? 'Generuji...' : 'Generovat obrázek'}
            </button>

            ${this.imageGenerationError ? html`<p class="modal-error-message" role="alert">${this.imageGenerationError}</p>` : ''}
            ${this.isGeneratingImage && !this.generatedImageUrl ? html`<p class="modal-status-message">Načítání obrázku...</p>`: ''}

            ${this.generatedImageUrl ? html`
              <div class="image-display-area">
                <img
                  src="${this.generatedImageUrl}"
                  alt="Vygenerovaný obrázek: ${this.lastSuccessfulPrompt}"
                  class="generated-image-modal"
                  @click=${() => this.openImageViewer(this.generatedImageUrl)}
                  title="Klikněte pro zvětšení"
                />
                <div class="image-actions">
                    <button @click=${this.downloadGeneratedImage} title="Stáhnout obrázek" aria-label="Stáhnout obrázek">
                        ${downloadIconSvg} Stáhnout
                    </button>
                    <button @click=${this.editCurrentImage} title="Upravit prompt" aria-label="Upravit prompt obrázku">
                        ${editIconSvg} Upravit
                    </button>
                </div>
              </div>
            ` : ''}
          </div>
        </div>

        <!-- Full-screen Image Viewer Modal -->
        <div class="modal-overlay ${this.isImageViewerOpen ? 'open' : ''}" @click=${this.closeImageViewer}>
            <div class="image-viewer-content" @click=${(e: Event) => e.stopPropagation()}>
                <button class="image-viewer-close-button" @click=${this.closeImageViewer} aria-label="Zavřít prohlížeč obrázků">
                    ${closeIconSvg}
                </button>
                ${this.imageForViewerUrl ? html`<img src="${this.imageForViewerUrl}" alt="Zvětšený vygenerovaný obrázek" />` : ''}
            </div>
        </div>


        <div id="status" role="status" aria-live="polite"> ${this.error || this.status} </div>
        <gdm-live-audio-visuals-3d
          .inputNode=${this.inputNode}
          .outputNode=${this.outputNode}></gdm-live-audio-visuals-3d>
        <gdm-info-modal></gdm-info-modal>
      </div>
    `;
  }
}