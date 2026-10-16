/** A message turn lets input and native animation frames run between steps. */
export class WorkerTaskYield {
  readonly #channel = new MessageChannel()
  readonly #pending: Array<{ resolve: () => void; reject: (error: unknown) => void }> = []
  #closed = false

  constructor() {
    const receivePort = this.#channel.port1
    receivePort.onmessage = () => this.#pending.shift()?.resolve()
  }

  next(): Promise<void> {
    if (this.#closed) return Promise.reject(new DOMException("Canvas was destroyed", "AbortError"))
    return new Promise((resolve, reject) => {
      this.#pending.push({ resolve, reject })
      this.#channel.port2.postMessage(null)
    })
  }

  close() {
    this.#closed = true
    this.#channel.port1.close()
    this.#channel.port2.close()
    const error = new DOMException("Canvas was destroyed", "AbortError")
    this.#pending.splice(0).forEach(({ reject }) => reject(error))
  }
}
