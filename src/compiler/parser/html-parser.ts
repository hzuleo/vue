/**
 * Not type-checking this file because it's mostly vendor code.
 */

/*!
 * HTML Parser By John Resig (ejohn.org)
 * Modified by Juriy "kangax" Zaytsev
 * Original code by Erik Arvidsson (MPL-1.1 OR Apache-2.0 OR GPL-2.0-or-later)
 * http://erik.eae.net/simplehtmlparser/simplehtmlparser.js
 */

import { makeMap, no } from 'shared/util'
import { isNonPhrasingTag } from 'web/compiler/util'
import { unicodeRegExp } from 'core/util/lang'
import { ASTAttr, CompilerOptions } from 'types/compiler'

// Regular Expressions for parsing tags and attributes
const attribute =
  /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/
const dynamicArgAttribute =
  /^\s*((?:v-[\w-]+:|@|:|#)\[[^=]+?\][^\s"'<>\/=]*)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/
const ncname = `[a-zA-Z_][\\-\\.0-9_a-zA-Z${unicodeRegExp.source}]*`
const qnameCapture = `((?:${ncname}\\:)?${ncname})`
const startTagOpen = new RegExp(`^<${qnameCapture}`)
const startTagClose = /^\s*(\/?)>/
const endTag = new RegExp(`^<\\/${qnameCapture}[^>]*>`)
const doctype = /^<!DOCTYPE [^>]+>/i
// #7298: escape - to avoid being passed as HTML comment when inlined in page
const comment = /^<!\--/
const conditionalComment = /^<!\[/

// Special Elements (can contain anything)
export const isPlainTextElement = makeMap('script,style,textarea', true)
const reCache = {}

// 用来完成对 html 实体进行解码的
const decodingMap = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&amp;': '&',
  '&#10;': '\n',
  '&#9;': '\t',
  '&#39;': "'"
}
const encodedAttr = /&(?:lt|gt|quot|amp|#39);/g
const encodedAttrWithNewLines = /&(?:lt|gt|quot|amp|#39|#10|#9);/g

// #5992
// 用来检测给定的标签是否是 <pre> 标签或者 <textarea> 标签
const isIgnoreNewlineTag = makeMap('pre,textarea', true)
// 用来检测是否应该忽略元素内容的第一个换行符
const shouldIgnoreFirstNewline = (tag, html) =>
  tag && isIgnoreNewlineTag(tag) && html[0] === '\n'

// 解码 html 实体，实现将 html 实体转为对应的字符
function decodeAttr(value, shouldDecodeNewlines) {
  const re = shouldDecodeNewlines ? encodedAttrWithNewLines : encodedAttr
  return value.replace(re, match => decodingMap[match])
}

export interface HTMLParserOptions extends CompilerOptions {
  start?: (
    tag: string,
    attrs: ASTAttr[],
    unary: boolean,
    start: number,
    end: number
  ) => void
  end?: (tag: string, start: number, end: number) => void
  chars?: (text: string, start?: number, end?: number) => void
  comment?: (content: string, start: number, end: number) => void
}

export function parseHTML(html, options: HTMLParserOptions) {
  // 在 while 循环中处理 html 字符流的时候每当遇到一个 非一元标签，都会将该开始标签 push 到该数组。
  const stack: any[] = []
  const expectHTML = options.expectHTML
  // 用来检测一个标签是否是一元标签
  const isUnaryTag = options.isUnaryTag || no
  // 用来检测一个标签是否是可以省略闭合标签的非一元标签
  const canBeLeftOpenTag = options.canBeLeftOpenTag || no
  // 标识着当前字符流的读入位置
  let index = 0
  // 变量 last 存储剩余还未 parse 的 html 字符串
  // 变量 lastTag 则始终存储着位于 stack 栈顶的元素
  let last, lastTag

  // 开启一个 while 循环，循环结束的条件是 html 为空，即 html 被 parse 完毕
  while (html) {
    last = html
    // Make sure we're not in a plaintext content element like script/style
    // 确保即将 parse 的内容不是在纯文本标签里 (script,style,textarea)
    if (!lastTag || !isPlainTextElement(lastTag)) {
      let textEnd = html.indexOf('<')
      // 1、可能是注释节点：<!-- -->
      // 2、可能是条件注释节点：<![ ]>
      // 3、可能是 doctype：<!DOCTYPE >
      // 4、可能是结束标签：</xxx>
      // 5、可能是开始标签：<xxx>
      // 6、可能只是一个单纯的字符串：<abcdefg
      if (textEnd === 0) {
        // Comment:
        if (comment.test(html)) {
          // 确实是一个注释节点
          const commentEnd = html.indexOf('-->')

          if (commentEnd >= 0) {
            if (options.shouldKeepComment && options.comment) {
              options.comment(
                html.substring(4, commentEnd),
                index,
                index + commentEnd + 3
              )
            }
            advance(commentEnd + 3)
            continue
          }
        }

        // http://en.wikipedia.org/wiki/Conditional_comment#Downlevel-revealed_conditional_comment
        if (conditionalComment.test(html)) {
          const conditionalEnd = html.indexOf(']>')

          if (conditionalEnd >= 0) {
            // Vue 模板永远都不会保留条件注释节点的内容
            advance(conditionalEnd + 2)
            continue
          }
        }

        // Doctype:
        const doctypeMatch = html.match(doctype)
        if (doctypeMatch) {
          advance(doctypeMatch[0].length)
          continue
        }

        // End tag:
        const endTagMatch = html.match(endTag)
        if (endTagMatch) {
          const curIndex = index
          advance(endTagMatch[0].length)
          parseEndTag(endTagMatch[1], curIndex, index)
          continue
        }

        // Start tag:
        const startTagMatch = parseStartTag()
        if (startTagMatch) {
          handleStartTag(startTagMatch)
          if (shouldIgnoreFirstNewline(startTagMatch.tagName, html)) {
            advance(1)
          }
          continue
        }
      }

      let text, rest, next
      // 如果字符串长成这个样子：html = '0<1<2'，那么 textEnd 的值应该为 1
      if (textEnd >= 0) {
        // 此时 rest 变量的值应该为 <1<2
        rest = html.slice(textEnd)
        while (
          !endTag.test(rest) &&
          !startTagOpen.test(rest) &&
          !comment.test(rest) &&
          !conditionalComment.test(rest)
        ) {
          // < in plain text, be forgiving and treat it as text
          // 此时 next 值为 2
          next = rest.indexOf('<', 1)
          if (next < 0) break
          textEnd += next
          // 使用新的 textEnd 对原始字符串 html 进行截取，并将新截取的字符串赋值给 rest 变量
          // 如此往复直到遇到一个能够成功匹配标签的 < 符号为止
          rest = html.slice(textEnd)
        }
        text = html.substring(0, textEnd)
      }

      if (textEnd < 0) {
        text = html
      }

      if (text) {
        advance(text.length)
      }

      // 被作为普通字符串处理
      if (options.chars && text) {
        options.chars(text, index - text.length, index)
      }
    } else {
      // 即将 parse 的内容是在纯文本标签里 (script,style,textarea)
      // endTagLength 用来保存纯文本标签闭合标签的字符长度
      let endTagLength = 0
      const stackedTag = lastTag.toLowerCase()
      // 正则匹配纯文本标签的内容以及结束标签
      const reStackedTag =
        reCache[stackedTag] ||
        (reCache[stackedTag] = new RegExp(
          '([\\s\\S]*?)(</' + stackedTag + '[^>]*>)',
          'i'
        ))
      // rest 保存剩余的字符
      // 例如：aaaabbbb</textarea>，值就为空字符串
      // 例如：aaaabbbb</textarea>ddd，值就为 ddd
      const rest = html.replace(reStackedTag, function (all, text, endTag) {
        endTagLength = endTag.length
        if (!isPlainTextElement(stackedTag) && stackedTag !== 'noscript') {
          text = text
            .replace(/<!\--([\s\S]*?)-->/g, '$1') // #7298
            .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1')
        }
        // 忽略 <pre> 标签和 <textarea> 标签的内容中的第一个换行符
        if (shouldIgnoreFirstNewline(stackedTag, text)) {
          text = text.slice(1)
        }
        // 纯文本标签的内容全部作为纯文本对待
        if (options.chars) {
          options.chars(text)
        }
        return ''
      })
      // 二者的差就是被替换掉的那部分字符串的字符数
      index += html.length - rest.length
      html = rest
      parseEndTag(stackedTag, index - endTagLength, index)
    }

    // 将整个字符串作为文本对待
    if (html === last) {
      options.chars && options.chars(html)
      if (__DEV__ && !stack.length && options.warn) {
        options.warn(`Mal-formatted tag at end of template: "${html}"`, {
          start: index + html.length
        })
      }
      break
    }
  }

  // Clean up any remaining tags
  parseEndTag()

  function advance(n) {
    index += n
    html = html.substring(n)
  }

  // parseStartTag 函数用来 parse 开始标签
  function parseStartTag() {
    const start = html.match(startTagOpen)
    // 匹配成功，那么 start 常量将是一个包含两个元素的数组
    // 第一个元素是标签的开始部分(包含 < 和 标签名称)；第二个元素是捕获组捕获到的标签名称
    if (start) {
      const match: any = {
        tagName: start[1],
        attrs: [],
        start: index
      }
      advance(start[0].length)
      let end, attr
      // 没有匹配到开始标签的结束部分，并且匹配到了开始标签中的属性
      while (
        !(end = html.match(startTagClose)) &&
        (attr = html.match(dynamicArgAttribute) || html.match(attribute))
      ) {
        attr.start = index
        advance(attr[0].length)
        attr.end = index
        match.attrs.push(attr)
      }
      if (end) {
        match.unarySlash = end[1]
        advance(end[0].length)
        match.end = index
        return match
      }
    }
  }

  // handleStartTag 函数用来处理 parseStartTag 的结果
  function handleStartTag(match) {
    const tagName = match.tagName
    const unarySlash = match.unarySlash

    if (expectHTML) {
      // 最近一次遇到的开始标签是 p 标签，并且当前正在解析的开始标签必须不能是 段落式内容(Phrasing content) 模型
      if (lastTag === 'p' && isNonPhrasingTag(tagName)) {
        parseEndTag(lastTag)
      }
      // 当前正在解析的标签是一个可以省略结束标签的标签，并且与上一次解析到的开始标签相同
      if (canBeLeftOpenTag(tagName) && lastTag === tagName) {
        parseEndTag(tagName)
      }
    }

    // 当它为真时代表着标签是一元标签，否则是二元标签
    const unary = isUnaryTag(tagName) || !!unarySlash

    const l = match.attrs.length
    const attrs: ASTAttr[] = new Array(l)
    // 格式化 match.attrs 数组，并将格式化后的数据存储到常量 attrs 中
    // 第一：格式化后的数据只包含 name 和 value 两个字段，其中 name 是属性名，value 是属性的值。
    // 第二：对属性值进行 html 实体的解码。
    for (let i = 0; i < l; i++) {
      const args = match.attrs[i]
      const value = args[3] || args[4] || args[5] || ''
      const shouldDecodeNewlines =
        tagName === 'a' && args[1] === 'href'
          ? options.shouldDecodeNewlinesForHref
          : options.shouldDecodeNewlines
      attrs[i] = {
        name: args[1],
        value: decodeAttr(value, shouldDecodeNewlines)
      }
      if (__DEV__ && options.outputSourceRange) {
        attrs[i].start = args.start + args[0].match(/^\s*/).length
        attrs[i].end = args.end
      }
    }

    if (!unary) {
      stack.push({
        tag: tagName,
        lowerCasedTag: tagName.toLowerCase(),
        attrs: attrs,
        start: match.start,
        end: match.end
      })
      lastTag = tagName
    }

    if (options.start) {
      options.start(tagName, attrs, unary, match.start, match.end)
    }
  }

  // parseEndTag 函数用来 parse 结束标签
  // 主要有三个作用：
  // 检测是否缺少闭合标签
  // 处理 stack 栈中剩余的标签
  // 解析 </br> 与 </p> 标签，与浏览器的行为相同
  function parseEndTag(tagName?: any, start?: any, end?: any) {
    let pos, lowerCasedTagName
    if (start == null) start = index
    if (end == null) end = index

    // Find the closest opened tag of the same type
    // 寻找当前解析的结束标签所对应的开始标签在 stack 栈中的位置。
    if (tagName) {
      lowerCasedTagName = tagName.toLowerCase()
      for (pos = stack.length - 1; pos >= 0; pos--) {
        if (stack[pos].lowerCasedTag === lowerCasedTagName) {
          break
        }
      }
    } else {
      // If no tag name is provided, clean shop
      // pos 变量会被用来判断是否有元素缺少闭合标签
      pos = 0
    }

    if (pos >= 0) {
      // Close all the open elements, up the stack
      for (let i = stack.length - 1; i >= pos; i--) {
        // 如果发现 stack 数组中存在索引大于 pos 的元素，那么该元素一定是缺少闭合标签的
        if (__DEV__ && (i > pos || !tagName) && options.warn) {
          options.warn(`tag <${stack[i].tag}> has no matching end tag.`, {
            start: stack[i].start,
            end: stack[i].end
          })
        }
        if (options.end) {
          // 立即将其闭合，这是为了保证解析结果的正确性
          options.end(stack[i].tag, start, end)
        }
      }

      // Remove the open elements from the stack
      stack.length = pos
      lastTag = pos && stack[pos - 1].tag
    } else if (lowerCasedTagName === 'br') {
      if (options.start) {
        options.start(tagName, [], true, start, end)
      }
    } else if (lowerCasedTagName === 'p') {
      if (options.start) {
        options.start(tagName, [], false, start, end)
      }
      if (options.end) {
        options.end(tagName, start, end)
      }
    }
  }
}
