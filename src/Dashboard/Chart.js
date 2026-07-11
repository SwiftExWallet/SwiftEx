import React, { useEffect, useState } from "react";
import { AreaChart, Grid } from "react-native-svg-charts";
import * as shape from "d3-shape";

export default function Chart({ name, setPercent, percent }) {
  const [style, setStyle] = useState("");
  const [Data, setData] = useState([]);
  const data = [
    150, 130, 140, 135, 149, 158, 125, 105, 155, 153, 153, 144, 150, 160, 80,
  ];
  if (name == "USDT") {
    name = "USD";
  }
  if (name == "WETH") {
    name = "ETH";
  }

  function chooseStyle(percent) {
    if (parseFloat(percent) === 0) {
      return setStyle("rgba(0,153,51,0.8)");
    }
    if (parseFloat(percent) < 0) {
      return setStyle("rgba(204,51,51,0.8)");
    }

    return setStyle("rgba(0,153,51,0.8)");
  }
  function fetchKline() {
    fetch(
      `https://api.binance.com/api/v1/klines?symbol=${name}USDT&interval=30m&limit=50`,
      {
        method: "GET",
      }
    )
      .then((resp) => resp.json())
      .then((resp) => {
        let percent;
        if (!resp) {
          percent = 0;
          return chooseStyle(percent);
        }

        const trades = resp.map((interval) => parseFloat(interval[1]));

        const firstTrade = trades[0];
        const lastTrade = trades.slice(-1)[0];
        percent = (((lastTrade - firstTrade) / firstTrade) * 100).toFixed(2);

        setData(trades);
        setPercent(percent);
        chooseStyle(percent);
      })
      .catch((err) => {
        console.error(err);
      });
  }

  useEffect(() => {
    // fetchKline()
    chooseStyle(percent);
  }, []);

  return (
    <AreaChart
      style={{ height: 100 }}
      data={data}
      contentInset={{ top: 30, bottom: 30 }}
      curve={shape.curveNatural}
      svg={{ fill: style }}
    ></AreaChart>
  );
}
