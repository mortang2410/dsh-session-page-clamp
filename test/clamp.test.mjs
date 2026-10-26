import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { apply, Config, inject, name } from '../lib/index.js'

function context(service) {
  const cleanups = []
  return {
    sessionController: service,
    effect(setup) { cleanups.push(setup()) },
    dispose() {
      for (const cleanup of cleanups.splice(0).reverse()) cleanup()
    },
    cleanups,
  }
}

function service() {
  const calls = []
  const promise = Promise.resolve({ records: [], hasMore: false })
  const svc = { page(request, signal) {
    calls.push({ receiver: this, request, signal })
    return promise
  } }
  svc.follow = svc.page
  return { svc, calls, promise }
}

const request = (extra = {}) => ({
  address: { kind: 'session', sessionId: 'session-test' },
  throughSeq: 100,
  ...extra,
})

test('C1: clamps an excessive safe integer with a new, non-mutating request', () => {
  const { svc, calls } = service()
  const ctx = context(svc)
  apply(ctx, { maxMessages: 50 })
  const input = Object.freeze(request({ maxMessages: 500, beforeSeq: 99 }))
  svc.page(input)
  assert.notEqual(calls[0].request, input)
  assert.deepEqual(calls[0].request, request({ maxMessages: 50, beforeSeq: 99 }))
  assert.equal(input.maxMessages, 500)
  ctx.dispose()
})

test('C2: clamps minMessages, preserves minTurns and leaves the nested caller object intact', () => {
  const { svc, calls } = service()
  const ctx = context(svc)
  apply(ctx, { maxMessages: 20 })
  const turnWindow = Object.freeze({ minMessages: 50, minTurns: 3 })
  const input = Object.freeze(request({ maxMessages: 500, turnWindow }))
  svc.page(input)
  assert.deepEqual(calls[0].request, request({
    maxMessages: 20, turnWindow: { minMessages: 20, minTurns: 3 },
  }))
  assert.notEqual(calls[0].request.turnWindow, turnWindow)
  assert.deepEqual(turnWindow, { minMessages: 50, minTurns: 3 })
  ctx.dispose()
})

test('C2: preserves smaller minMessages and absent fields', () => {
  const { svc, calls } = service()
  const ctx = context(svc)
  apply(ctx)
  for (const turnWindow of [{ minMessages: 10 }, { minTurns: 2 }, {}]) {
    svc.page(request({ maxMessages: 500, turnWindow }))
    assert.deepEqual(calls.at(-1).request, request({ maxMessages: 50, turnWindow }))
  }
  svc.page(request({ maxMessages: 500 }))
  assert.deepEqual(calls.at(-1).request, request({ maxMessages: 50 }))
  ctx.dispose()
})

test('C3: absent, at-cap, below-cap and invalid maxMessages pass through by identity', () => {
  const { svc, calls } = service()
  const ctx = context(svc)
  apply(ctx)
  const inputs = [
    request(),
    ...[undefined, 50, 1, 0, -1, 50.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '500', null]
      .map(maxMessages => request({ maxMessages, turnWindow: { minMessages: 80, minTurns: 3 } })),
  ]
  for (const input of inputs) {
    svc.page(input)
    assert.equal(calls.at(-1).request, input)
  }
  ctx.dispose()
})

test('follow: clamps above-cap maxMessages with a new non-mutating request', () => {
  const { svc, calls } = service()
  const ctx = context(svc)
  apply(ctx, { maxMessages: 20 })
  const input = Object.freeze(request({ maxMessages: 500, beforeSeq: 99 }))
  svc.follow(input)
  assert.notEqual(calls[0].request, input)
  assert.deepEqual(calls[0].request, request({ maxMessages: 20, beforeSeq: 99 }))
  assert.equal(input.maxMessages, 500)
  ctx.dispose()
})

