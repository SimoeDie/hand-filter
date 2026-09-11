// Cambio effetto: pollice (rosso) + mignolo (blu) si toccano. Sinistra = successivo, destra = precedente.
(function (g) {
    function hypot(ax, ay, bx, by) {
        let dx = ax - bx;
        let dy = ay - by;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function handKey(hand, i) {
        let hnd = hand && hand.handedness;
        if (typeof hnd === "string" && hnd) return hnd;
        if (hnd && typeof hnd === "object") {
            if (typeof hnd.categoryName === "string") return hnd.categoryName;
            if (typeof hnd.label === "string") return hnd.label;
        }
        if (hand && hand.id != null) return String(hand.id);
        return String(i);
    }

    function handScale(hand) {
        let kp = hand.keypoints;
        if (!kp || !kp[0] || !kp[9]) return 80;
        return Math.max(40, hypot(kp[0].x, kp[0].y, kp[9].x, kp[9].y));
    }

    function pinchRatio(hand) {
        let kp = hand.keypoints;
        if (!kp || !kp[4] || !kp[20]) return 99;
        return hypot(kp[4].x, kp[4].y, kp[20].x, kp[20].y) / handScale(hand);
    }

    function createEffectTapController(options) {
        options = options || {};
        let pinchIn = options.pinchIn != null ? options.pinchIn : 0.88;
        let pinchOut = options.pinchOut != null ? options.pinchOut : 1.05;
        let onFrames = options.onFrames != null ? options.onFrames : 2;
        let offFrames = options.offFrames != null ? options.offFrames : 3;
        let cooldownMs = options.cooldownMs != null ? options.cooldownMs : 280;
        let setT = options.setTimeoutFn || function (fn, ms) { return setTimeout(fn, ms); };
        let clearT = options.clearTimeoutFn || function (id) { clearTimeout(id); };

        let down = false;
        let onCount = 0;
        let offCount = 0;
        let downAt = 0;
        let activeKey = null;
        let cooldownUntil = 0;

        function sideOf(key) {
            let k = String(key || "").toLowerCase();
            if (k.indexOf("right") >= 0) return "right";
            if (k.indexOf("left") >= 0) return "left";
            return null;
        }

        function isPinched(hand) {
            let r = pinchRatio(hand);
            return r < (down ? pinchOut : pinchIn);
        }

        function findPinch(hands) {
            let best = null;
            for (let i = 0; i < hands.length; i++) {
                let h = hands[i];
                if (!isPinched(h)) continue;
                let r = pinchRatio(h);
                let key = handKey(h, i);
                if (!best || r < best.r) best = { key: key, r: r, hand: h };
            }
            return best;
        }

        function emitTap(now, cbs, key) {
            if (now < cooldownUntil) return;
            let side = sideOf(key);
            cooldownUntil = now + cooldownMs;
            if (side === "right") {
                if (cbs && cbs.onPrev) cbs.onPrev();
            } else if (side === "left") {
                if (cbs && cbs.onNext) cbs.onNext();
            }
        }

        function update(hands, now, cbs) {
            hands = hands || [];
            if (down) {
                let stillThere = false;
                for (let i = 0; i < hands.length; i++) {
                    if (handKey(hands[i], i) === activeKey) {
                        stillThere = true;
                        break;
                    }
                }
                if (!stillThere) {
                    down = false;
                    onCount = 0;
                    offCount = 0;
                    activeKey = null;
                    return { down: false, ratio: null };
                }
            }

            let hit = findPinch(hands);
            let pinched = false;
            if (down) {
                for (let i = 0; i < hands.length; i++) {
                    if (handKey(hands[i], i) === activeKey && isPinched(hands[i])) {
                        pinched = true;
                        break;
                    }
                }
            } else {
                pinched = !!hit;
            }

            let liveRatio = hit ? hit.r : null;
            if (!liveRatio && hands.length) {
                liveRatio = pinchRatio(hands[0]);
            }

            if (pinched) {
                onCount += 1;
                offCount = 0;
                if (!down && onCount >= onFrames) {
                    down = true;
                    downAt = now;
                    activeKey = hit ? hit.key : activeKey;
                    emitTap(now, cbs, activeKey);
                }
            } else {
                offCount += 1;
                onCount = 0;
                if (down && offCount >= offFrames) {
                    down = false;
                    activeKey = null;
                }
            }

            return { down: down, ratio: liveRatio };
        }

        function reset() {
            down = false;
            onCount = 0;
            offCount = 0;
            activeKey = null;
            cooldownUntil = 0;
        }

        return {
            update: update,
            reset: reset,
            pinchRatio: pinchRatio
        };
    }

    let api = { createEffectTapController: createEffectTapController, pinchRatio: pinchRatio, handScale: handScale };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    g.createEffectTapController = createEffectTapController;
    g.pinchRatio = pinchRatio;
})(typeof globalThis !== "undefined" ? globalThis : this);
