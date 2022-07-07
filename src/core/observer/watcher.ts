import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError,
  invokeWithErrorHandling,
  noop,
  isFunction
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget, DepTarget } from './dep'
import { DebuggerEvent, DebuggerOptions } from 'v3/debug'

import type { SimpleSet } from '../util/index'
import type { Component } from 'types/component'
import { activeEffectScope, recordEffectScope } from 'v3/reactivity/effectScope'

let uid = 0

/**
 * @internal
 */
export interface WatcherOptions extends DebuggerOptions {
  deep?: boolean
  user?: boolean
  lazy?: boolean
  sync?: boolean
  before?: Function
}

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 * @internal
 */
export default class Watcher implements DepTarget {
  vm?: Component | null
  expression: string
  cb: Function
  id: number
  deep: boolean
  user: boolean
  lazy: boolean
  sync: boolean
  dirty: boolean
  active: boolean
  deps: Array<Dep>
  newDeps: Array<Dep>
  depIds: SimpleSet
  newDepIds: SimpleSet
  before?: Function
  onStop?: Function
  noRecurse?: boolean
  getter: Function
  value: any

  // dev only
  onTrack?: ((event: DebuggerEvent) => void) | undefined
  onTrigger?: ((event: DebuggerEvent) => void) | undefined

  constructor(
    vm: Component | null,
    expOrFn: string | (() => any),
    cb: Function,
    options?: WatcherOptions | null,
    // 标识该观察者实例是否是渲染函数的观察者
    isRenderWatcher?: boolean
  ) {
    recordEffectScope(this, activeEffectScope || (vm ? vm._scope : undefined))
    // this.vm 该属性指明了这个观察者是属于哪一个组件的
    if ((this.vm = vm)) {
      if (isRenderWatcher) {
        vm._watcher = this
      }
    }
    // options
    if (options) {
      // 用来告诉当前观察者实例对象是否是深度观测
      this.deep = !!options.deep
      // 用来标识当前观察者实例对象是 开发者定义的 还是 内部定义的
      // 除了内部定义的观察者(如：渲染函数的观察者、计算属性的观察者等)之外，所有观察者都被认为是开发者定义的
      this.user = !!options.user
      this.lazy = !!options.lazy
      // 用来告诉观察者当数据变化时是否同步求值并执行回调
      this.sync = !!options.sync
      this.before = options.before
      if (__DEV__) {
        this.onTrack = options.onTrack
        this.onTrigger = options.onTrigger
      }
    } else {
      this.deep = this.user = this.lazy = this.sync = false
    }
    this.cb = cb
    // 观察者实例对象的唯一标识
    this.id = ++uid // uid for batching
    // 它标识着该观察者实例对象是否是激活状态
    this.active = true
    // 计算属性的观察者实例对象的 this.dirty 属性的值才会为真，因为计算属性是惰性求值
    this.dirty = this.lazy // for lazy watchers

    // 这四个属性用来实现避免收集重复依赖，且移除无用依赖的功能也依赖于它们
    this.deps = []
    this.newDeps = []
    // 用来避免重复求值时收集重复的观察者
    this.depIds = new Set()
    // 用来在一次求值中避免收集重复的观察者
    this.newDepIds = new Set()

    this.expression = __DEV__ ? expOrFn.toString() : ''
    // parse expression for getter
    if (isFunction(expOrFn)) {
      this.getter = expOrFn
    } else {
      // expOrFn 不是函数
      this.getter = parsePath(expOrFn)
      if (!this.getter) {
        this.getter = noop
        __DEV__ &&
          warn(
            `Failed watching path: "${expOrFn}" ` +
              'Watcher only accepts simple dot-delimited paths. ' +
              'For full control, use a function instead.',
            vm
          )
      }
    }
    // 保存着被观察目标的值。
    this.value = this.lazy ? undefined : this.get()
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
   */
  // 求值
  // 第一个是能够触发访问器属性的 get 拦截器函数，第二个是能够获得被观察目标的值
  get() {
    pushTarget(this)
    let value
    const vm = this.vm
    try {
      value = this.getter.call(vm, vm)
    } catch (e: any) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      // 深度观测
      if (this.deep) {
        traverse(value)
      }
      popTarget()
      this.cleanupDeps()
    }
    return value
  }

