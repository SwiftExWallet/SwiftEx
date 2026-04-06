import { useState } from "react";
import { useSelector } from "react-redux";
import Modal from "react-native-modal";
import { ChainSupportedToken } from "../exchange/crypto-exchange-front-end-main/src/components/ChainWithTokenInfo";
import TokenQrCode from "./TokensQrCode";

const RecieveModal = ({ modalVisible, setModalVisible }) => {
  const [visible, setVisible] = useState(false);
  const [assetInfo, setAssetInfo] = useState(null);
  const state = useSelector((state) => state);

  return (
     <>
      <ChainSupportedToken
        visible={modalVisible}
        onclose={() => { setModalVisible(false) }}
        isChainProvide={true}
        chain={"STR"}
        selectedToken={(item) => {
          setVisible(true);
          setAssetInfo(item);
        }}
        showOnlyEvm={false}
        />

      {assetInfo !== null && <TokenQrCode
        modalVisible={visible}
        setModalVisible={()=>{
          setVisible(false);
          setModalVisible(false);
        }}
        iconType={assetInfo.symbol||assetInfo.code}
        qrvalue={assetInfo.chain === "STR" ? state?.STELLAR_PUBLICK_KEY : state?.wallet?.address}
        isDark={state.THEME.THEME}
      />}
     </>
  );
};

export default RecieveModal;
