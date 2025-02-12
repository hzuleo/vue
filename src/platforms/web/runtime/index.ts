// 对 Vue 进行平台化地包装
// 在 Vue.options 上混合了两个指令(directives)，分别是 model 和 show。
// 在 Vue.options 上混合了两个组件(components)，分别是 Transition 和 TransitionGroup。
// 在 Vue.prototype 上添加了两个方法：__patch__ 和 $mount。
import Vue from 'core/index'
import config from 'core/config'
import { extend, noop } from 'shared/util'
import { mountComponent } from 'core/instance/lifecycle'
import { devtools, inBrowser } from 'core/util/index'

import {
  query,
  mustUseProp,
  isReservedTag,
  isReservedAttr,
  getTagNamespace,
  isUnknownElement
} from 'web/util/index'

import { patch } from './patch'
import platformDirectives from './directives/index'
import platformComponents from './components/index'
import type { Component } from 'types/component'

// install platform specific utils
// Vue 的 config 不是在开发环境不可以修复吗？为啥这里直接可以修改？
Vue.config.mustUseProp = mustUseProp
Vue.config.isReservedTag = isReservedTag
Vue.config.isReservedAttr = isReservedAttr
Vue.config.getTagNamespace = getTagNamespace
Vue.config.isUnknownElement = isUnknownElement

// install platform runtime directives & components
// 执行之前 Vue.options 的样子：
// Vue.options = {
//	 components: {
//	   KeepAlive
//	 },
//	 directives: Object.create(null),
//	 filters: Object.create(null),
//	 _base: Vue
// }
// 执行之后：
// Vue.options = {
//	 components: {
//		 KeepAlive,
//		 Transition,
//		 TransitionGroup
//	 },
//	 directives: {
//		 model,
//		 show
//	 },
//	 filters: Object.create(null),
//	 _base: Vue
// }
extend(Vue.options.directives, platformDirectives)
extend(Vue.options.components, platformComponents)

// install platform patch function
Vue.prototype.__patch__ = inBrowser ? patch : noop

// public mount method
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  el = el && inBrowser ? query(el) : undefined
  // mountComponent 完成挂载所需的必要条件就是：提供渲染函数给 mountComponent。
  return mountComponent(this, el, hydrating)
}

// devtools global hook
/* istanbul ignore next */
if (inBrowser) {
  setTimeout(() => {
    if (config.devtools) {
      if (devtools) {
        devtools.emit('init', Vue)
      } else if (__DEV__ && process.env.NODE_ENV !== 'test') {
        // @ts-expect-error
        console[console.info ? 'info' : 'log'](
          'Download the Vue Devtools extension for a better development experience:\n' +
            'https://github.com/vuejs/vue-devtools'
        )
      }
    }
    if (
      __DEV__ &&
      process.env.NODE_ENV !== 'test' &&
      config.productionTip !== false &&
      typeof console !== 'undefined'
    ) {
      // @ts-expect-error
      console[console.info ? 'info' : 'log'](
        `You are running Vue in development mode.\n` +
          `Make sure to turn on production mode when deploying for production.\n` +
          `See more tips at https://vuejs.org/guide/deployment.html`
      )
    }
  }, 0)
}

export default Vue
