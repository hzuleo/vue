/* globals MutationObserver */

import { noop } from 'shared/util'
import { handleError } from './error'
import { isIE, isIOS, isNative } from './env'

export let isUsingMicroTask = false

const callbacks: Array<Function> = []
let pending = false

function flushCallbacks() {
  pending = false
  // 使用 copies 常量保存一份 callbacks 的复制，然后遍历 copies 数组，
  // 并且在遍历 copies 数组之前将 callbacks 数组清空：callbacks.length = 0。为什么要这么做呢？
  const copies = callbacks.slice(0)
  callbacks.length = 0
  for (let i = 0; i < copies.length; i++) {
    copies[i]()
  }
}

// Here we have async deferring wrappers using microtasks.
// In 2.5 we used (macro) tasks (in combination with microtasks).
// However, it has subtle problems when state is changed right before repaint
// (e.g. #6813, out-in transitions).
// Also, using (macro) tasks in event handler would cause some weird behaviors
// that cannot be circumvented (e.g. #7109, #7153, #7546, #7834, #8109).
// So we now use microtasks everywhere, again.
// A major drawback of this tradeoff is that there are some scenarios
// where microtasks have too high a priority and fire in between supposedly
// sequential events (e.g. #4521, #6690, which have workarounds)
// or even between bubbling of the same event (#6566).
let timerFunc

// The nextTick behavior leverages the microtask queue, which can be accessed
// via either native Promise.then or MutationObserver.
// MutationObserver has wider support, however it is seriously bugged in
// UIWebView in iOS >= 9.3.3 when triggered in touch event handlers. It
// completely stops working after triggering a few times... so, if native
// Promise is available, we will use it:
/* istanbul ignore next, $flow-disable-line */
// 宿主环境支持 Promise
if (typeof Promise !== 'undefined' && isNative(Promise)) {
  const p = Promise.resolve()
  timerFunc = () => {
    p.then(flushCallbacks)
    // In problematic UIWebViews, Promise.then doesn't completely break, but
    // it can get stuck in a weird state where callbacks are pushed into the
    // microtask queue but the queue isn't being flushed, until the browser
    // needs to do some other work, e.g. handle a timer. Therefore we can
    // "force" the microtask queue to be flushed by adding an empty timer.
    // 在一些 UIWebViews 中存在很奇怪的问题，即 microtask 没有被刷新，
    // 对于这个问题的解决方案就是让浏览做一些其他的事情比如注册一个 (macro)task 即使这个 (macro)task 什么都不做，
    // 这样就能够间接触发 microtask 的刷新。
    if (isIOS) setTimeout(noop)
  }
  isUsingMicroTask = true
} else if (
  //
  !isIE &&
  typeof MutationObserver !== 'undefined' &&
  (isNative(MutationObserver) ||
    // PhantomJS and iOS 7.x
    MutationObserver.toString() === '[object MutationObserverConstructor]')
) {
  // Use MutationObserver where native Promise is not available,
  // e.g. PhantomJS, iOS7, Android 4.4
  // (#6466 MutationObserver is unreliable in IE11)
  let counter = 1
  const observer = new MutationObserver(flushCallbacks)
  const textNode = document.createTextNode(String(counter))
  observer.observe(textNode, {
    characterData: true
  })
  timerFunc = () => {
    counter = (counter + 1) % 2
    textNode.data = String(counter)
  }
  isUsingMicroTask = true
} else if (typeof setImmediate !== 'undefined' && isNative(setImmediate)) {
  // setImmediate 拥有比 setTimeout 更好的性能，这个问题很好理解，
  // setTimeout 在将回调注册为 (macro)task 之前要不停的做超时检测，而 setImmediate 则不需要，
  // 这就是优先选用 setImmediate 的原因
  // 但是 setImmediate 的缺陷也很明显，就是它的兼容性问题，到目前为止只有IE浏览器实现了它
  // Fallback to setImmediate.
  // Technically it leverages the (macro) task queue,
  // but it is still a better choice than setTimeout.
  timerFunc = () => {
    setImmediate(flushCallbacks)
  }
} else {
  // Fallback to setTimeout.
  timerFunc = () => {
    setTimeout(flushCallbacks, 0)
  }
}

export function nextTick(): Promise<void>
export function nextTick(cb: (...args: any[]) => any, ctx?: object): void
/**
 * @internal
 */
export function nextTick(cb?: (...args: any[]) => any, ctx?: object) {
  let _resolve
  callbacks.push(() => {
    if (cb) {
      try {
        cb.call(ctx)
      } catch (e: any) {
        handleError(e, ctx, 'nextTick')
      }
    } else if (_resolve) {
      // 没有传递 cb 参数，则直接调用 _resolve 函数
      // 这样就实现了 Promise 方式的 $nextTick 方法
      _resolve(ctx)
    }
  })
  // 代表回调队列是否处于等待刷新的状态
  if (!pending) {
    pending = true
    timerFunc()
  }
  // $flow-disable-line
  // 不传回调函数时
  if (!cb && typeof Promise !== 'undefined') {
    // 直接返回一个 Promise 实例对象
    return new Promise(resolve => {
      _resolve = resolve
    })
  }
}
