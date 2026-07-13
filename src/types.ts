export interface ApiConfig {
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
  baseUrl: string;
  accountName?: string;
}

export interface OrderForm {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  amount: number;
  price?: number;
}

export interface Position {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  positionSide: string; // 'BOTH', 'LONG', or 'SHORT'
  entryPrice: number;
  markPrice: number;
  amount: number;
  pnl: number;
  pnlPercent: number;
  timestamp: number;
}

export interface PositionHistory {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  positionSide: string;
  entryPrice: number;
  exitPrice: number;
  amount: number;
  pnl: number; // True PnL (tradePnl + commission + fundingFee)
  tradePnl: number; // Price difference PnL
  commission: number;
  fundingFee: number;
  pnlPercent: number;
  openTime: number;
  closeTime: number;
  timestamp: number;
  account?: string;
}

export interface TradeLog {
  id: string;
  timestamp: number;
  type: 'INFO' | 'SUCCESS' | 'ERROR' | 'TRADE';
  message: string;
}

export interface AccountBalance {
  asset: string;
  balance: number;
  available: number;
  unrealizedPnl: number;
  spotBalance: number;
  futuresBalance: number;
}

export interface OpenOrder {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: string;
  price: number;
  stopPrice?: number;
  isAlgo: boolean;
  time: number;
  positionSide: string;
}
