/* ============================================================
   Animated theme-aware background
   - aurora mode : drifting aurora blobs + dust/stars + vignette
   - cellular    : flowing 1D Rule 30 cellular automaton
   - reads colors from the active theme's CSS variables
   - respects prefers-reduced-motion
   ============================================================ */
(function () {
    "use strict";

    const canvas = document.getElementById("bgCanvas");
    if (!canvas || !canvas.getContext) return;

    const ctx = canvas.getContext("2d");
    const TAU = Math.PI * 2;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const STORE_KEY = "site-bg-v1";
    const MODES = ["aurora", "cellular"];

    let width = 0;
    let height = 0;
    let dpr = 1;
    let mode = "aurora";

    let blobs = [];
    let stars = [];

    const ca = {
        cell: 8,
        rowH: 9,
        cols: 0,
        rows: 0,
        buf: [],
        scroll: 0,
        speed: 0.16,
        tick: 0,
        seedEvery: 40
    };

    let rafId = null;
    let running = false;
    let palette = {
        bg: "#ffffff",
        accents: ["#0969da", "#8250df", "#bf3989", "#0969da"],
        luminance: 1
    };

    function hexToRgb(hex) {
        let h = String(hex || "").trim().replace(/^#/, "");
        if (h.length === 3) {
            h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        }
        if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
        const num = parseInt(h, 16);
        return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
    }

    function rgba(color, alpha) {
        const rgb = hexToRgb(color);
        if (!rgb) return "rgba(120,140,200," + alpha + ")";
        return "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + "," + alpha + ")";
    }

    function luminanceOf(color) {
        const rgb = hexToRgb(color);
        if (!rgb) return 1;
        return (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
    }

    function clamp01(value) {
        return value < 0 ? 0 : value > 1 ? 1 : value;
    }

    function readPalette() {
        const cs = getComputedStyle(document.documentElement);
        const accentTokens = ["--cyan", "--violet", "--pink", "--indigo", "--link"];
        const accents = [];
        accentTokens.forEach(function (token) {
            const value = cs.getPropertyValue(token).trim();
            if (value && accents.indexOf(value) === -1) accents.push(value);
        });
        const bg = cs.getPropertyValue("--bg").trim() || "#ffffff";
        palette.bg = bg;
        palette.accents = accents.length ? accents : ["#0969da", "#8250df", "#bf3989"];
        palette.luminance = luminanceOf(bg);
    }

    function readMode() {
        try {
            const saved = localStorage.getItem(STORE_KEY);
            return MODES.indexOf(saved) !== -1 ? saved : "aurora";
        } catch (e) {
            return "aurora";
        }
    }

    /* ---------------- Aurora mode ---------------- */

    function buildAurora() {
        const max = Math.max(width, height);
        blobs = [];
        const blobCount = width < 720 ? 3 : 4;
        for (let i = 0; i < blobCount; i += 1) {
            blobs.push({
                cx: Math.random() * width,
                cy: Math.random() * height,
                r: max * (0.26 + Math.random() * 0.2),
                rx: max * (0.12 + Math.random() * 0.16),
                ry: max * (0.12 + Math.random() * 0.16),
                sx: 0.14 + Math.random() * 0.16,
                sy: 0.11 + Math.random() * 0.14,
                phase: Math.random() * TAU,
                alpha: 0.12 + Math.random() * 0.1
            });
        }

        stars = [];
        const starCount = Math.min(120, Math.max(36, Math.round((width * height) / 13000)));
        for (let i = 0; i < starCount; i += 1) {
            stars.push({
                x: Math.random() * width,
                y: Math.random() * height,
                r: Math.random() < 0.85 ? rand(0.5, 1.2) : rand(1.3, 2.1),
                vy: rand(5, 18),
                sway: rand(8, 26),
                swaySpeed: rand(0.1, 0.4),
                twinkle: rand(0.6, 1.8),
                phase: Math.random() * TAU,
                alpha: rand(0.25, 0.85),
                hue: Math.random()
            });
        }
    }

    /* ---------------- Cellular (Rule 30) mode ---------------- */

    function nextRow(prev) {
        const n = prev.length;
        const out = new Uint8Array(n);
        for (let i = 0; i < n; i += 1) {
            const left = prev[(i - 1 + n) % n];
            const center = prev[i];
            const right = prev[(i + 1) % n];
            // Rule 30: left XOR (center OR right)
            out[i] = (left ^ (center | right)) ? 1 : 0;
        }
        return out;
    }

    function randomRow() {
        const row = new Uint8Array(ca.cols);
        const count = Math.max(1, Math.round(ca.cols * 0.05));
        for (let i = 0; i < count; i += 1) {
            row[Math.floor(Math.random() * ca.cols)] = 1;
        }
        return row;
    }

    function buildCA() {
        ca.cell = width < 720 ? 9 : 8;
        ca.rowH = ca.cell * 1.12;
        ca.cols = Math.max(12, Math.ceil(width / ca.cell) + 1);
        ca.rows = Math.max(8, Math.ceil(height / ca.rowH) + 1);
        ca.seedEvery = Math.max(24, Math.round(ca.rows * 1.2));
        ca.buf = [];
        for (let i = 0; i < ca.rows; i += 1) {
            ca.buf.push(new Uint8Array(ca.cols));
        }
        ca.scroll = 0;
        ca.tick = 0;
        reseedCA();
    }

    function reseedCA() {
        const seed = randomRow();
        ca.buf[0] = seed;
        for (let i = 1; i < ca.rows; i += 1) {
            ca.buf[i] = nextRow(ca.buf[i - 1]);
        }
    }

    function stepCA() {
        if (reducedMotion) return;
        ca.scroll += ca.speed;
        if (ca.scroll >= ca.rowH) {
            ca.scroll -= ca.rowH;
            const prev = ca.buf[0];
            ca.tick += 1;
            const next = ca.tick % ca.seedEvery === 0 ? randomRow() : nextRow(prev);
            for (let i = ca.rows - 1; i > 0; i -= 1) {
                ca.buf[i] = ca.buf[i - 1];
            }
            ca.buf[0] = next;
        }
    }

    function renderCellular() {
        const dark = palette.luminance < 0.5;
        const baseAlpha = dark ? 0.85 : 0.5;
        const cell = ca.cell;
        const lineW = Math.max(1, cell * 0.6);
        const baseY = height - ca.rowH;

        ctx.save();
        ctx.lineCap = "round";
        ctx.lineWidth = lineW;
        ctx.globalCompositeOperation = dark ? "lighter" : "source-over";

        for (let i = 0; i < ca.rows; i += 1) {
            const row = ca.buf[i];
            if (!row) continue;
            const y = baseY - i * ca.rowH + ca.scroll;
            if (y < -ca.rowH || y > height) continue;

            const age = i / ca.rows;
            const alpha = clamp01(1 - age * 0.85) * baseAlpha;
            if (alpha <= 0.012) continue;

            const color = palette.accents[Math.floor(age * palette.accents.length) % palette.accents.length];
            ctx.strokeStyle = rgba(color, alpha);

            ctx.beginPath();
            let inRun = false;
            let runStart = 0;
            for (let j = 0; j < row.length; j += 1) {
                if (row[j]) {
                    if (!inRun) {
                        inRun = true;
                        runStart = j;
                    }
                } else if (inRun) {
                    ctx.moveTo(runStart * cell, y);
                    ctx.lineTo(j * cell, y);
                    inRun = false;
                }
            }
            if (inRun) {
                ctx.moveTo(runStart * cell, y);
                ctx.lineTo(row.length * cell, y);
            }
            ctx.stroke();
        }
        ctx.restore();

        drawVignette();
    }

    /* ---------------- Shared layers ---------------- */

    function rand(min, max) {
        return min + Math.random() * (max - min);
    }

    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        buildAurora();
        buildCA();
        if (reducedMotion) render(0);
    }

    function drawBase() {
        ctx.fillStyle = palette.bg;
        ctx.fillRect(0, 0, width, height);

        const bg = hexToRgb(palette.bg);
        if (bg) {
            const shade = "rgb(" + Math.max(0, bg.r - 14) + "," + Math.max(0, bg.g - 14) + "," + Math.max(0, bg.b - 14) + ")";
            const g = ctx.createLinearGradient(0, 0, 0, height);
            g.addColorStop(0, rgba(palette.accents[0], 0.05));
            g.addColorStop(0.6, "rgba(0,0,0,0)");
            g.addColorStop(1, shade);
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, width, height);
        }
    }

    function drawBlobs(t) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const dark = palette.luminance < 0.5;
        blobs.forEach(function (b, i) {
            const ax = b.cx + Math.sin(t * b.sx + b.phase) * b.rx;
            const ay = b.cy + Math.cos(t * b.sy + b.phase * 1.3) * b.ry;
            const color = palette.accents[i % palette.accents.length];
            const baseAlpha = dark ? b.alpha : b.alpha * 0.5;
            const g = ctx.createRadialGradient(ax, ay, 0, ax, ay, b.r);
            g.addColorStop(0, rgba(color, baseAlpha));
            g.addColorStop(0.45, rgba(color, baseAlpha * 0.35));
            g.addColorStop(1, rgba(color, 0));
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(ax, ay, b.r, 0, TAU);
            ctx.fill();
        });
        ctx.restore();
    }

    function drawStars(t) {
        const dark = palette.luminance < 0.5;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        stars.forEach(function (s) {
            const y = (s.y - t * s.vy) % height;
            const yy = y < 0 ? y + height : y;
            const x = s.x + Math.sin(t * s.swaySpeed + s.phase) * s.sway;
            const tw = 0.5 + 0.5 * Math.sin(t * s.twinkle + s.phase);
            let alpha = s.alpha * (0.4 + 0.6 * tw);
            if (!dark) alpha *= 0.5;
            ctx.fillStyle = dark
                ? "rgba(232,240,255," + alpha.toFixed(3) + ")"
                : rgba(palette.accents[Math.floor(s.hue * palette.accents.length) % palette.accents.length], alpha * 0.7);
            ctx.beginPath();
            ctx.arc(x, yy, s.r, 0, TAU);
            ctx.fill();
            if (s.r > 1.5 && dark) {
                ctx.fillStyle = "rgba(255,255,255," + (alpha * 0.22).toFixed(3) + ")";
                ctx.beginPath();
                ctx.arc(x, yy, s.r * 2.6, 0, TAU);
                ctx.fill();
            }
        });
        ctx.restore();
    }

    function drawVignette() {
        if (palette.luminance >= 0.5) return;
        const g = ctx.createRadialGradient(
            width * 0.5, height * 0.44, Math.min(width, height) * 0.22,
            width * 0.5, height * 0.5, Math.max(width, height) * 0.78
        );
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(1, "rgba(0,0,0,0.32)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, width, height);
    }

    function renderAurora(t) {
        ctx.clearRect(0, 0, width, height);
        drawBase();
        drawBlobs(t);
        drawStars(t);
        drawVignette();
    }

    function render(t) {
        if (!width || !height) return;
        if (mode === "cellular") {
            ctx.clearRect(0, 0, width, height);
            drawBase();
            stepCA();
            renderCellular();
        } else {
            renderAurora(t);
        }
    }

    function frame(now) {
        rafId = null;
        if (!running) return;
        render(now / 1000);
        rafId = requestAnimationFrame(frame);
    }

    function start() {
        if (running || reducedMotion || document.hidden) return;
        running = true;
        rafId = requestAnimationFrame(frame);
    }

    function stop() {
        running = false;
        if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
    }

    let resizeTimer = 0;
    function queueResize() {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(resize, 120);
    }

    /* ---------------- Init & events ---------------- */

    mode = readMode();
    readPalette();
    resize();

    document.addEventListener("themechange", function () {
        readPalette();
        if (reducedMotion) render(0);
    });

    document.addEventListener("bgchange", function (event) {
        const next = event.detail && event.detail.mode;
        if (MODES.indexOf(next) === -1 || next === mode) return;
        mode = next;
        if (reducedMotion) render(0);
    });

    document.addEventListener("visibilitychange", function () {
        if (document.hidden) stop();
        else start();
    });

    window.addEventListener("resize", queueResize, { passive: true });
    start();
})();