test('follow: at and below cap pass through by request identity', () => {
  const { svc, calls } = service()
  const ctx = context(svc)
  apply(ctx, { maxMessages: 20 })
  for (const maxMessages of [20, 1]) {
    const input = request({ maxMessages })
    svc.follow(input)
    assert.equal(calls.at(-1).request, input)
  }
  ctx.dispose()
})

test('follow: clamps turnWindow.minMessages and preserves minTurns without mutation', () => {
  const { svc, calls } = service()
  const ctx = context(svc)
  apply(ctx, { maxMessages: 20 })
  const turnWindow = Object.freeze({ minMessages: 50, minTurns: 3, marker: 'kept' })
  const input = Object.freeze(request({ maxMessages: 500, turnWindow }))
  svc.follow(input)
  assert.deepEqual(calls[0].request, request({
    maxMessages: 20,
    turnWindow: { minMessages: 20, minTurns: 3, marker: 'kept' },
  }))
  assert.notEqual(calls[0].request.turnWindow, turnWindow)
  assert.deepEqual(turnWindow, { minMessages: 50, minTurns: 3, marker: 'kept' })
  ctx.dispose()
})

test('follow: cleanup restores the exact original descriptor', () => {
  const { svc } = service()
  const pageDescriptor = Object.getOwnPropertyDescriptor(svc, 'page')
  const followDescriptor = Object.getOwnPropertyDescriptor(svc, 'follow')
  const ctx = context(svc)
  apply(ctx)
  assert.notEqual(svc.page, pageDescriptor.value)
  assert.notEqual(svc.follow, followDescriptor.value)
  ctx.dispose()
  assert.deepEqual(Object.getOwnPropertyDescriptor(svc, 'page'), pageDescriptor)
  assert.deepEqual(Object.getOwnPropertyDescriptor(svc, 'follow'), followDescriptor)
})

test('C4: Config exposes Standard Schema defaults and apply uses the default cap', () => {
  assert.equal(Config['~standard'].version, 1)
  assert.deepEqual(Config['~standard'].validate({}), { value: { maxMessages: 50, enabled: true } })
  const { svc, calls } = service()
  const ctx = context(svc)
  apply(ctx)
  svc.page(request({ maxMessages: 500 }))
  assert.equal(calls[0].request.maxMessages, 50)
  ctx.dispose()
})

test('C4: disabled mode installs no wrapper or effect, including on a frozen service', () => {
  const { svc } = service()
  const original = svc.page
  const ctx = context(Object.freeze(svc))
  apply(ctx, { enabled: false })
  assert.equal(svc.page, original)
  assert.equal(ctx.cleanups.length, 0)
})

test('C4: invalid config fails loudly before any wrapping, including when disabled', () => {
  for (const maxMessages of [0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, '50', null]) {
    const { svc } = service()
    const original = svc.page
    const ctx = context(svc)
    const config = { maxMessages, enabled: false }
    assert.throws(() => apply(ctx, config), /dsh-session-page-clamp.*maxMessages.*positive safe integer/)
    assert.match(Config['~standard'].validate(config).issues[0].message, /maxMessages.*positive safe integer/)
    assert.equal(svc.page, original)
    assert.equal(ctx.cleanups.length, 0)
  }
  for (const enabled of [null, 0, 'true']) {
    assert.throws(() => apply(context(service().svc), { enabled }), /enabled.*boolean/)
    assert.ok(Config['~standard'].validate({ enabled }).issues)
  }
  for (const config of [null, [], 'bad']) {
    assert.throws(() => apply(context(service().svc), config), /config.*object/)
    assert.ok(Config['~standard'].validate(config).issues)
  }
})

