import config from '../config'
import Watcher from '../observer/watcher'
import Dep, { pushTarget, popTarget } from '../observer/dep'
import { isUpdatingChildComponent } from './lifecycle'
import { initSetup } from 'v3/apiSetup'

import {
  set,
  del,
  observe,
  defineReactive,
  toggleObserving
} from '../observer/index'

import {
  warn,
  bind,
  noop,
  hasOwn,
  isArray,
  hyphenate,
  isReserved,
  handleError,
  nativeWatch,
  validateProp,
  isPlainObject,
  isServerRendering,
  isReservedAttribute,
  invokeWithErrorHandling,
  isFunction
} from '../util/index'
import type { Component } from 'types/component'
import { TrackOpTypes } from '../../v3'

const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop
}

export function proxy(target: Object, sourceKey: string, key: string) {
  sharedPropertyDefinition.get = function proxyGetter() {
    return this[sourceKey][key]
  }
  sharedPropertyDefinition.set = function proxySetter(val) {
    this[sourceKey][key] = val
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

export function initState(vm: Component) {
  const opts = vm.$options
  if (opts.props) initProps(vm, opts.props)

  // Composition API
  initSetup(vm)

  if (opts.methods) initMethods(vm, opts.methods)
  if (opts.data) {
    initData(vm)
  } else {
    const ob = observe((vm._data = {}))
    ob && ob.vmCount++
  }
  if (opts.computed) initComputed(vm, opts.computed)
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch)
  }
}

function initProps(vm: Component, propsOptions: Object) {
  // vm.$options.propsData 就是用来存储来自外界的组件数据的
  // 例如：<some-comp prop1="1" prop2="2" />
  // 那么：vm.$options.propsData = { prop1: '1', prop2: '2' }
  const propsData = vm.$options.propsData || {}
  const props = (vm._props = {})
  // cache prop keys so that future props updates can iterate using Array
  // instead of dynamic object key enumeration.
  const keys: string[] = (vm.$options._propKeys = [])
  // 用来标识是否是根组件
  const isRoot = !vm.$parent
  // root instance props should be converted
  if (!isRoot) {
    // 不对值进行深度定义
    toggleObserving(false)
  }
  for (const key in propsOptions) {
    keys.push(key)
    const value = validateProp(key, propsOptions, propsData, vm)
    /* istanbul ignore else */
    if (__DEV__) {
      // 将 prop 的名字转为连字符加小写的形式
      const hyphenatedKey = hyphenate(key)
      if (
        // 判断 prop 的名字是否是保留的属性(attribute)
        isReservedAttribute(hyphenatedKey) ||
        config.isReservedAttr(hyphenatedKey)
      ) {
        // 不要直接修改 props 数据
        warn(
          `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
          vm
        )
      }
      defineReactive(props, key, value, () => {
        if (!isRoot && !isUpdatingChildComponent) {
          warn(
            `Avoid mutating a prop directly since the value will be ` +
              `overwritten whenever the parent component re-renders. ` +
              `Instead, use a data or computed property based on the prop's ` +
              `value. Prop being mutated: "${key}"`,
            vm
          )
        }
      })
    } else {
      defineReactive(props, key, value)
    }
    // static props are already proxied on the component's prototype
    // during Vue.extend(). We only need to proxy props defined at
    // instantiation here.
    if (!(key in vm)) {
      proxy(vm, `_props`, key)
    }
  }
  // 开关开启，目的是不影响后续代码的功能，因为这个开关是全局的。
  toggleObserving(true)
}

// 主要完成如下工作：
// 根据 vm.$options.data 选项获取真正想要的数据（注意：此时 vm.$options.data 是函数）
// 校验得到的数据是否是一个纯对象
// 检查数据对象 data 上的键是否与 props 对象上的键冲突
// 检查 methods 对象上的键是否与 data 对象上的键冲突
// 在 Vue 实例对象上添加代理访问数据对象的同名属性
// 最后调用 observe 函数开启响应式之路
function initData(vm: Component) {
  let data: any = vm.$options.data
  // beforeCreate 生命周期钩子函数是在 mergeOptions 函数之后 initData 之前被调用的
  // 如果在 beforeCreate 生命周期钩子函数中修改了 vm.$options.data 的值，
  // 那么在 initData 函数中对于 vm.$options.data 类型的判断就是必要的了。
  data = vm._data = isFunction(data) ? getData(data, vm) : data || {}
  if (!isPlainObject(data)) {
    data = {}
    __DEV__ &&
      warn(
        'data functions should return an object:\n' +
          'https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
        vm
      )
  }
  // proxy data on instance
  const keys = Object.keys(data)
  const props = vm.$options.props
  const methods = vm.$options.methods
  let i = keys.length
  while (i--) {
    const key = keys[i]
    // 优先级的关系：props 优先级 > methods 优先级 > data 优先级
    if (__DEV__) {
      // 你定义在 methods 对象中的函数名称已经被作为 data 对象中某个数据字段的 key 了，你应该换一个函数名字
      if (methods && hasOwn(methods, key)) {
        warn(`Method "${key}" has already been defined as a data property.`, vm)
      }
    }
    if (props && hasOwn(props, key)) {
      __DEV__ &&
        warn(
          `The data property "${key}" is already declared as a prop. ` +
            `Use prop default value instead.`,
          vm
        )
    // 判断定义在 data 中的 key 是否是保留键，isReserved 判断字符串是否以 $ 或者 _ 开头
    } else if (!isReserved(key)) {
      // 代理 _data 访问值
      proxy(vm, `_data`, key)
    }
  }
  // 响应系统的开始
  // observe data
  const ob = observe(data)
  ob && ob.vmCount++
}

