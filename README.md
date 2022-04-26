# Aergo Swap Interface

This contains the interface for the Aergo Swap


## Instructions

Clone this repo and run:

```
npm install
npm run build
node server.js
```

Then open the address `http://127.0.0.1:3000` in the browser

Click on "Connect to wallet", then on "Install Aergo Connect"

Install the extension and then create an account on the wallet, on the `testnet` network

Then copy your account address, and put tokens on your account in the [faucet.aergoscan.io](https://faucet.aergoscan.io)


### Tips for working

* Run `node server.js` on a dedicated terminal
* Run `npm run build` every time the `app.js` file is updated
* Do NOT use VSCode as editor of `app.js` because it reformats the entire file (unless you know how to disable it)
* Do NOT include `bundle.js` and the `node_modules` in the repo, nor any unnecessary file
* Push your changes to a separate branch
