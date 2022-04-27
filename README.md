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
* Do NOT include any file to the repository, only edit the existing ones
* Push your changes to a separate branch


### Using git

To create a new branch:

```
git checkout -b branch_name
```

To change to the working branch:

```
git checkout branch_name
```

To view the changes:

```
git diff
```

To commit the changes to the current branch:

```
git commit -am "Your commit message"
```

To commit the changes of only some files:

```
git add app.js
git commit -m "Your commit message"
```

To push it to the repo:

```
git push
```
