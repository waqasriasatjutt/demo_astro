// Phase 1 BFF — Auth & cart lifecycle, guest-cart merge, error taxonomy.
// Talks to Odoo 19 over JSON-RPC. Astro would hit this; never Odoo directly.
// GraphiQL at /graphql.

import { createServer } from 'node:http'
import crypto from 'node:crypto'
import { createYoga, createSchema } from 'graphql-yoga'
import { GraphQLError } from 'graphql'
import { SignJWT, jwtVerify, generateKeyPair } from 'jose'

// All Odoo connection values come from env — nothing sensitive is committed.
const ODOO_URL = process.env.ODOO_URL || 'https://your-odoo.example'
const DB = process.env.ODOO_DB || 'odoo'
const LOGIN = process.env.ODOO_LOGIN || 'admin'
const PASSWORD = process.env.ODOO_PASSWORD || ''
const PORT = Number(process.env.PORT || 3000)

// ---------- Odoo JSON-RPC ----------
async function rpc(service, method, args) {
  const r = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args } }),
  })
  const data = await r.json()
  if (data.error) {
    const e = data.error
    const err = new Error(e.data?.message || e.message || 'odoo error')
    err.odooClass = e.data?.name || 'odoo.exceptions.UserError'
    throw err
  }
  return data.result
}
let UID
async function uid() { if (!UID) UID = await rpc('common', 'authenticate', [DB, LOGIN, PASSWORD, {}]); return UID }
async function call(model, method, args = [], kwargs = {}) {
  return rpc('object', 'execute_kw', [DB, await uid(), PASSWORD, model, method, args, kwargs])
}

// ---------- Error taxonomy (Error@v1) ----------
const MAP = [
  { cls: 'odoo.exceptions.ValidationError', re: /not enough (stock|inventory)|insufficient|out of stock/i,
    code: 'CART_STOCK_INSUFFICIENT', category: 'conflict', retryable: false, http_status: 409,
    msg: { de: 'Nicht genügend Lagerbestand für diesen Artikel.', fr: 'Stock insuffisant pour cet article.', it: 'Scorte insufficienti per questo articolo.', en: 'Not enough stock for this item.' } },
  { cls: 'odoo.exceptions.UserError', re: /archived|no longer available/i,
    code: 'CART_VARIANT_UNAVAILABLE', category: 'conflict', retryable: false, http_status: 409,
    msg: { de: 'Diese Variante ist nicht mehr verfügbar.', fr: "Cette variante n'est plus disponible.", it: 'Questa variante non è più disponibile.', en: 'This variant is no longer available.' } },
  { cls: 'odoo.exceptions.AccessError', code: 'ODOO_ACCESS_DENIED', category: 'upstream', retryable: false, http_status: 502,
    msg: { de: 'Dienst vorübergehend nicht verfügbar.', fr: 'Service temporairement indisponible.', it: 'Servizio temporaneamente non disponibile.', en: 'Service temporarily unavailable.' } },
]
const DEFAULT_ERR = { code: 'INTERNAL', category: 'internal', retryable: false, http_status: 500,
  msg: { de: 'Ein unerwarteter Fehler ist aufgetreten.', fr: "Une erreur inattendue s'est produite.", it: 'Si è verificato un errore imprevisto.', en: 'An unexpected error occurred.' } }

function taxo(code, msg, category = 'conflict', http_status = 409, retryable = false, odoo = 'odoo.exceptions.ValidationError') {
  return { code, category, retryable, http_status, odoo_origin: odoo, user_message: msg, ref: 'err_' + crypto.randomUUID().slice(0, 10) }
}
function gqlFromOdoo(err) {
  const rule = MAP.find(m => m.cls === err.odooClass && (!m.re || m.re.test(err.message || '')))
  const ext = rule
    ? taxo(rule.code, rule.msg, rule.category, rule.http_status, rule.retryable, err.odooClass)
    : { ...DEFAULT_ERR, code: DEFAULT_ERR.code, user_message: DEFAULT_ERR.msg, odoo_origin: err.odooClass, ref: 'err_' + crypto.randomUUID().slice(0, 10) }
  return new GraphQLError(ext.user_message.en, { extensions: ext })
}

// ---------- JWT (RS256), keypair generated at boot ----------
let PRIV, PUB
async function initKeys() { const kp = await generateKeyPair('RS256'); PRIV = kp.privateKey; PUB = kp.publicKey }
async function issueJwt(p) {
  return new SignJWT({ email: p.email, name: p.name, locale: 'de', scope: ['shop:read', 'cart:write', 'order:write'] })
    .setProtectedHeader({ alg: 'RS256' }).setIssuer('bff.headless').setSubject(String(p.id))
    .setJti(crypto.randomUUID()).setIssuedAt().setExpirationTime('2h').sign(PRIV)
}
async function readJwt(auth) {
  if (!auth?.startsWith('Bearer ')) return null
  try { const { payload } = await jwtVerify(auth.slice(7), PUB, { issuer: 'bff.headless' }); return payload } catch { return null }
}

