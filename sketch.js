// ============================================================
//  HAND FILTER - "Finestra Magica"
//  Filtro webcam interattivo con riconoscimento mani (ml5 + p5)
//
//  GESTI:
//   - Pollice + Indice di entrambe le mani  -> crea la finestra (quadrilatero di forma libera)
//   - Apri/chiudi mani                       -> attiva/disattiva la finestra
//   - Pollice + Mignolo (una mano)           -> cambia l'effetto
//
//  EFFETTI (ciclo con pollice+mignolo):
//   1. Bianco & Nero
//   2. Seppia
//   3. Alto Contrasto
//   4. Pixelato
//   5. Glitch
//   6. Psichedelico
//   7. Fluido (onde)
//   8. Matrix (pioggia verde)
//   9. Metallo (riquadro lucido rame/ottone)
// ============================================================

let handPose;
let video;
let hands = [];
let filterBuffer;      // buffer dove disegno il video con l'effetto
let filterObjs = [];   // oggetti per alcuni effetti (pixel, matrix, onde)
let modelReady = false;
let modelError = null;

// Mostra un errore a schermo in rosso
function showError(msg) {
    let box = document.getElementById('errBox');
    if (box) {
        box.textContent = msg;
        box.style.display = 'block';
    }
}
// Aggiorna il testo del caricamento
function setBusy(text, done) {
    let el = document.getElementById('busy');
    if (el) {
        let t = document.getElementById('busyText');
        if (t) t.textContent = text;
        if (done) el.style.display = 'none';
    }
}

window.addEventListener('error', function (e) {
    showError('Errore JavaScript: ' + (e.message || 'sconosciuto'));
});

// Gestione finestra
let windowActive = false;      // la finestra magica e' attiva
let windowAlpha = 0;           // transizione morbida
let currentFrame = null;       // quadrilatero formato da pollice+indice delle mani

// Gestione cambio effetto
let currentEffect = 0;
let effectNames = [
    "Bianco & Nero",
    "Seppia",
    "Alto Contrasto",
    "Pixelato",
    "Glitch",
    "Psichedelico",
    "Fluido",
    "Matrix",
    "Metallo"
];
let switchCooldown = 0;        // evita cambi rapidi/accidentali
let pinchStartTime = 0;
let pinchTriggered = false;
let lastPinchPos = null;
let lastTapTime = -99;         // frame dell'ultimo tap (per il doppio tap indietro)

// Cornice decorativa per effetto "Decorativo" richiesto
let decorativeFrame = 0;       // 0=nessuna, 1=fuoco, 2=ghiaccio, 3=fiori
let frameTimer = 0;

// Mappa keypoint per riferimento rapido (indici ml5 handpose)
const KP = {
    wrist: 0,
    thumbTip: 4,
    indexTip: 8,
    middleTip: 12,
    ringTip: 16,
    pinkyTip: 20
};

function preload() {
    // Non blocchiamo l'avvio: carichiamo il modello dopo, in setup()
}

function setup() {
    createCanvas(640, 480);
    pixelDensity(1);

    setBusy('Avvio webcam...');

    try {
        video = createCapture(VIDEO, { flipped: true });
        video.size(640, 480);
        video.hide();

        // Se la webcam si avvia, togliamo l'overlay e carichiamo il modello
        let started = setInterval(() => {
            if (video.elt && video.elt.readyState >= 1) {
                clearInterval(started);
                setBusy('Caricamento intelligenza artificiale (prima volta può richiedere 30-60 secondi)...');
                loadHandModel();
            }
        }, 200);
    } catch (err) {
        showError('Errore webcam: ' + err.message);
        setBusy('Avvio senza webcam (solo HUD)...');
        loadHandModel();
    }

    filterBuffer = createGraphics(640, 480);
    filterBuffer.pixelDensity(1);

    // Inizializza gli oggetti degli effetti dinamici
    setupPixelGrid();
    setupMatrix();
    setupWaves();

    setupRecording();
}

