import Dep from './dep'
import VNode from '../vdom/vnode'
import { arrayMethods } from './array'
import {
  def,
  warn,
  hasOwn,
  isArray,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering,
  hasChanged
} from '../util/index'
import { isReadonly, isRef, TrackOpTypes, TriggerOpTypes } from '../../v3'

const arrayKeys = Object.getOwnPropertyNames(arrayMethods)

const NO_INIITIAL_VALUE = {}

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true

export function toggleObserving(value: boolean) {
  shouldObserve = value
}

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 */
export class Observer {
  dep: Dep
  vmCount: number // number of vms that have this object as root $data

  constructor(public value: any, public shallow = false) {
    // this.value = value
    // 收集依赖的“筐”，这个“筐”并不属于某一个字段，后面我们会发现，这个筐是属于某一个对象或数组的。
    this.dep = new Dep()
    this.vmCount = 0
    // 使用 def 函数定义 __ob__ 属性是因为这样可以定义不可枚举的属性，
    // 这样后面遍历数据对象的时候就能够防止遍历到 __ob__ 属性。
    // 例如数据对象：const data = { a: 1 }，经过 def 函数处理之后，data 对象应该变成如下这个样子：
    // const data = {
    //   a: 1,
    //   __ob__: {
    //     value: data,
    //     dep: dep实例对象,
    //     vmCount: 0
    //   }
    // }
    def(value, '__ob__', this)
    // 数组有很多变异方法会改变数组本身的值，例如：
    // push、pop、shift、unshift、splice、sort 以及 reverse 等
    if (isArray(value)) {
      if (hasProto) {
        protoAugment(value, arrayMethods)
      } else {
        // 兼容浏览器 ie11 之前
        copyAugment(value, arrayMethods, arrayKeys)
      }
      if (!shallow) {
        // 递归观测数组元素
        this.observeArray(value)
      }
    } else {
      this.walk(value, shallow)
    }
  }

  /**
   * Walk through all properties and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   */
  walk(obj: object, shallow: boolean) {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      defineReactive(obj, key, NO_INIITIAL_VALUE, undefined, shallow)
    }
  }

  /**
   * Observe a list of Array items.
   */
  observeArray(items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i])
    }
  }
}

// helpers

/**
 * Augment a target Object or Array by intercepting
 * the prototype chain using __proto__
 */
function protoAugment(target, src: Object) {
  /* eslint-disable no-proto */
  target.__proto__ = src
  /* eslint-enable no-proto */
}

/**
 * Augment a target Object or Array by defining
 * hidden properties.
 */
/* istanbul ignore next */
function copyAugment(target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i]
    def(target, key, src[key])
  }
}

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */
export function observe(value: any, shallow?: boolean): Observer | void {
  if (!isObject(value) || isRef(value) || value instanceof VNode) {
    return
  }
  let ob: Observer | void
  // 一个数据对象被观测之后将会在该对象上定义 __ob__ 属性
  // if 分支的作用是用来避免重复观测一个数据对象
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    ob = value.__ob__
  } else if (
    // 没有定义 __ob__ 属性，那么说明该对象没有被观测过
    shouldObserve &&
    !isServerRendering() &&
    (isArray(value) || isPlainObject(value)) &&
    // 被观测的数据对象必须是可扩展的。一个普通的对象默认就是可扩展的
    // 以下三个方法都可以使得一个对象变得不可扩展：
    // Object.preventExtensions()、Object.freeze() 以及 Object.seal()。
    Object.isExtensible(value) &&
    !value.__v_skip
  ) {
    ob = new Observer(value, shallow)
  }
  return ob
}

/**
 * Define a reactive property on an Object.
 */