test('C5/C6: installs on the reached instance, restores exact page and follow descriptors', () => {
  const { svc, calls } = service()
  const pageDescriptor = Object.getOwnPropertyDescriptor(svc, 'page')
  const followDescriptor = Object.getOwnPropertyDescriptor(svc, 'follow')
  const ctx = context(svc)
  apply(ctx)
  const pageWrapper = svc.page
  const followWrapper = svc.follow
  assert.notEqual(pageWrapper, pageDescriptor.value)
  assert.notEqual(followWrapper, followDescriptor.value)
  assert.equal(ctx.sessionController.page, pageWrapper)
  assert.equal(ctx.sessionController.follow, followWrapper)
  svc.page(request({ maxMessages: 500 }))
  svc.follow(request({ maxMessages: 500 }))
  assert.equal(calls[0].request.maxMessages, 50)
  assert.equal(calls[1].request.maxMessages, 50)
  ctx.dispose()
  assert.deepEqual(Object.getOwnPropertyDescriptor(svc, 'page'), pageDescriptor)
  assert.deepEqual(Object.getOwnPropertyDescriptor(svc, 'follow'), followDescriptor)
})

test('C5/C6: inherited instance shadow is removed on disposal', () => {
  const { svc: proto } = service()
  const svc = Object.create(proto)
  const ctx = context(svc)
  apply(ctx)
  assert.ok(Object.hasOwn(svc, 'page'))
  assert.notEqual(svc.page, proto.page)
  ctx.dispose()
  assert.equal(Object.hasOwn(svc, 'page'), false)
  assert.equal(svc.page, proto.page)
})

test('C5/C6: frozen instance falls back to its mutable prototype and restores it', () => {
  const { svc: proto, calls } = service()
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'page')
  const svc = Object.freeze(Object.create(proto))
  const ctx = context(svc)
  apply(ctx, { maxMessages: 20 })
  assert.equal(svc.page, proto.page)
  assert.notEqual(svc.page, descriptor.value)
  svc.page(request({ maxMessages: 500 }))
  assert.equal(calls[0].request.maxMessages, 20)
  ctx.dispose()
  assert.equal(svc.page, descriptor.value)
  assert.deepEqual(Object.getOwnPropertyDescriptor(proto, 'page'), descriptor)
})

test('C5: read-back detects a proxy ignoring successful instance assignment', () => {
  const { svc: proto, calls } = service()
  const original = proto.page
  let sets = 0
  const svc = new Proxy(Object.create(proto), {
    set() { sets += 1; return true },
  })
  const ctx = context(svc)
  apply(ctx)
  assert.equal(sets, 2)
  assert.notEqual(svc.page, original)
  assert.notEqual(svc.follow, original)
  assert.equal(svc.page, proto.page)
  assert.equal(svc.follow, proto.follow)
  svc.page(request({ maxMessages: 500 }))
  svc.follow(request({ maxMessages: 500 }))
  assert.equal(calls[0].request.maxMessages, 50)
  assert.equal(calls[1].request.maxMessages, 50)
  ctx.dispose()
  assert.equal(proto.page, original)
  assert.equal(proto.follow, original)
})

test('C5: neither patch site works: fail loudly without leaving a prototype wrapper', () => {
  const { svc: proto } = service()
  const original = proto.page
  const svc = Object.freeze({ __proto__: proto, page: original })
  assert.throws(() => apply(context(svc)), /dsh-session-page-clamp.*cannot install.*sessionController.page/)
  assert.equal(proto.page, original)
  assert.equal(svc.page, original)
  Object.freeze(proto)
  assert.throws(() => apply(context(Object.freeze(Object.create(proto)))), /cannot install/)
  assert.throws(() => apply(context({})), /sessionController.page.*function/)
})

