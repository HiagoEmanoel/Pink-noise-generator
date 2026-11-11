const { createServer } = require('node:http');

const PORT = 3000;
const HTML_CONTENT = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Pink Noise</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      -webkit-tap-highlight-color: transparent;
    }

    body {
      background: #0c0c0e;
      color: #e8e8e8;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      height: 100dvh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      user-select: none;
    }

    .container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 48px;
      padding: 24px;
    }

    h1 {
      font-size: 1.1rem;
      font-weight: 500;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #a0a0a8;
      opacity: 0.85;
    }

    .play-btn {
      width: 112px;
      height: 112px;
      border-radius: 50%;
      background: linear-gradient(145deg, #1a1a1e, #121214);
      border: 1px solid #2a2a30;
      box-shadow:
        0 8px 32px rgba(0, 0, 0, 0.55),
        inset 0 1px 0 rgba(255, 255, 255, 0.04);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.25s ease;
      position: relative;
    }

    .play-btn:active {
      transform: scale(0.94);
    }

    .play-btn.playing {
      background: linear-gradient(145deg, #2a1a24, #1e1218);
      border-color: #ff4d8d55;
      box-shadow:
        0 8px 36px rgba(255, 77, 141, 0.18),
        inset 0 1px 0 rgba(255, 255, 255, 0.05);
    }

    .play-btn svg {
      width: 42px;
      height: 42px;
      fill: #f0f0f2;
      transition: fill 0.2s ease;
    }

    .play-btn.playing svg {
      fill: #ff6b9d;
    }

    .icon-play {
      margin-left: 4px;
    }

    .status {
      font-size: 0.8rem;
      color: #666;
      height: 20px;
      letter-spacing: 0.04em;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Pink Noise</h1>

    <button class="play-btn" id="playBtn" aria-label="Play / Pause">
      <!-- Play icon -->
      <svg class="icon-play" id="iconPlay" viewBox="0 0 24 24">
        <path d="M8 5v14l11-7z"/>
      </svg>
      <!-- Pause icon (hidden by default) -->
      <svg id="iconPause" viewBox="0 0 24 24" style="display:none">
        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
      </svg>
    </button>

    <div class="status" id="status"></div>
  </div>

  <script>
    // ====================== Pink Noise (Paul Kellet refined) ======================
    // Extremely good approximation of true 1/f pink noise
    class PinkNoiseNode {
      constructor(audioContext) {
        this.ctx = audioContext;
        this.node = null;
        this.isPlaying = false;
        this.gainNode = this.ctx.createGain();
        this.gainNode.gain.value = 0.35;
        this.gainNode.connect(this.ctx.destination);

        // Filter coefficients state
        this.b0 = this.b1 = this.b2 = this.b3 = this.b4 = this.b5 = this.b6 = 0;
      }

      createProcessor() {
        const bufferSize = 4096;
        const processor = this.ctx.createScriptProcessor(bufferSize, 1, 1);

        processor.onaudioprocess = (e) => {
          const output = e.outputBuffer.getChannelData(0);

          for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;

            // Paul Kellet's refined method
            this.b0 = 0.99886 * this.b0 + white * 0.0555179;
            this.b1 = 0.99332 * this.b1 + white * 0.0750759;
            this.b2 = 0.96900 * this.b2 + white * 0.1538520;
            this.b3 = 0.86650 * this.b3 + white * 0.3104856;
            this.b4 = 0.55000 * this.b4 + white * 0.5329522;
            this.b5 = -0.7616 * this.b5 - white * 0.0168980;

            output[i] = this.b0 + this.b1 + this.b2 + this.b3 + this.b4 + this.b5 + this.b6 + white * 0.5362;
            output[i] *= 0.11; // compensate gain
            this.b6 = white * 0.115926;
          }
        };

        return processor;
      }

      async start() {
        if (this.isPlaying) return;

        if (this.ctx.state === 'suspended') {
          await this.ctx.resume();
        }

        this.node = this.createProcessor();
        this.node.connect(this.gainNode);
        this.isPlaying = true;
      }

      stop() {
        if (!this.isPlaying) return;
        if (this.node) {
          this.node.disconnect();
          this.node = null;
        }
        this.isPlaying = false;
      }
    }

    // ====================== UI + Control ======================
    const playBtn = document.getElementById('playBtn');
    const iconPlay = document.getElementById('iconPlay');
    const iconPause = document.getElementById('iconPause');
    const statusEl = document.getElementById('status');

    let audioCtx = null;
    let pink = null;
    let playing = false;

    function updateUI() {
      if (playing) {
        playBtn.classList.add('playing');
        iconPlay.style.display = 'none';
        iconPause.style.display = 'block';
        statusEl.textContent = 'playing';
      } else {
        playBtn.classList.remove('playing');
        iconPlay.style.display = 'block';
        iconPause.style.display = 'none';
        statusEl.textContent = '';
      }
    }

    playBtn.addEventListener('click', async () => {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        pink = new PinkNoiseNode(audioCtx);
      }

      if (!playing) {
        await pink.start();
        playing = true;
      } else {
        pink.stop();
        playing = false;
      }
      updateUI();
    });

    document.addEventListener('gesturestart', e => e.preventDefault());
  </script>
</body>
</html>`;

const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(HTML_CONTENT);
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});