// 将数据对象的数据属性转换为访问器属性，即为数据对象的属性设置一对 getter/setter
export function defineReactive(
  obj: object,
  key: string,
  val?: any,
  customSetter?: Function | null,
  shallow?: boolean
) {
  // 每个字段的 Dep 对象都被用来收集那些属于对应字段的依赖。
  const dep = new Dep()

  // 不可配置的属性是不能使用也没必要使用 Object.defineProperty 改变其属性定义的
  const property = Object.getOwnPropertyDescriptor(obj, key)
  if (property && property.configurable === false) {
    return
  }

  // cater for pre-defined getter/setters
  const getter = property && property.get
  const setter = property && property.set
  if (
    // 之所以在深度观测之前不取值是因为属性原本的 getter 由用户定义，
    // 用户可能在 getter 中做任何意想不到的事情，这么做是出于避免引发不可预见行为的考虑。
    (!getter || setter) &&
    (val === NO_INIITIAL_VALUE || arguments.length === 2)
  ) {
    val = obj[key]
  }

  // 深度观测，val 本身有可能也是一个对象，例如对象：const data = { a: { b: 1 } }
  // 那么：childOb === data.a.__ob__
  let childOb = !shallow && observe(val)
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    // get作用：一个是返回正确的属性值，另一个是收集依赖
    get: function reactiveGetter() {
      const value = getter ? getter.call(obj) : val
      if (Dep.target) {
        if (__DEV__) {
          dep.depend({
            target: obj,
            type: TrackOpTypes.GET,
            key
          })
        } else {
          // 每一个数据字段都通过闭包引用着属于自己的 dep 常量
          dep.depend()
        }
        if (childOb) {
          // 这里的 dep 和上面的 dep 是不同的，两个”筐“里收集的依赖的触发时机是不同的，即作用不同
          // 为了添加、删除属性时有能力触发依赖，而这就是 Vue.set 或 Vue.delete 的原理。
          childOb.dep.depend()
          if (isArray(value)) {
            // 例如数据：{ arr: [ { a: 1 } ] }
            // ins.$set(ins.$data.arr[0], 'b', 2) 为了能让这句代码触发依赖
            // 为什么数组需要这样处理，而纯对象不需要呢？那是因为 数组的索引是非响应式的
            // ins.arr[0] = 3  // 不能触发响应
            // 所以当有观察者依赖数组的某一个元素时是触发不了这个元素的 get 函数的，当然也就收集不到依赖
            // 这个时候就是 dependArray 函数发挥作用的时候了。
            dependArray(value)
          }
        }
      }
      return isRef(value) ? value.value : value
    },
    // set 作用：第一正确地为属性设置新值，第二是能够触发相应的依赖。
    set: function reactiveSetter(newVal) {
      const value = getter ? getter.call(obj) : val
      if (!hasChanged(value, newVal)) {
        return
      }
      if (__DEV__ && customSetter) {
        customSetter()
      }
      if (setter) {
        setter.call(obj, newVal)
      } else if (getter) {
        // #7981: for accessor properties without setter
        return
      } else if (isRef(value) && !isRef(newVal)) {
        value.value = newVal
        return
      } else {
        val = newVal
      }
      // 设置的新值是一个数组或者纯对象，就需要对新值进行观测
      childOb = !shallow && observe(newVal)
      if (__DEV__) {
        dep.notify({
          type: TriggerOpTypes.SET,
          target: obj,
          key,
          newValue: newVal,
          oldValue: value
        })
      } else {
        dep.notify()
      }
    }
  })

  return dep
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
export function set<T>(array: T[], key: number, value: T): T
export function set<T>(object: object, key: string | number, value: T): T
export function set(
  target: any[] | Record<string, any>,
  key: any,
  val: any
): any {
  if (__DEV__ && (isUndef(target) || isPrimitive(target))) {
    warn(
      `Cannot set reactive property on undefined, null, or primitive value: ${target}`
    )
  }
  if (isReadonly(target)) {
    __DEV__ && warn(`Set operation on key "${key}" failed: target is readonly.`)
    return
  }
  if (isArray(target) && isValidArrayIndex(key)) {
    // 数组的长度修改为 target.length 和 key 中的较大者
    target.length = Math.max(target.length, key)
    target.splice(key, 1, val)
    return val
  }
  // 已存在的属性是响应式的
  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }
  // Vue 实例对象拥有 _isVue 属性
  const ob = (target as any).__ob__
  if ((target as any)._isVue || (ob && ob.vmCount)) {
    __DEV__ &&
      warn(
        'Avoid adding reactive properties to a Vue instance or its root $data ' +
          'at runtime - declare it upfront in the data option.'
      )
    return val
  }
  if (!ob) {
    target[key] = val
    return val
  }
  // 这是为了保证新添加的属性是响应式的
  defineReactive(ob.value, key, val)
  if (__DEV__) {
    ob.dep.notify({
      type: TriggerOpTypes.ADD,
      target: target,
      key,
      newValue: val,
      oldValue: undefined
    })
  } else {
    ob.dep.notify()
  }
  return val
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del<T>(array: T[], key: number): void
export function del(object: object, key: string | number): void
export function del(target: any[] | object, key: any) {
  if (__DEV__ && (isUndef(target) || isPrimitive(target))) {
    warn(
      `Cannot delete reactive property on undefined, null, or primitive value: ${target}`
    )
  }
  if (isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1)
    return
  }
  const ob = (target as any).__ob__
  // vmCount 不允许删除根数据对象的属性，因为根数据不是响应式
  if ((target as any)._isVue || (ob && ob.vmCount)) {
    __DEV__ &&
      warn(
        'Avoid deleting properties on a Vue instance or its root $data ' +
          '- just set it to null.'
      )
    return
  }
  if (isReadonly(target)) {
    __DEV__ &&
      warn(`Delete operation on key "${key}" failed: target is readonly.`)
    return
  }
  if (!hasOwn(target, key)) {
    return
  }
  delete target[key]
  // 判断 ob 对象是否存在，如果不存在说明 target 对象原本就不是响应的
  if (!ob) {
    return
  }
  if (__DEV__) {
    ob.dep.notify({
      type: TriggerOpTypes.DELETE,
      target: target,
      key
    })
  } else {
    ob.dep.notify()
  }
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 */
function dependArray(value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    if (e && e.__ob__) {
      e.__ob__.dep.depend()
    }
    if (isArray(e)) {
      dependArray(e)
    }
  }
}
