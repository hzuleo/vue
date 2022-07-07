import { _Set as Set, isObject, isArray } from '../util/index'
import type { SimpleSet } from '../util/index'
import VNode from '../vdom/vnode'

const seenObjects = new Set()

/**
 * Recursively traverse an object to evoke all converted
 * getters, so that every nested property inside the object
 * is collected as a "deep" dependency.
 */
// 递归地读取被观察属性的所有子属性的值，这样被观察属性的所有子属性都将会收集到观察者，从而达到深度观测的目的。
export function traverse(val: any) {
  _traverse(val, seenObjects)
  seenObjects.clear()
  return val
}

function _traverse(val: any, seen: SimpleSet) {
  let i, keys
  const isA = isArray(val)
  // 该值不能是冻结的，同时也不应该是 VNode 实例(这是Vue单独做的限制)
  if (
    (!isA && !isObject(val)) ||
    Object.isFrozen(val) ||
    val instanceof VNode
  ) {
    return
  }
  // 解决了循环引用导致死循环的问题
  // 如果一个响应式数据是对象或数组，那么它会包含一个叫做 __ob__ 的属性
  if (val.__ob__) {
    const depId = val.__ob__.dep.id
    if (seen.has(depId)) {
      return
    }
    seen.add(depId)
  }
  if (isA) {
    i = val.length
    while (i--) _traverse(val[i], seen)
  } else {
    keys = Object.keys(val)
    i = keys.length
    while (i--) _traverse(val[keys[i]], seen)
  }
}
