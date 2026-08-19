export function uuid4() {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (character) =>
    (
      +character ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+character / 4)))
    ).toString(16)
  )
}
