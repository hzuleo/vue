import config from 'core/config'
import { warn, cached } from 'core/util/index'
import { mark, measure } from 'core/util/perf'

import Vue from './runtime/index'
import { query } from './util/index'
import { compileToFunctions } from './compiler/index'
import {
  shouldDecodeNewlines,
  shouldDecodeNewlinesForHref
} from './util/compat'
import type { Component } from 'types/component'
import type { GlobalAPI } from 'types/global-api'

const idToTemplate = cached(id => {
  const el = query(id)
  return el && el.innerHTML
})

// 使用 mount 变量缓存 Vue.prototype.$mount 方法
const mount = Vue.prototype.$mount
// 关键代码一：重写 Vue.prototype.$mount 方法
// 之所以重写 $mount 函数，其目的就是为了给运行时版的 $mount 函数增加编译模板的能力
// &mount 核心事情就是编译模板(template)字符串为渲染函数，并将渲染函数赋值给 vm.$options.render 选项，
// 这个选项将会在真正挂载组件的 mountComponent 函数中。
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  el = el && query(el)

  /* istanbul ignore if */
  // <body> 元素和 <html> 元素显然是不能被替换掉的
  if (el === document.body || el === document.documentElement) {
    __DEV__ &&
      warn(
        `Do not mount Vue to <html> or <body> - mount to normal elements instead.`
      )
    return this
  }

  const options = this.$options
  // resolve template/el and convert to render function
  // 检测是否包含 render 选项，即是否包含渲染函数。如果渲染函数存在那么什么都不会做，直接调用运行时版 $mount 函数即可
  if (!options.render) {
    // const new Vue({ el: '#foo', template: '<div id="bar"></div>' })
    // 获取模板(template)的过程：
    let template = options.template
    // 如果 template 选项存在：
    if (template) {
      if (typeof template === 'string') {
        // 如果第一个字符是 #，那么会把该字符串作为选择符去选中对应的元素，并把该元素的 innerHTML 作为模板
        if (template.charAt(0) === '#') {
          template = idToTemplate(template)
          /* istanbul ignore if */
          if (__DEV__ && !template) {
            warn(
              `Template element not found or is empty: ${options.template}`,
              this
            )
          }
        }
      } else if (template.nodeType) {
        // template 的类型是元素节点(template.nodeType 存在)，则使用该元素的 innerHTML 作为模板
        template = template.innerHTML
      } else {
        // 若 template 既不是字符串又不是元素节点，那么在非生产环境会提示开发者传递的 template 选项无效
        if (__DEV__) {
          warn('invalid template option:' + template, this)
        }
        return this
      }
    } else if (el) {
      // 如果 template 选项不存在，那么使用 el 元素的 outerHTML 作为模板内容
      // @ts-expect-error
      template = getOuterHTML(el)
    }
    // 只有在 template 存在的情况下才会执行 if 语句块内的代码
    // 使用 compileToFunctions 函数将模板(template)字符串编译为渲染函数(render)，
    // 并将渲染函数添加到 vm.$options 选项中
    if (template) {
      /* istanbul ignore if */
      if (__DEV__ && config.performance && mark) {
        mark('compile')
      }

      // 将模板(template)字符串编译为渲染函数(render)
      const { render, staticRenderFns } = compileToFunctions(
        template,
        {
          outputSourceRange: __DEV__,
          shouldDecodeNewlines,
          shouldDecodeNewlinesForHref,
          delimiters: options.delimiters,
          comments: options.comments
        },
        this
      )
      options.render = render
      options.staticRenderFns = staticRenderFns

      /* istanbul ignore if */
      if (__DEV__ && config.performance && mark) {
        mark('compile end')
        measure(`vue ${this._name} compile`, 'compile', 'compile end')
      }
    }
  }
  return mount.call(this, el, hydrating)
}

/**
 * Get outerHTML of elements, taking care
 * of SVG elements in IE as well.
 */
function getOuterHTML(el: Element): string {
  if (el.outerHTML) {
    return el.outerHTML
  } else {
    const container = document.createElement('div')
    container.appendChild(el.cloneNode(true))
    return container.innerHTML
  }
}

// 关键代码二：添加 compile 全局 API
Vue.compile = compileToFunctions

export default Vue as GlobalAPI
