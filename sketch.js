// Hand Filter — Finestra Magica
// Finestra: pollice + indice di entrambe le mani
// Effetto: tap indice+mignolo sinistra = successivo, destra = precedente

const VIDEO_W = 640;
const VIDEO_H = 480;
const FILTER_W = 320;
const FILTER_H = 240;
const KP = { wrist: 0, thumbTip: 4, indexTip: 8, middleTip: 12, ringTip: 16, pinkyTip: 20 };

let handPose;
let bodySegmentation;
let video;
let hands = [];
let segmentation = null;
let filterBuffer;
let personBuffer;
let trailBuffer;
let grayBuffer;
let prevGray;
let friendImg;
let faceSprite;
let appStarted = false;
let modelReady = false;

let windowActive = false;
let windowAlpha = 0;
let currentRect = null;
let smoothRect = null;
let bodyDetecting = false;

let currentEffect = 0;
const effectNames = [
    "Bianco & Nero",
    "Alto contrasto",
    "Psichedelico",
    "Motion",
    "Anime",
    "Particles",
    "Pioggia",
    "Game Boy"
];

let effectTap;

let particles = [];
let rainDrops = [];
let motionPts = [];

let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let lastFile = null;

function showError(msg) {
    let box = document.getElementById("errBox");
    if (box) {
        box.textContent = msg;
        box.style.display = "block";
    }
}

function setBusy(text, done) {
    let el = document.getElementById("busy");
    if (!el) return;
    let t = document.getElementById("busyText");
    if (t && text) t.textContent = text;
    el.classList.toggle("show", !done);
}

window.addEventListener("error", function (e) {
    let msg = (e && e.message) || "";
    if (!msg || msg === "Script error." || msg.indexOf("ResizeObserver") >= 0) return;
    showError("Errore JavaScript: " + msg);
});

function viewSize() {
    let view = document.getElementById("view");
    return {
        w: Math.max(1, view.clientWidth),
        h: Math.max(1, view.clientHeight)
    };
}

function setup() {
    let s = viewSize();
    let cnv = createCanvas(s.w, s.h);
    cnv.parent("view");
    pixelDensity(1);
    frameRate(30);
    noLoop();
    setTimeout(windowResized, 0);

    filterBuffer = createGraphics(FILTER_W, FILTER_H);
    filterBuffer.pixelDensity(1);
    personBuffer = createGraphics(FILTER_W, FILTER_H);
    personBuffer.pixelDensity(1);
    trailBuffer = createGraphics(FILTER_W, FILTER_H);
    trailBuffer.pixelDensity(1);
    trailBuffer.background(0);
    grayBuffer = createGraphics(FILTER_W, FILTER_H);
    grayBuffer.pixelDensity(1);
    prevGray = createGraphics(FILTER_W, FILTER_H);
    prevGray.pixelDensity(1);

    faceSprite = createGraphics(64, 76);
    faceSprite.pixelDensity(1);
    drawPlaceholderFace(faceSprite);
    loadImage("lollo.png", (img) => {
        friendImg = img;
        prepareFriendSprite(img);
    });

    setupRain();
    setupParticles();

    effectTap = createEffectTapController();

    document.getElementById("btnStart").addEventListener("click", startApp);
    document.getElementById("btnPhoto").addEventListener("click", takePhoto);
    document.getElementById("btnRec").addEventListener("click", toggleRecording);
    document.getElementById("btnShare").addEventListener("click", shareLast);
}

function windowResized() {
    let s = viewSize();
    resizeCanvas(s.w, s.h);
}

function startApp() {
    if (appStarted) return;
    appStarted = true;
    let errBox = document.getElementById("errBox");
    if (errBox) {
        errBox.textContent = "";
        errBox.style.display = "none";
    }
    document.getElementById("startOverlay").style.display = "none";
    document.getElementById("filterName").textContent = effectNames[currentEffect];
    document.getElementById("filterName").classList.add("on");
    document.getElementById("btnPhoto").disabled = false;
    document.getElementById("btnRec").disabled = false;
    setBusy("Avvio webcam...");
    loop();
    initCamera();
}

