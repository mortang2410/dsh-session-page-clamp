export const name = 'dsh-session-page-clamp'
export const inject = ['sessionController']

const WRAPPED = Object.freeze({
  page: Symbol('dsh-session-page-clamp.page.wrapper'),
  follow: Symbol('dsh-session-page-clamp.follow.wrapper'),
})

function resolveConfig(config = {}) {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    throw new TypeError(`${name}: config must be an object`)
  }
  const { maxMessages = 50, enabled = true } = config
  if (!Number.isSafeInteger(maxMessages) || maxMessages <= 0) {
    throw new TypeError(`${name}: maxMessages must be a positive safe integer`)
  }
  if (typeof enabled !== 'boolean') {
    throw new TypeError(`${name}: enabled must be a boolean`)
  }
  return { maxMessages, enabled }
}

// Cordis consumes the synchronous Standard Schema interface directly.
export const Config = {
  '~standard': {
    version: 1,
    vendor: name,
    validate(input) {
      try {
        return { value: resolveConfig(input) }
      } catch (error) {
        return { issues: [{ message: error.message }] }
      }
    },
  },
}

function restore(target, method, descriptor) {
  if (descriptor) Object.defineProperty(target, method, descriptor)
  else if (!Reflect.deleteProperty(target, method)) {
    throw new Error(`${name}: cannot remove sessionController.${method} shadow during cleanup`)
  }
}

function install(svc, target, method, wrapper, defineOwn = false) {
  if (!target) return
  const descriptor = Object.getOwnPropertyDescriptor(target, method)
  // A frozen instance or a proxy can reject a write. Read-back, not the
  // assignment's return value, decides whether the gateway reaches the patch.
  try {
    if (defineOwn) {
      Object.defineProperty(target, method, {
        value: wrapper,
        writable: descriptor?.writable ?? true,
        enumerable: descriptor?.enumerable ?? false,
        configurable: descriptor?.configurable ?? true,
      })
    } else {
      Reflect.set(target, method, wrapper)
    }
  } catch {
    // Try the immediate prototype below when instance assignment cannot work.
  }
  if (svc[method] === wrapper) return () => restore(target, method, descriptor)
  if (target[method] === wrapper) restore(target, method, descriptor)
}

function clampRequest(request, maxMessages) {
  if (!Number.isSafeInteger(request?.maxMessages)
    || request.maxMessages <= 0 || request.maxMessages <= maxMessages) return request

  const effective = { ...request, maxMessages }
  const turnWindow = request.turnWindow
  if (turnWindow && typeof turnWindow === 'object' && !Array.isArray(turnWindow)) {
    effective.turnWindow = { ...turnWindow }
    if (Number.isSafeInteger(turnWindow.minMessages)) {
      effective.turnWindow.minMessages = Math.min(turnWindow.minMessages, maxMessages)
    }
  }
  return effective
}

function makeWrapper(original, method, maxMessages) {
  // Do not make this async: callers must receive the original result itself.
  function wrapper(request, signal) {
    return original.apply(this, [clampRequest(request, maxMessages), signal])
  }
  Object.defineProperty(wrapper, WRAPPED[method], { value: true })
  return wrapper
}

export function apply(ctx, config) {
  const { maxMessages, enabled } = resolveConfig(config)
  if (!enabled) return

  const reached = ctx.sessionController
  // Cordis 4 contextual method reads create a fresh function proxy, and its
  // writes target a transient shadow. Patch the shared raw service instead.
  const raw = reached?.[Symbol.for('cordis.original')]
  const svc = raw ?? reached
  const wrappers = new Map()
  for (const method of Object.keys(WRAPPED)) {
    const original = svc?.[method]
    if (typeof original !== 'function') {
      throw new TypeError(`${name}: sessionController.${method} must be a function`)
    }
    if (!original[WRAPPED[method]]) wrappers.set(method, makeWrapper(original, method, maxMessages))
  }
  if (wrappers.size === 0) return

  ctx.effect(() => {
    const cleanups = []
    try {
      for (const [method, wrapper] of wrappers) {
        const cleanup = install(svc, svc, method, wrapper, raw != null)
          ?? install(svc, Object.getPrototypeOf(svc), method, wrapper)
        if (!cleanup) {
          throw new Error(`${name}: cannot install wrapper on sessionController.${method} or its immediate prototype (read-back failed)`)
        }
        cleanups.push(cleanup)
      }
    } catch (error) {
      for (const cleanup of cleanups.reverse()) cleanup()
      throw error
    }
    return () => {
      for (const cleanup of cleanups.reverse()) cleanup()
    }
  }, 'session-page-clamp: page and follow wrappers')
}
