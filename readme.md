<h1 style="text-align: center">
    Solana Token Utils
</h1>

> Following you will find a solana wrapper for token interactions and trasaction decoding onchain, mostly here will be stuff that I needed to use and was integrated here due to necessity and usage.

## 👷 Install

`yarn add sol-token-utils`

or

`npm i sol-token-utils`

## Decoding burn transactions

```ts
import TokenUtils from './sol-token-utils'
import { config } from 'dotenv'
config()

const decoder = new TokenUtils({
    commitment: "confirmed"
    httpEndpoint: process.env.HTTP
})

const tx = "3nbN4CQJ77i6V9arVX9TtrXiKLQcnLZ4eauWMjryoedwZXYc89HepqpZpJUmkzsS8CZTMbnNncWDZZVtWF84tgqf"

getBurnTransactionInfo(tx, { fetchNewBlance: true }).then(console.log)
// {
//   amount: '2235067977499',
//   mint: 'ED7G2vS2sj1FZmi8dn65vzKXSYkTZ1DkzovuuRgCzKyX',
//   account: 'FXBxvAnM8NnePk3SGpfUhLzQXUWBydrsboFY5uWqNrbf',
//   authority: 'DmAeQv9E1oyroWGm9KJFcVEsjUxdujEoPwoYh8bewPHE',
//   newBalance: 0
// }
```