function loadHandModel() {
    try {
        // Il modello si carica in background; detectStart parte quando e' pronto
        handPose = ml5.handPose({ maxHands: 2 }, () => {
            modelReady = true;
            setBusy('', true);
            try {
                handPose.detectStart(video, gotHands);
            } catch (e) {
                showError('Errore di avvio rilevamento mani: ' + e.message);
            }
        });
    } catch (err) {
        modelError = err;
        showError('Errore caricamento modello: ' + err.message);
        // Non blocchiamo la webcam
    }

    // Se il modello non carica entro 90 secondi, lo segnaliamo e togliamo l'overlay
    setTimeout(() => {
        if (!modelReady) {
            showError('Il modello AI non si è caricato. Controlla la connessione internet o riprova. La webcam resta attiva ma senza riconoscimento mani.');
            setBusy('', true);
        }
    }, 90000);
}

function gotHands(results) {
    hands = results;
}

// Ordina 4 punti in senso orario attorno al loro centro,
// così collegano i "confini" della forma senza incrociarsi
function orderQuadPoints(pts) {
    let cx = 0, cy = 0;
    for (let p of pts) { cx += p.x; cy += p.y; }
    cx /= pts.length;
    cy /= pts.length;
    return pts.slice().sort((a, b) => {
        return Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx);
    });
}

// Area reale del quadrilatero (formula shoelace)
function polygonArea(pts) {
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
        let a = pts[i];
        let b = pts[(i + 1) % pts.length];
        area += a.x * b.y - b.x * a.y;
    }
    return Math.abs(area) / 2;
}

// ---------------- EFFETTI DINAMICI: inizializzazione ----------------
function setupPixelGrid() {
    let cols = Math.floor(640 / 12);
    let rows = Math.floor(480 / 12);
    filterObjs.pixel = { cols: cols, rows: rows, size: 12 };
}

function setupMatrix() {
    let chars = "アイウエオカキクケコサシスセソタチツテト";
    filterObjs.matrix = [];
    let cols = 40;
    for (let i = 0; i < cols; i++) {
        filterObjs.matrix.push({
            x: i * 16,
            y: Math.random() * 480,
            speed: 2 + Math.random() * 6,
            len: 5 + Math.floor(Math.random() * 15)
        });
    }
    filterObjs.matrix.chars = chars;
}

function setupWaves() {
    filterObjs.wave = { y: 0, time: 0 };
}

// ---------------- DISEGNO PRINCIPALE ----------------
function draw() {
    background(0);
    image(video, 0, 0, width, height);

    // Rileva gesti dalle mani rilevate
    handleGestures();

    // Se la finestra e' attiva, applica l'effetto nel rettangolo
    if (windowActive && windowAlpha > 0.01) {
        // Disegna il video con l'effetto dentro filterBuffer
        drawFilteredVideo();

        // Ritaglia con la finestra (quadrilatero di forma libera) e mostra l'effetto
        blendMode(BLEND);
        let frame = currentFrame;
        if (frame) {
            tint(255, windowAlpha * 255);
            // Clip lungo il contorno del quadrilatero: 4 linee che collegano le dita
            drawingContext.save();
            drawingContext.beginPath();
            for (let i = 0; i < frame.pts.length; i++) {
                let p = frame.pts[i];
                if (i === 0) drawingContext.moveTo(p.x, p.y);
                else drawingContext.lineTo(p.x, p.y);
            }
            drawingContext.closePath();
            drawingContext.clip();
            image(filterBuffer, 0, 0, width, height);
            drawingContext.restore();
            noTint();

            // Cornice decorativa se richiesta
            drawDecorativeFrame(frame);
        }
    }

    // Mostra i landmark (punti) delle mani e le linee
    drawHands();

    // HUD: indicatore effetto attivo
    drawHUD();

    windowAlpha = lerp(windowAlpha, windowActive ? 1 : 0, 0.15);
}

