import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from "@nestjs/config";
import { BigNumber, ethers } from 'ethers';
import { SetSettingsDto } from './dto/set-settings.dto';
import { WSS_URIS } from './config';
import swapAbi from './abis/swap.abi.json';
import routerAbi from './abis/router.abi.json';
import pancakeCsdogeAbi from './abis/pacake_csdoge.abi.json';

let count = 0;
let uriIndex = 0;
let retryCount = 0;
let buyLowerLimit = 0.001; // 0.001 BNB
let buySlippage = 1; // 1%
let buyPercentage = 10; // 10%
let sellSlippage = 1; // 1%
let sellPercentage = 99; // 99%

const BNB_CONTRACT = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const CSDOGE_CONTRACT = "0x6eAbBB5c4FDA0033936d07Cf1A444e8816C009FC";
const PAN_V2_AMM = "0x1A0A18AC4BECDDbd6389559687d1A73d8927E416";
const PAN_V2_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const PAN_V2_CSDOGE = "0xC02Da752e59Af3DC42A388E6c99b04e7406903B2";
const PAN_V3_ROUTER = "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4";

const iface = new ethers.utils.Interface([
  'function swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline)',
  'function swapETHForExactTokens(uint amountOut, address[] calldata path, address to, uint deadline)',
  'function swapExactETHForTokensSupportingFeeOnTransferTokens(uint amountOutMin,address[] calldata path,address to,uint deadline)',
  'function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline)',
  'function multicall(uint256 deadline, bytes[] data)',
]);

@Injectable()
export class AppService {
  customWsProvider: ethers.providers.WebSocketProvider;
  wallet: ethers.Wallet;
  account: ethers.Wallet;

  constructor(
    private configService: ConfigService
  ) {
    try {
      this.customWsProvider = new ethers.providers.WebSocketProvider(WSS_URIS[uriIndex]);
      this.wallet = new ethers.Wallet(this.configService.get('BOT_PRIVATE_KEY'));
      this.account = this.wallet.connect(this.customWsProvider);

      this.monitorPendingTransactions();
    } catch {
      this.setProvider();
    }
  }

  async calculateGasPrice(action: 'buy' | 'sell', amount: ethers.BigNumber): Promise<BigInt> {
    if (action === "buy") {
      const gasPrice = ethers.utils.formatUnits(amount.add(1000000000), 'wei');
      return BigInt(gasPrice);
    } else {
      const gasPrice = ethers.utils.formatUnits(amount.sub(1000000000), 'wei');
      return BigInt(gasPrice);
    }
  }

  router(account: ethers.Wallet) {
    return new ethers.Contract(
      PAN_V2_ROUTER,
      [
        'function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)',
        'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
        'function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
        'function swapExactETHForTokensSupportingFeeOnTransferTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable',
        'function swapExactTokensForETH (uint amountOutMin, address[] calldata path, address to, uint deadline) external payable'
      ],
      account
    );
  }

