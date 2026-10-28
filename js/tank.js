(function () {
    "use strict";

    const canvas = document.getElementById("tankCanvas");
    if (!canvas) return;
    const stage = canvas.parentElement;
    const ctx = canvas.getContext ? canvas.getContext("2d") : null;
    if (!stage || !ctx) return;

    const TAU = Math.PI * 2;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const MAX_FISH = 40;
    const MIN_FISH = 6;
    const MAX_FOOD = 150;
    const MAX_PLANTS = 5;
    const FOOD_ENERGY = 0.32;
    const ENERGY_DECAY = 0.0075;
    const HUNGRY = 0.7;
    const DEFAULT_TIP = "点击水面撒饵 · 水草在阳光下进行光合作用";
    const PLANT_TIP = "点击水面种下水草 · 最多 5 株";

    const SPECIES = [
        { size: 9, speed: 92, color: "#ff9f43", accent: "#ffe8c9", fin: "#ffb36b", stripe: true, school: 1 },
        { size: 11, speed: 74, color: "#4cc9f0", accent: "#dff6ff", fin: "#2b8fb8", stripe: false, school: 0.9 },
        { size: 15, speed: 54, color: "#ffd166", accent: "#fff1c9", fin: "#f4a261", stripe: false, school: 0.5 }
    ];

    const btnFeed = document.getElementById("tankFeed");
    const btnPlant = document.getElementById("tankPlant");
    const btnClean = document.getElementById("tankClean");
    const btnPause = document.getElementById("tankPause");
    const pausedEl = document.getElementById("tankPaused");
    const tipEl = document.getElementById("tankTip");
    const statusEl = document.getElementById("tankStatus");
    const hudEls = {
        fish: document.querySelector('[data-tank="fish"]'),
        food: document.querySelector('[data-tank="food"]'),
        plants: document.querySelector('[data-tank="plants"]')
    };

    let width = 0;
    let height = 0;
    let dpr = 1;
    let sandY = 0;
    let visualScale = 1;
    let initialized = false;

    let fish = [];
    let food = [];
    let plants = [];
    let bubbles = [];
    let specks = [];
    let ripples = [];
    let pebbles = [];
    let kelp = [];

    let palette = {
        top: "#0a3a57",
        mid: "#07506f",
        deep: "#03202f",
        sand: "#d9c59b",
        sandDark: "#a88f68",
        plant: "#2fbf71",
        plantDark: "#12684a",
        glow: "150, 235, 255"
    };

    let elapsed = 0;
    let lastTime = 0;
    let rafId = null;
    let resizeFrame = 0;
    let visible = false;
    let paused = reducedMotion;
    let mode = "feed";
    let tipTimer = 0;
    let rescueTimer = 5;
    let hudCache = { fish: -1, food: -1, plants: -1 };
    let keyCursor = null;
    const pointer = { x: 0, y: 0, active: false };

    function rand(min, max) {
        return min + Math.random() * (max - min);
    }

    function clamp(value, min, max) {
        return value < min ? min : value > max ? max : value;
    }

    function readPalette() {
        const styles = getComputedStyle(stage);
        palette = {
            top: styles.getPropertyValue("--tank-top").trim() || palette.top,
            mid: styles.getPropertyValue("--tank-mid").trim() || palette.mid,
            deep: styles.getPropertyValue("--tank-deep").trim() || palette.deep,
            sand: styles.getPropertyValue("--tank-sand").trim() || palette.sand,
            sandDark: styles.getPropertyValue("--tank-sand-dark").trim() || palette.sandDark,
            plant: styles.getPropertyValue("--tank-plant").trim() || palette.plant,
            plantDark: styles.getPropertyValue("--tank-plant-dark").trim() || palette.plantDark,
            glow: styles.getPropertyValue("--tank-glow").trim() || palette.glow
        };
    }

    function buildBed() {
        pebbles = [];
        const pebbleCount = Math.max(12, Math.round(width / 52));
        for (let i = 0; i < pebbleCount; i += 1) {
            pebbles.push({
                x: rand(0, width),
                y: rand(sandY + 12, height - 2),
                r: rand(1.8, 6.5),
                a: rand(0.18, 0.42)
            });
        }

        kelp = [];
        const kelpCount = Math.max(3, Math.round(width / 240));
        for (let i = 0; i < kelpCount; i += 1) {
            kelp.push({
                x: ((i + 0.35 + Math.random() * 0.3) / kelpCount) * width,
                h: height * rand(0.16, 0.32),
                phase: rand(0, TAU),
                w: rand(4, 9)
            });
        }

        specks = [];
        for (let i = 0; i < 34; i += 1) {
            specks.push({
                x: rand(0, width),
                y: rand(0, sandY),
                r: rand(0.5, 1.4),
                phase: rand(0, TAU),
                speed: rand(3, 9)
            });
        }
    }

    function initWorld() {
        fish = [];
        food = [];
        plants = [];
        bubbles = [];
        ripples = [];
        elapsed = 0;
        rescueTimer = 5;

        const plan = width < 620 ? [6, 4, 2] : [8, 6, 4];
        plan.forEach(function (count, species) {
            for (let i = 0; i < count; i += 1) {
                createFish(species, rand(width * 0.14, width * 0.86), rand(height * 0.18, sandY - 50), 1);
            }
        });

        for (let i = 0; i < 2; i += 1) {
            plants.push({
                x: width * (0.24 + i * 0.48) + rand(-12, 12),
                h: rand(0.36, 0.5) * height,
                phase: rand(0, TAU),
                timer: rand(2, 5)
            });
        }

        for (let i = 0; i < 20; i += 1) bubbles.push(makeBubble(true));
        buildBed();
    }

    function resize() {
        const rect = stage.getBoundingClientRect();
        const nextWidth = Math.max(280, Math.round(rect.width));
        const nextHeight = Math.max(240, Math.round(rect.height));
        const oldWidth = width;
        const oldHeight = height;

        width = nextWidth;
        height = nextHeight;
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        visualScale = Math.min(1, Math.max(0.62, width / 1040));
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        sandY = height * 0.845;

        if (!initialized && lazyInited) {
            initialized = true;
            initWorld();
        } else if (initialized) {
            const sx = oldWidth ? width / oldWidth : 1;
            const sy = oldHeight ? height / oldHeight : 1;
            fish.forEach(function (f) {
                f.x *= sx;
                f.y *= sy;
                f.x = clamp(f.x, 10, width - 10);
                f.y = clamp(f.y, 10, sandY - 12);
            });
            food.forEach(function (o) {
                o.x *= sx;
                o.y = clamp(o.y * sy, 8, sandY - 4);
            });
            plants.forEach(function (p) {
                p.x *= sx;
                p.h *= sy;
            });
            if (keyCursor) {
                keyCursor.x *= sx;
                keyCursor.y *= sy;
            }
            buildBed();
        }

        updateHud(true);
        render();
    }

    function queueResize() {
        if (resizeFrame) return;
        resizeFrame = requestAnimationFrame(function () {
            resizeFrame = 0;
            resize();
        });
    }

    function createFish(species, x, y, scale) {
        const spec = SPECIES[species];
        const base = spec.size * rand(0.9, 1.1);
        const angle = rand(0, TAU);
        const speed = spec.speed * rand(0.35, 0.5);
        const f = {
            s: species,
            x: x == null ? rand(width * 0.15, width * 0.85) : x,
            y: y == null ? rand(height * 0.2, sandY - 40) : y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: base * (scale || 1),
            baseSize: base,
            energy: rand(0.55, 0.82),
            phase: rand(0, TAU),
            wobble: rand(0, TAU),
            repro: rand(14, 30)
        };
        fish.push(f);
        return f;
    }

    function makeBubble(anywhere) {
        return {
            x: rand(0, width),
            y: anywhere ? rand(0, height) : height + rand(0, 24),
            r: rand(1.1, 3.2),
            speed: rand(12, 34),
            phase: rand(0, TAU),
            a: rand(0.35, 1)
        };
    }

    function addRipple(x, y, max) {
        ripples.push({ x: x, y: y, max: max, t: 0, life: 0.9 });
        if (ripples.length > 10) ripples.shift();
    }

    function addPlant(x, announce) {
        if (plants.length >= MAX_PLANTS) return false;
        plants.push({
            x: clamp(x, 26, width - 26),
            h: rand(0.34, 0.52) * height,
            phase: rand(0, TAU),
            timer: rand(3, 7)
        });
        addRipple(x, sandY - 6, 26);
        if (announce) {
            announceStatus("种下一株水草，它会在阳光下持续产生浮游生物。");
            setTip("水草 +1 · 最多 5 株");
        }
        updateHud(true);
        return true;
    }

    function addFood(x, y, count, quiet) {
        const total = count || 4;
        for (let i = 0; i < total; i += 1) {
            if (food.length >= MAX_FOOD) food.shift();
            food.push({
                x: clamp(x + rand(-22, 22), 8, width - 8),
                y: clamp(y + rand(-16, 16), 12, sandY - 4),
                vx: rand(-4, 4),
                vy: rand(12, 26),
                r: rand(1.5, 2.6),
                phase: rand(0, TAU),
                age: 0,
                life: rand(26, 38),
                rest: false
            });
        }
        if (!quiet) {
            addRipple(x, y, 30);
            announceStatus("撒下一把饵料。");
            setTip("饵料 +" + total + " · 鱼群会循着味道聚过来");
        }
        updateHud(true);
    }

    function updateHud(force) {
        const counts = { fish: fish.length, food: food.length, plants: plants.length };
        Object.keys(counts).forEach(function (key) {
            if (!force && hudCache[key] === counts[key]) return;
            hudCache[key] = counts[key];
            if (hudEls[key]) hudEls[key].textContent = String(counts[key]);
        });
    }

    function setTip(text, hold) {
        if (!tipEl) return;
        window.clearTimeout(tipTimer);
        tipEl.textContent = text;
        if (!hold) {
            tipTimer = window.setTimeout(function () {
                tipEl.textContent = mode === "plant" ? PLANT_TIP : DEFAULT_TIP;
            }, 2600);
        }
    }

    function announceStatus(text) {
        if (statusEl) statusEl.textContent = text;
    }

    function setMode(next) {
        mode = next === "plant" ? "plant" : "feed";
        if (btnFeed) btnFeed.setAttribute("aria-pressed", mode === "feed" ? "true" : "false");
        if (btnPlant) btnPlant.setAttribute("aria-pressed", mode === "plant" ? "true" : "false");
        stage.classList.toggle("is-planting", mode === "plant");
        if (!paused) setTip(mode === "plant" ? PLANT_TIP : DEFAULT_TIP, true);
    }

    function setPaused(next) {
        paused = next;
        if (btnPause) {
            btnPause.setAttribute("aria-pressed", paused ? "true" : "false");
            btnPause.textContent = paused ? "继续" : "暂停";
        }
        if (pausedEl) pausedEl.hidden = !paused;
        if (paused) {
            stop();
            render();
            setTip("生态暂停中 · 点击「继续」恢复", true);
        } else {
            sync();
            setTip(mode === "plant" ? PLANT_TIP : DEFAULT_TIP, true);
        }
    }

    function nearestFood(f) {
        let best = null;
        let bestDistance = 260 * 260;
        for (let i = 0; i < food.length; i += 1) {
            const o = food[i];
            const dx = o.x - f.x;
            const dy = o.y - f.y;
            const distance = dx * dx + dy * dy;
            if (distance < bestDistance) {
                bestDistance = distance;
                best = o;
            }
        }
        return best;
    }

    function step(dt) {
        elapsed += dt;

        for (let i = 0; i < fish.length; i += 1) {
            const f = fish[i];
            const spec = SPECIES[f.s];
            let ax = Math.cos(elapsed * 0.8 + f.phase) * 20;
            let ay = Math.sin(elapsed * 0.66 + f.wobble) * 16;
            let sepX = 0;
            let sepY = 0;
            let aliX = 0;
            let aliY = 0;
            let cohX = 0;
            let cohY = 0;
            let same = 0;
            const sepRadius = 14 + f.size * 2.2;
            const nearRadius = 54 + f.size * 2.4;

            for (let j = 0; j < fish.length; j += 1) {
                if (i === j) continue;
                const other = fish[j];
                const dx = f.x - other.x;
                const dy = f.y - other.y;
                const distance2 = dx * dx + dy * dy;
                if (distance2 > nearRadius * nearRadius || distance2 < 0.0001) continue;
                const distance = Math.sqrt(distance2);
                if (distance < sepRadius) {
                    sepX += (dx / distance / distance) * 10;
                    sepY += (dy / distance / distance) * 10;
                }
                if (other.s === f.s) {
                    aliX += other.vx;
                    aliY += other.vy;
                    cohX += other.x;
                    cohY += other.y;
                    same += 1;
                }
            }

            ax += sepX * 1200;
            ay += sepY * 1200;

            if (same > 0) {
                ax += (aliX / same - f.vx) * spec.school * 1.35;
                ay += (aliY / same - f.vy) * spec.school * 1.35;
                const cx = cohX / same - f.x;
                const cy = cohY / same - f.y;
                const cd = Math.hypot(cx, cy) || 1;
                ax += (cx / cd) * spec.school * 70;
                ay += (cy / cd) * spec.school * 70;
            }

            if (f.energy < HUNGRY) {
                const target = nearestFood(f);
                if (target) {
                    const dx = target.x - f.x;
                    const dy = target.y - f.y;
                    const distance = Math.hypot(dx, dy) || 1;
                    ax += (dx / distance) * 260;
                    ay += (dy / distance) * 260;
                } else if (plants.length) {
                    let bestPlant = null;
                    let bestDistance = 320 * 320;
                    plants.forEach(function (p) {
                        const dx = p.x - f.x;
                        const dy = sandY - p.h * 0.6 - f.y;
                        const distance2 = dx * dx + dy * dy;
                        if (distance2 < bestDistance) {
                            bestDistance = distance2;
                            bestPlant = p;
                        }
                    });
                    if (bestPlant) {
                        const dx = bestPlant.x - f.x;
                        const dy = sandY - bestPlant.h * 0.6 - f.y;
                        const distance = Math.hypot(dx, dy) || 1;
                        ax += (dx / distance) * 60;
                        ay += (dy / distance) * 60;
                    }
                }
            }

            if (pointer.active) {
                const dx = f.x - pointer.x;
                const dy = f.y - pointer.y;
                const distance2 = dx * dx + dy * dy;
                if (distance2 < 8100 && distance2 > 0.01) {
                    const distance = Math.sqrt(distance2);
                    const force = (1 - distance / 90) * 150;
                    ax += (dx / distance) * force;
                    ay += (dy / distance) * force;
                }
            }

            const sideMargin = 46;
            const topMargin = 34;
            const bottomMargin = 40;
            if (f.x < sideMargin) ax += (sideMargin - f.x) * 4;
            if (f.x > width - sideMargin) ax -= (f.x - (width - sideMargin)) * 4;
            if (f.y < topMargin) ay += (topMargin - f.y) * 4;
            if (f.y > sandY - bottomMargin) ay -= (f.y - (sandY - bottomMargin)) * 4;

            const accel = Math.hypot(ax, ay);
            const maxAccel = spec.speed * 5;
            if (accel > maxAccel) {
                ax = (ax / accel) * maxAccel;
                ay = (ay / accel) * maxAccel;
            }

            f.vx += ax * dt;
            f.vy += ay * dt;

            let speed = Math.hypot(f.vx, f.vy);
            const maxSpeed = spec.speed * (f.energy < 0.25 ? 0.6 : 1) * (0.9 + f.size / 60);
            if (speed > maxSpeed) {
                f.vx = (f.vx / speed) * maxSpeed;
                f.vy = (f.vy / speed) * maxSpeed;
                speed = maxSpeed;
            }
            const minSpeed = spec.speed * 0.28;
            if (speed < minSpeed && speed > 0.001) {
                f.vx = (f.vx / speed) * minSpeed;
                f.vy = (f.vy / speed) * minSpeed;
            }

            f.x = clamp(f.x + f.vx * dt, 10, width - 10);
            f.y = clamp(f.y + f.vy * dt, 10, sandY - 12);

            f.energy -= ENERGY_DECAY * dt;
            if (f.size < f.baseSize) f.size = Math.min(f.baseSize, f.size + 5 * dt);
            if (f.repro > 0) f.repro -= dt;
            if (f.repro <= 0 && f.energy > 0.85 && fish.length < MAX_FISH) {
                f.energy -= 0.18;
                f.repro = rand(22, 38);
                const baby = createFish(f.s, f.x + rand(-14, 14), f.y + rand(-14, 14), 0.5);
                baby.energy = 0.5;
                addRipple(baby.x, baby.y, 14);
            }
        }

        for (let i = food.length - 1; i >= 0; i -= 1) {
            const pellet = food[i];
            pellet.age += dt;
            if (!pellet.rest) {
                pellet.x += pellet.vx * dt;
                pellet.y += pellet.vy * dt;
                pellet.x += Math.sin(elapsed * 0.8 + pellet.phase) * 6 * dt;
                if (pellet.y >= sandY - 3) {
                    pellet.y = sandY - 3;
                    pellet.rest = true;
                }
            }

            let eaten = false;
            for (let j = 0; j < fish.length; j += 1) {
                const f = fish[j];
                const eatRadius = 8 + f.size;
                const dx = f.x - pellet.x;
                const dy = f.y - pellet.y;
                if (dx * dx + dy * dy < eatRadius * eatRadius) {
                    f.energy = Math.min(1, f.energy + FOOD_ENERGY);
                    eaten = true;
                    break;
                }
            }

            if (eaten || pellet.age > pellet.life) {
                if (eaten) addRipple(pellet.x, pellet.y, 10);
                food.splice(i, 1);
            }
        }

        plants.forEach(function (p) {
            p.timer -= dt;
            if (p.timer <= 0) {
                p.timer = rand(5, 9);
                if (food.length < 70) {
                    addFood(p.x + rand(-12, 12), sandY - p.h + rand(0, 18), 1, true);
                }
            }
        });

        bubbles.forEach(function (b) {
            b.y -= b.speed * dt;
            b.x += Math.sin(elapsed * 1.2 + b.phase) * 8 * dt;
            if (b.y < -8) {
                b.y = height + rand(0, 24);
                b.x = rand(0, width);
            }
        });
        if (bubbles.length < 26 && Math.random() < dt * 1.8) bubbles.push(makeBubble(false));

        specks.forEach(function (s) {
            s.y += s.speed * dt * 0.4;
            s.x += Math.sin(elapsed * 0.4 + s.phase) * 4 * dt;
            if (s.y > sandY) {
                s.y = rand(0, sandY * 0.8);
                s.x = rand(0, width);
            }
            if (s.x < 0) s.x += width;
            if (s.x > width) s.x -= width;
        });

        ripples.forEach(function (r) {
            r.t += dt;
        });
        ripples = ripples.filter(function (r) {
            return r.t < r.life;
        });

        const survivors = [];
        fish.forEach(function (f) {
            if (f.energy > 0) {
                survivors.push(f);
            } else {
                for (let i = 0; i < 2; i += 1) {
                    bubbles.push({
                        x: f.x + rand(-6, 6),
                        y: f.y + rand(-6, 6),
                        r: rand(1, 2.4),
                        speed: rand(16, 30),
                        phase: rand(0, TAU),
                        a: 0.8
                    });
                }
            }
        });
        fish = survivors;

        rescueTimer -= dt;
        if (fish.length < MIN_FISH && rescueTimer <= 0) {
            const baby = createFish(
                Math.floor(Math.random() * SPECIES.length),
                rand(width * 0.2, width * 0.8),
                rand(height * 0.3, sandY - 60),
                0.55
            );
            baby.energy = 0.6;
            rescueTimer = 4;
            announceStatus("鱼群太少，补进了一条小鱼苗。");
        }

        updateHud(false);
    }

    function drawWater() {
        const water = ctx.createLinearGradient(0, 0, 0, height);
        water.addColorStop(0, palette.top);
        water.addColorStop(0.55, palette.mid);
        water.addColorStop(1, palette.deep);
        ctx.fillStyle = water;
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < 4; i += 1) {
            const x = width * (0.12 + i * 0.25) + Math.sin(elapsed * 0.2 + i * 1.7) * 36;
            const w = width * 0.08;
            const ray = ctx.createLinearGradient(x, 0, x + w, sandY);
            ray.addColorStop(0, "rgba(" + palette.glow + ", 0.14)");
            ray.addColorStop(0.55, "rgba(" + palette.glow + ", 0.05)");
            ray.addColorStop(1, "rgba(" + palette.glow + ", 0)");
            ctx.fillStyle = ray;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x + w * 0.5, 0);
            ctx.lineTo(x + w * 2.2, sandY);
            ctx.lineTo(x + w * 0.9, sandY);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }

    function drawSpecks() {
        if (!specks.length) return;
        ctx.save();
        ctx.fillStyle = "rgba(" + palette.glow + ", 0.6)";
        specks.forEach(function (s) {
            ctx.globalAlpha = 0.16 + 0.12 * Math.sin(elapsed * 0.8 + s.phase);
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, TAU);
            ctx.fill();
        });
        ctx.restore();
    }

    function drawSand() {
        const sand = ctx.createLinearGradient(0, sandY, 0, height);
        sand.addColorStop(0, palette.sand);
        sand.addColorStop(1, palette.sandDark);
        ctx.fillStyle = sand;
        ctx.beginPath();
        ctx.moveTo(0, height);
        ctx.lineTo(0, sandY + 8);
        for (let x = 0; x <= width; x += 24) {
            const y = sandY + Math.sin(x * 0.012) * 6 + Math.sin(x * 0.03 + 1.3) * 3;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(width, height);
        ctx.closePath();
        ctx.fill();

        pebbles.forEach(function (p) {
            ctx.globalAlpha = p.a;
            ctx.fillStyle = palette.sandDark;
            ctx.beginPath();
            ctx.ellipse(p.x, p.y, p.r * 1.4, p.r * 0.75, 0, 0, TAU);
            ctx.fill();
        });
        ctx.globalAlpha = 1;
    }

    function drawKelp() {
        ctx.save();
        ctx.strokeStyle = palette.plantDark;
        ctx.lineCap = "round";
        ctx.globalAlpha = 0.3;
        kelp.forEach(function (k) {
            const sway = Math.sin(elapsed * 0.6 + k.phase) * 14;
            ctx.lineWidth = k.w;
            ctx.beginPath();
            ctx.moveTo(k.x, sandY + 6);
            ctx.quadraticCurveTo(k.x + sway * 0.4, sandY - k.h * 0.55, k.x + sway, sandY - k.h);
            ctx.stroke();
        });
        ctx.restore();
    }

    function drawPlant(p, ghost) {
        const baseX = p.x;
        const baseY = sandY + 4;
        const swayBase = Math.sin(elapsed * 1.15 + p.phase);
        ctx.save();
        if (ghost) ctx.globalAlpha = 0.35;
        for (let i = 0; i < 4; i += 1) {
            const offset = (i - 1.5) * 7;
            const sway = swayBase * (8 + i * 3) + Math.sin(elapsed * 1.4 + p.phase + i) * 4;
            const tipX = baseX + offset + sway;
            const tipY = baseY - p.h * (0.72 + (i % 2) * 0.18);
            ctx.strokeStyle = i % 2 ? palette.plantDark : palette.plant;
            ctx.lineWidth = 2.6;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(baseX + offset * 0.4, baseY);
            ctx.quadraticCurveTo(baseX + offset + sway * 0.35, baseY - p.h * 0.5, tipX, tipY);
            ctx.stroke();

            for (let l = 1; l <= 3; l += 1) {
                const t = l / 4;
                const lx = baseX + offset * 0.4 + (tipX - baseX - offset * 0.4) * t + sway * 0.2 * t;
                const ly = baseY - (baseY - tipY) * t;
                ctx.fillStyle = l % 2 ? palette.plant : palette.plantDark;
                ctx.beginPath();
                ctx.ellipse(lx + (l % 2 ? 7 : -7), ly, 6.5, 2.6, l % 2 ? -0.6 : 0.6, 0, TAU);
                ctx.fill();
            }
        }
        ctx.restore();
    }

    function drawFood() {
        food.forEach(function (pellet) {
            const pulse = 0.7 + Math.sin(elapsed * 3 + pellet.phase) * 0.2;
            ctx.fillStyle = "rgba(255, 226, 140, " + (0.14 * pulse).toFixed(3) + ")";
            ctx.beginPath();
            ctx.arc(pellet.x, pellet.y, pellet.r * 4, 0, TAU);
            ctx.fill();
            ctx.fillStyle = "rgba(255, 236, 170, 0.95)";
            ctx.beginPath();
            ctx.arc(pellet.x, pellet.y, pellet.r, 0, TAU);
            ctx.fill();
        });
    }

    function drawFish(f) {
        const spec = SPECIES[f.s];
        const s = f.size * visualScale;
        const angle = Math.atan2(f.vy, f.vx);
        const flap = Math.sin(elapsed * (7 + f.s) + f.phase) * 0.32;

        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.rotate(angle);
        if (Math.abs(angle) > Math.PI / 2) ctx.scale(1, -1);

        ctx.fillStyle = spec.fin;
        ctx.beginPath();
        ctx.moveTo(-s * 1.15, 0);
        ctx.quadraticCurveTo(-s * 1.9, (-0.55 + flap) * s, -s * 2.35, (-0.9 + flap) * s);
        ctx.quadraticCurveTo(-s * 2.0, 0, -s * 2.35, (0.9 + flap) * s);
        ctx.quadraticCurveTo(-s * 1.9, (0.55 + flap) * s, -s * 1.15, 0);
        ctx.fill();

        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.moveTo(-s * 0.2, -s * 0.62);
        ctx.quadraticCurveTo(s * 0.05, -s * 1.25, s * 0.6, -s * 0.52);
        ctx.closePath();
        ctx.fill();

        ctx.globalAlpha = 1;
        ctx.fillStyle = spec.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 1.55, s * 0.8, 0, 0, TAU);
        ctx.fill();

        ctx.globalAlpha = 0.5;
        ctx.fillStyle = spec.accent;
        ctx.beginPath();
        ctx.ellipse(s * 0.18, s * 0.3, s * 1.05, s * 0.32, 0, 0, TAU);
        ctx.fill();

        if (spec.stripe) {
            ctx.globalAlpha = 0.85;
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.ellipse(s * 0.28, 0, s * 0.2, s * 0.7, 0, 0, TAU);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(-s * 0.5, 0, s * 0.14, s * 0.56, 0, 0, TAU);
            ctx.fill();
        }

        ctx.globalAlpha = 1;
        ctx.fillStyle = "#08131e";
        ctx.beginPath();
        ctx.arc(s * 1.02, -s * 0.16, s * 0.17, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
        ctx.beginPath();
        ctx.arc(s * 1.08, -s * 0.22, s * 0.06, 0, TAU);
        ctx.fill();

        ctx.restore();
    }

    function drawBubbles() {
        bubbles.forEach(function (b) {
            ctx.strokeStyle = "rgba(220, 250, 255, " + (0.32 * b.a).toFixed(3) + ")";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r, 0, TAU);
            ctx.stroke();
            ctx.fillStyle = "rgba(220, 250, 255, " + (0.12 * b.a).toFixed(3) + ")";
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r, 0, TAU);
            ctx.fill();
        });
    }

    function drawRipples() {
        ripples.forEach(function (r) {
            const progress = r.t / r.life;
            ctx.strokeStyle = "rgba(220, 250, 255, " + (0.5 * (1 - progress)).toFixed(3) + ")";
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(r.x, r.y, 6 + r.max * progress, 0, TAU);
            ctx.stroke();
        });
    }

    function drawCursor() {
        if (mode === "plant" && pointer.active) {
            drawPlant({ x: pointer.x, h: height * 0.4, phase: elapsed }, true);
        }
        if (keyCursor) {
            ctx.save();
            ctx.strokeStyle = "rgba(235, 250, 255, 0.8)";
            ctx.lineWidth = 1.3;
            ctx.setLineDash([4, 5]);
            ctx.beginPath();
            ctx.arc(keyCursor.x, keyCursor.y, 13, 0, TAU);
            ctx.stroke();
            ctx.restore();
        }
    }

    function render() {
        if (!width || !height) return;
        ctx.clearRect(0, 0, width, height);
        drawWater();
        drawSpecks();
        drawSand();
        drawKelp();
        plants.forEach(function (p) {
            drawPlant(p, false);
        });
        drawFood();
        fish.forEach(drawFish);
        drawBubbles();
        drawRipples();
        drawCursor();
    }

    function frame(now) {
        rafId = null;
        if (paused || !visible || document.hidden) return;
        if (!lastTime) lastTime = now;
        let dt = (now - lastTime) / 1000;
        lastTime = now;
        if (dt > 0.05) dt = 0.05;
        if (dt < 0) dt = 0;
        step(dt);
        render();
        rafId = requestAnimationFrame(frame);
    }

    function start() {
        if (rafId !== null || paused || !visible || document.hidden) return;
        lastTime = 0;
        rafId = requestAnimationFrame(frame);
    }

    function stop() {
        if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
    }

    function sync() {
        if (!paused && visible && !document.hidden) start();
        else stop();
    }

    function localPoint(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: rect.width ? (clientX - rect.left) * (width / rect.width) : 0,
            y: rect.height ? (clientY - rect.top) * (height / rect.height) : 0
        };
    }

    function actAt(x, y) {
        if (!initialized) return;
        if (mode === "plant") {
            if (plants.length >= MAX_PLANTS) {
                setMode("feed");
                setTip("水草已经长满 5 株了，先让它们继续长吧");
                announceStatus("水草已经长满 5 株。");
            } else {
                setMode("feed");
                addPlant(x, true);
            }
            if (paused) render();
            return;
        }
        addFood(x, y, 5, false);
        if (paused) render();
    }

    if (btnFeed) {
        btnFeed.addEventListener("click", function () {
            setMode("feed");
        });
    }

    if (btnPlant) {
        btnPlant.addEventListener("click", function () {
            if (plants.length >= MAX_PLANTS) {
                setTip("水草已经长满 5 株了，先让它们继续长吧");
                announceStatus("水草已经长满 5 株。");
                return;
            }
            setMode(mode === "plant" ? "feed" : "plant");
        });
    }

    if (btnClean) {
        btnClean.addEventListener("click", function () {
            if (!food.length) {
                setTip("水里没有多余的饵料");
                return;
            }
            food = [];
            for (let i = 0; i < 3; i += 1) {
                addRipple(rand(width * 0.2, width * 0.8), rand(30, sandY - 20), 26);
            }
            updateHud(true);
            announceStatus("清理了水中的饵料。");
            setTip("饵料已清理");
            if (paused) render();
        });
    }

    if (btnPause) {
        btnPause.addEventListener("click", function () {
            setPaused(!paused);
        });
    }

    canvas.addEventListener("click", function (event) {
        const point = localPoint(event.clientX, event.clientY);
        actAt(point.x, point.y);
    });

    canvas.addEventListener("pointermove", function (event) {
        const point = localPoint(event.clientX, event.clientY);
        pointer.x = point.x;
        pointer.y = point.y;
        pointer.active = true;
        if (paused) render();
    });

    canvas.addEventListener("pointerleave", function () {
        pointer.active = false;
        if (paused) render();
    });

    canvas.addEventListener("focus", function () {
        if (!keyCursor) {
            keyCursor = { x: width / 2, y: height * 0.38 };
        }
        return;
    });

    canvas.addEventListener("blur", function () {
        keyCursor = null;
        if (paused) render();
    });

    canvas.addEventListener("keydown", function (event) {
        const stepSize = 28;
        if (!keyCursor) keyCursor = { x: width / 2, y: height * 0.38 };
        let handled = true;
        switch (event.key) {
            case "ArrowLeft":
                keyCursor.x = Math.max(12, keyCursor.x - stepSize);
                break;
            case "ArrowRight":
                keyCursor.x = Math.min(width - 12, keyCursor.x + stepSize);
                break;
            case "ArrowUp":
                keyCursor.y = Math.max(12, keyCursor.y - stepSize);
                break;
            case "ArrowDown":
                keyCursor.y = Math.min(sandY - 14, keyCursor.y + stepSize);
                break;
            case " ":
            case "Enter":
                actAt(keyCursor.x, keyCursor.y);
                break;
            default:
                handled = false;
        }
        if (handled) {
            event.preventDefault();
            if (paused) render();
        }
    });

    document.addEventListener("themechange", function () {
        readPalette();
        if (rafId === null) render();
    });

    document.addEventListener("visibilitychange", function () {
        sync();
    });

    /* ---------- Magnetic drawer ---------- */
    const drawer = document.getElementById("tankDrawer");
    const handle = document.getElementById("tankHandle");
    const panel = document.getElementById("tankPanel");
    const closeBtn = document.getElementById("tankClose");
    const openBtn = document.getElementById("tankOpen");

    if (drawer && handle) {
        let gestureStartY = 0;
        let dragging = false;
        let suppressClick = false;
        let wheelAccum = 0;
        let wheelResetTimer = 0;
        const OPEN_THRESHOLD = 70;
        const WHEEL_THRESHOLD = 180;
        const handleText = handle.querySelector(".tank-handle-text");

        function isOpen() {
            return drawer.classList.contains("is-open");
        }

        function open() {
            if (isOpen()) return;
            drawer.classList.add("is-open");
            document.body.classList.add("tank-open");
            handle.setAttribute("aria-expanded", "true");
            handle.setAttribute("aria-label", "下滑关闭鱼缸");
            if (handleText) handleText.textContent = "下滑关闭鱼缸";
            window.setTimeout(function () {
                if (isOpen() && canvas.focus) canvas.focus({ preventScroll: true });
            }, 460);
        }

        function close() {
            if (!isOpen()) return;
            drawer.classList.remove("is-open");
            document.body.classList.remove("tank-open");
            handle.setAttribute("aria-expanded", "false");
            handle.setAttribute("aria-label", "上滑打开鱼缸");
            if (handleText) handleText.textContent = "上滑打开鱼缸";
            if (document.activeElement && panel && panel.contains(document.activeElement)) {
                document.activeElement.blur();
            }
            if (openBtn && openBtn.focus) openBtn.focus({ preventScroll: true });
        }

        function toggle() {
            if (isOpen()) close();
            else open();
        }

        function gestureStart(y) {
            gestureStartY = y;
            dragging = true;
        }

        function gestureMove(y) {
            if (!dragging) return;
            const delta = gestureStartY - y;
            if (!isOpen() && delta > OPEN_THRESHOLD) {
                open();
                dragging = false;
                suppressClick = true;
            } else if (isOpen() && delta < -OPEN_THRESHOLD) {
                close();
                dragging = false;
                suppressClick = true;
            }
        }

        function gestureEnd() {
            dragging = false;
        }

        handle.addEventListener("touchstart", function (e) {
            gestureStart(e.touches[0].clientY);
        }, { passive: true });

        handle.addEventListener("touchmove", function (e) {
            gestureMove(e.touches[0].clientY);
        }, { passive: true });

        handle.addEventListener("touchend", gestureEnd);
        handle.addEventListener("touchcancel", gestureEnd);

        handle.addEventListener("mousedown", function (e) {
            gestureStart(e.clientY);
        });

        window.addEventListener("mousemove", function (e) {
            if (dragging) gestureMove(e.clientY);
        });

        window.addEventListener("mouseup", gestureEnd);

        handle.addEventListener("click", function () {
            if (suppressClick) {
                suppressClick = false;
                return;
            }
            toggle();
        });

        handle.addEventListener("keydown", function (e) {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggle();
            }
        });

        if (openBtn) openBtn.addEventListener("click", open);
        if (closeBtn) closeBtn.addEventListener("click", close);

        document.querySelectorAll('a[href="#tank"]').forEach(function (link) {
            link.addEventListener("click", function (e) {
                e.preventDefault();
                open();
            });
        });

        window.addEventListener("wheel", function (e) {
            if (isOpen()) {
                if (e.deltaY < 0) {
                    wheelAccum += -e.deltaY;
                    window.clearTimeout(wheelResetTimer);
                    wheelResetTimer = window.setTimeout(function () { wheelAccum = 0; }, 400);
                    if (wheelAccum >= WHEEL_THRESHOLD) {
                        close();
                        wheelAccum = 0;
                    }
                } else {
                    wheelAccum = 0;
                }
                return;
            }
            const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
            if (!nearBottom || e.deltaY <= 0) {
                wheelAccum = 0;
                return;
            }
            wheelAccum += e.deltaY;
            window.clearTimeout(wheelResetTimer);
            wheelResetTimer = window.setTimeout(function () { wheelAccum = 0; }, 400);
            if (wheelAccum >= WHEEL_THRESHOLD) {
                open();
                wheelAccum = 0;
            }
        }, { passive: true });

        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && isOpen()) close();
        });
    }

    let lazyInited = false;

    function lazyInit() {
        if (lazyInited) return;
        lazyInited = true;
        readPalette();
        resize();
        setMode("feed");
        setPaused(reducedMotion);
    }

    if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver(function (entries) {
            const intersecting = entries[0].isIntersecting;
            visible = intersecting;
            if (intersecting) lazyInit();
            sync();
        }, { threshold: 0.01 });
        observer.observe(stage);
    } else {
        visible = true;
        lazyInit();
    }

    if ("ResizeObserver" in window) {
        const resizeObserver = new ResizeObserver(queueResize);
        resizeObserver.observe(stage);
    } else {
        window.addEventListener("resize", queueResize);
    }
})();