// ---------------- GESTI ----------------
function handleGestures() {
    switchCooldown = max(0, switchCooldown - 1);
    frameTimer++;

    if (hands.length < 2) {
        // Meno di due mani -> finestra non attiva
        windowActive = false;
        currentFrame = null;
        pinchTriggered = false;
        return;
    }

    let handA = hands[0];
    let handB = hands[1];

    // Pollice e indice di entrambe le mani
    let point = (hand, key) => {
        let k = hand.keypoints[key];
        return { x: k.x, y: k.y };
    };

    let AThumb = point(handA, KP.thumbTip);
    let AIndex = point(handA, KP.indexTip);
    let BThumb = point(handB, KP.thumbTip);
    let BIndex = point(handB, KP.indexTip);

    // GESTO 1: Pollice+Indice di entrambe le mani -> finestra di forma libera
    // I 4 vertici del quadrilatero sono: pollice A, indice A, pollice B, indice B
    let cornerPoints = [AThumb, AIndex, BThumb, BIndex];
    let orderedPts = orderQuadPoints(cornerPoints);

    // Limiti (bounding box) per comodità
    let allX = cornerPoints.map(p => p.x);
    let allY = cornerPoints.map(p => p.y);
    let x1 = Math.min(...allX);
    let y1 = Math.min(...allY);
    let x2 = Math.max(...allX);
    let y2 = Math.max(...allY);

    // Apri/chiudi: se la distanza pollice-indice e' grande (mano aperta) la finestra opera
    let distA = dist(AThumb.x, AThumb.y, AIndex.x, AIndex.y);
    let distB = dist(BThumb.x, BThumb.y, BIndex.x, BIndex.y);
    let openThreshold = 45; // pixel

    let handAOpen = distA > openThreshold;
    let handBOpen = distB > openThreshold;

    // Finestra attiva solo se entrambe le mani sono aperte e creano un'area ragionevole
    let area = polygonArea(orderedPts);
    windowActive = handAOpen && handBOpen && area > 4000;

    if (windowActive) {
        currentFrame = { pts: orderedPts, x1, y1, x2, y2, area };
    } else {
        currentFrame = null;
    }

    // GESTO 2: Pollice+Mignolo di QUALSIASI mano -> cambia effetto
    // Controllo su entrambe le mani
    for (let h of hands) {
        let t = point(h, KP.thumbTip);
        let p = point(h, KP.pinkyTip);
        let d = dist(t.x, t.y, p.x, p.y);
        // Il gesto pollice-mignolo: pollice e mignolo vicini
        // (deve toccarsi), ma il resto della mano e' aperto
        if (d < 35) {
            if (!pinchTriggered && switchCooldown === 0) {
                pinchStartTime = frameTimer;
                pinchTriggered = true;
                lastPinchPos = { x: t.x, y: t.y };
            }
        } else {
            if (pinchTriggered) {
                // Quando si 'rilascia' il gesto, cambia effetto
                // Tempo di contatto minimo per evitare accidentali
                if (frameTimer - pinchStartTime >= 8 && switchCooldown === 0) {
                    // Doppio tap (entro ~500ms a 60fps) -> vai INDIETRO
                    if (frameTimer - lastTapTime <= 30) {
                        currentEffect = (currentEffect - 1 + effectNames.length) % effectNames.length;
                        lastTapTime = -99;
                    } else {
                        // Tap singolo -> vai AVANTI
                        currentEffect = (currentEffect + 1) % effectNames.length;
                        lastTapTime = frameTimer;
                    }
                    // Se siamo di nuovo al primo, cambiamo anche cornice decorativa
                    if (currentEffect === 0) {
                        decorativeFrame = (decorativeFrame + 1) % 4;
                    }
                    switchCooldown = 30; // cooldown
                }
                pinchTriggered = false;
                lastPinchPos = null;
            }
        }
    }
}

// ---------------- APPLICA EFFETTO NEL VIDEO ----------------
function drawFilteredVideo() {
    let frame = currentFrame;
    if (!frame) return;

    // Disegna il video normale nel buffer, poi applica l'effetto
    filterBuffer.clear();
    filterBuffer.image(video, 0, 0, width, height);

    switch (currentEffect) {
        case 0: // Bianco & Nero
            applyBWEffect();
            break;
        case 1: // Seppia
            applySepiaEffect();
            break;
        case 2: // Alto contrasto
            applyContrastEffect();
            break;
        case 3: // Pixelato
            applyPixelEffect();
            break;
        case 4: // Glitch
            applyGlitchEffect();
            break;
        case 5: // Psichedelico
            applyPsychedelicEffect();
            break;
        case 6: // Fluido (onde)
            applyWaveEffect();
            break;
        case 7: // Matrix
            applyMatrixEffect();
            break;
        case 8: // Metallo
            applyMetalEffect();
            break;
    }
}

