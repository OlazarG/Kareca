class EscposBuilder {
    constructor(width = 42) {
        this.buf = [];
        this.width = width;
    }

    init() { this.buf.push(0x1B, 0x40); return this; }
    feed(n = 1) { for (let i = 0; i < n; i++) this.buf.push(0x0A); return this; }
    font(f) { this.buf.push(0x1B, 0x4D, f === 'b' ? 1 : 0); return this; }
    bold(on) { this.buf.push(0x1B, 0x45, on ? 1 : 0); return this; }
    size(w, h) { this.buf.push(0x1D, 0x21, (w & 0x0F) | ((h & 0x0F) << 4)); return this; }
    align(a) {
        const m = { lt: 0, ct: 1, rt: 2 };
        this.buf.push(0x1B, 0x61, m[a] || 0);
        return this;
    }
    cut() { this.buf.push(0x1D, 0x56, 0x01); return this; }
    cashdraw() { this.buf.push(0x1B, 0x70, 0x00, 0x19, 0xFA); return this; }

    text(str) {
        const encoded = new TextEncoder().encode(str);
        this.buf.push(...encoded);
        this.buf.push(0x0A);
        return this;
    }

    line(str) {
        const encoded = new TextEncoder().encode(str);
        this.buf.push(...encoded);
        this.buf.push(0x0A);
        return this;
    }

    separator(ch = '-') {
        return this.line(ch.repeat(this.width));
    }

    formatLine(left, right) {
        const l = left.substring(0, this.width - 1);
        const r = String(right).substring(0, 15);
        const dots = this.width - l.length - r.length;
        if (dots > 0) {
            return this.line(l + ' '.repeat(dots) + r);
        }
        return this.line(l + ' ' + r);
    }

    build() {
        return new Uint8Array(this.buf);
    }
}