// “通过调用 data 选项从而获取数据对象
export function getData(data: Function, vm: Component): any {
  // 防止使用 props 数据初始化 data 数据时收集冗余的依赖
  // #7573 disable dep collection when invoking data getters
  pushTarget()
  try {
    return data.call(vm, vm)
  } catch (e: any) {
    handleError(e, vm, `data()`)
    return {}
  } finally {
    popTarget()
  }
}

const computedWatcherOptions = { lazy: true }

function initComputed(vm: Component, computed: Object) {
  // $flow-disable-line
  const watchers = (vm._computedWatchers = Object.create(null))
  // computed properties are just getters during SSR
  const isSSR = isServerRendering()

  for (const key in computed) {
    const userDef = computed[key]
    // 计算属性有两种写法，一种是函数：
    // computed: {
    //   someComputedProp () {
    //     return this.a + this.b
    //   }
    // }
    // 一种是对象：
    // computed: {
    //   someComputedProp: {
    //     get: function () {
    //       return this.a + 1
    //     },
    //     set: function (v) {
    //       this.a = v - 1
    //     }
    //   }
    // }
    const getter = isFunction(userDef) ? userDef : userDef.get
    if (__DEV__ && getter == null) {
      warn(`Getter is missing for computed property "${key}".`, vm)
    }

    if (!isSSR) {
      // create internal watcher for the computed property.
      // 对 watchers 常量的修改相当于对 vm._computedWatchers 属性的修改
      watchers[key] = new Watcher(
        vm,
        getter || noop,
        noop,
        computedWatcherOptions
      )
    }

    // component-defined computed properties are already defined on the
    // component prototype. We only need to define computed properties defined
    // at instantiation here.
    if (!(key in vm)) {
      defineComputed(vm, key, userDef)
    } else if (__DEV__) {
      if (key in vm.$data) {
        warn(`The computed property "${key}" is already defined in data.`, vm)
      } else if (vm.$options.props && key in vm.$options.props) {
        warn(`The computed property "${key}" is already defined as a prop.`, vm)
      } else if (vm.$options.methods && key in vm.$options.methods) {
        warn(
          `The computed property "${key}" is already defined as a method.`,
          vm
        )
      }
    }
  }
}

