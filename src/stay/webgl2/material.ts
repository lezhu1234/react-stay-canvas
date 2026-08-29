export type MeshColor = readonly [number, number, number, number]

export interface UnlitMaterialProps {
  readonly color?: MeshColor
}

export interface LambertMaterialProps {
  readonly color?: MeshColor
}

export interface GlassMaterialProps {
  readonly color?: MeshColor
  /** Refractive index of the glass medium. Must be greater than 1. */
  readonly ior?: number
  /** Micro-surface blur from 0 (sharp) to 1 (fully rough). */
  readonly roughness?: number
  /** Distance travelled through the medium in world units. */
  readonly thickness?: number
}

function copyColor(
  color: MeshColor,
  name: string
): MeshColor {
  const copied: [number, number, number, number] = [
    color[0], color[1], color[2], color[3],
  ]
  copied.forEach((value, index) => {
    if (!Number.isFinite(value)) throw new TypeError(`${name}[${index}] must be finite`)
    if (value < 0 || value > 1) {
      throw new RangeError(`${name} must be between 0 and 1`)
    }
  })
  return Object.freeze(copied)
}

function copyOpaqueColor(
  color: MeshColor = [1, 1, 1, 1],
  name = "material color"
): MeshColor {
  const copied = copyColor(color, name)
  if (copied[3] !== 1) {
    throw new RangeError(`${name} alpha must be 1 for an opaque material`)
  }
  return copied
}

function copyGlassColor(
  color: MeshColor = [0.82, 0.92, 1, 0.18],
  name = "GlassMaterial color"
): MeshColor {
  const copied = copyColor(color, name)
  if (copied[3] <= 0 || copied[3] >= 1) {
    throw new RangeError(`${name} alpha must be greater than 0 and less than 1`)
  }
  return copied
}

function copyFloat32(value: number, name: string) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`)
  const copied = Math.fround(value)
  if (!Number.isFinite(copied)) throw new RangeError(`${name} exceeds Float32 range`)
  return copied
}

function copyIndexOfRefraction(value = 1.5) {
  const copied = copyFloat32(value, "GlassMaterial ior")
  if (copied <= 1) {
    throw new RangeError("GlassMaterial ior must be greater than 1 in Float32 range")
  }
  return copied
}

function copyThickness(value = 0.1) {
  if (Number.isFinite(value) && value < 0) {
    throw new RangeError("GlassMaterial thickness must be greater than or equal to 0")
  }
  const copied = copyFloat32(value, "GlassMaterial thickness")
  return copied
}

function copyRoughness(value = 0) {
  if (Number.isFinite(value) && (value < 0 || value > 1)) {
    throw new RangeError("GlassMaterial roughness must be between 0 and 1")
  }
  const copied = copyFloat32(value, "GlassMaterial roughness")
  if (copied < 0 || copied > 1) {
    throw new RangeError("GlassMaterial roughness must be between 0 and 1")
  }
  return copied
}

/** An immutable opaque material that ignores scene lights. */
export class UnlitMaterial {
  readonly kind = "unlit"
  readonly color: MeshColor
  readonly #materialBrand = "unlit"

  constructor({ color }: UnlitMaterialProps = {}) {
    this.color = copyOpaqueColor(color, "UnlitMaterial color")
    Object.freeze(this)
  }
}

/** An immutable opaque diffuse material lit by the layer's ambient and directional lights. */
export class LambertMaterial {
  readonly kind = "lambert"
  readonly color: MeshColor
  readonly #materialBrand = "lambert"

  constructor({ color }: LambertMaterialProps = {}) {
    this.color = copyOpaqueColor(color, "LambertMaterial color")
    Object.freeze(this)
  }
}

/** An immutable lit refractive material rendered in the transparent queue. */
export class GlassMaterial {
  readonly kind = "glass"
  readonly color: MeshColor
  readonly ior: number
  readonly roughness: number
  readonly thickness: number
  readonly #materialBrand = "glass"

  constructor({ color, ior, roughness, thickness }: GlassMaterialProps = {}) {
    this.color = copyGlassColor(color)
    this.ior = copyIndexOfRefraction(ior)
    this.roughness = copyRoughness(roughness)
    this.thickness = copyThickness(thickness)
    Object.freeze(this)
  }
}

export type MeshMaterial = UnlitMaterial | LambertMaterial | GlassMaterial

export type MeshMaterialSnapshot = Readonly<
  | { kind: "unlit"; color: MeshColor }
  | { kind: "lambert"; color: MeshColor }
  | {
    kind: "glass"
    color: MeshColor
    ior: number
    roughness: number
    thickness: number
  }
>

export function copyMeshMaterial(material: MeshMaterial): MeshMaterial {
  if (material instanceof UnlitMaterial) return new UnlitMaterial({ color: material.color })
  if (material instanceof LambertMaterial) return new LambertMaterial({ color: material.color })
  if (material instanceof GlassMaterial) {
    return new GlassMaterial({
      color: material.color,
      ior: material.ior,
      roughness: material.roughness,
      thickness: material.thickness,
    })
  }
  throw new TypeError(
    "Mesh material must be an UnlitMaterial, LambertMaterial, or GlassMaterial"
  )
}

export function captureMeshMaterial(material: MeshMaterial): MeshMaterialSnapshot {
  if (material instanceof GlassMaterial) {
    return {
      kind: material.kind,
      color: [...material.color],
      ior: material.ior,
      roughness: material.roughness,
      thickness: material.thickness,
    }
  }
  return { kind: material.kind, color: [...material.color] }
}

export function materializeMeshMaterial(snapshot: MeshMaterialSnapshot): MeshMaterial {
  if (snapshot.kind === "unlit") return new UnlitMaterial({ color: snapshot.color })
  if (snapshot.kind === "lambert") return new LambertMaterial({ color: snapshot.color })
  if (snapshot.kind === "glass") {
    return new GlassMaterial({
      color: snapshot.color,
      ior: snapshot.ior,
      roughness: snapshot.roughness,
      thickness: snapshot.thickness,
    })
  }
  throw new TypeError("Mesh material snapshot has an unsupported kind")
}

/** @internal Lit materials require normals and an affine invertible model matrix. */
export function meshMaterialUsesLighting(material: MeshMaterial) {
  return material instanceof LambertMaterial || material instanceof GlassMaterial
}

/** @internal Only GlassMaterial participates in the transparent render queue. */
export function meshMaterialIsTransparent(material: MeshMaterial) {
  return material instanceof GlassMaterial
}
