import AsyncStorage from '@react-native-async-storage/async-storage';
import { ARB, AVAX, BASE, OPT, POL, RPC } from '../Dashboard/constants';
import Web3 from 'web3';
import { PPOST, proxyRequest } from '../Dashboard/exchange/crypto-exchange-front-end-main/src/api';

const ShortTermStorage = {
  async saveTx(activeWalletPublicKey, data) {
    try {
      const key = `App_+_+Storage${activeWalletPublicKey}`;
      const existingResponse = await this.getWalletTx(activeWalletPublicKey);
      const existingData = existingResponse.status ? existingResponse.data : [];

      const txObject = {
        chain: data.chain,
        typeTx: data.typeTx,
        status: data.status,
        hash: data.hash,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      let updatedData = [txObject, ...existingData];
      if (updatedData.length > 30) {
        updatedData = updatedData.slice(0, 30);
      }

      await AsyncStorage.setItem(key, JSON.stringify(updatedData));

      return {
        status: true,
        data: updatedData,
      };
    } catch (error) {
      console.log('ShortTermStorage save error', error);
      return {
        status: false,
        data: [],
      };
    }
  },

  async getWalletTx(activeWalletPublicKey) {
    try {
      const key = `App_+_+Storage${activeWalletPublicKey}`;
      const storedData = await AsyncStorage.getItem(key);
      const txList = storedData ? JSON.parse(storedData) : [];

      const updatedTxList = [];

      for (const tx of txList) {
        if (tx.status === "pending"||tx.status === "Pending") {
          const createdAt = tx.createdAt || 0;
          const oneMinuteAgo = Date.now() - (60 * 1000);
        if (createdAt < oneMinuteAgo) {
          const receipt = await this.getTxReceiptByChain(tx.chain, tx.hash);
          if (receipt?.status === true || receipt?.status === 1 || receipt?.status === 1n) {
            updatedTxList.push({
              ...tx,
              status: "success",
              statusColor: "#27ae60",
              updatedAt: Date.now(),
            });
            continue;
          }

          if (receipt?.status === false || receipt?.status === 0) {
            updatedTxList.push({
              ...tx,
              status: "failed",
              statusColor: "#de2727ff",
              updatedAt: Date.now(),
            });
            continue;
          }

          // If createdAt > 1 min ago AND receipt is null, mark as failed
          if (receipt === null || receipt === undefined) {
            updatedTxList.push({
              ...tx,
              status: "failed",
              statusColor: "#de2727ff",
              updatedAt: Date.now(),
            });
            continue;
          }
        }
        // Less than 1 min or receipt check passed - keep pending
          updatedTxList.push({
            ...tx,
            status: "pending",
            statusColor: "#eec14fff",
            updatedAt: Date.now(),
          });
        } else {
          updatedTxList.push(tx);
        }
      }

      await AsyncStorage.setItem(key, JSON.stringify(updatedTxList));

      return {
        status: true,
        data: updatedTxList,
      };
    } catch (error) {
      console.log('ShortTermStorage get error', error);
      return {
        status: false,
        data: [],
      };
    }
  },

  async updateTxStatus(activeWalletPublicKey, updateData) {
    try {
      const response = await this.getWalletTx(activeWalletPublicKey);
      if (!response.status) {
        return { status: false, message: 'No transactions found' };
      }

      const updatedData = response.data.map(tx => {
        if (tx.hash === updateData.hash && tx.chain === updateData.chain) {
          return {
            ...tx,
            status: updateData.status,
            updatedAt: Date.now(),
          };
        }
        return tx;
      });

      const key = `App_+_+Storage${activeWalletPublicKey}`;
      await AsyncStorage.setItem(key, JSON.stringify(updatedData));

      return {
        status: true,
        data: updatedData,
      };
    } catch (error) {
      console.log('ShortTermStorage update error', error);
      return {
        status: false,
        error: error.message,
      };
    }
  },
  async removeTxByHash(activeWalletPublicKey, hash, chain) {
  try {
    const key = `App_+_+Storage${activeWalletPublicKey}`;
    const data = await AsyncStorage.getItem(key);

    if (!data) return { status: false };

    const parsed = JSON.parse(data);

    const filtered = parsed.filter(
      tx => !(tx.hash === hash && tx.chain === chain)
    );

    await AsyncStorage.setItem(key, JSON.stringify(filtered));

    return { status: true };
  } catch (error) {
    console.log("removeTxByHash error", error);
    return { status: false };
  }
  },
  async getTxReceiptByChain(chainSymbol, txHash) {
    let rpcUrl;

    switch (chainSymbol) {
      case "ETH":
        rpcUrl = RPC.ETHRPC;
        break;

      case "BNB":
      case "BSC":
        rpcUrl = RPC.BSCRPC;
        break;
      case "POL":
        rpcUrl = POL.RPC;
        break;
      case "ARB":
        rpcUrl = ARB.RPC;
        break;
      case "OPT":
        rpcUrl = OPT.RPC;
        break;
      case "AVAX":
        rpcUrl = AVAX.RPC;
        break;
      case "BASE":
        rpcUrl = BASE.RPC;
        break; 
      default:
        return null;
    }

    const web3 = new Web3(rpcUrl);
    return await web3.eth.getTransactionReceipt(txHash);
  },

  async syncTx(payload) {
    try {
      const response = await proxyRequest('/v1/swapOrders/store', PPOST, payload);
      if (response.err?.status) {
        return { status: false, error: response.err.message };
      }
      return { status: true, response: response.res };
    } catch (error) {
      console.error('sync tx error', error);
      return {
        status: false,
        data: [],
      };
    }
  },

};

export default ShortTermStorage;