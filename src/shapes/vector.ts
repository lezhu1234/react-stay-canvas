export class Vector {
  x: number
  y: number

  constructor(x: number, y: number) {
    this.x = x
    this.y = y
  }

  add(v: Vector) {
    return new Vector(this.x + v.x, this.y + v.y)
  }

  angle(v: Vector) {
    return Math.acos(this.project(v) / this.norm())
  }

  dot(v: Vector) {
    return this.x * v.x + this.y * v.y
  }

  norm() {
    return Math.sqrt(this.x * this.x + this.y * this.y)
  }

  project(v: Vector) {
    /**
     * 向量在v上的投影长度
     */
    return this.dot(v) / v.norm()
  }

  subtract(v: Vector) {
    return new Vector(this.x - v.x, this.y - v.y)
  }
}
