import { extend } from 'shared/util'
import { CompilerOptions, CompiledResult, WarningMessage } from 'types/compiler'
import { detectErrors } from './error-detector'
import { createCompileToFunctionFn } from './to-function'

// 把通用的代码封装起来
// 这样在不同平台就可以创建不同的编译器
// 例如：
// function createCompilerCreator (baseCompile) {
//   return customCompiler function (template: string, options: CompilerOptions) {
//
//     一些处理编译错误的代码
//
//     return baseCompile(template, options)
//   }
// }
// 这样我们就可以使用 createCompilerCreator 函数创建出针对于不同平台的编译器了，如下代码所示：
// 创建 web 平台的编译器：
// const webCompiler = createCompilerCreator(function baseCompile (template, options) {
//   const ast = parse(template.trim(), options)
//   const code = generate(ast, options)
//   return code
// })
//
// 创建其他平台的编译器：
// const otherCompiler = createCompilerCreator(function baseCompile (template, options) {
//   const ast = parse(template.trim(), options)
//   const code = otherGenerate(ast, options)
//   return code
// })
export function createCompilerCreator(baseCompile: Function): Function {
  return function createCompiler(baseOptions: CompilerOptions) {
    // 1、生成最终编译器选项 finalOptions
    // 2、对错误的收集
    // 3、调用 baseCompile 编译模板
    function compile(
      template: string,
      options?: CompilerOptions
    ): CompiledResult {
      const finalOptions = Object.create(baseOptions)
      const errors: WarningMessage[] = []
      const tips: WarningMessage[] = []

      let warn = (
        msg: WarningMessage,
        range: { start: number; end: number },
        tip: string
      ) => {
        ;(tip ? tips : errors).push(msg)
      }

      // baseOptions 理解为编译器的默认选项或者基本选项，而 options 是用来提供定制能力的扩展选项
      // 将 options 对象混合到 finalOptions 中
      if (options) {
        if (__DEV__ && options.outputSourceRange) {
          // $flow-disable-line
          const leadingSpaceLength = template.match(/^\s*/)![0].length

          warn = (
            msg: WarningMessage | string,
            range: { start: number; end: number },
            tip: string
          ) => {
            const data: WarningMessage = typeof msg === 'string' ? { msg } : msg
            if (range) {
              if (range.start != null) {
                data.start = range.start + leadingSpaceLength
              }
              if (range.end != null) {
                data.end = range.end + leadingSpaceLength
              }
            }
            ;(tip ? tips : errors).push(data)
          }
        }
        // merge custom modules
        if (options.modules) {
          finalOptions.modules = (baseOptions.modules || []).concat(
            options.modules
          )
        }
        // merge custom directives
        if (options.directives) {
          finalOptions.directives = extend(
            Object.create(baseOptions.directives || null),
            options.directives
          )
        }
        // copy other options
        for (const key in options) {
          if (key !== 'modules' && key !== 'directives') {
            finalOptions[key] = options[key as keyof CompilerOptions]
          }
        }
      }

      finalOptions.warn = warn

      // 将字符串模板(template)，以及最终的编译器选项(finalOptions)传递了过去
      const compiled = baseCompile(template.trim(), finalOptions)
      if (__DEV__) {
        // 通过抽象语法树来检查模板中是否存在错误表达式的
        detectErrors(compiled.ast, warn)
      }
      compiled.errors = errors
      compiled.tips = tips
      return compiled
    }

    return {
      compile,
      compileToFunctions: createCompileToFunctionFn(compile)
    }
  }
}
