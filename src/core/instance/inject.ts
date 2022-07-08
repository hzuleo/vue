import { warn, hasSymbol, isFunction, isObject } from '../util/index'
import { defineReactive, toggleObserving } from '../observer/index'
import type { Component } from 'types/component'
import { provide } from 'v3/apiInject'
import { setCurrentInstance } from '../../v3/currentInstance'

// 本质上就是在组件实例对象上添加了 vm._provided 属性，并保存了用于子代组件的数据
export function initProvide(vm: Component) {
  const provideOption = vm.$options.provide
  // provide 选项可以是对象，也可以是一个返回对象的函数
  if (provideOption) {
    const provided = isFunction(provideOption)
      ? provideOption.call(vm)
      : provideOption
    if (!isObject(provided)) {
      return
    }
    const keys = hasSymbol ? Reflect.ownKeys(provided) : Object.keys(provided)
    setCurrentInstance(vm)
    for (let i = 0; i < keys.length; i++) {
      provide(keys[i], provided[keys[i]])
    }
    setCurrentInstance()
  }
}

export function initInjections(vm: Component) {
  // 子组件中通过 inject 选项注入的数据其实是存放在其父代组件实例的 vm._provided 属性中
  // 根据当前组件的 inject 选项去父代组件中寻找注入的数据，并将最终的数据返回
  const result = resolveInject(vm.$options.inject, vm)
  // 条件为真时说明成功取得注入的数据
  if (result) {
    // 在当前组件实例对象 vm 上定义与注入名称相同的变量，并赋予取得的值
    // 关闭了响应式定义的开关
    toggleObserving(false)
    Object.keys(result).forEach(key => {
      /* istanbul ignore else */
      if (__DEV__) {
        defineReactive(vm, key, result[key], () => {
          warn(
            `Avoid mutating an injected value directly since the changes will be ` +
              `overwritten whenever the provided component re-renders. ` +
              `injection being mutated: "${key}"`,
            vm
          )
        })
      } else {
        defineReactive(vm, key, result[key])
      }
    })
    toggleObserving(true)
  }
}

export function resolveInject(
  inject: any,
  vm: Component
): Record<string, any> | undefined | null {
  if (inject) {
    // inject is :any because flow is not smart enough to figure out cached
    const result = Object.create(null)
    // 获取 inject 对象中所有可枚举的键名
    const keys = hasSymbol ? Reflect.ownKeys(inject) : Object.keys(inject)

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      // #6574 in case the inject object is observed...
      if (key === '__ob__') continue
      const provideKey = inject[key].from
      if (provideKey in vm._provided) {
        result[key] = vm._provided[provideKey]
      } else if ('default' in inject[key]) {
        const provideDefault = inject[key].default
        result[key] = isFunction(provideDefault)
          ? provideDefault.call(vm)
          : provideDefault
      } else if (__DEV__) {
        warn(`Injection "${key as string}" not found`, vm)
      }
    }
    return result
  }
}