// ---------- domain helpers ----------
let PUBLIC_PARTNER
async function publicPartner() {
  if (PUBLIC_PARTNER) return PUBLIC_PARTNER
  const ref = await call('ir.model.data', 'search_read', [[['module', '=', 'base'], ['name', '=', 'public_partner']]], { fields: ['res_id'] })
  PUBLIC_PARTNER = ref.length ? ref[0].res_id
    : (await call('res.partner', 'search', [[['name', '=', 'Website Guest (BFF)']]]))[0]
    || await call('res.partner', 'create', [{ name: 'Website Guest (BFF)' }])
  return PUBLIC_PARTNER
}
async function findOrCreatePartner(email, name) {
  const ex = await call('res.partner', 'search', [[['email', '=', email]]])
  if (ex.length) { const [p] = await call('res.partner', 'read', [ex, ['id', 'name', 'email']]); return p }
  const id = await call('res.partner', 'create', [{ name: name || email.split('@')[0], email, customer_rank: 1 }])
  return { id, name: name || email.split('@')[0], email }
}
async function variant(vid) {
  const [v] = await call('product.product', 'read', [[vid], ['display_name', 'default_code', 'lst_price', 'free_qty']])
  return v
}
async function draftByToken(token) {
  const ids = await call('sale.order', 'search', [[['client_order_ref', '=', token], ['state', '=', 'draft']]], { limit: 1 })
  return ids[0] || null
}
async function activeCartFor(partnerId) {
  const ids = await call('sale.order', 'search', [[['partner_id', '=', partnerId], ['state', '=', 'draft']]], { order: 'id desc', limit: 1 })
  return ids[0] || null
}
async function projectCart(orderId) {
  if (!orderId) return null
  const [o] = await call('sale.order', 'read', [[orderId], ['name', 'state', 'partner_id', 'client_order_ref', 'amount_untaxed', 'amount_tax', 'amount_total', 'order_line']])
  const lines = o.order_line.length ? await call('sale.order.line', 'read', [o.order_line, ['product_id', 'name', 'product_uom_qty', 'price_unit', 'price_subtotal']]) : []
  const pub = await publicPartner()
  const stateMap = { draft: o.partner_id[0] === pub ? 'guest' : 'active', cancel: 'merged', sale: 'converted', sent: 'active', done: 'converted' }
  return {
    _contract: 'Cart@v1', cart_token: o.client_order_ref, order_id: o.id,
    partner_id: o.partner_id[0] === pub ? null : o.partner_id[0], state: stateMap[o.state] || 'active',
    locale: 'de', currency: 'CHF',
    lines: lines.map(l => ({ line_id: l.id, variant_id: l.product_id[0], sku: '', name: (l.name || '').split('\n')[0], qty: l.product_uom_qty, unit_price_chf: l.price_unit, subtotal_chf: l.price_subtotal, availability: 'in_stock' })),
    subtotal_chf: o.amount_untaxed, tax_chf: o.amount_tax, total_chf: o.amount_total,
  }
}
async function addLine(orderId, vid, qty) {
  const v = await variant(vid)
  const existing = await call('sale.order.line', 'search', [[['order_id', '=', orderId], ['product_id', '=', vid]]])
  if (existing.length) {
    const [l] = await call('sale.order.line', 'read', [existing, ['product_uom_qty']])
    await call('sale.order.line', 'write', [existing, { product_uom_qty: l.product_uom_qty + qty }])
  } else {
    await call('sale.order.line', 'create', [{ order_id: orderId, product_id: vid, product_uom_qty: qty, price_unit: v.lst_price }])
  }
}

// ---------- GraphQL ----------
const typeDefs = /* GraphQL */ `
  type AttrKV { k: String!  v: String! }
  type Variant { variant_id: Int!  sku: String  price_chf: Float!  free_qty: Float!  availability: String!  name: String! }
  type ProductDetail { _contract: String!  name: String!  variant_axes: [String!]!  variants: [Variant!]! }
  type CartLine { line_id: Int!  variant_id: Int!  name: String!  qty: Float!  unit_price_chf: Float!  subtotal_chf: Float! }
  type Cart { _contract: String!  cart_token: String  order_id: Int  partner_id: Int  state: String!  currency: String!  lines: [CartLine!]!  subtotal_chf: Float!  tax_chf: Float!  total_chf: Float! }
  type Session { _contract: String!  token: String!  partner_id: Int!  display_name: String!  cart: Cart }
  type Query {
    products: [Variant!]!
    product(name: String! = "Hayabusa T3 Boxing Gloves"): ProductDetail!
    cart(cart_token: String!): Cart
  }
  type Mutation {
    addToCart(cart_token: String, variant_id: Int!, qty: Float! = 1): Cart!
    login(email: String!, password: String! = "demo", guest_cart_token: String): Session!
    mergeGuestCart(guest_cart_token: String!): Cart!
  }
`

