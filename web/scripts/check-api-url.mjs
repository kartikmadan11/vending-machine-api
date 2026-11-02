// The Vercel build runs this first (see buildCommand in vercel.json), so a deployment with a
// missing or malformed VENDING_API_URL fails to build instead of shipping a page whose every
// API call quietly 404s. The variable is read twice: vite.config.ts bakes it into the docs link
// at build time, and the /api route in vercel.json expands it on each request, where an unset
// variable is left as the literal text "${VENDING_API_URL}".
const NAME = 'VENDING_API_URL'
const value = process.env[NAME]

function problemWith(value) {
  if (!value) return 'is not set. Set it in the Vercel project for Production and Preview'
  if (value !== value.trim()) return 'has spaces around it'
  let url
  try {
    url = new URL(value)
  } catch {
    return 'is not an absolute URL'
  }
  if (url.protocol !== 'https:') return 'must use https'
  // Tested on the raw text, since URL reports an empty search for a bare trailing "?".
  if (/[?#]/.test(value)) return 'must not have a query string or a fragment'
  if (value.endsWith('/')) return 'must not end with a slash, since the route adds one'
  return null
}

const problem = problemWith(value)
if (problem) {
  console.error(`${NAME} ${problem}, for example https://vending-api.example.com`)
  process.exit(1)
}
console.log(`${NAME} is ${value}`)
