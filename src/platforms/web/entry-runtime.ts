// 运行时版的入口文件
import Vue from './runtime/index'
import * as vca from 'v3'
import { extend } from 'shared/util'

extend(Vue, vca)

export default Vue
