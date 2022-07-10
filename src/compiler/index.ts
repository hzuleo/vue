import { parse } from './parser/index'
import { optimize } from './optimizer'
import { generate } from './codegen/index'
import { createCompilerCreator } from './create-compiler'
import { CompilerOptions, CompiledResult } from 'types/compiler'

// `createCompilerCreator` allows creating compilers that use alternative
// parser/optimizer/codegen, e.g the SSR optimizing compiler.
// Here we just export a default compiler using the default parts.
// web 平台下的编译器
// 词法分析 -> 句法分析 -> 代码生成
// 在词法分析阶段 Vue 会把字符串模板解析成一个个的令牌(token)，
// 该令牌将用于句法分析阶段，在句法分析阶段会根据令牌生成一棵 AST，
// 最后再根据该 AST 生成最终的渲染函数，这样就完成了代码的生成。
export const createCompiler = createCompilerCreator(function baseCompile(
  template: string,
  options: CompilerOptions
): CompiledResult {
  // 调用 parse 函数将字符串模板解析成抽象语法树(AST)
  const ast = parse(template.trim(), options)
  if (options.optimize !== false) {
    // 调用 optimize 函数优化 ast
    optimize(ast, options)
  }
  // 调用 generate 函数将 ast 编译成渲染函数
  const code = generate(ast, options)
  // 其最终返回了抽象语法树(ast)，渲染函数(render)，静态渲染函数(staticRenderFns)
  return {
    ast,
    render: code.render,
    staticRenderFns: code.staticRenderFns
  }
})