function cameraErrorText(err) {
    if (!err) return "Webcam non disponibile.";
    let name = err.name || "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        return "Accesso alla webcam negato. Consenti la fotocamera per questo sito e ricarica.";
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        return "Nessuna webcam trovata.";
    }
    if (name === "NotReadableError" || name === "TrackStartError") {
        return "La webcam è usata da un'altra app o scheda. Chiudila e premi di nuovo Avvia.";
    }
    if (name === "OverconstrainedError") {
        return "Questa webcam non accetta i vincoli richiesti. Riprovo in modo più semplice.";
    }
    return "Errore webcam: " + (err.message || name || String(err));
}

function stopCameraStream() {
    let el = videoEl();
    if (el && el.srcObject) {
        el.srcObject.getTracks().forEach(function (t) {
            try { t.stop(); } catch (e) {}
        });
        el.srcObject = null;
    }
}

async function openCameraStream() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("getUserMedia non supportato in questo browser.");
    }
    let tries = [
        { video: true, audio: false },
        { video: { facingMode: { ideal: "user" } }, audio: false }
    ];
    let lastErr = null;
    for (let i = 0; i < tries.length; i++) {
        try {
            return await navigator.mediaDevices.getUserMedia(tries[i]);
        } catch (err) {
            lastErr = err;
        }
    }
    throw lastErr || new Error("Webcam non disponibile.");
}

function initCamera() {
    stopCameraStream();
    let camReady = false;
    function onCamReady() {
        if (camReady) return;
        let el = videoEl();
        if (el && el.videoWidth < 2) return;
        camReady = true;
        setBusy("", true);
        loadModels();
    }

    openCameraStream().then(function (stream) {
        video = createVideo("");
        if (!video || !video.elt) {
            throw new Error("Impossibile creare l'elemento video.");
        }
        video.elt.srcObject = stream;
        video.size(VIDEO_W, VIDEO_H);
        parkVideoElement(video.elt);
        video.elt.setAttribute("playsinline", "true");
        video.elt.setAttribute("autoplay", "true");
        video.elt.muted = true;
        video.elt.playsInline = true;
        video.elt.controls = false;
        video.volume(0);
        video.elt.onloadeddata = onCamReady;
        video.elt.onplaying = onCamReady;
        let playTry = video.elt.play();
        if (playTry && playTry.catch) playTry.catch(function () {});

        let checks = 0;
        let poll = setInterval(function () {
            checks += 1;
            if (camReady) {
                clearInterval(poll);
                return;
            }
            if (videoEl() && videoEl().videoWidth > 0) {
                clearInterval(poll);
                onCamReady();
                return;
            }
            if (checks >= 40) {
                clearInterval(poll);
                failCamera({ name: "NotReadableError" });
            }
        }, 250);
    }).catch(failCamera);
}

function failCamera(err) {
    setBusy("", true);
    showError(cameraErrorText(err));
    appStarted = false;
    let overlay = document.getElementById("startOverlay");
    if (overlay) overlay.style.display = "flex";
}

function parkVideoElement(el) {
    el.style.position = "fixed";
    el.style.left = "0";
    el.style.top = "0";
    el.style.width = VIDEO_W + "px";
    el.style.height = VIDEO_H + "px";
    el.style.opacity = "0.01";
    el.style.pointerEvents = "none";
    el.style.zIndex = "-1";
    el.style.transform = "none";
}

window.addEventListener("pagehide", stopCameraStream);
window.addEventListener("beforeunload", stopCameraStream);

function videoEl() {
    return video && video.elt ? video.elt : null;
}

function onHandsModelReady(model) {
    if (modelReady) return;
    if (model && typeof model.detectStart === "function") handPose = model;
    if (!handPose || typeof handPose.detectStart !== "function") return;
    modelReady = true;
    startHandLoop();
    syncBodySeg();
}

let handBusy = false;
let handTimer = null;

function startHandLoop() {
    try {
        if (handPose && typeof handPose.detectStop === "function") handPose.detectStop();
    } catch (e) {}
    if (handPose) {
        handPose.signalStop = true;
        handPose.detecting = false;
    }
    handBusy = false;
    queueHandDetect();
}

