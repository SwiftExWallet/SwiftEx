import React, { useState } from "react";
import { useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Image,StatusBar,
  FlatList,
  Platform
} from "react-native";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import { useNavigation } from "@react-navigation/native";
import Icon from "../icon";
import { alert } from "./reusables/Toasts";
import { REACT_APP_HOST } from "./exchange/crypto-exchange-front-end-main/src/ExchangeConstants";
import { useSelector } from "react-redux";
import { Wallet_screen_header } from "./reusables/ExchangeHeader";
import { Wallet_market_loading } from "./reusables/Exchange_loading";
import monkey from "../../assets/monkey.png"
import apiHelper from "./exchange/crypto-exchange-front-end-main/src/apiHelper";


const Market = (props) => {
  const state=useSelector((state)=>state);
  const [data, setData] = useState([
    {
      "_id": "68af009c9bd91f1d4ffee99d",
      "id": "bitcoin",
      "__v": 0,
      "ath": 126080,
      "athChangePercentage": -28.79913,
      "athDate": "2025-10-06T18:57:42.558Z",
      "atl": 67.81,
      "atlChangePercentage": 132286.53082,
      "atlDate": "2013-07-06T00:00:00.000Z",
      "circulatingSupply": 19962334,
      "createdAt": "2025-08-27T12:57:00.243Z",
      "currentPrice": 89625,
      "fullyDilutedValuation": 1791098994832,
      "high24h": 89935,
      "image": "https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png?1696501400",
      "lastUpdated": "2025-12-15T11:44:42.977Z",
      "low24h": 87892,
      "marketCap": 1791097559251,
      "marketCapChange24h": 8259696817,
      "marketCapChangePercentage_24h": 0.46329,
      "marketCapRank": 1,
      "maxSupply": 21000000,
      "name": "Bitcoin",
      "priceChange24h": 695.05,
      "priceChangePercentage24h": 0.78158,
      "roi": null,
      "savedAt": "2025-12-15T11:46:00.051Z",
      "symbol": "btc",
      "totalSupply": 19962350,
      "totalVolume": 33932096364,
      "updatedAt": "2025-12-15T11:46:00.051Z"
    },
    {
      "_id": "68af009c9bd91f1d4ffee99e",
      "id": "ethereum",
      "__v": 0,
      "ath": 4946.05,
      "athChangePercentage": -36.15351,
      "athDate": "2025-08-24T19:21:03.333Z",
      "atl": 0.432979,
      "atlChangePercentage": 729237.76038,
      "atlDate": "2015-10-20T00:00:00.000Z",
      "circulatingSupply": 120695108.2435468,
      "createdAt": "2025-08-27T12:57:00.243Z",
      "currentPrice": 3149.38,
      "fullyDilutedValuation": 380870220387,
      "high24h": 3171.02,
      "image": "https://coin-images.coingecko.com/coins/images/279/large/ethereum.png?1696501628",
      "lastUpdated": "2025-12-15T11:44:46.550Z",
      "low24h": 3052.44,
      "marketCap": 380870220387,
      "marketCapChange24h": 8528895714,
      "marketCapChangePercentage_24h": 2.29061,
      "marketCapRank": 2,
      "maxSupply": null,
      "name": "Ethereum",
      "priceChange24h": 74.74,
      "priceChangePercentage24h": 2.43091,
      "roi": {
        "times": 45.98370840635786,
        "currency": "btc",
        "percentage": 4598.370840635786
      },
      "savedAt": "2025-12-15T11:46:00.051Z",
      "symbol": "eth",
      "totalSupply": 120695108.2435468,
      "totalVolume": 21915625778,
      "updatedAt": "2025-12-15T11:46:00.051Z"
    },
    {
      "_id": "68af009c9bd91f1d4ffee9a0",
      "id": "tether",
      "__v": 0,
      "ath": 1.32,
      "athChangePercentage": -24.41083,
      "athDate": "2018-07-24T00:00:00.000Z",
      "atl": 0.572521,
      "atlChangePercentage": 74.68649,
      "atlDate": "2015-03-02T00:00:00.000Z",
      "circulatingSupply": 186251181624.3731,
      "createdAt": "2025-08-27T12:57:00.243Z",
      "currentPrice": 1,
      "fullyDilutedValuation": 191736377809,
      "high24h": 1,
      "image": "https://coin-images.coingecko.com/coins/images/325/large/Tether.png?1696501661",
      "lastUpdated": "2025-12-15T11:44:44.499Z",
      "low24h": 0.999981,
      "marketCap": 186268920695,
      "marketCapChange24h": 144042,
      "marketCapChangePercentage_24h": 0.00008,
      "marketCapRank": 3,
      "maxSupply": null,
      "name": "Tether",
      "priceChange24h": -5.74192944303e-7,
      "priceChangePercentage24h": -0.00006,
      "roi": null,
      "savedAt": "2025-12-15T11:46:00.051Z",
      "symbol": "usdt",
      "totalSupply": 191718118051.8562,
      "totalVolume": 58986314512,
      "updatedAt": "2025-12-15T11:46:00.051Z"
    },
    {
      "_id": "68af009c9bd91f1d4ffee9a1",
      "id": "binancecoin",
      "__v": 0,
      "ath": 1369.99,
      "athChangePercentage": -35.09595,
      "athDate": "2025-10-13T08:41:24.131Z",
      "atl": 0.0398177,
      "atlChangePercentage": 2233027.68606,
      "atlDate": "2017-10-19T00:00:00.000Z",
      "circulatingSupply": 137735472.17,
      "createdAt": "2025-08-27T12:57:00.243Z",
      "currentPrice": 888.01,
      "fullyDilutedValuation": 122413990160,
      "high24h": 893.64,
      "image": "https://coin-images.coingecko.com/coins/images/825/large/bnb-icon2_2x.png?1696501970",
      "lastUpdated": "2025-12-15T11:44:42.758Z",
      "low24h": 874.45,
      "marketCap": 122413990160,
      "marketCapChange24h": -53713080.67662048,
      "marketCapChangePercentage_24h": -0.04386,
      "marketCapRank": 4,
      "maxSupply": 200000000,
      "name": "BNB",
      "priceChange24h": -1.2154190483264529,
      "priceChangePercentage24h": -0.13668,
      "roi": null,
      "savedAt": "2025-12-15T11:46:00.051Z",
      "symbol": "bnb",
      "totalSupply": 137735472.17,
      "totalVolume": 1271765111,
      "updatedAt": "2025-12-15T11:46:00.051Z"
    },
    {
      "_id": "68af009c9bd91f1d4ffee99f",
      "id": "ripple",
      "__v": 0,
      "ath": 3.65,
      "athChangePercentage": -45.40451,
      "athDate": "2025-07-18T03:40:53.808Z",
      "atl": 0.00268621,
      "atlChangePercentage": 74010.37732,
      "atlDate": "2014-05-22T00:00:00.000Z",
      "circulatingSupply": 60491484708,
      "createdAt": "2025-08-27T12:57:00.243Z",
      "currentPrice": 1.99,
      "fullyDilutedValuation": 198932773769,
      "high24h": 2.01,
      "image": "https://coin-images.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png?1696501442",
      "lastUpdated": "2025-12-15T11:44:45.596Z",
      "low24h": 1.98,
      "marketCap": 120354545285,
      "marketCapChange24h": -402719378.5138397,
      "marketCapChangePercentage_24h": -0.33349,
      "marketCapRank": 5,
      "maxSupply": 100000000000,
      "name": "XRP",
      "priceChange24h": -0.010852279455336511,
      "priceChangePercentage24h": -0.54292,
      "roi": null,
      "savedAt": "2025-12-15T11:46:00.051Z",
      "symbol": "xrp",
      "totalSupply": 99985744733,
      "totalVolume": 1988967123,
      "updatedAt": "2025-12-15T11:46:00.051Z"
    },
    {
      "_id": "68af009c9bd91f1d4ffee9a2",
      "id": "solana",
      "__v": 0,
      "ath": 293.31,
      "athChangePercentage": -54.76308,
      "athDate": "2025-01-19T11:15:27.957Z",
      "atl": 0.500801,
      "atlChangePercentage": 26394.60671,
      "atlDate": "2020-05-11T19:35:23.449Z",
      "circulatingSupply": 562049921.8112413,
      "createdAt": "2025-08-27T12:57:00.243Z",
      "currentPrice": 132.51,
      "fullyDilutedValuation": 81795814302,
      "high24h": 132.8,
      "image": "https://coin-images.coingecko.com/coins/images/4128/large/solana.png?1718769756",
      "lastUpdated": "2025-12-15T11:44:44.240Z",
      "low24h": 129.28,
      "marketCap": 74610881756,
      "marketCapChange24h": 765476730,
      "marketCapChangePercentage_24h": 1.03659,
      "marketCapRank": 7,
      "maxSupply": null,
      "name": "Solana",
      "priceChange24h": 1.47,
      "priceChangePercentage24h": 1.12387,
      "roi": null,
      "savedAt": "2025-12-15T11:46:00.051Z",
      "symbol": "sol",
      "totalSupply": 616174610.8704093,
      "totalVolume": 3231873452,
      "updatedAt": "2025-12-15T11:46:00.051Z"
    },
    {
      "_id": "68af009c9bd91f1d4ffee9a3",
      "id": "usd-coin",
      "__v": 0,
      "ath": 1.17,
      "athChangePercentage": -14.73679,
      "athDate": "2019-05-08T00:40:28.300Z",
      "atl": 0.877647,
      "atlChangePercentage": 13.92819,
      "atlDate": "2023-03-11T08:02:13.981Z",
      "circulatingSupply": 78442245981.4737,
      "createdAt": "2025-08-27T12:57:00.243Z",
      "currentPrice": 0.99989,
      "fullyDilutedValuation": 78431307487,
      "high24h": 1,
      "image": "https://coin-images.coingecko.com/coins/images/6319/large/usdc.png?1696506694",
      "lastUpdated": "2025-12-15T11:44:44.666Z",
      "low24h": 0.999517,
      "marketCap": 78430536402,
      "marketCapChange24h": 14862450,
      "marketCapChangePercentage_24h": 0.01895,
      "marketCapRank": 6,
      "maxSupply": null,
      "name": "USDC",
      "priceChange24h": 0.0001338,
      "priceChangePercentage24h": 0.01338,
      "roi": null,
      "savedAt": "2025-12-15T11:46:00.051Z",
      "symbol": "usdc",
      "totalSupply": 78443017181.33035,
      "totalVolume": 8567510013,
      "updatedAt": "2025-12-15T11:46:00.051Z"
    },
    {
      "_id": "68af009c9bd91f1d4ffee9a4",
      "id": "staked-ether",
      "__v": 0,
      "ath": 4932.89,
      "athChangePercentage": -36.05883,
      "athDate": "2025-08-24T19:21:31.902Z",
      "atl": 482.9,
      "atlChangePercentage": 553.17346,
      "atlDate": "2020-12-22T04:08:21.854Z",
      "circulatingSupply": 8767550.125824971,
      "createdAt": "2025-08-27T12:57:00.243Z",
      "currentPrice": 3150.83,
      "fullyDilutedValuation": 27682254190,
      "high24h": 3169.95,
      "image": "https://coin-images.coingecko.com/coins/images/13442/large/steth_logo.png?1696513206",
      "lastUpdated": "2025-12-15T11:44:43.872Z",
      "low24h": 3050.04,
      "marketCap": 27682254190,
      "marketCapChange24h": 627185948,
      "marketCapChangePercentage_24h": 2.31818,
      "marketCapRank": 8,
      "maxSupply": null,
      "name": "Lido Staked Ether",
      "priceChange24h": 66.8,
      "priceChangePercentage24h": 2.16588,
      "roi": null,
      "savedAt": "2025-12-15T11:46:00.051Z",
      "symbol": "steth",
      "totalSupply": 8767550.125824971,
      "totalVolume": 29157486,
      "updatedAt": "2025-12-15T11:46:00.051Z"
    },
    {
      "_id": "68af009c9bd91f1d4ffee9a5",
      "id": "tron",
      "__v": 0,
      "ath": 0.431288,
      "athChangePercentage": -34.679,
      "athDate": "2024-12-04T00:10:40.323Z",
      "atl": 0.00180434,
      "atlChangePercentage": 15513.55348,
      "atlDate": "2017-11-12T00:00:00.000Z",
      "circulatingSupply": 94684742914.32729,
      "createdAt": "2025-08-27T12:57:00.243Z",
      "currentPrice": 0.281726,
      "fullyDilutedValuation": 26674578784,
      "high24h": 0.282445,
      "image": "https://coin-images.coingecko.com/coins/images/1094/large/tron-logo.png?1696502193",
      "lastUpdated": "2025-12-15T11:44:44.244Z",
      "low24h": 0.274352,
      "marketCap": 26674522962,
      "marketCapChange24h": 665422072,
      "marketCapChangePercentage_24h": 2.55842,
      "marketCapRank": 9,
      "maxSupply": null,
      "name": "TRON",
      "priceChange24h": 0.00674969,
      "priceChangePercentage24h": 2.45464,
      "roi": {
        "times": 147.27679395316412,
        "currency": "usd",
        "percentage": 14727.67939531641
      },
      "savedAt": "2025-12-15T11:46:00.051Z",
      "symbol": "trx",
      "totalSupply": 94684941063.24559,
      "totalVolume": 692499158,
      "updatedAt": "2025-12-15T11:46:00.051Z"
    },
    {
      "_id": "68af009c9bd91f1d4ffee9a6",
      "id": "dogecoin",
      "__v": 0,
      "ath": 0.731578,
      "athChangePercentage": -81.2773,
      "athDate": "2021-05-08T05:08:23.458Z",
      "atl": 0.0000869,
      "atlChangePercentage": 157512.47575,
      "atlDate": "2015-05-06T00:00:00.000Z",
      "circulatingSupply": 167878603126.579,
      "createdAt": "2025-08-27T12:57:00.243Z",
      "currentPrice": 0.136826,
      "fullyDilutedValuation": 22992473189,
      "high24h": 0.137871,
      "image": "https://coin-images.coingecko.com/coins/images/5/large/dogecoin.png?1696501409",
      "lastUpdated": "2025-12-15T11:44:44.186Z",
      "low24h": 0.1338,
      "marketCap": 22989409826,
      "marketCapChange24h": 21094170,
      "marketCapChangePercentage_24h": 0.09184,
      "marketCapRank": 10,
      "maxSupply": null,
      "name": "Dogecoin",
      "priceChange24h": 0.00008587,
      "priceChangePercentage24h": 0.0628,
      "roi": null,
      "savedAt": "2025-12-15T11:46:00.051Z",
      "symbol": "doge",
      "totalSupply": 167900973126.579,
      "totalVolume": 1006467662,
      "updatedAt": "2025-12-15T11:46:00.051Z"
    },
    {
      "_id": "68bcaea4c90a94859a7f64d6",
      "id": "cardano",
      "__v": 0,
      "ath": 3.09,
      "athChangePercentage": -71.26058,
      "athDate": "2021-09-02T06:00:10.474Z",
      "atl": 0.01925275,
      "atlChangePercentage": 4507.9683,
      "atlDate": "2020-03-13T02:22:55.044Z",
      "circulatingSupply": 36523691980.95682,
      "createdAt": "2025-09-06T21:59:00.135Z",
      "currentPrice": 0.886389,
      "fullyDilutedValuation": 39940954182,
      "high24h": 0.903678,
      "image": "https://coin-images.coingecko.com/coins/images/975/large/cardano.png?1696502090",
      "lastUpdated": "2025-09-21T13:16:15.521Z",
      "low24h": 0.880051,
      "marketCap": 32417580177,
      "marketCapChange24h": -239196607.1674118,
      "marketCapChangePercentage_24h": -0.73246,
      "marketCapRank": 10,
      "maxSupply": 45000000000,
      "name": "Cardano",
      "priceChange24h": -0.008059023662645548,
      "priceChangePercentage24h": -0.90101,
      "roi": null,
      "savedAt": "2025-09-21T13:18:00.080Z",
      "symbol": "ada",
      "totalSupply": 45000000000,
      "totalVolume": 780449449,
      "updatedAt": "2025-09-21T13:18:00.080Z"
    },
    {
      "_id": "68beab78c90a94859a7f651b",
      "id": "solid-2",
      "__v": 0,
      "ath": 1.086,
      "athChangePercentage": -5.14955,
      "athDate": "2025-09-07T06:02:58.279Z",
      "atl": 1.003,
      "atlChangePercentage": 2.77173,
      "atlDate": "2025-09-07T18:57:43.702Z",
      "circulatingSupply": 68773969682,
      "createdAt": "2025-09-08T10:10:00.106Z",
      "currentPrice": 1.032,
      "fullyDilutedValuation": 81829,
      "high24h": 1.077,
      "image": "https://coin-images.coingecko.com/coins/images/68475/large/IMG_7008_2.png?1755845964",
      "lastUpdated": "2025-09-08T10:08:21.327Z",
      "low24h": 1.003,
      "marketCap": 70966574157,
      "marketCapChange24h": 70966574157,
      "marketCapChangePercentage_24h": 0,
      "marketCapRank": null,
      "maxSupply": null,
      "name": "Solid",
      "priceChange24h": -0.03717565908977294,
      "priceChangePercentage24h": -3.47743,
      "roi": null,
      "savedAt": "2025-09-08T10:11:00.088Z",
      "symbol": "solid",
      "totalSupply": 79300.730031,
      "totalVolume": 1836.36,
      "updatedAt": "2025-09-08T10:11:00.088Z"
    },
    {
      "_id": "68c187a8c90a94859a7f65fa",
      "id": "linea",
      "__v": 0,
      "ath": null,
      "athChangePercentage": 0,
      "athDate": null,
      "atl": null,
      "atlChangePercentage": 0,
      "atlDate": null,
      "circulatingSupply": 15842197800,
      "createdAt": "2025-09-10T14:14:00.181Z",
      "currentPrice": 99.44,
      "fullyDilutedValuation": 7160809386383,
      "high24h": 99.44,
      "image": "https://coin-images.coingecko.com/coins/images/68507/large/linea-logo.jpeg?1756025484",
      "lastUpdated": "2025-09-10T14:25:22.092Z",
      "low24h": 99.44,
      "marketCap": 1575378065004,
      "marketCapChange24h": -9669684767.326416,
      "marketCapChangePercentage_24h": -0.61006,
      "marketCapRank": 2,
      "maxSupply": 72009990000,
      "name": "Linea",
      "priceChange24h": -0.000813464342215298,
      "priceChangePercentage24h": -0.00082,
      "roi": null,
      "savedAt": "2025-09-10T14:27:00.109Z",
      "symbol": "linea",
      "totalSupply": 72009990000,
      "totalVolume": 3.94,
      "updatedAt": "2025-09-10T14:27:00.109Z"
    },
    {
      "_id": "68f10dd4f73419a34125dc01",
      "id": "cyreneai",
      "__v": 0,
      "ath": 0.00011073,
      "athChangePercentage": -34.91433,
      "athDate": "2025-10-15T12:38:23.209Z",
      "atl": 0.00007136,
      "atlChangePercentage": 0.99409,
      "atlDate": "2025-10-16T14:28:24.155Z",
      "circulatingSupply": 999852284161621,
      "createdAt": "2025-10-16T15:23:00.087Z",
      "currentPrice": 0.00007222,
      "fullyDilutedValuation": 72214,
      "high24h": 0.00009676,
      "image": "https://coin-images.coingecko.com/coins/images/70081/large/20251014_050308.jpg?1760521873",
      "lastUpdated": "2025-10-16T15:19:20.003Z",
      "low24h": 0.00007136,
      "marketCap": 72213509398,
      "marketCapChange24h": 72213509398,
      "marketCapChangePercentage_24h": 0,
      "marketCapRank": null,
      "maxSupply": 1000000000,
      "name": "CyreneAI",
      "priceChange24h": -0.000024086044869889,
      "priceChangePercentage24h": -25.00881,
      "roi": null,
      "savedAt": "2025-10-16T15:24:00.079Z",
      "symbol": "cyai",
      "totalSupply": 999852284.161621,
      "totalVolume": 4853.12,
      "updatedAt": "2025-10-16T15:24:00.079Z"
    },
    {
      "_id": "6912861c48dfd4add0e624af",
      "id": "eureka-bridged-pax-gold-terra",
      "__v": 0,
      "ath": 4288.86,
      "athChangePercentage": -2.36814,
      "athDate": "2025-11-10T13:46:41.914Z",
      "atl": 4064.8,
      "atlChangePercentage": 3.01368,
      "atlDate": "2025-11-10T08:35:37.843Z",
      "circulatingSupply": 9860592295403327000,
      "createdAt": "2025-11-11T00:41:00.061Z",
      "currentPrice": 4205.78,
      "fullyDilutedValuation": 4.124233309808889e+22,
      "high24h": 4288.86,
      "image": "https://coin-images.coingecko.com/coins/images/70025/large/IMG_7998.webp?1760438148",
      "lastUpdated": "2025-11-11T00:50:43.178Z",
      "low24h": 4064.8,
      "marketCap": 4.124233309808889e+22,
      "marketCapChange24h": 4.124233309808889e+22,
      "marketCapChangePercentage_24h": 0,
      "marketCapRank": 1,
      "maxSupply": null,
      "name": "Eureka Bridged PAX Gold (Terra)",
      "priceChange24h": 32.65,
      "priceChangePercentage24h": 0.7825,
      "roi": null,
      "savedAt": "2025-11-11T00:53:00.103Z",
      "symbol": "paxg",
      "totalSupply": 9860592295403327000,
      "totalVolume": 1446.3,
      "updatedAt": "2025-11-11T00:53:00.103Z"
    }
  ]);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedData, setUpdatedData] = useState([])
  const [Load_new_data,setLoad_new_data]=useState(false);
  const navigation = useNavigation();
  const fetchKline = async (
    setData,
  ) => {
      const result = await apiHelper.get(REACT_APP_HOST+"/v1/market-data");
      if (result.success) {
        setData(result.data.marketData);
         setUpdatedData(result.data.marketData)
         setLoad_new_data(false)
      } else {
        console.log(error);
        alert("error", error);
      }
  };

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(async () => {
      await fetchKline(
        setData,
      );
      setRefreshing(false);
    }, 2000);
  };

  useEffect(() => {
   const fetch_token_data=async()=>{
    try {
      await fetchKline(
        setData,
      );
    } catch (error) {
      console.log("::::***-",error)
    }
   }
   fetch_token_data()
  }, []);


  return (
    <View style={{ backgroundColor: state.THEME.THEME===false?"#fff":"#1B1B1C" }}>
    <Wallet_screen_header elementestID={"market_back"} title="Discover" onLeftIconPress={() => navigation.goBack()} />
      <View style={{ height: hp(100) }}>
        <View style={[Styles.searchContainer,{backgroundColor:state.THEME.THEME===false?"#F4F4F8":"#242426",borderColor:"rgba(255, 255, 255, 0.2)"}]}>
          <Icon name="search1" type="antDesign" size={25} color={state.THEME.THEME===false?"black":"gray"} />
          <TextInput
            placeholder="search your coin"
            placeholderTextColor={"gray"}
            style={[Styles.input,{width:wp(80),fontSize:18,color:state.THEME.THEME===false?"black":"#ebebeb"}]}
            onChangeText={(input) => {
              let UpdatedData = []
              updatedData.filter((item) => {
                if (item.name.toLowerCase().includes(input.toLowerCase()) || item.symbol.toLowerCase().includes(input.toLowerCase())) {
                  UpdatedData.push(item)
                }

                setData(UpdatedData)
                return UpdatedData
              })

            }}
          />
        </View>

        {Load_new_data ? (
  <Wallet_market_loading />
) : (
  <View style={{ height: Platform.OS==="android"?hp(75):hp(80), paddingBottom: hp(5) }}>
    <FlatList
      data={data}
      keyExtractor={(item, index) => item.id?.toString() || index.toString()}
      style={{ marginBottom: hp(5) }}
      refreshControl={
        <RefreshControl
          tintColor={"#4CA6EA"}
          refreshing={refreshing}
          onRefresh={onRefresh}
        />
      }
      ListEmptyComponent={() => (
        <View>
          <Image source={monkey} style={Styles.noItemImg} />
          <Text
            style={{
              color: state.THEME.THEME === false ? "black" : "#fff",
              alignSelf: "center",
              fontSize: 18,
              marginTop: hp(2),
            }}
          >
            No results found.
          </Text>
        </View>
      )}
      renderItem={({ item, index }) => {
        const image = item.image;
        const color = item.priceChange24h > 0 ? "green" : "red";
        const backgroundColor =
          state.THEME.THEME === false ? "#F4F4F8" : "#242426";
        const imgBgColor =
          state.THEME.THEME === false ? "#fff" : "#23262F1A";

        return (
          <TouchableOpacity
            style={[Styles.container, { backgroundColor }]}
            onPress={() => {
              props.navigation.navigate("CoinDetails", { data: item });
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={[Styles.imgCon, { backgroundColor: imgBgColor }]}>
                <Image source={{ uri: image }} style={Styles.img} />
              </View>
              <View style={Styles.flatContainerText}>
                <Text style={{ fontSize:16,fontWeight:"500",color: state.THEME.THEME === false ? "black" : "#fff",maxWidth:wp(50) }}>
                  {item.name}
                </Text>
                <Text
                  style={{
                    color: "gray",
                    fontSize: 14,
                    marginTop: hp(0.2),
                  }}
                >
                  {item?.symbol?.toUpperCase()}
                </Text>
              </View>
            </View>

            <View style={Styles.flatContainerPrice}>
              <Text
                style={{
                  color: state.THEME.THEME === false ? "black" : "#fff",
                  fontSize:16,
                  fontWeight:"500"
                }}
              >
                {`$ ${item.currentPrice ? item.currentPrice.toFixed(2) : "0"}`}
              </Text>

              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Icon
                  name={item.priceChangePercentage24h >= 0 ?"menu-up":"menu-down"||"menu-down"}
                  type="materialCommunity"
                  size={20}
                  color={
                    item.priceChangePercentage24h >= 0 ? "green" : "red"
                  }
                />
                <Text
                  style={{
                    color: item.priceChangePercentage24h >= 0 ? "green" : "red",
                    fontSize: 13,
                  }}
                >
                  {`${item.priceChangePercentage24h
                    ? item.priceChangePercentage24h.toFixed(3)
                    : "0"
                  }%`}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        );
      }}
    />
  </View>
)}

      </View>
    </View>
  );
};
const Styles = StyleSheet.create({
  container: {
    width: wp(90),
    paddingHorizontal: wp(2),
    paddingVertical:hp(1),
    alignSelf: "center",
    marginTop: hp(1),
    alignItems: "center",
    flexDirection: "row",
    justifyContent:"space-between",
    borderRadius:15,
    borderColor:"rgba(255, 255, 255, 0.2)",
  },
  flatContainerText: {
    marginHorizontal: wp(2),
  },
  flatContainerPrice: {
    alignItems:"flex-end"
  },
  img: {
    height: hp(5.1),
    width: wp(10.5),
  },
  imgCon: {
    height: hp(6),
    width: wp(13),
    justifyContent:"center",
    alignItems:"center",
    borderRadius:10
  },
  noItemImg:{
    width:hp(20),
    height:hp(20),
    alignSelf:"center",
    marginTop:hp(13)
  },
  searchContainer: {
    flexDirection: "row",
    width: wp(90),
    borderWidth: StyleSheet.hairlineWidth * 1,
    alignItems: "center",
    paddingLeft: wp(3),
    borderRadius: wp(4),
    alignSelf: "center",
    marginTop: hp(2),
    paddingVertical: hp(1),
    marginVertical: hp(2),
  },
  input: {
    marginHorizontal: hp(1.5),
    padding: hp(0.6),
  },
});
export default Market;