// L'effetto è applicato al buffer (dove c'è il video) e poi il clip nel draw()
// mostra SOLO l'area dentro la finestra.
// PERFORMANCE: gli effetti processano SOLO l'area coperta dalla finestra,
// non l'intero video, per mantenere il tutto fluido.

// Limiti della finestra, limitati ai bordi dello schermo
function windowBounds() {
    if (!currentFrame) return null;
    return {
        x1: max(0, floor(currentFrame.x1)),
        y1: max(0, floor(currentFrame.y1)),
        x2: min(width, ceil(currentFrame.x2)),
        y2: min(height, ceil(currentFrame.y2))
    };
}

// Sposta una striscia di pixel dentro l'array "pix" (ottimizzato, niente disegno)
function shiftSlice(pix, x, y, w, h, dx) {
    if (dx === 0) return;
    let tmp = new Array(w * h * 4);
    let k = 0;
    for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
            let idx = (yy * width + xx) * 4;
            tmp[k++] = pix[idx];
            tmp[k++] = pix[idx + 1];
            tmp[k++] = pix[idx + 2];
            tmp[k++] = pix[idx + 3];
        }
    }
    k = 0;
    for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
            let dst = xx + dx;
            if (dst >= 0 && dst < width) {
                let idx = (yy * width + dst) * 4;
                pix[idx] = tmp[k];
                pix[idx + 1] = tmp[k + 1];
                pix[idx + 2] = tmp[k + 2];
                pix[idx + 3] = tmp[k + 3];
            }
            k += 4;
        }
    }
}

function applyBWEffect() {
    // Bianco e nero, solo dentro la finestra
    let b = windowBounds();
    if (!b) return;
    filterBuffer.loadPixels();
    let p = filterBuffer.pixels;
    for (let y = b.y1; y < b.y2; y++) {
        for (let x = b.x1; x < b.x2; x++) {
            let i = (y * width + x) * 4;
            let gray = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
            p[i] = gray;
            p[i + 1] = gray;
            p[i + 2] = gray;
        }
    }
    filterBuffer.updatePixels();
}

function applyContrastEffect() {
    // Alto contrasto, solo dentro la finestra
    let b = windowBounds();
    if (!b) return;
    filterBuffer.loadPixels();
    let p = filterBuffer.pixels;
    for (let y = b.y1; y < b.y2; y++) {
        for (let x = b.x1; x < b.x2; x++) {
            let i = (y * width + x) * 4;
            let gray = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
            let val = gray > 128 ? 255 : 0;
            p[i] = val;
            p[i + 1] = val;
            p[i + 2] = val;
        }
    }
    filterBuffer.updatePixels();
}

function applySepiaEffect() {
    let b = windowBounds();
    if (!b) return;
    filterBuffer.loadPixels();
    let p = filterBuffer.pixels;
    for (let y = b.y1; y < b.y2; y++) {
        for (let x = b.x1; x < b.x2; x++) {
            let i = (y * width + x) * 4;
            let r = p[i];
            let g = p[i + 1];
            let bl = p[i + 2];
            p[i]     = min(255, 0.393 * r + 0.769 * g + 0.189 * bl);
            p[i + 1] = min(255, 0.349 * r + 0.686 * g + 0.168 * bl);
            p[i + 2] = min(255, 0.272 * r + 0.534 * g + 0.131 * bl);
        }
    }
    filterBuffer.updatePixels();
}