test('C6: duplicate mounts do not stack page or follow; dispose and remount wrap once', () => {
  const { svc, calls } = service()
  const originalPage = svc.page
  const originalFollow = svc.follow
  const first = context(svc)
  const duplicate = context(svc)
  apply(first, { maxMessages: 50 })
  const pageWrapper = svc.page
  const followWrapper = svc.follow
  assert.ok(Object.getOwnPropertySymbols(pageWrapper).some(symbol => typeof pageWrapper[symbol] === 'boolean'))
  assert.ok(Object.getOwnPropertySymbols(followWrapper).some(symbol => typeof followWrapper[symbol] === 'boolean'))
  apply(duplicate, { maxMessages: 10 })
  assert.equal(svc.page, pageWrapper)
  assert.equal(svc.follow, followWrapper)
  assert.equal(duplicate.cleanups.length, 0)
  svc.page(request({ maxMessages: 500 }))
  svc.follow(request({ maxMessages: 500 }))
  assert.equal(calls.length, 2)
  assert.equal(calls[0].request.maxMessages, 50)
  assert.equal(calls[1].request.maxMessages, 50)
  duplicate.dispose()
  first.dispose()
  assert.equal(svc.page, originalPage)
  assert.equal(svc.follow, originalFollow)
  const remount = context(svc)
  apply(remount, { maxMessages: 25 })
  assert.notEqual(svc.page, pageWrapper)
  assert.notEqual(svc.follow, followWrapper)
  svc.page(request({ maxMessages: 500 }))
  svc.follow(request({ maxMessages: 500 }))
  assert.equal(calls.length, 4)
  assert.equal(calls[2].request.maxMessages, 25)
  assert.equal(calls[3].request.maxMessages, 25)
  remount.dispose()
  assert.equal(svc.page, originalPage)
  assert.equal(svc.follow, originalFollow)
})

test('C7: page and follow forward this and AbortSignal and return their exact original results', () => {
  const { svc, calls, promise } = service()
  const followResult = (async function* () {})()
  svc.follow = function(request, signal) {
    calls.push({ receiver: this, request, signal })
    return followResult
  }
  const ctx = context(svc)
  apply(ctx)
  const receiver = { marker: true }
  const signal = new AbortController().signal
  assert.equal(svc.page.call(receiver, request({ maxMessages: 500 }), signal), promise)
  assert.equal(svc.follow.call(receiver, request({ maxMessages: 500 }), signal), followResult)
  assert.equal(calls[0].receiver, receiver)
  assert.equal(calls[0].signal, signal)
  assert.equal(calls[1].receiver, receiver)
  assert.equal(calls[1].signal, signal)
  ctx.dispose()
})

test('C7: synchronous errors and rejected promises propagate unchanged without logging', async () => {
  const failure = new Error('sentinel')
  const svc = { page() { throw failure } }
  svc.follow = svc.page
  const ctx = context(svc)
  ctx.logger = { error() { assert.fail('unexpected logging') }, warn() { assert.fail('unexpected logging') } }
  apply(ctx)
  assert.throws(() => svc.page(request({ maxMessages: 500 })), error => error === failure)
  ctx.dispose()
  const rejection = Promise.reject(failure)
  svc.page = () => rejection
  apply(ctx)
  const returned = svc.page(request({ maxMessages: 500 }))
  assert.equal(returned, rejection)
  await assert.rejects(returned, error => error === failure)
  ctx.dispose()
})

