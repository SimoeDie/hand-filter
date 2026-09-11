const assert = require("assert");
const { friendBgAlpha, applyFriendCutout } = require("./friend-cutout.js");

assert.strictEqual(friendBgAlpha(235, 234, 230), 0, "white hair halo must be transparent");
assert.strictEqual(friendBgAlpha(210, 208, 205), 0, "light gray cutout fringe must be transparent");

assert.ok(friendBgAlpha(58, 36, 28) > 200, "dark brown hair must stay");
assert.ok(friendBgAlpha(22, 14, 12) > 200, "dark hair strands must stay");
assert.ok(friendBgAlpha(10, 9, 8) > 200, "near-black hair must not be keyed as a color");
assert.ok(friendBgAlpha(210, 168, 140) > 200, "skin must stay");
assert.ok(friendBgAlpha(92, 98, 42) > 200, "olive shirt must stay");

{
    let w = 5;
    let h = 5;
    let p = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < p.length; i += 4) {
        p[i] = 0;
        p[i + 1] = 0;
        p[i + 2] = 0;
        p[i + 3] = 255;
    }
    let c = (2 * w + 2) * 4;
    p[c] = 58;
    p[c + 1] = 36;
    p[c + 2] = 28;
    p[c + 3] = 255;
    applyFriendCutout(p, w, h);
    assert.strictEqual(p[3], 0, "studio black on the border must disappear");
    assert.ok(p[c + 3] > 200, "hair in the middle of black studio must remain");
}

console.log("friend-cutout tests passed");
