import EarnHomeScreen from './EarnHomeScreen';
import EarnExploreScreen from './EarnExploreScreen';
import EarnDetailScreen from './EarnDetailScreen';
import EarnDepositScreen from './EarnDepositScreen';
import ReviewDepositScreen from './ReviewDepositScreen';
import ProcessingScreen from './ProcessingScreen';
import TransactionStatusScreen from './TransactionStatusScreen';
import SuccessScreen from './SuccessScreen';
import PositionScreen from './PositionScreen';
import WithdrawScreen from './WithdrawScreen';
import WithdrawConfirmScreen from './WithdrawConfirmScreen';
import PortfolioScreen from './PortfolioScreen';
import TradeHistoryScreen from './TradeHistoryScreen';
import PositionsListScreen from './PositionsListScreen';

const earnScreens = {
  EarnHome: EarnHomeScreen,
  EarnExplore: EarnExploreScreen,
  EarnDetail: EarnDetailScreen,
  EarnDeposit: EarnDepositScreen,
  ReviewDeposit: ReviewDepositScreen,
  Processing: ProcessingScreen,
  TransactionStatus: TransactionStatusScreen,
  Success: SuccessScreen,
  Position: PositionScreen,
  Withdraw: WithdrawScreen,
  WithdrawConfirm: WithdrawConfirmScreen,
  Portfolio: PortfolioScreen,
  TradeHistory: TradeHistoryScreen,
  PositionsList: PositionsListScreen,
};

export default earnScreens;

export {
  EarnHomeScreen,
  EarnExploreScreen,
  EarnDetailScreen,
  EarnDepositScreen,
  ReviewDepositScreen,
  ProcessingScreen,
  TransactionStatusScreen,
  SuccessScreen,
  PositionScreen,
  WithdrawScreen,
  WithdrawConfirmScreen,
  PortfolioScreen,
  TradeHistoryScreen,
  PositionsListScreen,
};
