export const name = 'dsh-session-page-clamp'
export const inject = ['sessionController']

const WRAPPED = Symbol('dsh-session-page-clamp.wrapper')

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

function restore(target, descriptor) {
  if (descriptor) Object.defineProperty(target, 'page', descriptor)
  else if (!Reflect.deleteProperty(target, 'page')) {
    throw new Error(`${name}: cannot remove sessionController.page shadow during cleanup`)
  }
}

function install(svc, target, wrapper, defineOwn = false) {
  if (!target) return
  const descriptor = Object.getOwnPropertyDescriptor(target, 'page')
  // A frozen instance or a proxy can reject a write. Read-back, not the
  // assignment's return value, decides whether the gateway reaches the patch.
  try {
    if (defineOwn) {
      Object.defineProperty(target, 'page', {
        value: wrapper,
        writable: descriptor?.writable ?? true,
        enumerable: descriptor?.enumerable ?? false,
        configurable: descriptor?.configurable ?? true,
      })
    } else {
      Reflect.set(target, 'page', wrapper)
    }
  } catch {
    // Try the immediate prototype below when instance assignment cannot work.
  }
  if (svc.page === wrapper) return () => restore(target, descriptor)
  if (target.page === wrapper) restore(target, descriptor)
}

export function apply(ctx, config) {
  const { maxMessages, enabled } = resolveConfig(config)
  if (!enabled) return

  const reached = ctx.sessionController
  // Cordis 4 contextual method reads create a fresh function proxy, and its
  // writes target a transient shadow. Patch the shared raw service instead.
  const raw = reached?.[Symbol.for('cordis.original')]
  const svc = raw ?? reached
  const original = svc?.page
  if (typeof original !== 'function') {
    throw new TypeError(`${name}: sessionController.page must be a function`)
  }
  if (original[WRAPPED]) return

  // Do not make this async: callers must receive the original promise itself.
  function wrapper(request, signal) {
    let effective = request
    if (Number.isSafeInteger(request?.maxMessages)
      && request.maxMessages > 0 && request.maxMessages > maxMessages) {
      effective = { ...request, maxMessages }
      if (request.turnWindow) {
        effective.turnWindow = { ...request.turnWindow }
        if ('minMessages' in request.turnWindow) {
          effective.turnWindow.minMessages = Math.min(request.turnWindow.minMessages, maxMessages)
        }
      }
    }
    return original.apply(this, [effective, signal])
  }
  Object.defineProperty(wrapper, WRAPPED, { value: true })

  ctx.effect(() => {
    const cleanup = install(svc, svc, wrapper, raw != null)
      ?? install(svc, Object.getPrototypeOf(svc), wrapper)
    if (!cleanup) {
      throw new Error(`${name}: cannot install wrapper on sessionController.page or its immediate prototype (read-back failed)`)
    }
    return cleanup
  }, 'session-page-clamp: page wrapper')
}