function applyPixelEffect() {
    let b = windowBounds();
    if (!b) return;
    let size = filterObjs.pixel.size;
    filterBuffer.loadPixels();
    let pix = filterBuffer.pixels;
    // Blocchi solo dentro la finestra, tutto scritto direttamente in memoria
    for (let y = b.y1; y < b.y2; y += size) {
        for (let x = b.x1; x < b.x2; x += size) {
            let r = 0, g = 0, bl = 0, n = 0;
            let ex = min(x + size, b.x2);
            let ey = min(y + size, b.y2);
            for (let yy = y; yy < ey; yy++) {
                for (let xx = x; xx < ex; xx++) {
                    let i = (yy * width + xx) * 4;
                    r += pix[i];
                    g += pix[i + 1];
                    bl += pix[i + 2];
                    n++;
                }
            }
            r = Math.round(r / n);
            g = Math.round(g / n);
            bl = Math.round(bl / n);
            for (let yy = y; yy < ey; yy++) {
                for (let xx = x; xx < ex; xx++) {
                    let i = (yy * width + xx) * 4;
                    pix[i] = r;
                    pix[i + 1] = g;
                    pix[i + 2] = bl;
                }
            }
        }
    }
    filterBuffer.updatePixels();
}

function applyGlitchEffect() {
    let b = windowBounds();
    if (!b) return;
    let bw = b.x2 - b.x1;
    let bh = b.y2 - b.y1;
    if (bh < 24 || bw < 24) return;
    filterBuffer.loadPixels();
    let pix = filterBuffer.pixels;
    // 1-2 fasce orizzontali spostate casualmente, solo dentro la finestra
    for (let n = 0; n < 2; n++) {
        let y = b.y1 + Math.floor(Math.random() * (bh - 20));
        let band = 4 + Math.floor(Math.random() * 12);
        band = min(band, bh - (y - b.y1));
        let shift = Math.floor(Math.random() * 20) - 10;
        shiftSlice(pix, b.x1, y, bw, band, shift);
    }
    filterBuffer.updatePixels();
}

function applyPsychedelicEffect() {
    let b = windowBounds();
    if (!b) return;
    filterBuffer.loadPixels();
    let p = filterBuffer.pixels;
    let shift = (frameCount * 2) % 255;
    for (let y = b.y1; y < b.y2; y++) {
        for (let x = b.x1; x < b.x2; x++) {
            let i = (y * width + x) * 4;
            p[i] = (p[i] + shift) % 255;              // R
            p[i + 1] = (p[i + 1] + 255 - shift) % 255; // G
            p[i + 2] = (p[i + 2] + shift * 2) % 255;   // B
        }
    }
    filterBuffer.updatePixels();
}

function applyWaveEffect() {
    let b = windowBounds();
    if (!b) return;
    let bh = b.y2 - b.y1;
    if (bh < 8) return;
    filterObjs.wave.time += 0.05;
    let strength = 12;
    let colW = 6;
    filterBuffer.loadPixels();
    let pix = filterBuffer.pixels;
    // Distorsione ondulata solo dentro la finestra, striscia per striscia
    for (let x = b.x1; x < b.x2; x += colW) {
        let offset = Math.sin(x * 0.08 + filterObjs.wave.time) * strength;
        let dx = Math.round(offset);
        if (dx !== 0) {
            let w2 = min(colW, b.x2 - x);
            shiftSlice(pix, x, b.y1, w2, bh, dx);
        }
    }
    filterBuffer.updatePixels();
}

function applyMatrixEffect() {
    // Pioggia di caratteri verdi sopra il video
    filterBuffer.noStroke();
    let chars = filterObjs.matrix.chars;
    for (let drop of filterObjs.matrix) {
        for (let n = 0; n < drop.len; n++) {
            let yy = (drop.y - n * 16) % height;
            if (yy < 0) yy += height;
            let brightness = map(n, 0, drop.len, 255, 80);
            filterBuffer.fill(0, brightness, 0);
            filterBuffer.textSize(13);
            filterBuffer.text(chars.charAt(Math.floor(Math.random() * chars.length)), drop.x, yy + 16);
        }
        drop.y += drop.speed;
        if (drop.y > height + 20) {
            drop.y = -20;
            drop.x = Math.random() * width;
        }
    }
    // Sfuma leggermente per creare la scia
    filterBuffer.fill(0, 60);
    filterBuffer.rect(0, 0, width, height);
}

