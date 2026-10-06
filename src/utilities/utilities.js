import Clipboard from "@react-native-clipboard/clipboard";
import React from 'react';

export const navigationRef = React.createRef();

export function NavigationController(location) {
  navigationRef.current?.navigate(location);
}

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