function queueHandDetect() {
    if (handTimer) clearTimeout(handTimer);
    handTimer = setTimeout(runHandDetect, 40);
}

function runHandDetect() {
    if (!appStarted || !handPose) return;
    let el = videoEl();
    if (!el || el.videoWidth < 16) {
        queueHandDetect();
        return;
    }
    if (handBusy) {
        queueHandDetect();
        return;
    }
    handBusy = true;
    let finished = false;
    function done(results) {
        if (finished) return;
        finished = true;
        handBusy = false;
        if (results) gotHands(results);
        queueHandDetect();
    }
    try {
        let ret = handPose.detect(el, function (results) {
            done(results);
        });
        if (ret && typeof ret.then === "function") {
            ret.then(function (results) { done(results); }).catch(function () { done(null); });
        }
        setTimeout(function () {
            if (!finished) done(null);
        }, 4000);
    } catch (e) {
        done(null);
    }
}

function loadModels() {
    try {
        let result = ml5.handPose({ maxHands: 2, callback: onHandsModelReady }, onHandsModelReady);
        if (result && typeof result.then === "function") {
            result.then(onHandsModelReady).catch((err) => {
                showError("Errore modello mani: " + (err && err.message ? err.message : err));
            });
        }
        if (result && typeof result.detectStart === "function") {
            handPose = result;
            onHandsModelReady(result);
        }
    } catch (err) {
        showError("Errore caricamento modello: " + err.message);
    }
    setTimeout(() => {
        if (!modelReady) {
            showError("Il modello mani sta ancora scaricando. La webcam resta attiva.");
        }
    }, 20000);
}

function syncBodySeg() {
    let want = currentEffect === 6;
    if (!want) {
        stopBodySeg();
        return;
    }
    if (!bodySegmentation) {
        try {
            bodySegmentation = ml5.bodySegmentation("SelfieSegmentation", { maskType: "person" }, () => {
                startBodySeg();
            });
        } catch (err) {
            console.warn("Segmentation non disponibile", err);
        }
        return;
    }
    startBodySeg();
}

function startBodySeg() {
    let el = videoEl();
    if (bodyDetecting || !bodySegmentation || typeof bodySegmentation.detectStart !== "function" || !el) return;
    try {
        bodySegmentation.detectStart(el, gotSeg);
        bodyDetecting = true;
    } catch (e) {
        console.warn(e);
    }
}

function stopBodySeg() {
    if (!bodyDetecting || !bodySegmentation) return;
    try {
        if (typeof bodySegmentation.detectStop === "function") bodySegmentation.detectStop();
    } catch (e) {
        console.warn(e);
    }
    bodyDetecting = false;
    segmentation = null;
}

function gotHands(results) {
    hands = Array.isArray(results) ? results : [];
}

function gotSeg(result) {
    segmentation = result;
}

function coverTransform() {
    let scale = Math.max(width / VIDEO_W, height / VIDEO_H);
    let dw = VIDEO_W * scale;
    let dh = VIDEO_H * scale;
    return { scale, dw, dh, ox: (width - dw) / 2, oy: (height - dh) / 2 };
}

function mapFromVideo(x, y) {
    let t = coverTransform();
    return { x: t.ox + x * t.scale, y: t.oy + y * t.scale };
}

function drawCover(img) {
    if (!img) return;
    if (img.tagName === "VIDEO") img = video;
    if (!img) return;
    if (video && img === video && video.elt && video.elt.readyState < 2) return;
    let t = coverTransform();
    image(img, t.ox, t.oy, t.dw, t.dh);
}

function drawPlaceholderFace(g) {
    g.clear();
    g.noStroke();
    g.fill(255, 214, 170);
    g.ellipse(32, 36, 50, 58);
    g.fill(80, 50, 40);
    g.ellipse(23, 32, 6, 7);
    g.ellipse(41, 32, 6, 7);
    g.stroke(80, 50, 40);
    g.strokeWeight(2);
    g.noFill();
    g.arc(32, 40, 18, 12, 0.15, PI - 0.15);
}

