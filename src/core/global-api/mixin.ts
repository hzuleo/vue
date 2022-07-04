import type { GlobalAPI } from 'types/global-api'
import { mergeOptions } from '../util/index'

// 添加 mixin 这个全局 API
export function initMixin(Vue: GlobalAPI) {
  Vue.mixin = function (mixin: Object) {
    this.options = mergeOptions(this.options, mixin)
    return this
  }
}
