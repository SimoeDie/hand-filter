const assert = require("assert");
const { createEffectTapController } = require("./gesture-tap.js");

function fakeHand(opts) {
    let kp = [];
    for (let i = 0; i < 21; i++) kp.push({ x: 0, y: 0 });
    kp[0] = { x: 0, y: 100 };
    kp[9] = { x: 0, y: 40 };
    kp[4] = { x: opts.ix, y: opts.iy };
    kp[20] = { x: opts.px, y: opts.py };
    return { handedness: opts.id || "Left", keypoints: kp };
}

function openHand(id) {
    return fakeHand({ id: id || "Left", ix: 40, iy: 0, px: -50, py: 10 });
}

function pinchedHand(id) {
    return fakeHand({ id: id || "Left", ix: 8, iy: 0, px: 14, py: 2 });
}

function makeClock() {
    let t = 0;
    let nid = 1;
    let jobs = [];
    return {
        now: function () { return t; },
        setTimeout: function (fn, ms) {
            let id = nid++;
            jobs.push({ id: id, at: t + ms, fn: fn });
            return id;
        },
        clearTimeout: function (id) {
            jobs = jobs.filter(function (j) { return j.id !== id; });
        },
        advance: function (ms) {
            t += ms;
            let due = jobs.filter(function (j) { return j.at <= t; });
            jobs = jobs.filter(function (j) { return j.at > t; });
            due.forEach(function (j) { j.fn(); });
        }
    };
}

function makeCtl(clock) {
    return createEffectTapController({
        setTimeoutFn: clock.setTimeout,
        clearTimeoutFn: clock.clearTimeout
    });
}

function frames(ctl, clock, hand, n, cbs) {
    for (let i = 0; i < n; i++) {
        clock.advance(16);
        ctl.update(hand ? [hand] : [], clock.now(), cbs);
    }
}

let next = 0;
let prev = 0;
function cbs() {
    return {
        onNext: function () { next += 1; },
        onPrev: function () { prev += 1; }
    };
}

next = 0; prev = 0;
{
    let clock = makeClock();
    let ctl = makeCtl(clock);
    let c = cbs();
    frames(ctl, clock, pinchedHand("Left"), 6, c);
    clock.advance(50);
    assert.strictEqual(next, 1, "left fingers touching should go next immediately");
    assert.strictEqual(prev, 0, "left touch should not go prev");
}

next = 0; prev = 0;
{
    let clock = makeClock();
    let ctl = makeCtl(clock);
    let c = cbs();
    frames(ctl, clock, pinchedHand("Right"), 6, c);
    clock.advance(50);
    assert.strictEqual(prev, 1, "right fingers touching should go prev immediately");
    assert.strictEqual(next, 0, "right touch should not go next");
}

next = 0; prev = 0;
{
    let clock = makeClock();
    let ctl = makeCtl(clock);
    let c = cbs();
    frames(ctl, clock, pinchedHand("Left"), 6, c);
    frames(ctl, clock, openHand("Left"), 6, c);
    frames(ctl, clock, pinchedHand("Left"), 6, c);
    clock.advance(50);
    assert.strictEqual(next, 1, "second left touch inside cooldown should not fire again");
    assert.strictEqual(prev, 0, "two left touches must not go prev");
}

next = 0; prev = 0;
{
    let clock = makeClock();
    let ctl = makeCtl(clock);
    let c = cbs();
    frames(ctl, clock, pinchedHand("Left"), 1, c);
    frames(ctl, clock, openHand("Left"), 6, c);
    clock.advance(50);
    assert.strictEqual(next + prev, 0, "1-frame flicker must not count as a tap");
}

next = 0; prev = 0;
{
    let clock = makeClock();
    let ctl = makeCtl(clock);
    let c = cbs();
    frames(ctl, clock, pinchedHand("Left"), 1, c);
    frames(ctl, clock, null, 6, c);
    clock.advance(50);
    assert.strictEqual(next + prev, 0, "losing the hand before a stable touch must not fire");
}

next = 0; prev = 0;
{
    let clock = makeClock();
    let ctl = makeCtl(clock);
    let c = cbs();
    frames(ctl, clock, openHand("Left"), 10, c);
    clock.advance(50);
    assert.strictEqual(next + prev, 0, "open hand must not pinch");
}

console.log("gesture-tap tests passed");
