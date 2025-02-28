export class Scaler {
  constructor(
    private fromMinValue: number,
    private fromMaxValue: number,
    private toMinValue: number,
    private toMaxValue: number,
    private postProc?: (val: number) => number,
  ) {}

  scale(value: number) {
    const fromPercent = (value - this.fromMinValue) / (this.fromMaxValue - this.fromMinValue);
    const toValue = this.toMinValue + fromPercent * (this.toMaxValue - this.toMinValue);
    console.log('Scaling value', value, this.fromMinValue, this.fromMaxValue, fromPercent, this.toMinValue, this.toMaxValue, toValue);
    return this.postProc?.(toValue) ?? toValue;
  }
}
