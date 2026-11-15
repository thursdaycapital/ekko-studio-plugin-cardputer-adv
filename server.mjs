import { createBackend } from './lib/backend.mjs'

/** @param {import('@ekko-studio/plugin-sdk').PluginContext} ctx */
export function apply(ctx) {
  return createBackend(ctx)
}