function prepareFriendSprite(img) {
    let sx = img.width * 0.12;
    let sy = img.height * 0.06;
    let sw = img.width * 0.76;
    let sh = img.height * 0.52;
    let outW = 220;
    let outH = Math.round(outW * (sh / sw));
    faceSprite = createGraphics(outW, outH);
    faceSprite.pixelDensity(1);
    faceSprite.clear();
    faceSprite.image(img, 0, 0, outW, outH, sx, sy, sw, sh);
    faceSprite.loadPixels();
    let p = faceSprite.pixels;
    for (let i = 0; i < p.length; i += 4) {
        if (p[i] < 22 && p[i + 1] < 22 && p[i + 2] < 22) p[i + 3] = 0;
    }
    faceSprite.updatePixels();
}

function setupRain() {
    rainDrops = [];
    for (let i = 0; i < 12; i++) {
        rainDrops.push({
            x: Math.random() * FILTER_W,
            y: Math.random() * FILTER_H,
            s: 28 + Math.random() * 26,
            speed: 1.8 + Math.random() * 2.8,
            rot: Math.random() * 0.35 - 0.175
        });
    }
}

function setupParticles() {
    particles = [];
}

function setEffectName() {
    let el = document.getElementById("filterName");
    if (el) el.textContent = effectNames[currentEffect];
}

function nextEffect() {
    currentEffect = (currentEffect + 1) % effectNames.length;
    setEffectName();
    syncBodySeg();
}

function prevEffect() {
    currentEffect = (currentEffect - 1 + effectNames.length) % effectNames.length;
    setEffectName();
    syncBodySeg();
}

function pointOf(hand, key) {
    if (!hand || !hand.keypoints || !hand.keypoints[key]) return null;
    let k = hand.keypoints[key];
    if (k.x == null || k.y == null) return null;
    return { x: k.x, y: k.y };
}

function handleGestures() {
    if (effectTap) {
        effectTap.update(hands, millis(), {
            onNext: nextEffect,
            onPrev: prevEffect
        });
    }

    if (hands.length < 2) {
        windowActive = false;
        return;
    }

    let handA = hands[0];
    let handB = hands[1];
    let AThumbV = pointOf(handA, KP.thumbTip);
    let AIndexV = pointOf(handA, KP.indexTip);
    let BThumbV = pointOf(handB, KP.thumbTip);
    let BIndexV = pointOf(handB, KP.indexTip);
    if (!AThumbV || !AIndexV || !BThumbV || !BIndexV) {
        windowActive = false;
        return;
    }

    let AThumb = mapFromVideo(AThumbV.x, AThumbV.y);
    let AIndex = mapFromVideo(AIndexV.x, AIndexV.y);
    let BThumb = mapFromVideo(BThumbV.x, BThumbV.y);
    let BIndex = mapFromVideo(BIndexV.x, BIndexV.y);

    let allX = [AThumb.x, AIndex.x, BThumb.x, BIndex.x];
    let allY = [AThumb.y, AIndex.y, BThumb.y, BIndex.y];
    let x1 = Math.min(...allX);
    let y1 = Math.min(...allY);
    let x2 = Math.max(...allX);
    let y2 = Math.max(...allY);

    let distA = dist(AThumb.x, AThumb.y, AIndex.x, AIndex.y);
    let distB = dist(BThumb.x, BThumb.y, BIndex.x, BIndex.y);
    let openThreshold = 45 * coverTransform().scale;
    let area = (x2 - x1) * (y2 - y1);
    windowActive = distA > openThreshold && distB > openThreshold && area > 4000;

    if (windowActive) currentRect = { x1, y1, x2, y2 };
}