function applyMetalEffect() {
    // Effetto metallo: il riquadro assume una lucentezza metallica lucida (ottone/rame)
    // La luminosità del soggetto viene mappata su una rampa cromatica metallica
    // con 'venature brushed' ondulate. Elabora su griglia campionata per fluidità.
    let b = windowBounds();
    if (!b) return;
    let w = b.x2 - b.x1;
    let h = b.y2 - b.y1;
    if (w < 8 || h < 8) return;

    const step = 2;
    const cols = Math.ceil(w / step);
    const rows = Math.ceil(h / step);

    filterBuffer.loadPixels();
    let p = filterBuffer.pixels;
    for (let gy = 0; gy < rows; gy++) {
        let y = b.y1 + gy * step;
        if (y >= b.y2) break;
        let ey = Math.min(y + step, b.y2);
        for (let gx = 0; gx < cols; gx++) {
            let x = b.x1 + gx * step;
            if (x >= b.x2) break;
            let ex = Math.min(x + step, b.x2);
            let i = (y * width + x) * 4;
            let r = p[i], g = p[i + 1], bl = p[i + 2];
            // Luminosità del pixel + venature brushed (riflessi ondulati)
            let luma = 0.299 * r + 0.587 * g + 0.114 * bl;
            let sheen = Math.sin(x * 0.06 + y * 0.02) * 18;
            luma = Math.min(255, Math.max(0, luma + sheen + 60));
            // Rampa cromatica metallica (rame/ottone lucido)
            let col;
            if (luma < 90)      col = [70, 50, 30];
            else if (luma < 140) col = [150, 110, 60];
            else if (luma < 190) col = [220, 175, 110];
            else if (luma < 230) col = [250, 225, 165];
            else                col = [255, 252, 235];
            for (let yy = y; yy < ey; yy++) {
                let rw = yy * width;
                for (let xx = x; xx < ex; xx++) {
                    let j = (rw + xx) * 4;
                    p[j] = col[0]; p[j + 1] = col[1]; p[j + 2] = col[2];
                }
            }
        }
    }
    filterBuffer.updatePixels();
}

// ---------------- CORNICE / CONTORNO DELLA FINESTRA ----------------
// Disegna sempre le 4 linee che collegano le dita (contorno del quadrilatero);
// se una cornice decorativa è selezionata, la sovrappone in colore
function drawDecorativeFrame(frame) {
    let pts = frame.pts;

    // Contorno sempre visibile: 4 linee che collegano i vertici
    noFill();
    strokeWeight(3);
    stroke(255, 255, 255, 180);
    beginShape();
    for (let p of pts) vertex(p.x, p.y);
    endShape(CLOSE);

    if (decorativeFrame === 0) return;

    let colors = {
        1: [255, 130, 0],   // fuoco
        2: [120, 200, 255], // ghiaccio
        3: [200, 120, 255]  // fiori
    };
    let col = colors[decorativeFrame];

    // Centro per la pulsazione
    let cx = (frame.x1 + frame.x2) / 2;
    let cy = (frame.y1 + frame.y2) / 2;
    let pulse = 1 + Math.sin(frameTimer * 0.1) * 0.08;

    strokeWeight(5);
    stroke(col[0], col[1], col[2]);
    noFill();
    beginShape();
    for (let p of pts) vertex(cx + (p.x - cx) * pulse, cy + (p.y - cy) * pulse);
    endShape(CLOSE);

    // Scintille sugli angoli
    let sparkle = Math.floor(Math.random() * 3);
    if (sparkle === 0) {
        stroke(255, 255, 255);
        strokeWeight(6);
        for (let p of pts) point(p.x, p.y);
    }
}

