import CryptoJS from "react-native-crypto-js";
import AsyncStorageLib from '@react-native-async-storage/async-storage';
import Clipboard from "@react-native-clipboard/clipboard";
import React from 'react';

export const navigationRef = React.createRef();

export function NavigationController(location) {
  navigationRef.current?.navigate(location);
}

export const SaveTransaction = async (type, hash, user, Token, walletType, chainType) => {
  let userTransactions = [];

  await AsyncStorageLib.getItem(`${user}-transactions`)
    .then(async (transactions) => {
      const data = JSON.parse(transactions);
      if (data) {
        data.map((item) => {
          userTransactions.push(item);
        });
        let txBody = { hash, type, walletType, chainType };
        userTransactions.push(txBody);
        await AsyncStorageLib.setItem(`${user}-transactions`, JSON.stringify(userTransactions));
        return userTransactions;
      } else {
        let transactions = [];
        let txBody = { hash, type, walletType, chainType };
        transactions.push(txBody);
        await AsyncStorageLib.setItem(`${user}-transactions`, JSON.stringify(transactions));
        return transactions;
      }
    });
};

export function isFloat(value) {
  if (!Number.isNaN(Number(value)) && !Number.isInteger(Number(value))) {
    return true;
  }
  return false;
}

export function isInteger(value) {
  if (value && Number.isSafeInteger(Number(value))) {
    return true;
  }
  return false;
}

export const Paste = async (func) => {
  try {
    const text = await Clipboard.getString();
    if (func && typeof func === 'function') {
      func(text);
    }
    return text;
  } catch (error) {
    console.error("Error accessing clipboard:", error);
    return null;
  }
};