function draw() {
    background(0);
    if (!appStarted) return;

    try {
        if (video) drawCover(video);

        handleGestures();
        windowAlpha = lerp(windowAlpha, windowActive ? 1 : 0, 0.22);
        if (windowAlpha < 0.01) {
            windowAlpha = 0;
            if (!windowActive) smoothRect = null;
        }
        updateSmoothRect();

        if (windowAlpha > 0.01 && smoothRect && video) {
            drawFilteredVideo();
            tint(255, windowAlpha * 255);
            drawingContext.save();
            try {
                drawingContext.beginPath();
                drawingContext.rect(smoothRect.x1, smoothRect.y1, smoothRect.x2 - smoothRect.x1, smoothRect.y2 - smoothRect.y1);
                drawingContext.clip();
                drawCover(filterBuffer);
                if (currentEffect === 6) drawPersonInFront();
            } finally {
                drawingContext.restore();
                noTint();
            }

            noFill();
            stroke(255, windowAlpha * 255);
            strokeWeight(2);
            rect(smoothRect.x1, smoothRect.y1, smoothRect.x2 - smoothRect.x1, smoothRect.y2 - smoothRect.y1);
        }

        drawHands();
    } catch (e) {
        showError("Errore disegno: " + (e && e.message ? e.message : e));
    }
}

function updateSmoothRect() {
    if (!currentRect) return;
    if (!smoothRect) {
        smoothRect = {
            x1: currentRect.x1,
            y1: currentRect.y1,
            x2: currentRect.x2,
            y2: currentRect.y2
        };
        return;
    }
    let k = windowActive ? 0.38 : 0.2;
    smoothRect.x1 = lerp(smoothRect.x1, currentRect.x1, k);
    smoothRect.y1 = lerp(smoothRect.y1, currentRect.y1, k);
    smoothRect.x2 = lerp(smoothRect.x2, currentRect.x2, k);
    smoothRect.y2 = lerp(smoothRect.y2, currentRect.y2, k);
}

function drawPersonInFront() {
    if (!segmentation || !segmentation.mask || !video) return;
    try {
        personBuffer.clear();
        personBuffer.image(video, 0, 0, FILTER_W, FILTER_H);
        personBuffer.mask(segmentation.mask);
        drawCover(personBuffer);
    } catch (e) {
        /* mask può non essere pronta */
    }
}

function drawFilteredVideo() {
    filterBuffer.clear();
    filterBuffer.image(video, 0, 0, FILTER_W, FILTER_H);

    switch (currentEffect) {
        case 0:
            filterBuffer.filter(GRAY);
            break;
        case 1:
            filterBuffer.filter(THRESHOLD, 0.5);
            break;
        case 2:
            applyPsychedelicEffect();
            break;
        case 3:
            applyMotionEffect();
            break;
        case 4:
            applyAnimeEffect();
            break;
        case 5:
            applyParticleEffect();
            break;
        case 6:
            applyRainEffect();
            break;
        case 7:
            applyGameBoyEffect();
            break;
    }
}

function applyPsychedelicEffect() {
    filterBuffer.loadPixels();
    let p = filterBuffer.pixels;
    let shift = (frameCount * 2) % 255;
    for (let i = 0; i < p.length; i += 4) {
        p[i] = (p[i] + shift) % 255;
        p[i + 1] = (p[i + 1] + 255 - shift) % 255;
        p[i + 2] = (p[i + 2] + shift * 2) % 255;
    }
    filterBuffer.updatePixels();
}

function applyMotionEffect() {
    grayBuffer.image(video, 0, 0, FILTER_W, FILTER_H);
    grayBuffer.filter(GRAY);
    trailBuffer.noStroke();
    trailBuffer.fill(0, 28);
    trailBuffer.rect(0, 0, FILTER_W, FILTER_H);
    grayBuffer.loadPixels();
    prevGray.loadPixels();
    motionPts = [];
    let gp = grayBuffer.pixels;
    let pp = prevGray.pixels;
    for (let y = 0; y < FILTER_H; y += 4) {
        for (let x = 0; x < FILTER_W; x += 4) {
            let i = (y * FILTER_W + x) * 4;
            let d = Math.abs(gp[i] - pp[i]);
            if (d > 28) {
                trailBuffer.stroke(255, Math.min(255, d * 3));
                trailBuffer.strokeWeight(2);
                trailBuffer.point(x, y);
                if (motionPts.length < 80) motionPts.push({ x, y, d });
            }
        }
    }
    prevGray.image(grayBuffer, 0, 0);
    filterBuffer.image(video, 0, 0, FILTER_W, FILTER_H);
    filterBuffer.blend(trailBuffer, 0, 0, FILTER_W, FILTER_H, 0, 0, FILTER_W, FILTER_H, ADD);
}

