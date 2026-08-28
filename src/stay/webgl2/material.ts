export type MeshColor = readonly [number, number, number, number]

export interface UnlitMaterialProps {
  readonly color?: MeshColor
}

export interface LambertMaterialProps {
  readonly color?: MeshColor
}

function copyOpaqueColor(
  color: MeshColor = [1, 1, 1, 1],
  name = "material color"
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
  if (copied[3] !== 1) {
    throw new RangeError(`${name} alpha must be 1 for an opaque material`)
  }
  return Object.freeze(copied)
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

export type MeshMaterial = UnlitMaterial | LambertMaterial

export type MeshMaterialSnapshot = Readonly<{
  kind: MeshMaterial["kind"]
  color: MeshColor
}>

export function copyMeshMaterial(material: MeshMaterial): MeshMaterial {
  if (material instanceof UnlitMaterial) return new UnlitMaterial({ color: material.color })
  if (material instanceof LambertMaterial) return new LambertMaterial({ color: material.color })
  throw new TypeError("Mesh material must be an UnlitMaterial or LambertMaterial")
}

export function captureMeshMaterial(material: MeshMaterial): MeshMaterialSnapshot {
  return { kind: material.kind, color: [...material.color] }
}

export function materializeMeshMaterial(snapshot: MeshMaterialSnapshot): MeshMaterial {
  if (snapshot.kind === "unlit") return new UnlitMaterial({ color: snapshot.color })
  if (snapshot.kind === "lambert") return new LambertMaterial({ color: snapshot.color })
  throw new TypeError("Mesh material snapshot has an unsupported kind")
}
