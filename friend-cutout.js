// Scontorno ritratto: solo sfondo nero collegato ai bordi + alone bianco.
// I capelli scuri non vengono cancellati.
(function (g) {
    function isWhiteHalo(r, g, b) {
        let mx = Math.max(r, g, b);
        let mn = Math.min(r, g, b);
        let sat = mx - mn;
        let lum = 0.299 * r + 0.587 * g + 0.114 * b;
        return (lum >= 188 && sat <= 36) || (lum >= 168 && sat <= 18);
    }

    function isStudioBlack(r, g, b) {
        let mx = Math.max(r, g, b);
        let mn = Math.min(r, g, b);
        return mx <= 18 && (mx - mn) <= 8;
    }

    function friendBgAlpha(r, g, b) {
        if (isWhiteHalo(r, g, b)) return 0;
        return 255;
    }

    function applyFriendCutout(pixels, width, height) {
        for (let i = 0; i < pixels.length; i += 4) {
            pixels[i + 3] = Math.min(pixels[i + 3], friendBgAlpha(pixels[i], pixels[i + 1], pixels[i + 2]));
        }
        if (!width || !height) return pixels;

        let seen = new Uint8Array(width * height);
        let stack = [];

        function tryPush(x, y) {
            if (x < 0 || y < 0 || x >= width || y >= height) return;
            let idx = y * width + x;
            if (seen[idx]) return;
            let i = idx * 4;
            if (pixels[i + 3] === 0) {
                seen[idx] = 1;
                return;
            }
            if (!isStudioBlack(pixels[i], pixels[i + 1], pixels[i + 2])) return;
            seen[idx] = 1;
            stack.push(idx);
        }

        for (let x = 0; x < width; x++) {
            tryPush(x, 0);
            tryPush(x, height - 1);
        }
        for (let y = 0; y < height; y++) {
            tryPush(0, y);
            tryPush(width - 1, y);
        }

        while (stack.length) {
            let idx = stack.pop();
            let i = idx * 4;
            pixels[i + 3] = 0;
            let x = idx % width;
            let y = (idx - x) / width;
            tryPush(x - 1, y);
            tryPush(x + 1, y);
            tryPush(x, y - 1);
            tryPush(x, y + 1);
        }

        return pixels;
    }

    let api = { friendBgAlpha: friendBgAlpha, applyFriendCutout: applyFriendCutout };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    g.friendBgAlpha = friendBgAlpha;
    g.applyFriendCutout = applyFriendCutout;
})(typeof globalThis !== "undefined" ? globalThis : this);