function applyAnimeEffect() {
    filterBuffer.filter(POSTERIZE, 4);
    filterBuffer.loadPixels();
    let p = filterBuffer.pixels;
    let step = 2;
    for (let y = 1; y < FILTER_H - 1; y += step) {
        for (let x = 1; x < FILTER_W - 1; x += step) {
            let i = (y * FILTER_W + x) * 4;
            let iR = (y * FILTER_W + x + step) * 4;
            let iD = ((y + step) * FILTER_W + x) * 4;
            if (iD + 2 >= p.length || iR + 2 >= p.length) continue;
            let lum = p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11;
            let lumR = p[iR] * 0.3 + p[iR + 1] * 0.59 + p[iR + 2] * 0.11;
            let lumD = p[iD] * 0.3 + p[iD + 1] * 0.59 + p[iD + 2] * 0.11;
            if (Math.abs(lum - lumR) > 32 || Math.abs(lum - lumD) > 32) {
                p[i] = p[i + 1] = p[i + 2] = 20;
            }
        }
    }
    filterBuffer.updatePixels();
}

function applyParticleEffect() {
    if (motionPts.length === 0 && hands.length) {
        for (let h of hands) {
            let t = pointOf(h, KP.indexTip);
            if (!t) continue;
            motionPts.push({
                x: t.x * FILTER_W / VIDEO_W,
                y: t.y * FILTER_H / VIDEO_H,
                d: 80
            });
        }
    }
    for (let m of motionPts) {
        if (particles.length < 220 && Math.random() < 0.5) {
            particles.push({
                x: m.x,
                y: m.y,
                vx: (Math.random() - 0.5) * 4,
                vy: (Math.random() - 0.5) * 4,
                life: 40 + Math.random() * 30
            });
        }
    }
    filterBuffer.noStroke();
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        filterBuffer.fill(255, 240, 180, Math.max(0, p.life * 5));
        filterBuffer.circle(p.x, p.y, 4 + (40 - Math.min(40, p.life)) * 0.08);
        if (p.life <= 0) particles.splice(i, 1);
    }
}

function applyRainEffect() {
    filterBuffer.image(video, 0, 0, FILTER_W, FILTER_H);
    if (!faceSprite || !faceSprite.width) return;
    for (let d of rainDrops) {
        filterBuffer.push();
        filterBuffer.translate(d.x, d.y);
        filterBuffer.rotate(d.rot);
        let aspect = faceSprite.height / faceSprite.width;
        filterBuffer.image(faceSprite, -d.s / 2, -(d.s * aspect) / 2, d.s, d.s * aspect);
        filterBuffer.pop();
        d.y += d.speed;
        d.x += Math.sin(frameCount * 0.02 + d.x) * 0.4;
        if (d.y > FILTER_H + 40) {
            d.y = -40;
            d.x = Math.random() * FILTER_W;
        }
    }
}

function applyGameBoyEffect() {
    const pal = [
        [15, 56, 15],
        [48, 98, 48],
        [139, 172, 15],
        [155, 188, 15]
    ];
    let size = 8;
    filterBuffer.loadPixels();
    let src = filterBuffer.pixels;
    filterBuffer.noStroke();
    for (let y = 0; y < FILTER_H; y += size) {
        for (let x = 0; x < FILTER_W; x += size) {
            let i = ((y + (size >> 1)) * FILTER_W + (x + (size >> 1))) * 4;
            if (i + 2 >= src.length) continue;
            let lum = (src[i] + src[i + 1] + src[i + 2]) / 3;
            let idx = lum < 64 ? 0 : lum < 128 ? 1 : lum < 192 ? 2 : 3;
            let col = pal[idx];
            filterBuffer.fill(col[0], col[1], col[2]);
            filterBuffer.rect(x, y, size, size);
        }
    }
}