function availability(free) { return free <= 0 ? 'out_of_stock' : free <= 5 ? 'low_stock' : 'in_stock' }

const resolvers = {
  Query: {
    products: async () => {
      const ids = await call('product.product', 'search', [[['default_code', 'like', 'HYB-T3']]])
      const vs = await call('product.product', 'read', [ids, ['display_name', 'default_code', 'lst_price', 'free_qty']])
      return vs.map(v => ({ variant_id: v.id, sku: v.default_code, price_chf: v.lst_price, free_qty: v.free_qty, availability: availability(v.free_qty), name: v.display_name }))
    },
    product: async (_p, { name }) => {
      const t = await call('product.template', 'search', [[['name', '=', name]]], { limit: 1 })
      if (!t.length) throw new GraphQLError('product not found')
      const ids = await call('product.product', 'search', [[['product_tmpl_id', '=', t[0]]]])
      const vs = await call('product.product', 'read', [ids, ['display_name', 'default_code', 'lst_price', 'free_qty']])
      return { _contract: 'Product@v1', name, variant_axes: ['size', 'color'],
        variants: vs.map(v => ({ variant_id: v.id, sku: v.default_code, price_chf: v.lst_price, free_qty: v.free_qty, availability: availability(v.free_qty), name: v.display_name })) }
    },
    cart: async (_p, { cart_token }) => projectCart(await draftByToken(cart_token)),
  },
  Mutation: {
    // Flow 1 — first add creates the draft sale.order in Odoo. Stock-guarded.
    addToCart: async (_p, { cart_token, variant_id, qty }, ctx) => {
      const v = await variant(variant_id)
      if (qty > v.free_qty) throw new GraphQLError('Not enough stock for this item.', { extensions: taxo('CART_STOCK_INSUFFICIENT', MAP[0].msg) })
      let orderId = cart_token ? await draftByToken(cart_token) : null
      const token = cart_token || 'cart_' + crypto.randomUUID().slice(0, 8)
      if (!orderId) {
        const partner = ctx.customer ? Number(ctx.customer.sub) : await publicPartner()
        orderId = await call('sale.order', 'create', [{ partner_id: partner, client_order_ref: token }])
      }
      await addLine(orderId, variant_id, qty)
      return projectCart(orderId)
    },
    // Flow 1+2 — issue JWT, and if a guest cart is passed, merge it into the partner.
    login: async (_p, { email, guest_cart_token }) => {
      const partner = await findOrCreatePartner(email)
      const token = await issueJwt(partner)
      let cartId = await activeCartFor(partner.id)
      if (guest_cart_token) cartId = await doMerge(guest_cart_token, partner.id)
      return { _contract: 'Customer@v1', token, partner_id: partner.id, display_name: partner.name, cart: await projectCart(cartId) }
    },
    // Flow 2 — explicit guest -> partner merge (requires JWT).
    mergeGuestCart: async (_p, { guest_cart_token }, ctx) => {
      if (!ctx.customer) throw new GraphQLError('auth required', { extensions: taxo('AUTH_TOKEN_INVALID', { de: '', fr: '', it: '', en: 'Authentication required.' }, 'auth', 401, false, 'bff') })
      return projectCart(await doMerge(guest_cart_token, Number(ctx.customer.sub)))
    },
  },
}

// merge: fold the guest cart into the partner's active cart, cancel the guest one.
async function doMerge(guestToken, partnerId) {
  const guestId = await draftByToken(guestToken)
  if (!guestId) return activeCartFor(partnerId)
  let mine = await activeCartFor(partnerId)
  if (!mine) { await call('sale.order', 'write', [[guestId], { partner_id: partnerId }]); return guestId }
  if (mine === guestId) return mine
  const gl = await call('sale.order.line', 'read', [await call('sale.order.line', 'search', [[['order_id', '=', guestId]]]), ['product_id', 'product_uom_qty']])
  for (const l of gl) await addLine(mine, l.product_id[0], l.product_uom_qty)
  await call('sale.order', 'action_cancel', [[guestId]])
  return mine
}

const yoga = createYoga({
  schema: createSchema({ typeDefs, resolvers }),
  graphqlEndpoint: '/graphql',
  landingPage: false,
  context: async ({ request }) => ({ customer: await readJwt(request.headers.get('authorization')) }),
  maskedErrors: false,
})

await initKeys()
await uid()
createServer(yoga).listen(PORT, () => console.log(`Phase-1 BFF on :${PORT}  ->  Odoo ${ODOO_URL}`))