test('C5 revised/C6/C7: real Cordis gateway dispatch clamps through raw service and preserves shadow helpers', async t => {
  let entry
  try {
    const profile = process.env.DSH_PROFILE_DIR ?? '/home/wilder/.dsh/profiles/web'
    entry = createRequire(join(profile, 'package.json')).resolve('@deepseek-ai/cordis')
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error
    t.skip('installed profile Cordis is not resolvable')
    return
  }
  const { Context, Service, resolveConfig } = await import(pathToFileURL(entry).href)
  const plugin = { name, inject, Config, apply }
  assert.deepEqual(resolveConfig(plugin, {}), { maxMessages: 50, enabled: true })
  assert.throws(() => resolveConfig(plugin, { maxMessages: 0 }), /maxMessages.*positive safe integer/)
  const ctx = new Context().extend({ testContextLabel: 'host' })
  const calls = []
  const promise = Promise.resolve({ records: [], hasMore: true })
  class SessionController extends Service {
    constructor(ctx) { super(ctx, 'sessionController') }
    helper() { return this.ctx.testContextLabel }
    page(request, signal) {
      calls.push({ request, signal, helper: this.helper() })
      return promise
    }
    follow(request, signal) {
      calls.push({ request, signal, helper: this.helper() })
      return promise
    }
  }
  const raw = new SessionController(ctx)
  const original = raw.page
  const originalFollow = raw.follow
  const originalDescriptor = Object.getOwnPropertyDescriptor(raw, 'page')
  assert.equal(originalDescriptor, undefined)
  assert.equal(ctx.sessionController[Symbol.for('cordis.original')], raw)
  assert.notEqual(ctx.sessionController.page, ctx.sessionController.page)
  const fiber = ctx.plugin(plugin, { maxMessages: 20 })
  t.after(() => fiber.dispose())
  await fiber.await()
  assert.ok(Object.hasOwn(raw, 'page'))
  assert.ok(Object.hasOwn(raw, 'follow'))
  assert.notEqual(raw.page, original)
  assert.notEqual(raw.follow, originalFollow)
  const input = request({ maxMessages: 500, turnWindow: { minMessages: 50, minTurns: 3 } })
  const signal = new AbortController().signal
  const receiver = ctx.extend({ testContextLabel: 'gateway' }).sessionController
  const invoke = () => Reflect.apply(Reflect.get(receiver, 'page'), receiver, [input, signal])
  const invokeFollow = () => Reflect.apply(Reflect.get(receiver, 'follow'), receiver, [input, signal])
  assert.equal(invoke(), promise)
  assert.equal(invokeFollow(), promise)
  for (const call of calls) {
    assert.deepEqual(call, {
      request: request({ maxMessages: 20, turnWindow: { minMessages: 20, minTurns: 3 } }),
      signal,
      helper: 'gateway',
    })
  }
  assert.equal(input.maxMessages, 500)
  await fiber.dispose()
  assert.equal(raw.page, original)
  assert.equal(raw.follow, originalFollow)
  assert.deepEqual(Object.getOwnPropertyDescriptor(raw, 'page'), originalDescriptor)
  assert.equal(Object.hasOwn(raw, 'follow'), false)
  assert.equal(invoke(), promise)
  assert.equal(calls[2].request, input)
  assert.equal(calls[2].helper, 'gateway')
  assert.equal(invokeFollow(), promise)
  assert.equal(calls[3].request, input)
  assert.equal(calls[3].helper, 'gateway')

  // Real raw services with an existing own descriptor must restore it too.
  Object.defineProperty(raw, 'page', {
    value: original, writable: true, enumerable: false, configurable: false,
  })
  const ownDescriptor = Object.getOwnPropertyDescriptor(raw, 'page')
  const remount = ctx.plugin(plugin, { maxMessages: 30 })
  t.after(() => remount.dispose())
  await remount.await()
  invoke()
  invokeFollow()
  assert.equal(calls[4].request.maxMessages, 30)
  assert.equal(calls[5].request.maxMessages, 30)
  await remount.dispose()
  assert.deepEqual(Object.getOwnPropertyDescriptor(raw, 'page'), ownDescriptor)
  assert.equal(raw.follow, originalFollow)
  invoke()
  invokeFollow()
  assert.equal(calls[6].request, input)
  assert.equal(calls[7].request, input)
})

test('C8: host-only package has one insert row, no client half, no runtime dependencies', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(manifest.name, 'dsh-session-page-clamp')
  assert.equal(manifest.main, 'lib/index.js')
  assert.deepEqual(manifest.dsh, { bundle: { patch: './cordis.patch.yml' } })
  assert.deepEqual(manifest.dependencies ?? {}, {})
  assert.deepEqual(inject, ['sessionController'])
  assert.equal(name, 'dsh-session-page-clamp')
  assert.equal(await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8'),
    '- insert:\n    - id: session-page-clamp\n      name: dsh-session-page-clamp\n      config:\n        maxMessages: 50\n        enabled: true\n')
})