export function defineComputed(
  target: any,
  key: string,
  userDef: Record<string, any> | (() => any)
) {
  // 只有在非服务端渲染的情况下计算属性才会缓存值。
  const shouldCache = !isServerRendering()
  if (isFunction(userDef)) {
    sharedPropertyDefinition.get = shouldCache
      ? createComputedGetter(key)
      : createGetterInvoker(userDef)
    // 说明该计算属性并没有指定 set 拦截器函数
    sharedPropertyDefinition.set = noop
  } else {
    sharedPropertyDefinition.get = userDef.get
      ? shouldCache && userDef.cache !== false
        ? createComputedGetter(key)
        : createGetterInvoker(userDef.get)
      : noop
    sharedPropertyDefinition.set = userDef.set || noop
  }
  if (__DEV__ && sharedPropertyDefinition.set === noop) {
    sharedPropertyDefinition.set = function () {
      warn(
        `Computed property "${key}" was assigned to but it has no setter.`,
        this
      )
    }
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

// 例如代码：
// computed: {
//   compA () {
//     return this.a +1
//   }
// }
// 计算属性 compA 依赖了数据对象的 a 属性，那么属性 a 将收集计算属性 compA 的 计算属性观察者对象，
// 而 计算属性观察者对象 将收集 渲染函数观察者对象，
function createComputedGetter(key) {
  return function computedGetter() {
    const watcher = this._computedWatchers && this._computedWatchers[key]
    if (watcher) {
      if (watcher.dirty) {
        watcher.evaluate()
      }
      if (Dep.target) {
        if (__DEV__ && Dep.target.onTrack) {
          Dep.target.onTrack({
            effect: Dep.target,
            target: this,
            type: TrackOpTypes.GET,
            key
          })
        }
        watcher.depend()
      }
      return watcher.value
    }
  }
}

function createGetterInvoker(fn) {
  return function computedGetter() {
    return fn.call(this, this)
  }
}

function initMethods(vm: Component, methods: Object) {
  const props = vm.$options.props
  for (const key in methods) {
    if (__DEV__) {
      // 检测该方法是否真正的有定义
      if (typeof methods[key] !== 'function') {
        warn(
          `Method "${key}" has type "${typeof methods[
            key
          ]}" in the component definition. ` +
            `Did you reference the function correctly?`,
          vm
        )
      }
      // 检测 methods 选项中定义的方法名字是否在 props 选项中有定义
      if (props && hasOwn(props, key)) {
        warn(`Method "${key}" has already been defined as a prop.`, vm)
      }
      // 以字符 $ 或 _ 开头的名字为保留名
      if (key in vm && isReserved(key)) {
        warn(
          `Method "${key}" conflicts with an existing Vue instance method. ` +
            `Avoid defining component methods that start with _ or $.`
        )
      }
    }
    // 在组件实例对象上定义了与 methods 选项中所定义的同名方法
    vm[key] = typeof methods[key] !== 'function' ? noop : bind(methods[key], vm)
  }
}

function initWatch(vm: Component, watch: Object) {
  for (const key in watch) {
    const handler = watch[key]
    // 可以为一个数组，例如：
    // watch: {
    //   name: [
    //     function () {
    //       console.log('name 改变了1')
    //     },
    //     function () {
    //       console.log('name 改变了2')
    //     }
    //   ]
    // }
    if (isArray(handler)) {
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i])
      }
    } else {
      createWatcher(vm, key, handler)
    }
  }
}

// 作用就是将纯对象形式的参数规范化一下
function createWatcher(
  vm: Component,
  expOrFn: string | (() => any),
  handler: any,
  options?: Object
) {
  // 例如：vm.$watch('name', { handler () { console.log('change') }, immediate: true })
  if (isPlainObject(handler)) {
    options = handler
    handler = handler.handler
  }
  // 例如：watch: { name: 'handleNameChange' },
  if (typeof handler === 'string') {
    handler = vm[handler]
  }
  return vm.$watch(expOrFn, handler, options)
}

export function stateMixin(Vue: typeof Component) {
  // flow somehow has problems with directly declared definition object
  // when using Object.defineProperty, so we have to procedurally build up
  // the object here.
  const dataDef: any = {}
  dataDef.get = function () {
    return this._data
  }
  const propsDef: any = {}
  propsDef.get = function () {
    return this._props
  }
  if (__DEV__) {
    dataDef.set = function () {
      warn(
        'Avoid replacing instance root $data. ' +
          'Use nested data properties instead.',
        this
      )
    }
    propsDef.set = function () {
      warn(`$props is readonly.`, this)
    }
  }
  // 比较关键的代码在这里，在 Vue.prototype 上定义了两个属性 $data 和 $props
  // 可以看到上面 dataDef 的定义，$data 属性实际上代理的是 _data 这个实例属性，
  // 然后有一个是否为开发环境的判断，如果是开发环境的话，就为 $data 和 $props
  // 这两个属性设置一下 set，说明 $data 和 $props 是只读属性
  Object.defineProperty(Vue.prototype, '$data', dataDef)
  Object.defineProperty(Vue.prototype, '$props', propsDef)

  // 接着，定义了一下三个方法，这三个方法看到名字应该比较熟悉了
  Vue.prototype.$set = set
  Vue.prototype.$delete = del

  Vue.prototype.$watch = function (
    expOrFn: string | (() => any),
    cb: any,
    options?: Record<string, any>
  ): Function {
    const vm: Component = this
    // cb 不是函数，而是一个纯对象
    if (isPlainObject(cb)) {
      return createWatcher(vm, expOrFn, cb, options)
    }
    options = options || {}
    // 代表该观察者实例是用户创建的
    options.user = true
    const watcher = new Watcher(vm, expOrFn, cb, options)
    // immediate 选项用来在属性或函数被侦听后立即执行回调
    // 不过此时回调函数的参数只有新值没有旧值
    if (options.immediate) {
      const info = `callback for immediate watcher "${watcher.expression}"`
      pushTarget()
      invokeWithErrorHandling(cb, vm, [watcher.value], vm, info)
      popTarget()
    }
    // 解除当前观察者对属性的观察
    return function unwatchFn() {
      watcher.teardown()
    }
  }
}
