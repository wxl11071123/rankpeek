import { handleRequest } from './handlers.mjs'

export default {
  fetch(request, env, ctx) {
    return handleRequest(request, env, { ctx })
  }
}
