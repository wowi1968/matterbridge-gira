/* eslint-disable @typescript-eslint/no-explicit-any */
type XyColor = { x: number; y: number };

export class ColorXy {
  m_x: number;
  m_y: number;

  constructor(xyColor: XyColor | { x: number; y: number });
  constructor(x: number, y: number);
  constructor(arg1: any, arg2?: any) {
    const max = 0xffff; // 65535
    if (typeof arg1 === 'object') {
      this.m_x = Math.round(arg1.x * max);
      this.m_y = Math.round(arg1.y * max);
    } else {
      this.m_x = arg1;
      this.m_y = arg2;
    }
  }

  toXyColor(): XyColor {
    const max = 0xffff;
    return {
      x: this.m_x / max,
      y: this.m_y / max,
    };
  }

  raw(): bigint {
    return (BigInt(this.m_x) << 16n) | BigInt(this.m_y);
  }

  equals(other: ColorXy): boolean {
    return this.m_x === other.m_x && this.m_y === other.m_y;
  }
}

export class Brightness {
  value: number;

  constructor(value: number) {
    this.value = value;
  }

  static fromRaw(raw: number): Brightness {
    return new Brightness((raw & 0xff00) >> 8);
  }

  toRaw(): number {
    return this.value << 8;
  }
}

export class ColorAndBrightness {
  m_color?: ColorXy;
  m_bri?: Brightness;

  constructor(raw: bigint);
  constructor(color?: ColorXy, bri?: Brightness);
  constructor(arg1?: any, arg2?: any) {
    if (typeof arg1 === 'bigint') {
      const raw = arg1;
      if ((raw & 0x01n) !== 0n) {
        this.m_bri = Brightness.fromRaw(Number((raw & 0xff00n) >> 8n));
      }
      if (((raw >> 1n) & 0x01n) !== 0n) {
        const x = Number((raw & 0xffff00000000n) >> 32n);
        const y = Number((raw & 0x0000ffff0000n) >> 16n);
        this.m_color = new ColorXy(x, y);
      }
    } else {
      this.m_color = arg1;
      this.m_bri = arg2;
    }
  }

  raw(): bigint {
    let raw = 0n;
    if (this.m_color) {
      raw = BigInt(this.m_color.raw());
      raw = raw << 16n;
      raw |= 0x02n;
    }
    if (this.m_bri) {
      raw |= BigInt(this.m_bri.toRaw());
      raw |= 0x01n;
    }
    return raw;
  }
}