  /**
   * Add a dependency to this directive.
   */
  addDep(dep: Dep) {
    const id = dep.id
    // 作用就是用来 避免收集重复依赖
    if (!this.newDepIds.has(id)) {
      this.newDepIds.add(id)
      this.newDeps.push(dep)
      // depIds 属性用来避免重复求值时收集重复的观察者，这里要清楚第一次求值和重复求值的区别
      if (!this.depIds.has(id)) {
        dep.addSub(this)
      }
    }
  }

  /**
   * Clean up for dependency collection.
   */
  // 每次求值完毕后都会使用 depIds 属性和 deps 属性保存 newDepIds 属性和 newDeps 属性的值，
  // 然后再清空 newDepIds 属性和 newDeps 属性的值。
  // newDepIds 和 newDeps 这两个属性的值所存储的总是当次求值所收集到的 Dep 实例对象，
  // 而 depIds 和 deps 这两个属性的值所存储的总是上一次求值过程中所收集到的 Dep 实例对象。
  cleanupDeps() {
    let i = this.deps.length
    while (i--) {
      const dep = this.deps[i]
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this)
      }
    }
    let tmp: any = this.depIds
    this.depIds = this.newDepIds
    this.newDepIds = tmp
    this.newDepIds.clear()
    tmp = this.deps
    this.deps = this.newDeps
    this.newDeps = tmp
    this.newDeps.length = 0
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   */
  update() {
    /* istanbul ignore else */
    if (this.lazy) {
      this.dirty = true
    } else if (this.sync) {
      this.run()
    } else {
      // 将当前观察者对象放到一个异步更新队列
      // 对于渲染函数的观察者来讲，它并不是同步更新变化的，而是将变化放到一个异步更新队列中
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  run() {
    // 一个观察者是否处于激活状态，或者可用状态。
    if (this.active) {
      // 重新求值
      // 对于渲染函数的观察者来讲，重新求值其实等价于重新执行渲染函数，
      // 最终结果就是重新生成了虚拟 DOM 并更新真实 DOM，这样就完成了重新渲染的过程。
      const value = this.get()
      // 渲染函数的观察者并不会执行这个 if 语句块,
      // 因为 this.get 方法的返回值其实就等价于 updateComponent 函数的返回值，这个值将永远都是 undefined
      if (
        value !== this.value ||
        // Deep watchers and watchers on Object/Arrays should fire even
        // when the value is the same, because the value may
        // have mutated.
        isObject(value) ||
        this.deep
      ) {
        // set new value
        const oldValue = this.value
        this.value = value
        // 如果观察者对象的 this.user 为真意味着这个观察者是开发者定义的
        if (this.user) {
          // this.expression 属性，我们前面说过该属性是被观察目标(expOrFn)的字符串表示，
          // 这样开发者就能清楚的知道是哪里发生了错误
          const info = `callback for watcher "${this.expression}"`
          invokeWithErrorHandling(
            this.cb,
            this.vm,
            [value, oldValue],
            this.vm,
            info
          )
        } else {
          this.cb.call(this.vm, value, oldValue)
        }
      }
    }
  }

  /**
   * Evaluate the value of the watcher.
   * This only gets called for lazy watchers.
   */
  evaluate() {
    this.value = this.get()
    this.dirty = false
  }

  /**
   * Depend on all deps collected by this watcher.
   */
  depend() {
    let i = this.deps.length
    while (i--) {
      this.deps[i].depend()
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   */
  teardown() {
    // _isBeingDestroyed 组件是否被销毁
    if (this.vm && !this.vm._isBeingDestroyed) {
      remove(this.vm._scope.effects, this)
    }
    if (this.active) {
      // 当一个属性与一个观察者建立联系之后，属性的 Dep 实例对象会收集到该观察者对象，
      // 同时观察者对象也会将该 Dep 实例对象收集，这是一个双向的过程，并且一个观察者可以同时观察多个属性，
      // 这些属性的 Dep 实例对象都会被收集到该观察者实例对象的 this.deps 数组中，
      // 所以解除属性与观察者之间关系的第二步就是将当前观察者实例对象从所有的 Dep 实例对象中移除
      let i = this.deps.length
      while (i--) {
        this.deps[i].removeSub(this)
      }
      this.active = false
      if (this.onStop) {
        this.onStop()
      }
    }
  }
}