// ---------------- DISEGNO MANI ----------------
function drawHands() {
    for (let hand of hands) {
        // Linee connessioni (schema mano)
        let connections = [
            [0,1],[1,2],[2,3],[3,4],         // pollice
            [0,5],[5,6],[6,7],[7,8],         // indice
            [0,9],[9,10],[10,11],[11,12],    // medio
            [0,13],[13,14],[14,15],[15,16],  // anulare
            [0,17],[17,18],[18,19],[19,20],  // mignolo
            [5,9],[9,13],[13,17]             // palmo
        ];
        stroke(0, 255, 200);
        strokeWeight(2);
        for (let [a, b] of connections) {
            line(hand.keypoints[a].x, hand.keypoints[a].y,
                 hand.keypoints[b].x, hand.keypoints[b].y);
        }

        // Punti
        for (let kp of hand.keypoints) {
            fill(0, 255, 200);
            noStroke();
            circle(kp.x, kp.y, 6);
        }

        // Evidenzia pollice e indice (vertici del rettangolo)
        let thumb = hand.keypoints[KP.thumbTip];
        let index = hand.keypoints[KP.indexTip];
        let pinky = hand.keypoints[KP.pinkyTip];
        fill(255, 200, 0);
        circle(thumb.x, thumb.y, 10);
        fill(255, 100, 0);
        circle(index.x, index.y, 10);
        fill(200, 0, 255);
        circle(pinky.x, pinky.y, 8);
    }
}

// ---------------- HUD ----------------
function drawHUD() {
    // Pannello in alto
    fill(0, 0, 0, 180);
    noStroke();
    rect(0, 0, width, 48);

    fill(255);
    textSize(20);
    textAlign(LEFT, CENTER);
    text("✨ Finestra Magica", 10, 16);

    textSize(12);
    fill(180);
    text("👆 Pollice+Indice di entrambe le mani = finestra", 10, 34);

    // Indicatore effetto attivo
    fill(0, 0, 0, 180);
    rect(width - 220, 60, 210, 30, 5);
    fill(255);
    textAlign(RIGHT, CENTER);
    textSize(14);
    text("Effetto: " + effectNames[currentEffect], width - 20, 76);

    // Istruzioni cambio
    fill(0, 0, 0, 180);
    rect(width - 220, 95, 210, 22, 5);
    fill(180);
    textAlign(RIGHT, CENTER);
    textSize(11);
    text("🤏 Pollice+Mignolo = cambia effetto", width - 20, 107);
}

// ---------------- REGISTRAZIONE VIDEO ----------------
let recorder = null;
let recordingChunks = [];
let isRecording = false;
let recordBtnEl = null;

function setupRecording() {
    recordBtnEl = document.getElementById('recordBtn');
    if (!recordBtnEl) return;
    recordBtnEl.addEventListener('click', toggleRecording);
}

// Usa il canvas p5 come sorgente: registra esattamente ciò che vedi
async function toggleRecording() {
    if (!recordBtnEl) return;

    if (isRecording) {
        stopRecording();
        return;
    }

    // Cattura lo stream direttamente dal canvas p5
    const stream = canvas.captureStream(30);
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : (MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : '');

    try {
        recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch (err) {
        showError('Registrazione non supportata: ' + err.message);
        return;
    }

    recordingChunks = [];
    recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recordingChunks.push(e.data);
    };
    recorder.onstop = onRecordingFinished;
    recorder.start();
    isRecording = true;

    recordBtnEl.textContent = 'STOP';
    recordBtnEl.classList.add('rec');
    setBusy('Registrazione in corso...');
}

function stopRecording() {
    if (recorder && recorder.state !== 'inactive') recorder.stop();
}

async function onRecordingFinished() {
    isRecording = false;
    recordBtnEl.textContent = 'REC';
    recordBtnEl.classList.remove('rec');
    setBusy('', true);

    const type = recorder && recorder.mimeType ? recorder.mimeType : 'video/webm';
    const blob = new Blob(recordingChunks, { type: type });
    if (blob.size === 0) {
        showError('Registrazione vuota: nessun dato catturato.');
        return;
    }

    const fileName = 'hand-filter-' + Date.now() + '.webm';
    const file = new File([blob], fileName, { type: type });

    // Su mobile preferiamo il Web Share per salvare direttamente nella galleria
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({ files: [file], title: 'Hand Filter Video' });
            return;
        } catch (err) {
            if (err.name === 'AbortError') return; // utente ha annullato
            // altrimenti cadiamo nel download
        }
    }

    // Fallback: download classico
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    setBusy('Video salvato!', true);
}
