# Csdoge Trading Bot Server
### How does the bot work?
The bot monitors pending transactions in pancake swap v2. \
When someone tries to buy $CSDOGE, this bot detects the pending transaction. \
If some conditions are satisfied, the bot buys some amount of tokens before him and waits until his pending transaction will be confirmed. \
Once confirmed the trasaction, the bot sells some amount of tokens. \
In this way, the bot will generate revenue.

Example:
Let's say one user tries to buy $CSDOGE for 0.2 BNB. \
In the BSC network, it will take around 9s to confirm pending transactions. \
The bot will detect the pending transaction and check if some conditions are satisfied. For example the bot can buy tokens only when another user tries to buy more than 0.1 BNB. We can call the value **Buy_Lower_Limit**. In this example, we can set **Buy_Lower_Limit** to 0.1 BNB. \
So in this case, condition is satisfied. \
The bot will try to buy some amount of tokens according to **Buy_Percentage** with more gas fee than another user. \
*(Where if **Buy_Percentage** is 10%, the bot will buy tokens for `0.2 BNB * 0.1 = 0.02 BNB`.)* \
The bot will buy tokens before the user because the bot set more gas fee than the user.\ 
And then waits until the user's pending transaction will be confirmed. \
Once confirmed the transaction, the bot sells some amount of tokens according to **Sell_Percentage**. \
*(Where if **Sell_Percentage** is 10%, the bot will sell 10% of token balance.)*

### Installation
- Install 18.x nodejs

- Install `yarn`
```
$ npm i -g yarn
```

- Frontend \
Build frontend with the following command.
```
$ yarn build
```
You can see `build` folder in the root folder of frontend. \
Copy the folder to the root folder of the backend.

- Build backend \
Create .env file from .env.example. In the .env file you need to change `WSS_URI` and `BOT_PRIVATE_KEY`. For test, you can use current `WSS_URI`. \
Build the backend with the following command.
```
$ yarn build
```

- Run the backend using PM2 \
In the root folder of the backend.
```
$ pm2 start .\dist\main.js --name <app_name>
```
or
go to build directory "dist" and run
```
$ pm2 start main.js --name <app_name>
```