function drawHands() {
    stroke(255);
    strokeWeight(2);
    for (let hand of hands) {
        if (!hand || !hand.keypoints || hand.keypoints.length < 21) continue;
        let connections = [
            [0, 1], [1, 2], [2, 3], [3, 4],
            [0, 5], [5, 6], [6, 7], [7, 8],
            [0, 9], [9, 10], [10, 11], [11, 12],
            [0, 13], [13, 14], [14, 15], [15, 16],
            [0, 17], [17, 18], [18, 19], [19, 20],
            [5, 9], [9, 13], [13, 17]
        ];
        for (let [a, b] of connections) {
            if (!hand.keypoints[a] || !hand.keypoints[b]) continue;
            let pa = mapFromVideo(hand.keypoints[a].x, hand.keypoints[a].y);
            let pb = mapFromVideo(hand.keypoints[b].x, hand.keypoints[b].y);
            line(pa.x, pa.y, pb.x, pb.y);
        }
        for (let kp of hand.keypoints) {
            if (!kp) continue;
            let p = mapFromVideo(kp.x, kp.y);
            fill(255);
            noStroke();
            circle(p.x, p.y, 5);
            stroke(255);
        }

        let idxP = pointOf(hand, KP.indexTip);
        let pnkP = pointOf(hand, KP.pinkyTip);
        if (!idxP || !pnkP) continue;
        let idx = mapFromVideo(idxP.x, idxP.y);
        let pnk = mapFromVideo(pnkP.x, pnkP.y);
        let ratio = typeof pinchRatio === "function" ? pinchRatio(hand) : 99;
        if (ratio < 1.05) {
            let ready = ratio < 0.72;
            stroke(255, ready ? 255 : 140);
            strokeWeight(ready ? 4 : 2);
            line(idx.x, idx.y, pnk.x, pnk.y);
            noStroke();
            fill(255);
            circle(idx.x, idx.y, ready ? 14 : 10);
            circle(pnk.x, pnk.y, ready ? 14 : 10);
        }
    }
}

function rememberFile(blob, name, mime) {
    lastFile = new File([blob], name, { type: mime });
    document.getElementById("btnShare").disabled = false;
    let a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
}

function canvasEl() {
    return canvas.elt || canvas;
}

function takePhoto() {
    if (!appStarted) return;
    canvasEl().toBlob((blob) => {
        if (!blob) return;
        rememberFile(blob, "finestra-magica.png", "image/png");
    }, "image/png");
}

function pickMime() {
    if (typeof MediaRecorder === "undefined") return "";
    let types = ["video/webm;codecs=vp9", "video/webm", "video/mp4"];
    for (let t of types) {
        if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return "";
}

function toggleRecording() {
    if (!appStarted) return;
    if (typeof MediaRecorder === "undefined") {
        showError("Registrazione non supportata in questo browser.");
        return;
    }
    if (isRecording) {
        mediaRecorder.stop();
        return;
    }
    recordedChunks = [];
    let stream = canvasEl().captureStream(30);
    let mime = pickMime();
    try {
        mediaRecorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch (e) {
        showError("Registrazione non supportata: " + e.message);
        return;
    }
    mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size) recordedChunks.push(e.data);
    };
    mediaRecorder.onstop = () => {
        isRecording = false;
        document.getElementById("btnRec").classList.remove("recording");
        let type = mediaRecorder.mimeType || "video/webm";
        let ext = type.indexOf("mp4") >= 0 ? "mp4" : "webm";
        let blob = new Blob(recordedChunks, { type });
        rememberFile(blob, "finestra-magica." + ext, type);
    };
    mediaRecorder.start();
    isRecording = true;
    document.getElementById("btnRec").classList.add("recording");
}

async function shareLast() {
    if (!lastFile) return;
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [lastFile] })) {
        try {
            await navigator.share({ files: [lastFile], title: "Finestra Magica" });
        } catch (e) {
            if (e && e.name !== "AbortError") showError("Condivisione annullata o non disponibile.");
        }
        return;
    }
    if (navigator.share) {
        try {
            await navigator.share({ title: "Finestra Magica", text: lastFile.name });
        } catch (e) {
            /* ignore */
        }
        return;
    }
    showError("Condivisione non disponibile: il file è già stato salvato.");
}
