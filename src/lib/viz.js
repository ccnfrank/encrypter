/*
 * Encripter — encryption visualization
 * Drawn on a canvas inside the drop zone while a file is being encrypted.
 * Blocks of data scramble until they are "sealed" in order, a scan line sweeps
 * across, and a bar chart of entropy pulses along the bottom.
 */
export const EncripterViz = (() => {
  "use strict";

  const HEX = "0123456789ABCDEF";
  const CELL = 22; // px per block, including gap
  const CHART_H = 56; // px reserved at the bottom for the bar chart
  const TOP_H = 30; // px reserved at the top for the label row
  const COLORS = {
    paper: "243, 235, 221",
    brass: "217, 164, 65",
    brassHi: "239, 194, 110",
    sage: "156, 199, 169",
  };

  const randHex = () => HEX[(Math.random() * 16) | 0] + HEX[(Math.random() * 16) | 0];

  function create(canvas) {
    const ctx = canvas.getContext("2d");
    let width = 0;
    let height = 0;
    let cols = 0;
    let rows = 0;
    let gridX = 0;
    let gridY = 0;
    let values = [];
    let rank = [];
    let sealedAt = [];
    let bars = [];
    let progress = 0;
    let displayed = 0;
    let running = false;
    let frameId = 0;
    let startedAt = 0;
    let finished = false;
    let mode = "Encrypting";

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      cols = Math.max(4, Math.floor(width / CELL));
      rows = Math.max(3, Math.floor((height - CHART_H - TOP_H - 8) / CELL));
      gridX = (width - cols * CELL) / 2;
      gridY = TOP_H;

      const total = cols * rows;
      values = Array.from({ length: total }, randHex);
      sealedAt = new Array(total).fill(-1);

      // Seal order: a diagonal wave across the grid, with a little jitter
      const keys = Array.from({ length: total }, (_, i) => {
        const x = i % cols;
        const y = Math.floor(i / cols);
        return { i, key: x + y * 0.6 + Math.random() * 3 };
      });
      keys.sort((a, b) => a.key - b.key);
      rank = new Array(total);
      keys.forEach((entry, position) => {
        rank[entry.i] = position;
      });

      bars = Array.from({ length: Math.max(12, Math.floor(width / 10)) }, () => 0.35 + Math.random() * 0.65);
    }

    function draw(now) {
      const total = values.length;
      const sealed = Math.floor(displayed * total);
      const t = (now - startedAt) / 1000;
      ctx.clearRect(0, 0, width, height);

      // Label row
      ctx.textBaseline = "middle";
      ctx.font = "500 12px 'Instrument Sans', system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillStyle = `rgba(${COLORS.paper}, 0.8)`;
      const label = finished ? (mode === "Decrypting" ? "Opened" : "Sealed") : mode;
      ctx.fillText(label, 16, 15);
      ctx.textAlign = "right";
      ctx.fillStyle = `rgba(${COLORS.paper}, 0.55)`;
      ctx.fillText(`${sealed.toLocaleString("en-US")} / ${total.toLocaleString("en-US")} blocks`, width - 16, 15);

      // Scan line sweeping left to right
      const scanX = ((t * 0.45) % 1.4) * (width + 80) - 40;

      ctx.font = "600 10.5px 'Instrument Sans', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      for (let i = 0; i < total; i++) {
        const x = gridX + (i % cols) * CELL;
        const y = gridY + Math.floor(i / cols) * CELL;
        const cx = x + CELL / 2;
        const cy = y + CELL / 2;
        const isSealed = rank[i] < sealed;

        if (isSealed) {
          if (sealedAt[i] < 0) {
            sealedAt[i] = now;
          }
          const age = now - sealedAt[i];
          const flash = Math.max(0, 1 - age / 350); // bright flash on the moment of sealing
          const color = finished ? COLORS.sage : COLORS.brass;
          const bg = 0.1 + flash * 0.25;
          ctx.fillStyle = `rgba(${color}, ${bg})`;
          ctx.fillRect(x + 1, y + 1, CELL - 3, CELL - 3);
          ctx.fillStyle = flash > 0 ? `rgba(${COLORS.brassHi}, 1)` : `rgba(${color}, 0.95)`;
        } else {
          // Unsealed blocks keep scrambling
          if (Math.random() < 0.2) values[i] = randHex();
          const near = Math.max(0, 1 - Math.abs(cx - scanX) / 46);
          ctx.fillStyle = `rgba(${COLORS.paper}, ${0.05 + near * 0.12})`;
          ctx.fillRect(x + 1, y + 1, CELL - 3, CELL - 3);
          ctx.fillStyle = near > 0.05 ? `rgba(${COLORS.brassHi}, ${0.45 + near * 0.5})` : `rgba(${COLORS.paper}, 0.32)`;
        }
        ctx.fillText(values[i], cx, cy + 0.5);
      }

      // Entropy bar chart along the bottom, growing as the file is sealed
      const baseY = height - 10;
      ctx.fillStyle = `rgba(${COLORS.paper}, 0.12)`;
      ctx.fillRect(12, baseY, width - 24, 1);

      const barW = 5;
      const gap = (width - 24 - bars.length * barW) / Math.max(1, bars.length - 1);
      bars.forEach((seed, i) => {
        const wave = 0.5 + 0.5 * Math.sin(t * 3.2 + i * 0.55);
        const pulse = 0.4 + 0.6 * wave * seed;
        const h = Math.max(3, (CHART_H - 22) * pulse * (0.25 + 0.75 * displayed));
        const bx = 12 + i * (barW + gap);
        const active = i / bars.length < displayed;
        ctx.fillStyle = active ? `rgba(${COLORS.brassHi}, 0.9)` : `rgba(${COLORS.paper}, 0.18)`;
        ctx.fillRect(bx, baseY - h, barW, h);
      });
    }

    function frame(now) {
      if (!running) return;
      // Ease the displayed value toward the real progress, never beyond it
      displayed += (progress - displayed) * 0.2;
      if (progress >= 1) displayed = 1;
      draw(now);
      frameId = requestAnimationFrame(frame);
    }

    return {
      start(label = "Encrypting") {
        resize();
        mode = label;
        progress = 0;
        displayed = 0;
        finished = false;
        startedAt = performance.now();
        running = true;
        cancelAnimationFrame(frameId);
        frameId = requestAnimationFrame(frame);
      },
      setProgress(fraction) {
        progress = Math.max(progress, Math.min(1, fraction));
        if (progress >= 1) finished = true;
      },
      stop() {
        running = false;
        cancelAnimationFrame(frameId);
      },
    };
  }

  return { create };
})();