  erc20(account: ethers.Wallet, tokenAddress: string) {
    return new ethers.Contract(
      tokenAddress,
      [{
        "constant": true,
        "inputs": [{ "name": "_owner", "type": "address" }],
        "name": "balanceOf",
        "outputs": [{ "name": "balance", "type": "uint256" }],
        "payable": false,
        "type": "function"
      },
      { "inputs": [], "name": "decimals", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
      { "inputs": [], "name": "symbol", "outputs": [{ "internalType": "string", "name": "", "type": "string" }], "stateMutability": "view", "type": "function" },
      {
        "constant": false,
        "inputs": [{ "name": "_spender", "type": "address" }, { "name": "_value", "type": "uint256" }],
        "name": "approve",
        "outputs": [{ "name": "", "type": "bool" }],
        "payable": false,
        "stateMutability": "nonpayable",
        "type": "function"
      },
      ],
      account
    );
  }

  async buyToken(
    account: ethers.Wallet,
    tokenContract: string,
    buyAmount: number,
    gasLimit: ethers.BigNumber,
    gasPrice: BigInt
  ) {
    // amountOutMin how many token we are going to receive
    let amountOutMin = 0;
    const amountIn = ethers.utils.parseUnits(buyAmount.toString(), 'ether');
    if (Math.floor(buySlippage) !== 0) {
      const amounts = await this.router(account).getAmountsOut(amountIn, [BNB_CONTRACT, tokenContract]);
      amountOutMin = amounts[1].sub(amounts[1].div(100).mul(`${buySlippage}`));
    }

    const tx = await this.router(account).swapExactETHForTokensSupportingFeeOnTransferTokens(
      amountOutMin,
      [BNB_CONTRACT, tokenContract],
      account.address,
      (Date.now() + 1000 * 60 * 10),
      {
        value: amountIn,
        gasLimit: gasLimit,
        gasPrice: gasPrice,
      }
    );

    const receipt = await tx.wait();
    if (receipt && receipt.blockNumber && receipt.status === 1) { // 0 - failed, 1 - success
      console.log(`Transaction https://bscscan.com/tx/${receipt.transactionHash} mined, status success`);
    } else if (receipt && receipt.blockNumber && receipt.status === 0) {
      console.log(`Transaction https://bscscan.com/tx/${receipt.transactionHash} mined, status failed`);
    } else {
      console.log(`Transaction https://bscscan.com/tx/${receipt.transactionHash} not mined`);
    }
  }

  async sellToken(
    account: ethers.Wallet,
    tokenContract: string,
    _gasLimit: ethers.BigNumber,
    gasPrice: BigInt,
  ) {
    const sellTokenContract = new ethers.Contract(tokenContract, swapAbi, account);
    const contract = new ethers.Contract(PAN_V2_ROUTER, routerAbi, account);
    const accountAddress = account.address;
    const tokenBalance = await this.erc20(account, tokenContract).balanceOf(accountAddress);

    if (tokenBalance.toString() == '0') {
      console.log('Zero token balance');
      return;
    }

    let amountOutMin = 0;
    const amountIn = tokenBalance.mul(sellPercentage).div(100);
    const amounts = await this.router(account).getAmountsOut(amountIn, [tokenContract, BNB_CONTRACT]);

    if (Math.floor(sellSlippage) !== 0) {
      amountOutMin = amounts[1].sub(amounts[1].mul(`${sellSlippage}`).div(100));
    } else {
      amountOutMin = amounts[1];
    }

    const approve = await sellTokenContract.approve(PAN_V2_ROUTER, amountIn);
    const receipt_approve = await approve.wait();
    if (receipt_approve && receipt_approve.blockNumber && receipt_approve.status === 1) {
      console.log(`Approved https://bscscan.com/tx/${receipt_approve.transactionHash}`);
      const swap_txn = await contract.swapExactTokensForETHSupportingFeeOnTransferTokens(
        amountIn,
        amountOutMin,
        [tokenContract, BNB_CONTRACT],
        accountAddress,
        (Date.now() + 1000 * 60 * 10),
        {
          gasPrice: gasPrice,
        }
      );

      const receipt = await swap_txn.wait();
      if (receipt && receipt.blockNumber && receipt.status === 1) { // 0 - failed, 1 - success
        console.log(`Transaction https://bscscan.com/tx/${receipt.transactionHash} mined, status success`);
      } else if (receipt && receipt.blockNumber && receipt.status === 0) {
        console.log(`Transaction https://bscscan.com/tx/${receipt.transactionHash} mined, status failed`);
      } else {
        console.log(`Transaction https://bscscan.com/tx/${receipt.transactionHash} not mined`);
      }
    }
  }

  async processEventTransaction(
    _sender: string,
    amount0In: ethers.BigNumber,
    amount1In: ethers.BigNumber,
    _amount0Out: ethers.BigNumber,
    amount1Out: ethers.BigNumber,
    count: number,
  ) {
    try {
      try {
        const provider = new ethers.providers.JsonRpcProvider(WSS_URIS[count % WSS_URIS.length].replace('wss://', 'https://'));

        const bnbInputAmount = ethers.utils.formatEther(amount1In);
        const tokenInputAmount = ethers.utils.formatUnits(amount0In, 9);
        // When users tried to buy CSDOGE, we sell the tokens
        if (Number(bnbInputAmount) > 0) {
          const networkGasPrice = await provider.getGasPrice();
          const sellGasPrice = Math.ceil(networkGasPrice.toNumber() * 1.5);

          console.log("going to sell from event");
          await this.sellToken(this.account, CSDOGE_CONTRACT, BigNumber.from('232310'), BigInt(sellGasPrice));
        }

        // When users tried to sell CSDOGE, we buy the tokens
        if (Number(tokenInputAmount) > 0) {
          const value = ethers.utils.formatEther(amount1Out.toString());
          if (Number(value) >= buyLowerLimit) {
            const networkGasPrice = await provider.getGasPrice();
            const buyGasPrice = Math.ceil(networkGasPrice.toNumber() * 1.5);
            const buyAmount = Number(value) * buyPercentage / 100 / 2;

            console.log("going to buy from event");
            await this.buyToken(this.account, CSDOGE_CONTRACT, buyAmount, BigNumber.from('232310'), BigInt(buyGasPrice));
          }
        }
      } catch (error) {
        console.log("final err : ", error);
      }
    } catch (e) {
      Logger.error('error in process event transaction: ');
      Logger.error(e);
    }
  }

  async processPendingTransaction(tx: string, count: number) {
    let retryProcessCount = 0;
    try {
      const provider = new ethers.providers.JsonRpcProvider(WSS_URIS[count % WSS_URIS.length].replace('wss://', 'https://'));
      const transaction = await provider.getTransaction(tx);

      if (transaction) {
        let isBuyable = false;
        const value = ethers.utils.formatEther(transaction.value.toString());

        // When buying CSDOGE via Pancakeswap V2 Router
        if (transaction.to == PAN_V2_ROUTER) {
          if (Number(value) >= buyLowerLimit) {
            let result: any = [];
            try {
              result = iface.decodeFunctionData('swapExactETHForTokens', transaction.data);
            } catch {
              try {
                result = iface.decodeFunctionData('swapExactETHForTokensSupportingFeeOnTransferTokens', transaction.data)
              } catch {
                try {
                  result = iface.decodeFunctionData('swapETHForExactTokens', transaction.data)
                } catch { }
              }
            }
            if (result.length > 0) {
              if (result[1].length > 0) {
                const tokenAddress = result[1][1];
                if (tokenAddress == CSDOGE_CONTRACT) {
                  isBuyable = true;
                }
              }
            }
          }
        }

        // When buying CSDOGE via Pancakeswap V2 AMM or Pancakeswap V3 Router
        if (transaction.to == PAN_V2_AMM || transaction.to == PAN_V3_ROUTER) {
          if (Number(value) >= buyLowerLimit) {
            try {
              const decodedInput = iface.parseTransaction({ data: transaction.data });
              if (decodedInput.name == "execute" || decodedInput.name == "multicall") {
                console.log({ tx });
                if ((decodedInput.args[1] as string[]).filter(input => input.includes(CSDOGE_CONTRACT.slice(2).toLowerCase()) && input.includes(BNB_CONTRACT.slice(2).toLowerCase())).length > 0) {
                  isBuyable = true;
                }
              }
            } catch { }
          }
        }

        if (isBuyable) {
          // we can print the sender of that transaction
          console.log("from", transaction.from);

          const networkGasPrice = await provider.getGasPrice();
          const buyGasPrice = await this.calculateGasPrice("buy", transaction.gasPrice || networkGasPrice);
          const sellGasPrice = await this.calculateGasPrice("sell", transaction.gasPrice || networkGasPrice);

          // after calculating the gas price we buy the token
          console.log("going to buy");
          const buyAmount = Number(value) * buyPercentage / 100;
          await this.buyToken(this.account, CSDOGE_CONTRACT, buyAmount, transaction.gasLimit, buyGasPrice);

          // after buying the token we sell it 
          console.log("going to sell the token");
          await this.sellToken(this.account, CSDOGE_CONTRACT, transaction.gasLimit, sellGasPrice);
        }
      }
    } catch (e) {
      if (retryProcessCount < 5) {
        retryProcessCount++;
        this.processPendingTransaction(tx, count);
      } else {
        Logger.error('error in process pending transaction: ');
        Logger.error(e);
      }
    }
  }

  setProvider() {
    retryCount += 1;
    if (retryCount > 5) {
      retryCount = 0;
      uriIndex += 1;
      if (uriIndex > WSS_URIS.length - 1) {
        uriIndex == 0;
      }

      this.customWsProvider = new ethers.providers.WebSocketProvider(WSS_URIS[uriIndex]);
      this.account = this.wallet.connect(this.customWsProvider);
    }

    setTimeout(() => {
      this.monitorPendingTransactions();
    }, 3000);
  }

  monitorPendingTransactions() {
    try {
      const pancakeSwapV2CsdogeContract = new ethers.Contract(PAN_V2_CSDOGE, pancakeCsdogeAbi, this.account);
      pancakeSwapV2CsdogeContract.on('Swap', (sender, amount0In, amount1In, amount0Out, amount1Out, to, event) => {
        if (
          sender.toLowerCase() !== this.account.address.toString().toLowerCase() &&
          to.toLowerCase() !== this.account.address.toString().toLowerCase()
        ) {
          console.log("swapppppppppp")
          this.processEventTransaction(event.args[0], amount0In, amount1In, amount0Out, amount1Out, count);
        }
        
      });

      this.customWsProvider._websocket.on("error", async (ep) => {
        console.log(`Unable to connect to ${ep.subdomain} retrying in 3s...`);
        this.setProvider();
      });
      this.customWsProvider._websocket.on("close", async (code) => {
        console.log(
          `Connection lost with code ${code}! Attempting reconnect in 3s...`
        );
        this.customWsProvider._websocket.terminate();
        this.setProvider();
      });
    } catch (e) {
      this.setProvider();
      Logger.error('error in connection socket: ');
      Logger.error(e);
    }
  }

  async setSettings(params: SetSettingsDto) {
    buyLowerLimit = params.buyLowerLimit;
    buySlippage = params.buySlippage;
    buyPercentage = params.buyPercentage;
    sellSlippage = params.sellSlippage;
    sellPercentage = params.sellPercentage;
  }

  getSettings() {
    return {
      buyLowerLimit,
      buySlippage,
      buyPercentage,
      sellSlippage,
      sellPercentage,
      tokenAddress: CSDOGE_CONTRACT,
    }
  }

  ping(): string {
    return 'Bot is alive';
  }
}
