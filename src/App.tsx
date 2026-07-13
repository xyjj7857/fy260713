import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Settings, 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  Shield, 
  Clock, 
  Zap, 
  Server, 
  Key, 
  XCircle,
  RefreshCw,
  Eye,
  EyeOff,
  ArrowUpRight,
  ArrowDownRight,
  Terminal,
  Wallet,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  FileText,
  Download,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Sliders,
  Calculator,
  Volume2,
  VolumeX,
  Plus,
  Bell,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ApiConfig, OrderForm, Position, TradeLog, AccountBalance, OpenOrder, PositionHistory } from './types';
import MonitoringAssistant from './components/MonitoringAssistant';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  LabelList
} from 'recharts';
import * as XLSX from 'xlsx';

const Candlestick = (props: any) => {
  const { x, y, width, height, payload } = props;
  if (x === undefined || y === undefined || width === undefined || height === undefined) return null;
  if (!payload) return null;

  const isUp = payload.close >= payload.open;
  const color = isUp ? '#10B981' : '#EF4444';

  const bodyMax = Math.max(payload.open, payload.close);
  const bodyMin = Math.min(payload.open, payload.close);
  const bodyHeightVal = Math.max(0.0001, bodyMax - bodyMin);

  const pixelsPerUnit = height / bodyHeightVal;

  const wickTopY = y - (payload.high - bodyMax) * pixelsPerUnit;
  const wickBottomY = y + height + (bodyMin - payload.low) * pixelsPerUnit;
  const cx = x + width / 2;

  return (
    <g stroke={color} strokeWidth={1.5} fill={isUp ? color : 'transparent'}>
      {/* Upper Wick */}
      <line x1={cx} y1={y} x2={cx} y2={wickTopY} />
      {/* Lower Wick */}
      <line x1={cx} y1={y + height} x2={cx} y2={wickBottomY} />
      {/* Candle Body */}
      <rect 
        x={x} 
        y={y} 
        width={width} 
        height={height} 
        fill={isUp ? '#10B981' : '#EF4444'} 
        stroke={isUp ? '#10B981' : '#EF4444'}
        strokeWidth={1}
        rx={1}
      />
    </g>
  );
};

const CustomTrendTooltip = ({ active, payload, opacity }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const change = data.close - data.open;
    const changePctStr = data.open > 0 ? ((change / data.open) * 100).toFixed(2) : '0.00';
    const amplitude = data.open > 0 ? (((data.high - data.low) / data.open) * 100).toFixed(2) : '0.00';
    return (
      <div 
        className="bg-[#141416] border border-[#232326] p-4 rounded-lg shadow-xl text-xs font-mono space-y-1.5 min-w-[180px] backdrop-blur-sm z-50 transition-opacity duration-200"
        style={{ opacity: opacity !== undefined ? opacity / 100 : 0.95 }}
      >
        <p className="font-sans font-bold text-zinc-400 pb-1 border-b border-zinc-800">{data.name}</p>
        <div className="flex justify-between gap-4">
          <span className="text-zinc-500">开盘:</span>
          <span className="text-zinc-300 font-bold">{data.open?.toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-zinc-500">最高:</span>
          <span className="text-zinc-300 font-bold">{data.high?.toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-zinc-500">最低:</span>
          <span className="text-zinc-300 font-bold">{data.low?.toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-zinc-500">收盘:</span>
          <span className={`font-bold ${data.close >= data.open ? 'text-emerald-500' : 'text-red-500'}`}>
            {data.close?.toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-zinc-500">次数:</span>
          <span className="text-zinc-300 font-bold">{data.tradesCount ?? 0}</span>
        </div>
        <div className="flex justify-between gap-4 pt-1 border-t border-zinc-800/50">
          <span className="text-zinc-500">涨跌幅:</span>
          <span className={`font-bold ${change >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
            {change >= 0 ? '+' : ''}{changePctStr}%
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-zinc-500">振幅:</span>
          <span className="text-zinc-400">{amplitude}%</span>
        </div>
        {data.pnlSum !== undefined && (
          <div className="flex justify-between gap-4">
            <span className="text-zinc-500">净盈亏:</span>
            <span className={`font-bold ${data.pnlSum >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              {data.pnlSum >= 0 ? '+' : ''}{data.pnlSum?.toFixed(2)} USDT
            </span>
          </div>
        )}
      </div>
    );
  }
  return null;
};

export default function App() {
  // State
  const [activeMainTab, setActiveMainTab] = useState<'TRADE' | 'MONITOR' | 'REPORT'>('TRADE');
  const [positionHistory, setPositionHistory] = useState<PositionHistory[]>([]);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);
  
  // Alert Logs States
  const [alertLogs, setAlertLogs] = useState<any[]>([]);
  const [alertFilterDate, setAlertFilterDate] = useState<string>('');
  const [alertFilterBoard, setAlertFilterBoard] = useState<string>('');
  const [isFetchingAlerts, setIsFetchingAlerts] = useState<boolean>(false);
  const [alertCurrentPage, setAlertCurrentPage] = useState<number>(1);
  const ALERT_ITEMS_PER_PAGE = 20;
  
  // Pagination & Rate limiting/Sync progress States
  const [currentPage, setCurrentPage] = useState<number>(1);
  const ITEMS_PER_PAGE = 50;
  const [rateLimitDelay, setRateLimitDelay] = useState<number>(300); // 默认 300ms, 安全防护
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number; stage: string }>({
    current: 0,
    total: 0,
    stage: ''
  });
  
  // Date range for history (default to last 7 days)
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  
  const [apiConfig, setApiConfig] = useState<ApiConfig>({
    apiKey: '',
    apiSecret: '',
    baseUrl: 'https://fapi-gcp.binance.com', // Binance Futures API
    accountName: '',
  });

  const [savedApiAccounts, setSavedApiAccounts] = useState<any[]>([]);
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);

  const [kValue, setKValue] = useState<number | null>(null);
  const [zValue, setZValue] = useState<number | null>(null);
  const [entryEntity, setEntryEntity] = useState<number | null>(null);
  const [entryEntityRatio, setEntryEntityRatio] = useState<number | null>(null);
  const [countdownStr, setCountdownStr] = useState<string>('00:00');

  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const minutes = now.getMinutes();
      const seconds = now.getSeconds();
      const remMinutes = 14 - (minutes % 15);
      const remSeconds = 59 - seconds;
      setCountdownStr(`${String(remMinutes).padStart(2, '0')}:${String(remSeconds).padStart(2, '0')}`);
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  const [selectedReportAccount, setSelectedReportAccount] = useState<string>('ALL_ACCOUNTS');
  const [availableAccounts, setAvailableAccounts] = useState<string[]>([]);

  // 走势分析状态
  const [trendInitialBalance, setTrendInitialBalance] = useState<number>(200);
  const [trendOpacity, setTrendOpacity] = useState<number>(40);
  const [trendChartType, setTrendChartType] = useState<'candle' | 'line'>('candle');
  const [trendTimeframe, setTrendTimeframe] = useState<'1h' | '4h' | '1d' | '1w' | '1M'>('1M');
  const [isTrendAnalysisVisible, setIsTrendAnalysisVisible] = useState<boolean>(true);
  const [isStreakChartVisible, setIsStreakChartVisible] = useState<boolean>(true);
  const [trendCandles, setTrendCandles] = useState<any[]>([]);

  // 缩放与横向移动(漫游)状态
  const [trendZoomInfo, setTrendZoomInfo] = useState({ startIndex: 0, viewLen: 0 });
  const [streakZoomInfo, setStreakZoomInfo] = useState({ startIndex: 0, viewLen: 0 });
  const [isTrendHovered, setIsTrendHovered] = useState(false);
  const [isStreakHovered, setIsStreakHovered] = useState(false);

  const trendContainerRef = useRef<HTMLDivElement>(null);
  const streakContainerRef = useRef<HTMLDivElement>(null);

  const handleZoom = useCallback((
    deltaY: number,
    totalLength: number,
    setZoom: React.Dispatch<React.SetStateAction<{ startIndex: number; viewLen: number }>>
  ) => {
    if (totalLength === 0) return;

    setZoom((prev) => {
      const currentViewLen = prev.viewLen <= 0 || prev.viewLen > totalLength 
        ? totalLength 
        : prev.viewLen;
        
      const currentStartIndex = prev.startIndex;
      
      // Step: 约数据集长度的10%
      const step = Math.max(1, Math.floor(totalLength * 0.1));
      
      let newViewLen = currentViewLen;
      let newStartIndex = currentStartIndex;
      
      if (deltaY < 0) {
        // 放大：减少可见项
        newViewLen = Math.max(4, currentViewLen - step);
        const diff = currentViewLen - newViewLen;
        newStartIndex = currentStartIndex + Math.floor(diff / 2);
      } else {
        // 缩小：增加可见项
        newViewLen = Math.min(totalLength, currentViewLen + step);
        const diff = newViewLen - currentViewLen;
        newStartIndex = Math.max(0, currentStartIndex - Math.floor(diff / 2));
      }
      
      // 边界夹逼
      if (newStartIndex < 0) newStartIndex = 0;
      if (newStartIndex + newViewLen > totalLength) {
        newStartIndex = Math.max(0, totalLength - newViewLen);
      }
      
      return {
        startIndex: newStartIndex,
        viewLen: newViewLen
      };
    });
  }, []);

  const handlePan = useCallback((
    direction: 'left' | 'right',
    totalLength: number,
    setZoom: React.Dispatch<React.SetStateAction<{ startIndex: number; viewLen: number }>>
  ) => {
    if (totalLength === 0) return;

    setZoom((prev) => {
      const currentViewLen = prev.viewLen <= 0 || prev.viewLen > totalLength 
        ? totalLength 
        : prev.viewLen;
      
      if (currentViewLen >= totalLength) return prev;
      
      // 每次移动当前可见长度的10%
      const step = Math.max(1, Math.floor(currentViewLen * 0.1));
      let newStartIndex = prev.startIndex;
      
      if (direction === 'left') {
        newStartIndex = Math.max(0, prev.startIndex - step);
      } else {
        newStartIndex = Math.min(totalLength - currentViewLen, prev.startIndex + step);
      }
      
      return {
        startIndex: newStartIndex,
        viewLen: currentViewLen
      };
    });
  }, []);


  const [serverIp, setServerIp] = useState<string>('未获取 (开启点击后刷新)');
  const [isQueryingIp, setIsQueryingIp] = useState<boolean>(false);
  const [showServerIp, setShowServerIp] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  
  const [positionMode, setPositionMode] = useState<'ONE_WAY' | 'HEDGE'>('ONE_WAY');
  const [isApiVisible, setIsApiVisible] = useState(false);
  const [isRiskVisible, setIsRiskVisible] = useState(false);
  const [isTradeConfigVisible, setIsTradeConfigVisible] = useState(false);
  const [leverage, setLeverage] = useState<number>(5);
  const [futuresRatio, setFuturesRatio] = useState<number>(50);
  const [turnoverCoef, setTurnoverCoef] = useState<number>(3000);
  const [isCalculatingVolume, setIsCalculatingVolume] = useState<boolean>(false);
  const positionOpenTimesRef = useRef<{[key: string]: number}>({});
  const isInitialLoadCompletedRef = useRef(false);
  const hasFetchedPositionsRef = useRef(false);
  const previousActivePositionsRef = useRef<Position[]>([]);
  const [isRiskProcessing, setIsRiskProcessing] = useState(false);
  const [isCancellingAll, setIsCancellingAll] = useState(false);
  const [exchangeInfo, setExchangeInfo] = useState<any>(null);

  // Active Risk Control State
  const [activeRisk, setActiveRisk] = useState({
    enabled: false,
    tp: 3,
    sl: 5,
    timeLimitEnabled: true,
    timeLimitMinutes: 15,
    tpCoef: 45,
    slCoef: 100,
  });

  // Position Submission risk timestamps & ticks for real-time countdown
  const [riskSubmitTimes, setRiskSubmitTimes] = useState<Record<string, number>>({});
  const [tick, setTick] = useState(0);

  const activeRiskRef = useRef(activeRisk);
  const riskSubmitTimesRef = useRef(riskSubmitTimes);

  useEffect(() => {
    activeRiskRef.current = activeRisk;
  }, [activeRisk]);

  useEffect(() => {
    riskSubmitTimesRef.current = riskSubmitTimes;
  }, [riskSubmitTimes]);
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    return localStorage.getItem('global_mute_state') === 'true';
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setTick(t => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const [orderForm, setOrderForm] = useState<OrderForm>({
    symbol: 'BTCUSDT', // Binance Futures format
    side: 'BUY',
    type: 'MARKET',
    amount: 500,
  });

  const [positions, setPositions] = useState<Position[]>([]);
  const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]);
  const [isTrading, setIsTrading] = useState(false);
  
  const [logs, setLogs] = useState<TradeLog[]>([]);
  const [isAutoCleanLogs, setIsAutoCleanLogs] = useState<boolean>(() => {
    return localStorage.getItem('auto_clean_logs_enabled') === 'true';
  });
  const [autoCleanHours, setAutoCleanHours] = useState<number>(() => {
    const saved = localStorage.getItem('auto_clean_logs_hours');
    return saved ? parseInt(saved, 10) : 6;
  });

  useEffect(() => {
    localStorage.setItem('auto_clean_logs_enabled', String(isAutoCleanLogs));
  }, [isAutoCleanLogs]);

  useEffect(() => {
    localStorage.setItem('auto_clean_logs_hours', String(autoCleanHours));
  }, [autoCleanHours]);
  const [balance, setBalance] = useState<AccountBalance>({
    asset: 'USDT',
    balance: 0,
    available: 0,
    unrealizedPnl: 0,
    spotBalance: 0,
    futuresBalance: 0
  });

  // Transfer States
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferType, setTransferType] = useState<'futures_to_spot' | 'spot_to_futures'>('spot_to_futures');
  const [transferAmount, setTransferAmount] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);

  // Calculate win/loss streaks for the chart
  const chartData = React.useMemo(() => {
    const streaks: any[] = [];
    if (positionHistory.length > 0) {
      // positionHistory is sorted by timestamp DESC (newest first)
      // We need to process from oldest to newest for streaks
      const sortedHistory = [...positionHistory].sort((a, b) => a.timestamp - b.timestamp);
      
      let currentStreak: any = null;
      
      sortedHistory.forEach((h) => {
        const isWin = h.pnl > 0;
        if (!currentStreak) {
          currentStreak = { isWin, count: 1 };
        } else if (currentStreak.isWin === isWin) {
          currentStreak.count++;
        } else {
          streaks.push(currentStreak);
          currentStreak = { isWin, count: 1 };
        }
      });
      if (currentStreak) streaks.push(currentStreak);
    }

    return streaks.map((s, idx) => ({
      name: idx + 1,
      count: s.count,
      isWin: s.isWin,
      color: s.isWin ? '#10B981' : '#EF4444'
    }));
  }, [positionHistory]);

  // 通过点击选择时段或点击分析主动对当前选中账户的“仓位历史记录”进行数据分析
  const handleAnalyzeTrend = useCallback((overrideTimeframe?: '1h' | '4h' | '1d' | '1w' | '1M') => {
    if (positionHistory.length === 0) {
      setTrendCandles([]);
      return;
    }

    const activeTimeframe = overrideTimeframe || trendTimeframe;

    // 按平仓时间/最后平仓时间进行升序排序
    const sorted = [...positionHistory].sort((a, b) => {
      const timeA = a.closeTime || a.timestamp || 0;
      const timeB = b.closeTime || b.timestamp || 0;
      return timeA - timeB;
    });

    let runningBalance = trendInitialBalance;
    const balancePoints = sorted.map(h => {
      runningBalance += (h.pnl || 0);
      return {
        time: h.closeTime || h.timestamp || 0,
        balance: runningBalance,
        pnl: h.pnl || 0
      };
    });

    // 格式化时间键函数
    const getGroupKey = (timestamp: number, tf: '1h' | '4h' | '1d' | '1w' | '1M') => {
      const d = new Date(timestamp);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const date = String(d.getDate()).padStart(2, '0');
      const hours = d.getHours();
      
      if (tf === '1h') {
        return `${year}-${month}-${date} ${String(hours).padStart(2, '0')}:00`;
      } else if (tf === '4h') {
        const h4 = Math.floor(hours / 4) * 4;
        return `${year}-${month}-${date} ${String(h4).padStart(2, '0')}:00`;
      } else if (tf === '1d') {
        return `${year}-${month}-${date}`;
      } else if (tf === '1w') {
        const oneJan = new Date(year, 0, 1);
        const numberOfDays = Math.floor((d.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000));
        const week = Math.ceil((numberOfDays + oneJan.getDay() + 1) / 7);
        return `${year}-W${String(week).padStart(2, '0')}`;
      } else {
        return `${year}-${month}`;
      }
    };

    const groupMap: Record<string, { balance: number; pnl: number; time: number }[]> = {};
    balancePoints.forEach(pt => {
      const key = getGroupKey(pt.time, activeTimeframe);
      if (!groupMap[key]) {
        groupMap[key] = [];
      }
      groupMap[key].push(pt);
    });

    const sortedGroupKeys = Object.keys(groupMap).sort((a, b) => a.localeCompare(b));
    const candlesList: any[] = [];
    let runningPrev = trendInitialBalance;

    sortedGroupKeys.forEach(key => {
      const pts = groupMap[key];
      const open = runningPrev;
      const close = pts[pts.length - 1].balance;
      const balances = pts.map(p => p.balance);
      const high = Math.max(open, close, ...balances);
      const low = Math.min(open, close, ...balances);
      const pnlSum = pts.reduce((sum, p) => sum + p.pnl, 0);

      const tradesCount = positionHistory.filter(item => {
        const itemOpenTime = item.openTime || item.timestamp || 0;
        return getGroupKey(itemOpenTime, activeTimeframe) === key;
      }).length;

      candlesList.push({
        name: key,
        open,
        high,
         low,
        close,
        range: [Math.min(open, close), Math.max(open, close)],
        pnlSum,
        count: pts.length,
        tradesCount
      });

      runningPrev = close; // 下一个区间的开盘是当前区间的收盘
    });

    setTrendCandles(candlesList);
    // 重置缩放区间为全幅，使得新图可以立刻完整地展示
    setTrendZoomInfo({ startIndex: 0, viewLen: candlesList.length });
  }, [positionHistory, trendInitialBalance, trendTimeframe]);

  // 当仓位交易历史、初始资金改变时，重置并清空走势分析 (不再进行自动分析)
  useEffect(() => {
    setTrendCandles([]);
  }, [positionHistory, trendInitialBalance]);

  // 可见区间的 K线 数据（支持缩放和游走）
  const visibleTrendCandles = React.useMemo(() => {
    if (trendCandles.length === 0) return [];
    let len = trendZoomInfo.viewLen;
    if (len <= 0 || len > trendCandles.length) {
      len = trendCandles.length;
    }
    let start = trendZoomInfo.startIndex;
    if (start < 0) start = 0;
    if (start + len > trendCandles.length) {
      start = Math.max(0, trendCandles.length - len);
    }
    return trendCandles.slice(start, start + len);
  }, [trendCandles, trendZoomInfo]);

  // 可见区间的 连续盈亏柱状图 数据（支持缩放和游走）
  const visibleStreakData = React.useMemo(() => {
    if (chartData.length === 0) return [];
    let len = streakZoomInfo.viewLen;
    if (len <= 0 || len > chartData.length) {
      len = chartData.length;
    }
    let start = streakZoomInfo.startIndex;
    if (start < 0) start = 0;
    if (start + len > chartData.length) {
      start = Math.max(0, chartData.length - len);
    }
    return chartData.slice(start, start + len);
  }, [chartData, streakZoomInfo]);

  const historyTotals = React.useMemo(() => {
    return positionHistory.reduce((acc, curr) => {
      acc.totalPnl += curr.pnl;
      acc.totalCommission += curr.commission;
      acc.totalFunding += curr.fundingFee;
      acc.totalTrades += 1;
      if (curr.pnl > 0) acc.wins += 1;
      return acc;
    }, { totalPnl: 0, totalCommission: 0, totalFunding: 0, wins: 0, totalTrades: 0 });
  }, [positionHistory]);

  // 走势分析鼠标滚轮监听
  useEffect(() => {
    const element = trendContainerRef.current;
    if (!element) return;
    
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      handleZoom(e.deltaY, trendCandles ? trendCandles.length : 0, setTrendZoomInfo);
    };
    
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', onWheel);
    };
  }, [trendCandles, handleZoom]);

  // 连续盈亏鼠标滚轮监听
  useEffect(() => {
    const element = streakContainerRef.current;
    if (!element) return;
    
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      handleZoom(e.deltaY, chartData ? chartData.length : 0, setStreakZoomInfo);
    };
    
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', onWheel);
    };
  }, [chartData, handleZoom]);

  // 键盘左右键监听（当鼠标悬浮在两个图表各自的容器内时）
  useEffect(() => {
    if (!isTrendHovered) return;
    
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePan('left', trendCandles ? trendCandles.length : 0, setTrendZoomInfo);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handlePan('right', trendCandles ? trendCandles.length : 0, setTrendZoomInfo);
      }
    };
    
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isTrendHovered, trendCandles, handlePan]);

  useEffect(() => {
    if (!isStreakHovered) return;
    
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePan('left', chartData ? chartData.length : 0, setStreakZoomInfo);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handlePan('right', chartData ? chartData.length : 0, setStreakZoomInfo);
      }
    };
    
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isStreakHovered, chartData, handlePan]);

  // Reset pagination on history changes
  useEffect(() => {
    setCurrentPage(1);
  }, [positionHistory]);

  const logEndRef = useRef<HTMLDivElement>(null);

  // Helper: Add Log
  const addLog = useCallback((message: string, type: TradeLog['type'] = 'INFO') => {
    const newLog: TradeLog = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      type,
      message
    };
    setLogs(prev => {
      let updated = [newLog, ...prev];
      if (isAutoCleanLogs) {
        const threshold = Date.now() - autoCleanHours * 60 * 60 * 1000;
        updated = updated.filter(log => log.timestamp >= threshold);
      }
      return updated.slice(0, 100);
    });
  }, [isAutoCleanLogs, autoCleanHours]);

  // Periodic Log Auto-Cleanup
  useEffect(() => {
    if (!isAutoCleanLogs) return;

    const cleanup = () => {
      const threshold = Date.now() - autoCleanHours * 60 * 60 * 1000;
      setLogs(prev => {
        const afterClean = prev.filter(log => log.timestamp >= threshold);
        if (afterClean.length !== prev.length) {
          return afterClean;
        }
        return prev;
      });
    };

    cleanup();
    const interval = setInterval(cleanup, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, [isAutoCleanLogs, autoCleanHours]);

  // Poll backend monitor logs to keep unified log console synchronized
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/monitoring/logs");
        if (res.ok) {
          const backendLogs = await res.json();
          if (Array.isArray(backendLogs) && backendLogs.length > 0) {
            setLogs(prev => {
              const prevIds = new Set(prev.map(l => l.id));
              const newLogs = backendLogs.filter((l: any) => !prevIds.has(l.id));
              if (newLogs.length === 0) return prev;
              
              let updated = [...newLogs, ...prev];
              if (isAutoCleanLogs) {
                const threshold = Date.now() - autoCleanHours * 60 * 60 * 1000;
                updated = updated.filter(log => log.timestamp >= threshold);
              }
              return updated.slice(0, 100);
            });
          }
        }
      } catch (err) {
        console.error("Failed to poll backend logs:", err);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [isAutoCleanLogs, autoCleanHours]);

  const fetchAvailableAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/position-history/accounts');
      if (res.ok) {
        const list = await res.json();
        setAvailableAccounts(list);
      }
    } catch (err) {
      console.error('Failed to fetch available accounts:', err);
    }
  }, []);

  const fetchSavedApiAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/api-credentials');
      if (res.ok) {
        const list = await res.json();
        setSavedApiAccounts(list);
      }
    } catch (err) {
      console.error('Failed to fetch saved API accounts:', err);
    }
  }, []);

  const loadPositionHistory = useCallback(async (accountStr?: string) => {
    try {
      const act = accountStr !== undefined ? accountStr : selectedReportAccount;
      let url = '/api/position-history';
      if (act && act !== 'ALL_ACCOUNTS') {
        url += `?account=${encodeURIComponent(act)}`;
      }
      const res = await fetch(url);
      if (res.ok) {
        const list = await res.json();
        setPositionHistory(list);
      }
    } catch (err) {
      console.error('Failed to load position history:', err);
    }
  }, [selectedReportAccount]);

  const fetchAlertLogs = useCallback(async () => {
    setIsFetchingAlerts(true);
    try {
      let url = '/api/alert-logs';
      const params = new URLSearchParams();
      if (alertFilterDate) params.append('date', alertFilterDate);
      if (alertFilterBoard) params.append('boardName', alertFilterBoard);
      const queryStr = params.toString();
      if (queryStr) url += `?${queryStr}`;

      const res = await fetch(url);
      if (res.ok) {
        const list = await res.json();
        setAlertLogs(list);
      }
    } catch (err) {
      console.error('Failed to fetch alert logs:', err);
    } finally {
      setIsFetchingAlerts(false);
    }
  }, [alertFilterDate, alertFilterBoard]);

  const handleClearAlertLogs = async () => {
    if (!window.confirm('您确定要清空本地数据库中的全部警报记录吗？此操作不可恢复。')) return;
    try {
      const res = await fetch('/api/alert-logs/clear', { method: 'POST' });
      if (res.ok) {
        addLog('已成功清空本地数据库中的所有警报记录', 'SUCCESS');
        fetchAlertLogs();
        setAlertCurrentPage(1);
      }
    } catch (err) {
      console.error('Failed to clear alert logs:', err);
      addLog('清空警报记录失败', 'ERROR');
    }
  };

  useEffect(() => {
    if (activeMainTab === 'REPORT') {
      loadPositionHistory();
      fetchAvailableAccounts();
      fetchAlertLogs();
    }
  }, [activeMainTab, selectedReportAccount, loadPositionHistory, fetchAvailableAccounts, fetchAlertLogs]);

  const fetchExchangeInfo = async (apiKey?: string, apiSecret?: string) => {
    try {
      const response = await fetch('/api/binance-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: '/fapi/v1/exchangeInfo',
          apiKey: apiKey || apiConfig.apiKey,
          apiSecret: apiSecret || apiConfig.apiSecret
        })
      });
      const data = await response.json();
      if (response.ok) {
        setExchangeInfo(data);
        addLog('交易对精度信息已同步', 'SUCCESS');
      }
    } catch (error) {
      addLog('获取交易对精度信息失败', 'ERROR');
    }
  };

  const getSymbolInfo = (symbol: string) => {
    if (!exchangeInfo || !exchangeInfo.symbols) return null;
    return exchangeInfo.symbols.find((s: any) => s.symbol === symbol);
  };

  const formatPrice = (symbol: string, price: number) => {
    const info = getSymbolInfo(symbol);
    if (!info) return price.toString();
    
    const priceFilter = info.filters.find((f: any) => f.filterType === 'PRICE_FILTER');
    if (priceFilter) {
      const tickSize = parseFloat(priceFilter.tickSize);
      const roundedPrice = Math.round(price / tickSize) * tickSize;
      return roundedPrice.toFixed(info.pricePrecision);
    }
    
    return price.toFixed(info.pricePrecision);
  };

  const formatQty = (symbol: string, qty: number) => {
    const info = getSymbolInfo(symbol);
    if (!info) return qty.toString();
    
    const lotSizeFilter = info.filters.find((f: any) => f.filterType === 'LOT_SIZE');
    if (lotSizeFilter) {
      const stepSize = parseFloat(lotSizeFilter.stepSize);
      const roundedQty = Math.round(qty / stepSize) * stepSize; // Use round for closest quantity as requested
      return roundedQty.toFixed(info.quantityPrecision);
    }
    
    return qty.toFixed(info.quantityPrecision);
  };

  // Auto-scroll logs
  useEffect(() => {
    // We don't necessarily want to scroll to bottom if they are looking at old logs, 
    // but for a trading terminal, usually we want the newest at the top or bottom.
    // Here I'm putting newest at the top, so no scroll needed.
  }, [logs]);

  // Fetch Server IP manually on active click
  const handleFetchIp = useCallback(async () => {
    if (isQueryingIp) return;
    setIsQueryingIp(true);
    addLog('正在手动发起服务器 IP 查询...', 'INFO');
    try {
      const res = await fetch('/api/server-info');
      if (res.ok) {
        const data = await res.json();
        setServerIp(data.ip);
        addLog(`服务器 IP 查询成功: ${data.ip}`, 'SUCCESS');
      } else {
        throw new Error('IP API returned non-ok response');
      }
    } catch (err) {
      setServerIp('127.0.0.1');
      addLog('手动查询 IP 失败，已使用回退本地地址', 'ERROR');
    } finally {
      setIsQueryingIp(false);
    }
  }, [addLog, isQueryingIp]);

  // Load configuration and position history from SQLite database on mount
  useEffect(() => {
    let active = true;
    
    const loadFromDb = async () => {
      try {
        // 1. Fetch system settings
        const settingsRes = await fetch('/api/settings');
        if (settingsRes.ok) {
          const settings = await settingsRes.json();
          if (!active) return;
          
          if (settings.apiConfig) {
            setApiConfig(settings.apiConfig);
            addLog('从本地数据库 [settings 表] 成功加载了 API 配置以及代理端点', 'SUCCESS');
          }
          if (settings.activeRisk) {
            setActiveRisk(settings.activeRisk);
            addLog(`从本地数据库 [settings 表] 成功加载了止盈/止损及风控参数 (止盈: ${settings.activeRisk.tp}%, 止损: ${settings.activeRisk.sl}%)`, 'SUCCESS');
          }
          if (settings.rateLimitDelay !== undefined) {
            setRateLimitDelay(settings.rateLimitDelay);
          }
          if (settings.leverage !== undefined) {
            setLeverage(settings.leverage);
          }
          if (settings.futuresRatio !== undefined) {
            setFuturesRatio(settings.futuresRatio);
          }
          if (settings.turnoverCoef !== undefined) {
            setTurnoverCoef(settings.turnoverCoef);
          }
          if (settings.kValue !== undefined) {
            setKValue(settings.kValue);
          }
          if (settings.zValue !== undefined) {
            setZValue(settings.zValue);
          }
          if (settings.entryEntity !== undefined) {
            setEntryEntity(settings.entryEntity);
          }
          if (settings.entryEntityRatio !== undefined) {
            setEntryEntityRatio(settings.entryEntityRatio);
          }
        }
        
        // 2. Fetch position history database
        const historyRes = await fetch('/api/position-history');
        if (historyRes.ok) {
          const historyList = await historyRes.json();
          if (!active) return;
          if (Array.isArray(historyList) && historyList.length > 0) {
            setPositionHistory(historyList);
            addLog(`从本地数据库 [position_history 表] 成功加载了 ${historyList.length} 条已闭环的历史仓位及财务报表`, 'SUCCESS');
          }
        }
        // Load available accounts
        fetchAvailableAccounts();
        fetchSavedApiAccounts();
      } catch (err) {
        console.error('Failed to load initial settings / history from DB:', err);
      } finally {
        if (active) {
          isInitialLoadCompletedRef.current = true;
        }
      }
    };
    
    loadFromDb();
    
    return () => {
      active = false;
    };
  }, [addLog, fetchAvailableAccounts, fetchSavedApiAccounts]);

  // Debounced auto-save of configuration & parameters to SQLite
  useEffect(() => {
    if (!isInitialLoadCompletedRef.current) return;
    
    const timer = setTimeout(() => {
      // Out of security concerns, do NOT store apiKey and apiSecret in settings
      const sanitizedApiConfig = {
        ...apiConfig,
        apiKey: "",
        apiSecret: ""
      };
      
      fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          apiConfig: sanitizedApiConfig,
          activeRisk,
          rateLimitDelay,
          leverage,
          futuresRatio,
          turnoverCoef,
          kValue,
          zValue,
          entryEntity,
          entryEntityRatio
        })
      })
      .then(res => {
        if (!res.ok) throw new Error('Network response not ok');
      })
      .catch(err => {
        console.error('Failed to autosave settings to database:', err);
      });
    }, 1500); // 1.5s debounce to group setting adjustments
    
    return () => clearTimeout(timer);
  }, [apiConfig, activeRisk, rateLimitDelay, leverage, futuresRatio, turnoverCoef, kValue, zValue, entryEntity, entryEntityRatio]);

  // API Verification
  const handleVerifyConnection = async () => {
    if (isConnected) {
      setIsConnected(false);
      setApiConfig(prev => ({
        ...prev,
        apiKey: '',
        apiSecret: ''
      }));
      addLog('已重置 API 连接状态并清除 API 凭证，可以进行下一轮输入', 'INFO');
      return;
    }
    if (!apiConfig.accountName) {
      addLog('验证失败: 请输入账户名称 (例如: 主账号)', 'ERROR');
      return;
    }
    if (!apiConfig.apiKey || !apiConfig.apiSecret) {
      addLog('验证失败: 请先输入 API Key 和 Secret', 'ERROR');
      return;
    }

    setIsVerifying(true);
    addLog('正在尝试连接币安永续合约服务器...', 'INFO');

    try {
      const response = await fetch('/api/binance-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: '/fapi/v2/account',
          apiKey: apiConfig.apiKey,
          apiSecret: apiConfig.apiSecret
        })
      });

      const data = await response.json();

      if (response.ok) {
        setIsConnected(true);
        fetchExchangeInfo(apiConfig.apiKey, apiConfig.apiSecret);
        
        let spotVal = 0;
        try {
          const spotResponse = await fetch('/api/binance-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              endpoint: '/api/v3/account',
              baseUrl: 'https://api.binance.com',
              apiKey: apiConfig.apiKey,
              apiSecret: apiConfig.apiSecret
            })
          });
          if (spotResponse.ok) {
            const spotData = await spotResponse.json();
            if (spotData && Array.isArray(spotData.balances)) {
              const usdtSpot = spotData.balances.find((b: any) => b.asset === 'USDT');
              if (usdtSpot) {
                spotVal = parseFloat(usdtSpot.free) + parseFloat(usdtSpot.locked);
              }
            }
          }
        } catch (spotErr) {
          console.error('Failed to fetch spot balance during validation:', spotErr);
        }

        const usdtAsset = data.assets.find((a: any) => a.asset === 'USDT');
        if (usdtAsset) {
          const futuresVal = parseFloat(usdtAsset.walletBalance);
          setBalance({
            asset: 'USDT',
            balance: spotVal + futuresVal,
            available: parseFloat(usdtAsset.availableBalance),
            unrealizedPnl: parseFloat(usdtAsset.unrealizedProfit),
            spotBalance: spotVal,
            futuresBalance: futuresVal
          });
        }

        // Auto-detect Position Mode (Hedge or One-way)
        try {
          const modeResponse = await fetch('/api/binance-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              endpoint: '/fapi/v1/positionSide/dual',
              apiKey: apiConfig.apiKey,
              apiSecret: apiConfig.apiSecret
            })
          });
          const modeData = await modeResponse.json();
          if (modeResponse.ok) {
            const isHedge = modeData.dualSidePosition; // true for Hedge, false for One-way
            setPositionMode(isHedge ? 'HEDGE' : 'ONE_WAY');
            addLog(`持仓模式已同步: ${isHedge ? '双向持仓 (Hedge)' : '单向持仓 (One-way)'}`, 'INFO');
          }
        } catch (e) {
          console.error('Failed to sync position mode');
        }

        addLog('连接成功: 币安 API 验证通过', 'SUCCESS');
        addLog(`账户余额已同步: ${usdtAsset?.walletBalance || '0'} USDT`, 'INFO');

        // Automatically save/persist the account name for easy switching later
        try {
          const saveRes = await fetch('/api/api-credentials', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accountName: apiConfig.accountName,
              baseUrl: apiConfig.baseUrl
            })
          });
          if (saveRes.ok) {
            addLog(`账户 [${apiConfig.accountName}] 已保存至账户列表中`, 'SUCCESS');
            fetchSavedApiAccounts(); // refresh dropdown list
          }
        } catch (saveErr) {
          console.error('Failed to auto-save api credentials on verification:', saveErr);
        }
      } else {
        setIsConnected(false);
        addLog(`连接失败: ${data.msg || data.error || '未知错误'}`, 'ERROR');
      }
    } catch (error) {
      addLog('网络异常: 无法连接到代理服务器', 'ERROR');
    } finally {
      setIsVerifying(false);
    }
  };

  // Fetch Balance Helper
  const handleFetchBalance = useCallback(async () => {
    if (!isConnected) return;
    try {
      // 1. Fetch futures balance
      const response = await fetch('/api/binance-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: '/fapi/v2/balance',
          apiKey: apiConfig.apiKey,
          apiSecret: apiConfig.apiSecret
        })
      });
      const data = await response.json();

      // 2. Fetch spot balance
      let spotVal = 0;
      try {
        const spotResponse = await fetch('/api/binance-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: '/api/v3/account',
            baseUrl: 'https://api.binance.com',
            apiKey: apiConfig.apiKey,
            apiSecret: apiConfig.apiSecret
          })
        });
        if (spotResponse.ok) {
          const spotData = await spotResponse.json();
          if (spotData && Array.isArray(spotData.balances)) {
            const usdtSpot = spotData.balances.find((b: any) => b.asset === 'USDT');
            if (usdtSpot) {
              spotVal = parseFloat(usdtSpot.free) + parseFloat(usdtSpot.locked);
            }
          }
        }
      } catch (spotErr) {
        // Silent catch
      }

      if (response.ok && Array.isArray(data)) {
        const usdtBalance = data.find((b: any) => b.asset === 'USDT');
        if (usdtBalance) {
          const futuresVal = parseFloat(usdtBalance.balance);
          setBalance({
            asset: 'USDT',
            balance: spotVal + futuresVal,
            available: parseFloat(usdtBalance.availableBalance),
            unrealizedPnl: parseFloat(usdtBalance.crossUnPnl),
            spotBalance: spotVal,
            futuresBalance: futuresVal
          });
        }
      }
    } catch (error) {
      // Silent fail
    }
  }, [isConnected, apiConfig.apiKey, apiConfig.apiSecret]);

  // Periodic Balance Refresh
  useEffect(() => {
    if (!isConnected) return;
    handleFetchBalance();
    const interval = setInterval(handleFetchBalance, 5000);
    return () => clearInterval(interval);
  }, [isConnected, handleFetchBalance]);

  // Handle Account Transfer (Spot <-> Futures)
  const handleTransfer = async () => {
    const amountVal = parseFloat(transferAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      addLog('[划转] 请输入合法的划转金额', 'ERROR');
      return;
    }

    // Check balances
    if (transferType === 'futures_to_spot') {
      const sourceBalance = balance.futuresBalance || 0;
      if (amountVal > sourceBalance) {
        addLog('[划转] 余额不足，转入失败', 'ERROR');
        alert('余额不足，转入失败');
        return;
      }
    } else {
      const sourceBalance = balance.spotBalance || 0;
      if (amountVal > sourceBalance) {
        addLog('[划转] 余额不足，转入失败', 'ERROR');
        alert('余额不足，转入失败');
        return;
      }
    }

    setIsTransferring(true);
    addLog(`[划转] 正在提交划转请求: ${transferType === 'futures_to_spot' ? '合约 -> 现货' : '现货 -> 合约'} ${amountVal} USDT...`, 'INFO');

    try {
      const response = await fetch('/api/binance-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'POST',
          endpoint: '/sapi/v1/asset/transfer',
          baseUrl: 'https://api.binance.com',
          apiKey: apiConfig.apiKey,
          apiSecret: apiConfig.apiSecret,
          params: {
            type: transferType === 'futures_to_spot' ? 'UMFUTURE_MAIN' : 'MAIN_UMFUTURE',
            asset: 'USDT',
            amount: amountVal.toString()
          }
        })
      });

      const data = await response.json();
      if (response.ok && (data.tranId || data.status === 'success' || data.tranId !== undefined)) {
        addLog(`[划转] 划转成功！划转金额: ${amountVal} USDT`, 'SUCCESS');
        setIsTransferModalOpen(false);
        setTransferAmount('');
        await handleFetchBalance();
      } else {
        const errMsg = data.msg || data.error || JSON.stringify(data);
        if (errMsg.includes('balance') || errMsg.includes('insufficient') || errMsg.includes('Balance')) {
          addLog('[划转] 余额不足，转入失败', 'ERROR');
          alert('余额不足，转入失败');
        } else {
          addLog(`[划转] 划转失败: ${errMsg}`, 'ERROR');
          alert(`划转失败: ${errMsg}`);
        }
      }
    } catch (err: any) {
      addLog(`[划转] 划转请求异常: ${err.message}`, 'ERROR');
      alert(`划转异常: ${err.message}`);
    } finally {
      setIsTransferring(false);
    }
  };

  const handleCancelAllOrdersRef = useRef<() => Promise<void>>(async () => {});
  const handleClosePositionRef = useRef<(id: string, currentPositions?: Position[]) => Promise<void>>(async () => {});

  useEffect(() => {
    handleCancelAllOrdersRef.current = handleCancelAllOrders;
    handleClosePositionRef.current = handleClosePosition;
  });

  // Real Position & Order Updates
  useEffect(() => {
    if (!isConnected) return;

    const fetchData = async () => {
      try {
        // Fetch Positions
        const posPromise = fetch('/api/binance-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: '/fapi/v2/positionRisk',
            apiKey: apiConfig.apiKey,
            apiSecret: apiConfig.apiSecret
          })
        });

        // Fetch Normal Orders
        const ordersPromise = fetch('/api/binance-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: '/fapi/v1/openOrders',
            apiKey: apiConfig.apiKey,
            apiSecret: apiConfig.apiSecret
          })
        });

        // Fetch Algo Orders
        const algoPromise = fetch('/api/binance-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: '/fapi/v1/openAlgoOrders',
            apiKey: apiConfig.apiKey,
            apiSecret: apiConfig.apiSecret
          })
        });

        const [posRes, ordersRes, algoRes] = await Promise.all([posPromise, ordersPromise, algoPromise]);
        
        let currentActivePositions: any[] = [];
        let mappedPositions: Position[] = [];
        
        if (posRes.ok) {
          const data = await posRes.json();
          if (Array.isArray(data)) {
            currentActivePositions = data.filter((p: any) => parseFloat(p.positionAmt) !== 0);
            mappedPositions = currentActivePositions.map((p: any) => {
              const amount = Math.abs(parseFloat(p.positionAmt));
              const entryPrice = parseFloat(p.entryPrice);
              const markPrice = parseFloat(p.markPrice);
              const pnl = parseFloat(p.unRealizedProfit);
              const pnlPercent = (pnl / (entryPrice * amount)) * 100;

              return {
                id: p.symbol + p.positionSide,
                symbol: p.symbol,
                side: parseFloat(p.positionAmt) > 0 ? 'BUY' : 'SELL',
                positionSide: p.positionSide,
                entryPrice,
                markPrice,
                amount,
                pnl,
                pnlPercent,
                timestamp: Date.now()
              };
            });
            setPositions(mappedPositions);

            // Check if any position got closed
            if (hasFetchedPositionsRef.current) {
              const prevPositions = previousActivePositionsRef.current;
              const currentIds = new Set(mappedPositions.map(p => p.id));
              const closedPositions = prevPositions.filter(p => !currentIds.has(p.id));
              if (closedPositions.length > 0) {
                addLog(`[自愈风控] 检测到持仓单平仓完成（商品: ${closedPositions.map(p => `${p.symbol} ${p.side === 'BUY' ? '多' : '空'}`).join(', ')}），立即执行遗留挂单(包括算法单与普通单)清理...`, 'SUCCESS');
                handleCancelAllOrdersRef.current();
              }
            } else {
              hasFetchedPositionsRef.current = true;
            }
            previousActivePositionsRef.current = mappedPositions;
          }
        }

        let combinedOrders: OpenOrder[] = [];

        if (ordersRes.ok) {
          const normalOrders = await ordersRes.json();
          if (Array.isArray(normalOrders)) {
            combinedOrders = [...combinedOrders, ...normalOrders.map((o: any) => ({
              id: o.orderId.toString(),
              symbol: o.symbol,
              side: o.side,
              type: o.type,
              price: parseFloat(o.price),
              stopPrice: parseFloat(o.stopPrice),
              isAlgo: false,
              time: o.time,
              positionSide: o.positionSide
            }))];
          }
        }

        if (algoRes.ok) {
          const algoData = await algoRes.json();
          const algoOrders = Array.isArray(algoData) ? algoData : (algoData.orders || algoData.algoOrders || []);
          if (Array.isArray(algoOrders)) {
            combinedOrders = [...combinedOrders, ...algoOrders.map((o: any) => ({
              id: o.algoId.toString(),
              symbol: o.symbol,
              side: o.side,
              type: o.algoType || o.type,
              price: parseFloat(o.price || 0),
              stopPrice: parseFloat(o.stopPrice || o.triggerPrice || 0),
              isAlgo: true,
              time: o.time,
              positionSide: o.positionSide
            }))];
          }
        }

        // Sort by time descending (newest first)
        const sortedOrders = combinedOrders.sort((a, b) => b.time - a.time);
        setOpenOrders(sortedOrders);

        // Always clean up the refs and states for closed positions
        const currentIds = new Set(mappedPositions.map(p => p.id));
        
        Object.keys(positionOpenTimesRef.current).forEach(id => {
          if (!currentIds.has(id)) {
            delete positionOpenTimesRef.current[id];
          }
        });

        setRiskSubmitTimes(prev => {
          const updated = { ...prev };
          let changed = false;
          Object.keys(updated).forEach(id => {
            if (!currentIds.has(id)) {
              delete updated[id];
              changed = true;
            }
          });
          return changed ? updated : prev;
        });

        // Holding Time Risk Control Lifecycle logic
        const currentActiveRisk = activeRiskRef.current;
        const currentRiskSubmitTimes = riskSubmitTimesRef.current;

        if (currentActiveRisk.timeLimitEnabled) {
          const hasActivePositions = mappedPositions.length > 0;
          const hasActiveCountdown = mappedPositions.some(pos => !!currentRiskSubmitTimes[pos.id]);

          if (!hasActivePositions) {
            setActiveRisk(prev => ({ ...prev, timeLimitEnabled: false }));
            addLog('[超时风控] 当前无活跃持仓，最大持仓时间风控已自动关闭', 'INFO');
          } else if (!hasActiveCountdown) {
            setActiveRisk(prev => ({ ...prev, timeLimitEnabled: false }));
            addLog('[超时风控] 当前持仓均处于“死斗”状态，最大持仓时间风控已自动关闭', 'INFO');
          } else {
            const now = Date.now();
            const timeLimitMinVal = parseFloat(currentActiveRisk.timeLimitMinutes as any) || 0;
            const limitMs = timeLimitMinVal * 60 * 1000;
            
            for (const pos of mappedPositions) {
              const submitTime = currentRiskSubmitTimes[pos.id];
              if (submitTime) {
                const durationMs = now - submitTime;
                if (durationMs > limitMs) {
                  addLog(`[超时风控] ${pos.symbol} 持仓时间 (${(durationMs/60000).toFixed(1)}分) 超过限制 (${timeLimitMinVal}分)，正在自动平仓...`, 'TRADE');
                  handleClosePositionRef.current(pos.id, mappedPositions);
                }
              }
            }
          }
        }

      } catch (error) {
        // Silent fail for background refresh
      }
    };

    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [isConnected, apiConfig.apiKey, apiConfig.apiSecret, isCancellingAll]);

  const handleCancelOrder = async (order: OpenOrder) => {
    if (!isConnected) return;
    
    addLog(`正在撤销委托: ${order.symbol} ${order.id}...`, 'TRADE');
    
    try {
      const endpoint = order.isAlgo ? '/fapi/v1/algoOrder' : '/fapi/v1/order';
      const params = order.isAlgo ? { algoId: order.id } : { symbol: order.symbol, orderId: order.id };
      
      const response = await fetch('/api/binance-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'DELETE',
          endpoint: endpoint,
          params: params,
          apiKey: apiConfig.apiKey,
          apiSecret: apiConfig.apiSecret
        })
      });

      const data = await response.json();
      if (response.ok) {
        addLog(`委托已撤销: ${order.symbol} ${order.id}`, 'SUCCESS');
      } else {
        addLog(`撤销失败: ${data.msg || '未知错误'}`, 'ERROR');
      }
    } catch (error) {
      addLog('网络异常: 撤销请求失败', 'ERROR');
    }
  };

  const handleCalculateContractVolume = useCallback(async () => {
    const normalizedSymbol = orderForm.symbol.trim().toUpperCase();
    if (!normalizedSymbol) {
      addLog('合约量计算失败: 请先输入合约交易对', 'ERROR');
      return;
    }

    if (isCalculatingVolume) return;
    setIsCalculatingVolume(true);
    addLog(`[合约量计算] 开始执行计算，输入币对: ${normalizedSymbol}...`, 'INFO');

    try {
      const futuresBalance = balance.futuresBalance || 0;
      // 基础合约量1 = 合约余额 * 杠杆 * (合约比例 / 100)
      const baseQty1 = futuresBalance * leverage * (futuresRatio / 100);
      addLog(`[合约量计算] 基础合约量1 = 合约余额 (${futuresBalance.toFixed(2)} USDT) * 杠杆 (${leverage}x) * 合约比例 (${futuresRatio}%) = ${baseQty1.toFixed(2)} USDT`, 'INFO');

      addLog(`[合约量计算] 正在向币安接口获取 ${normalizedSymbol} 的最近 15m K线...`, 'INFO');

      const response = await fetch('/api/binance-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'GET',
          endpoint: '/fapi/v1/klines',
          params: {
            symbol: normalizedSymbol,
            interval: '15m',
            limit: '1'
          },
          apiKey: apiConfig.apiKey,
          apiSecret: apiConfig.apiSecret
        })
      });

      if (!response.ok) {
        throw new Error(`K线获取接口返回了非 200 状态: ${response.status}`);
      }

      const klines = await response.json();
      if (!Array.isArray(klines) || klines.length === 0) {
        throw new Error('未获取到有效的 K线数据，返回值为空');
      }

      const latestKline = klines[klines.length - 1];
      // Index 7 is quote asset volume (成交额 in USDT)
      const quoteAssetVolume = parseFloat(latestKline[7]);
      
      if (isNaN(quoteAssetVolume)) {
        throw new Error(`解析 K线成交额失败，无法解析字段`);
      }

      // Calculate K-value, Z-value, and Entry Entity
      const openPrice = parseFloat(latestKline[1]);
      const highPrice = parseFloat(latestKline[2]);
      const lowPrice = parseFloat(latestKline[3]);
      const closePrice = parseFloat(latestKline[4]);

      if (isNaN(openPrice) || isNaN(highPrice) || isNaN(lowPrice) || isNaN(closePrice)) {
        throw new Error(`解析 K线 价格数据(OHLC) 失败`);
      }

      // 1. k值 = 100 * (收盘价 - 开盘价) / 开盘价
      const calcKValue = openPrice !== 0 ? (100 * (closePrice - openPrice) / openPrice) : 0;
      
      // 2. z值 = 100 * (最高价 - 最低价) / 最低价
      const calcZValue = lowPrice !== 0 ? (100 * (highPrice - lowPrice) / lowPrice) : 0;

      // 3. 进场主体 = z * (收盘价 - 最低价) / (最高价 - 最低价)
      const rangeDenom = highPrice - lowPrice;
      const ratio = rangeDenom !== 0 ? (closePrice - lowPrice) / rangeDenom : 0.5;
      const calcEntryEntity = calcZValue * ratio;

      setKValue(calcKValue);
      setZValue(calcZValue);
      setEntryEntity(calcEntryEntity);
      setEntryEntityRatio(ratio);

      addLog(`[分析] 15m K线指标计算成功: k值=${calcKValue.toFixed(4)}%, z值=${calcZValue.toFixed(4)}%, 进场主体=${calcEntryEntity.toFixed(4)}`, 'SUCCESS');

      // 基础合约量2 = 15分钟成交额 / 成交额系数
      const baseQty2 = quoteAssetVolume / turnoverCoef;
      addLog(`[合约量计算] 基础合约量2 = 15分钟成交额 (${quoteAssetVolume.toFixed(2)} USDT) / 成交额系数 (${turnoverCoef}) = ${baseQty2.toFixed(2)} USDT`, 'INFO');

      // Compare baseQty1 & baseQty2, pick min
      const finalAmount = Math.min(baseQty1, baseQty2);
      const roundedAmount = parseFloat(finalAmount.toFixed(2));

      setOrderForm(prev => ({
        ...prev,
        amount: roundedAmount
      }));

      addLog(`[合约量计算] 最终值 = min(基础合约量1: ${baseQty1.toFixed(2)}, 基础合约量2: ${baseQty2.toFixed(2)}) = ${roundedAmount} USDT，已更新至“下单数量”`, 'SUCCESS');
    } catch (err: any) {
      addLog(`[合约量计算] 获取或计算异常: ${err.message || '未知错误'}`, 'ERROR');
    } finally {
      setIsCalculatingVolume(false);
    }
  }, [orderForm.symbol, balance.futuresBalance, leverage, futuresRatio, turnoverCoef, apiConfig.apiKey, apiConfig.apiSecret, isCalculatingVolume, addLog, setKValue, setZValue, setEntryEntity, setEntryEntityRatio]);

  const handlePlaceOrder = async (direction?: 'BUY' | 'SELL') => {
    if (!isConnected) {
      addLog('下单失败: 请先验证 API 连接', 'ERROR');
      return;
    }

    const orderSide = direction || orderForm.side;
    if (direction) {
      setOrderForm(prev => ({ ...prev, side: direction }));
    }

    setIsTrading(true);
    
    // Normalize symbol: uppercase and append USDT if missing
    let normalizedSymbol = orderForm.symbol.toUpperCase().trim();
    if (normalizedSymbol && !normalizedSymbol.endsWith('USDT') && !normalizedSymbol.endsWith('BUSD')) {
      normalizedSymbol += 'USDT';
    }

    addLog(`正在获取 ${normalizedSymbol} 当前价格以计算下单数量...`, 'INFO');

    let currentPrice = 0;
    try {
      const priceRes = await fetch('/api/binance-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'GET',
          endpoint: '/fapi/v1/ticker/price',
          params: { symbol: normalizedSymbol },
          apiKey: apiConfig.apiKey,
          apiSecret: apiConfig.apiSecret
        })
      });
      const priceData = await priceRes.json();
      if (priceRes.ok && priceData.price) {
        currentPrice = parseFloat(priceData.price);
      } else {
        addLog(`获取价格失败: ${priceData.msg || '未知错误'}`, 'ERROR');
        setIsTrading(false);
        return;
      }
    } catch (error) {
      addLog('获取价格异常', 'ERROR');
      setIsTrading(false);
      return;
    }

    const calculatedQty = orderForm.amount / currentPrice;
    const formattedQty = formatQty(normalizedSymbol, calculatedQty);

    if (parseFloat(formattedQty) <= 0) {
      addLog(`下单数量太小: ${orderForm.amount} USDT 不足以购买最小单位 of ${normalizedSymbol}`, 'ERROR');
      setIsTrading(false);
      return;
    }

    // Determine positionSide based on mode
    let positionSide = 'BOTH';
    if (positionMode === 'HEDGE') {
      positionSide = orderSide === 'BUY' ? 'LONG' : 'SHORT';
    }

    // 1. 自动并在下单前，同步合约杠杆倍数至币安终端，避免实盘和系统设置的杠杆不一致导致保证金不足
    try {
      addLog(`正在同步 ${normalizedSymbol} 的合约杠杆倍数至 ${leverage}x...`, 'INFO');
      const levResponse = await fetch('/api/binance-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'POST',
          endpoint: '/fapi/v1/leverage',
          params: {
            symbol: normalizedSymbol,
            leverage: leverage
          },
          apiKey: apiConfig.apiKey,
          apiSecret: apiConfig.apiSecret
        })
      });
      const levData = await levResponse.json();
      if (levResponse.ok) {
        addLog(`成功同步合约杠杆为: ${leverage}x`, 'SUCCESS');
      } else {
        addLog(`同步杠杆失败: ${levData.msg || '无法更改，实盘可能已达该币种杠杆上限或有未平仓位阻碍'}`, 'WARNING');
      }
    } catch (err: any) {
      console.warn('Failed to sync leverage with Binance:', err);
    }

    addLog(`正在发送 ${orderSide} 订单: ${orderForm.amount} USDT ≈ ${formattedQty} ${normalizedSymbol} (价格: ${currentPrice})...`, 'TRADE');

    try {
      const response = await fetch('/api/binance-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'POST',
          endpoint: '/fapi/v1/order',
          params: {
            symbol: normalizedSymbol,
            side: orderSide,
            type: orderForm.type,
            quantity: formattedQty,
            positionSide: positionSide,
          },
          apiKey: apiConfig.apiKey,
          apiSecret: apiConfig.apiSecret
        })
      });

      const data = await response.json();

      if (response.ok) {
        addLog(`订单成交: ${orderSide} ${formattedQty} ${normalizedSymbol} (约 ${orderForm.amount} USDT) @ ${data.avgPrice || '市价'}`, 'SUCCESS');
      } else {
        let errorMsg = data.msg || data.error || '未知错误';
        if (typeof errorMsg === 'string') {
          if (errorMsg.includes('Precision')) {
            errorMsg += ' (请尝试减少下单数量的小数位数)';
          }
          if (errorMsg.includes('position side')) {
            errorMsg += ' (请检查持仓模式设置是否与币安账户一致)';
          }
          if (errorMsg.includes('Margin is insufficient') || errorMsg.includes('insufficient margin') || errorMsg.includes('Margin') || errorMsg.includes('insufficient')) {
            errorMsg += ` (可用保证金不足！当前系统杠杆为 ${leverage}x。请检查币安账户实际划转的可用资金，或尝试在前置“风控配置”/“交易配置”中调大杠杆倍数、调低“合约比例”/“成交额系数”以自动减小下单金额，或直接手动调低“下单数量”)`;
          }
        }
        addLog(`下单失败: ${errorMsg}`, 'ERROR');
      }
    } catch (error) {
      addLog('网络异常: 下单请求失败', 'ERROR');
    } finally {
      setIsTrading(false);
    }
  };

  const handleClosePosition = async (id: string, currentPositions?: Position[]) => {
    const targetPositions = currentPositions || positions;
    const pos = targetPositions.find(p => p.id === id);
    if (!pos) return;

    addLog(`正在市价平仓: ${pos.symbol} ${pos.side}...`, 'TRADE');

    // Use the EXACT positionSide returned by the API for this position
    const positionSide = pos.positionSide;

    // Fix: Only send reduceOnly in ONE_WAY mode (when positionSide is BOTH)
    const orderParams: any = {
      symbol: pos.symbol,
      side: pos.side === 'BUY' ? 'SELL' : 'BUY',
      type: 'MARKET',
      quantity: formatQty(pos.symbol, pos.amount),
      positionSide: positionSide,
    };

    if (positionSide === 'BOTH') {
      orderParams.reduceOnly = 'true';
    }

    try {
      const response = await fetch('/api/binance-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'POST',
          endpoint: '/fapi/v1/order',
          params: orderParams,
          apiKey: apiConfig.apiKey,
          apiSecret: apiConfig.apiSecret
        })
      });

      const data = await response.json();

      if (response.ok) {
        const avgPrice = parseFloat(data.avgPrice || '0');
        addLog(`持仓已平: ${pos.symbol} 平仓价: ${avgPrice || '市价'}`, 'SUCCESS');
        
        // --- 撤单流程第一步：撤销普通挂单 ---
        addLog(`[系统] 正在执行撤单流程第一步：撤销 ${pos.symbol} 的普通挂单...`, 'INFO');
        try {
          const cancelResponse = await fetch('/api/binance-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              method: 'DELETE',
              endpoint: '/fapi/v1/allOpenOrders',
              params: { symbol: pos.symbol },
              apiKey: apiConfig.apiKey,
              apiSecret: apiConfig.apiSecret
            })
          });
          const cancelData = await cancelResponse.json();
          if (cancelResponse.ok) {
            addLog(`[系统] 第一步完成：${pos.symbol} 普通挂单已全部撤销`, 'SUCCESS');
          } else {
            addLog(`[系统] 第一步警告：普通挂单撤销异常 - ${cancelData.msg || '未知错误'}`, 'INFO');
          }
        } catch (e) {
          addLog(`[系统] 第一步失败：撤销普通挂单请求异常`, 'ERROR');
        }

        // --- 撤单流程第二步：独立处理算法接口挂单 ---
        addLog(`[系统] 正在执行撤单流程第二步：撤销算法单...`, 'INFO');
        try {
          const algoEndpoint = '/fapi/v1/openAlgoOrders';
          const response = await fetch('/api/binance-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              method: 'GET',
              endpoint: algoEndpoint,
              params: { symbol: pos.symbol },
              baseUrl: apiConfig.baseUrl || "https://fapi-gcp.binance.com",
              apiKey: apiConfig.apiKey,
              apiSecret: apiConfig.apiSecret
            })
          });

          if (response.ok) {
            const algoData = await response.json();
            const allOrders = Array.isArray(algoData) ? algoData : (algoData.orders || algoData.algoOrders || []);
            
            if (allOrders.length > 0) {
              addLog(`[系统] 发现 ${allOrders.length} 个活跃算法单，正在逐一撤销...`, 'INFO');
              
              for (const order of allOrders) {
                // 打印订单详情以便调试（仅第一个）
                if (order === allOrders[0]) {
                  addLog(`[调试] 订单详情: ID=${order.algoId}, 状态=${order.orderStatus || order.status}, 类型=${order.algoType}`, 'INFO');
                }

                const delResponse = await fetch('/api/binance-proxy', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    method: 'DELETE',
                    endpoint: '/fapi/v1/algoOrder',
                    params: { algoId: order.algoId },
                    baseUrl: apiConfig.baseUrl || "https://fapi-gcp.binance.com",
                    apiKey: apiConfig.apiKey,
                    apiSecret: apiConfig.apiSecret
                  })
                });

                const delResult = await delResponse.json();
                if (delResponse.ok) {
                  addLog(`[系统] 算法单 ${order.algoId} 撤销成功`, 'SUCCESS');
                } else {
                  addLog(`[系统] 算法单 ${order.algoId} 撤销失败: ${JSON.stringify(delResult)}`, 'ERROR');
                }
              }
            } else {
              addLog(`[系统] 未发现活跃算法单，无需撤销。`, 'INFO');
            }
          } else {
            addLog(`[系统] 获取算法单列表失败 (状态码: ${response.status})`, 'ERROR');
          }
        } catch (e: any) {
          addLog(`[系统] 撤销算法单异常: ${e.message}`, 'ERROR');
        }

        // 每次检查到有平仓操作，立即调起全局挂单清理
        addLog(`[全局清理] 正在自动清理所有币对的遗留挂单...`, 'INFO');
        handleCancelAllOrders();
      } else {
        addLog(`平仓失败: ${data.msg || data.error || '未知错误'}`, 'ERROR');
      }
    } catch (error) {
      addLog('网络异常: 平仓请求失败', 'ERROR');
    }
  };

  const handleActiveRiskSubmit = async () => {
    if (!isConnected) {
      addLog('主动风控失败: API 未连接', 'ERROR');
      return;
    }

    if (positions.length === 0) {
      addLog('主动风控: 当前无活跃持仓，无需提交', 'INFO');
      return;
    }

    setIsRiskProcessing(true);
    addLog(`[主动风控] 开始处理 ${positions.length} 个持仓的云端挂单...`, 'INFO');

    // Record risk submit time for current positions to trigger countdowns
    const nowSubmit = Date.now();
    setRiskSubmitTimes(prev => {
      const updated = { ...prev };
      positions.forEach(pos => {
        updated[pos.id] = nowSubmit;
      });
      return updated;
    });

    try {
      for (const pos of positions) {
        const direction = pos.side === 'BUY' ? '多单 (LONG)' : '空单 (SHORT)';
        addLog(`[主动风控] 检测到 ${pos.symbol} 为${direction}，正在检查挂单...`, 'INFO');
        
        // 1. Get open orders for this symbol
        const ordersResponse = await fetch('/api/binance-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: '/fapi/v1/openOrders',
            params: { symbol: pos.symbol },
            apiKey: apiConfig.apiKey,
            apiSecret: apiConfig.apiSecret
          })
        });
        
        if (!ordersResponse.ok) {
          const err = await ordersResponse.json();
          addLog(`[主动风控] 获取 ${pos.symbol} 挂单失败: ${err.msg || '未知错误'}`, 'ERROR');
          continue;
        }

        const openOrders = await ordersResponse.json();
        
        // 2. Check for existing TP/SL
        const closingSide = pos.side === 'BUY' ? 'SELL' : 'BUY';
        
        const hasTP = openOrders.some((o: any) => 
          (o.type === 'TAKE_PROFIT_MARKET' || o.type === 'TAKE_PROFIT' || o.type === 'LIMIT') && 
          o.positionSide === pos.positionSide &&
          o.side === closingSide
        );
        const hasSL = openOrders.some((o: any) => 
          (o.type === 'STOP_MARKET' || o.type === 'STOP') && 
          o.positionSide === pos.positionSide &&
          o.side === closingSide
        );

        if (hasTP && hasSL) {
          addLog(`[主动风控] ${pos.symbol} 已存在止盈和止损挂单，跳过`, 'INFO');
          continue;
        }

        const side = pos.side === 'BUY' ? 'SELL' : 'BUY';

        const currentTp = parseFloat(activeRisk.tp as any) || 0;
        const currentSl = parseFloat(activeRisk.sl as any) || 0;

        const tpPrice = pos.side === 'BUY' 
          ? pos.entryPrice * (1 + currentTp / 100)
          : pos.entryPrice * (1 - currentTp / 100);
        
        const slPrice = pos.side === 'BUY'
          ? pos.entryPrice * (1 - currentSl / 100)
          : pos.entryPrice * (1 + currentSl / 100);

        // 4. Submit missing TP/SL
        if (!hasTP || !hasSL) {
          const missingTypes = [];
          if (!hasTP) missingTypes.push('止盈');
          if (!hasSL) missingTypes.push('止损');
          
          addLog(`[主动风控] ${pos.symbol} 缺失 ${missingTypes.join('和')}，正在处理...`, 'TRADE');
          
          // TP Logic: Use Standard LIMIT Order (Maker) to save fees
          if (!hasTP && currentTp > 0) {
            const placeLimitTP = async () => {
              const orderParams: any = {
                symbol: pos.symbol,
                side: side,
                positionSide: pos.positionSide,
                type: 'LIMIT',
                price: formatPrice(pos.symbol, tpPrice),
                quantity: formatQty(pos.symbol, Math.abs(pos.amount)),
                timeInForce: 'GTC',
              };
              if (pos.positionSide === 'BOTH') orderParams.reduceOnly = 'true';

              const response = await fetch('/api/binance-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  method: 'POST',
                  endpoint: '/fapi/v1/order',
                  params: orderParams,
                  apiKey: apiConfig.apiKey,
                  apiSecret: apiConfig.apiSecret
                })
              });
              return await response.json();
            };

            const limitRes = await placeLimitTP();
            if (limitRes.orderId) {
              addLog(`[主动风控] ${pos.symbol} 止盈限价单挂单成功 (Maker模式)`, 'SUCCESS');
            } else {
              addLog(`[主动风控] ${pos.symbol} 止盈限价单挂单失败: ${limitRes.msg || '未知错误'}`, 'ERROR');
            }
          }

          // SL Logic: Use Algo Order (CONDITIONAL) for safety
          if (!hasSL && currentSl > 0) {
            const submitAlgoSL = async () => {
              const currentPrice = pos.markPrice;
              const isLong = pos.side === 'BUY';
              
              // Validate price logic
              if ((isLong && slPrice >= currentPrice) || (!isLong && slPrice <= currentPrice)) {
                return { ok: false, msg: `止损价不符合逻辑 (现价:${currentPrice} 止损:${formatPrice(pos.symbol, slPrice)})` };
              }

              const p: any = {
                symbol: pos.symbol,
                side: side,
                positionSide: pos.positionSide,
                quantity: formatQty(pos.symbol, Math.abs(pos.amount)),
                workingType: 'MARK_PRICE',
                stopPrice: formatPrice(pos.symbol, slPrice),
                triggerPrice: formatPrice(pos.symbol, slPrice),
                algoType: 'CONDITIONAL',
                type: 'STOP_MARKET'
              };
              
              const bUrl = apiConfig.baseUrl || "https://fapi-gcp.binance.com";
              const ep = "/fapi/v1/algoOrder";
              
              const response = await fetch('/api/binance-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  method: 'POST',
                  endpoint: ep,
                  baseUrl: bUrl,
                  params: p,
                  apiKey: apiConfig.apiKey,
                  apiSecret: apiConfig.apiSecret
                })
              });
              
              const data = await response.json();
              return { ok: response.ok, data };
            };

            const slResult: any = await submitAlgoSL();
            if (slResult.ok) {
              addLog(`[主动风控] ${pos.symbol} 算法止损挂单成功 (CONDITIONAL)`, 'SUCCESS');
            } else {
              const errMsg = slResult.data?.msg || slResult.msg || JSON.stringify(slResult.data);
              addLog(`[主动风控] ${pos.symbol} 算法止损失败: ${errMsg}，尝试标准止损兜底...`, 'INFO');
              
              // Fallback to STOP (Stop Limit)
              const placeStopSL = async () => {
                const isLong = pos.side === 'BUY';
                const limitPrice = isLong ? slPrice * 0.99 : slPrice * 1.01; 
                
                const orderParams: any = {
                  symbol: pos.symbol,
                  side: side,
                  positionSide: pos.positionSide,
                  type: 'STOP',
                  stopPrice: formatPrice(pos.symbol, slPrice),
                  price: formatPrice(pos.symbol, limitPrice),
                  quantity: formatQty(pos.symbol, Math.abs(pos.amount)),
                  workingType: 'MARK_PRICE',
                  timeInForce: 'GTC'
                };
                if (pos.positionSide === 'BOTH') orderParams.reduceOnly = 'true';

                const response = await fetch('/api/binance-proxy', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    method: 'POST',
                    endpoint: '/fapi/v1/order',
                    params: orderParams,
                    apiKey: apiConfig.apiKey,
                    apiSecret: apiConfig.apiSecret
                  })
                });
                
                const contentType = response.headers.get("content-type");
                if (contentType && contentType.includes("application/json")) {
                  return await response.json();
                } else {
                  const text = await response.text();
                  return { msg: "非JSON响应", details: text.substring(0, 100) };
                }
              };

              const stopRes = await placeStopSL();
              if (stopRes.orderId) {
                addLog(`[主动风控] ${pos.symbol} 止损挂单成功 (标准止损模式)`, 'SUCCESS');
              } else {
                addLog(`[主动风控] ${pos.symbol} 止损最终失败: ${stopRes.msg || '未知错误'}`, 'ERROR');
              }
            }
          }
        }
      }
      addLog('[主动风控] 所有持仓处理完毕', 'SUCCESS');
    } catch (error) {
      addLog(`[主动风控] 执行过程中出现异常: ${error instanceof Error ? error.message : '未知错误'}`, 'ERROR');
    } finally {
      setIsRiskProcessing(false);
    }
  };

  const handleCancelAllOrders = async () => {
    if (!isConnected) {
      addLog('撤销失败: API 未连接', 'ERROR');
      return;
    }

    setIsCancellingAll(true);
    setRiskSubmitTimes({});
    addLog('[一键撤销] 开始执行撤销流程...', 'INFO');

    try {
      // 第一步：查找并撤销普通委托
      addLog('[一键撤销] 第一步：正在获取普通委托单...', 'INFO');
      const response = await fetch('/api/binance-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'GET',
          endpoint: '/fapi/v1/openOrders',
          apiKey: apiConfig.apiKey,
          apiSecret: apiConfig.apiSecret
        })
      });

      if (!response.ok) {
        const err = await response.json();
        addLog(`[一键撤销] 获取普通委托单失败: ${err.msg || '未知错误'}`, 'ERROR');
      } else {
        const normalOrders = await response.json();
        if (normalOrders.length > 0) {
          addLog(`[一键撤销] 发现 ${normalOrders.length} 个普通委托单，正在撤销...`, 'INFO');
          for (const order of normalOrders) {
            await fetch('/api/binance-proxy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                method: 'DELETE',
                endpoint: '/fapi/v1/order',
                params: { symbol: order.symbol, orderId: order.orderId },
                apiKey: apiConfig.apiKey,
                apiSecret: apiConfig.apiSecret
              })
            });
          }
          addLog(`[一键撤销] 第一步完成：${normalOrders.length} 个普通委托单已撤销`, 'SUCCESS');
        } else {
          addLog('[一键撤销] 第一步：当前无普通委托单', 'INFO');
        }
      }

      // 第二步：查找并撤销算法委托单
      addLog('[一键撤销] 第二步：正在获取算法委托单...', 'INFO');
      const algoResponse = await fetch('/api/binance-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'GET',
          endpoint: '/fapi/v1/openAlgoOrders',
          apiKey: apiConfig.apiKey,
          apiSecret: apiConfig.apiSecret
        })
      });

      if (!algoResponse.ok) {
        const err = await algoResponse.json();
        addLog(`[一键撤销] 获取算法委托单失败: ${err.msg || '未知错误'}`, 'ERROR');
      } else {
        const algoData = await algoResponse.json();
        // 兼容不同的返回格式
        const algoOrders = Array.isArray(algoData) ? algoData : (algoData.orders || algoData.algoOrders || []);
        
        if (algoOrders.length > 0) {
          addLog(`[一键撤销] 发现 ${algoOrders.length} 个算法委托单，正在撤销...`, 'INFO');
          for (const order of algoOrders) {
            await fetch('/api/binance-proxy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                method: 'DELETE',
                endpoint: '/fapi/v1/algoOrder',
                params: { algoId: order.algoId },
                apiKey: apiConfig.apiKey,
                apiSecret: apiConfig.apiSecret
              })
            });
          }
          addLog(`[一键撤销] 第二步完成：${algoOrders.length} 个算法委托单已撤销`, 'SUCCESS');
        } else {
          addLog('[一键撤销] 第二步：当前无算法委托单', 'INFO');
        }
      }

      addLog('[一键撤销] 流程全部完成', 'SUCCESS');
    } catch (error) {
      addLog(`[一键撤销] 流程异常中断: ${error instanceof Error ? error.message : '未知错误'}`, 'ERROR');
    } finally {
      setIsCancellingAll(false);
    }
  };

  const exportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(positionHistory.map(h => ({
      '合约名称': h.symbol,
      '订单类型': h.side === 'BUY' ? '多单' : '空单',
      '账户': h.account || '默认账户',
      '总盈亏': h.pnl.toFixed(4),
      '成交盈亏': h.tradePnl.toFixed(4),
      '手续费': h.commission.toFixed(4),
      '资金费': h.fundingFee.toFixed(4),
      '收益率': (h.entryPrice * h.amount) > 0 ? `${((h.pnl / (h.entryPrice * h.amount)) * 100).toFixed(3)}%` : '0.000%',
      '开仓时间': new Date(h.openTime).toLocaleString(),
      '最后平仓时间': new Date(h.closeTime).toLocaleString(),
      '数量': h.amount
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "仓位历史记录");
    XLSX.writeFile(wb, `PositionHistory_${new Date().getTime()}.xlsx`);
  };

  const fetchHistoryFromBinance = async () => {
    if (!isConnected) {
      addLog('获取历史失败: API 未连接', 'ERROR');
      return;
    }

    const activeAccount = apiConfig.accountName || '';
    if (!activeAccount) {
      addLog('获取历史失败: 请先在币安 API 配置板块录入账户名', 'ERROR');
      return;
    }

    setIsFetchingHistory(true);
    setSyncProgress({ current: 0, total: 0, stage: '正在查询本地数据库时间范围...' });

    try {
      // 1. Get existing history for this account from DB
      const localRes = await fetch(`/api/position-history?account=${encodeURIComponent(activeAccount)}`);
      if (!localRes.ok) throw new Error('Failed to fetch local history');
      const localHistory: PositionHistory[] = await localRes.json();

      const requestedStartTime = new Date(dateRange.start + 'T00:00:00').getTime();
      const requestedEndTime = new Date(dateRange.end + 'T23:59:59.999').getTime();

      // Compute missing ranges
      const missingRanges: { startTime: number, endTime: number }[] = [];
      if (localHistory.length === 0) {
        missingRanges.push({ startTime: requestedStartTime, endTime: requestedEndTime });
      } else {
        const minLocalTime = Math.min(...localHistory.map(h => h.openTime));
        const maxLocalTime = Math.max(...localHistory.map(h => h.closeTime));

        if (requestedStartTime < minLocalTime) {
          missingRanges.push({ startTime: requestedStartTime, endTime: minLocalTime - 1 });
        }
        if (requestedEndTime > maxLocalTime) {
          missingRanges.push({ startTime: maxLocalTime + 1, endTime: requestedEndTime });
        }
      }

      const binanceRequestWithRetry = async (
        endpoint: string,
        params: any,
        method: string = 'GET',
        maxRetries = 4,
        initialDelay = 1500
      ): Promise<any> => {
        let attempt = 0;
        while (true) {
          try {
            const response = await fetch('/api/binance-proxy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                method,
                endpoint,
                params,
                apiKey: apiConfig.apiKey,
                apiSecret: apiConfig.apiSecret
              })
            });

            const data = await response.json();

            if (response.status === 429 || response.status === 418 || (data && data.code === -1003)) {
              attempt++;
              if (attempt >= maxRetries) {
                return { ok: false, status: response.status, data };
              }
              
              const delay = initialDelay * Math.pow(2, attempt - 1) + Math.random() * 500;
              addLog(`[防限速避让] 触发币安接口频限. 正在自动进行第 ${attempt}/${maxRetries} 次指数避退并重试，延迟 ${Math.round(delay)}ms...`, 'INFO');
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            }

            return { ok: response.ok, status: response.status, data };
          } catch (error) {
            attempt++;
            if (attempt >= maxRetries) {
              throw error;
            }
            const delay = initialDelay * Math.pow(2, attempt - 1);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      };

      if (missingRanges.length === 0) {
        addLog(`💡 优先本地检索：所选账号 [${activeAccount}] 请求时间段的数据已完全包含在本地数据库中！本次直接极速展示本地存储对账记录，已大幅节省币安接口调用。`, 'SUCCESS');
        // Filter local history to the requested date range and set state
        const filteredLocal = localHistory.filter(h => h.openTime >= requestedStartTime && h.closeTime <= requestedEndTime);
        setPositionHistory(filteredLocal);
        setIsFetchingHistory(false);
        return;
      }

      // We have missing ranges! Let's fetch them from Binance and supplement the local DB
      let activePositions: { symbol: string, side: 'BUY' | 'SELL', amount: number }[] = [];
      try {
        const posResponse = await fetch('/api/binance-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: '/fapi/v2/positionRisk',
            apiKey: apiConfig.apiKey,
            apiSecret: apiConfig.apiSecret
          })
        });
        if (posResponse.ok) {
          const posData = await posResponse.json();
          if (Array.isArray(posData)) {
            activePositions = posData
              .filter((p: any) => parseFloat(p.positionAmt) !== 0)
              .map((p: any) => ({
                symbol: p.symbol.toUpperCase(),
                side: parseFloat(p.positionAmt) > 0 ? 'BUY' : 'SELL',
                amount: Math.abs(parseFloat(p.positionAmt))
              }));
          }
        }
      } catch (err) {
        console.error('获取持仓失败:', err);
      }

      if (activePositions.length > 0) {
        const details = activePositions.map(p => `${p.symbol} (${p.side === 'BUY' ? '做多' : '做空'} ${p.amount})`).join(', ');
        addLog(`当前存在活跃持仓: ${details}。生成历史闭环仓位时，将自动精准剔除这些持仓最近的开仓成交数据。`, 'INFO');
      } else {
        addLog(`当前无活跃持仓，将完整分析并闭环缺失区段的全部历史成交。`, 'INFO');
      }

      let allNewMatchedHistory: PositionHistory[] = [];

      for (const range of missingRanges) {
        addLog(`正在从币安拉取缺失时间段的流水 [时间: ${new Date(range.startTime).toLocaleDateString()} 至 ${new Date(range.endTime).toLocaleDateString()}]...`, 'INFO');
        
        const startTime = range.startTime;
        const endTime = range.endTime;

        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        let allIncome: any[] = [];
        let currentStart = startTime;

        // 2. 获取收入记录
        while (currentStart < endTime) {
          let currentEnd = Math.min(currentStart + SEVEN_DAYS_MS, endTime);
          let fetchStart = currentStart;
          let fetchEnd = currentEnd;

          while (fetchStart < fetchEnd) {
            setSyncProgress({
              current: 0,
              total: 0,
              stage: `正在获取缺失区间收入流水 [${new Date(fetchStart).toLocaleDateString()} - ${new Date(fetchEnd).toLocaleDateString()}]...`
            });

            const res = await binanceRequestWithRetry('/fapi/v1/income', {
              startTime: fetchStart,
              endTime: fetchEnd,
              limit: 1000
            });

            if (!res.ok || !Array.isArray(res.data)) {
              const errMsg = res.data && res.data.msg ? res.data.msg : '未知错误';
              addLog(`获取收入历史失败 [${new Date(fetchStart).toLocaleDateString()} - ${new Date(fetchEnd).toLocaleDateString()}]: ${errMsg}`, 'ERROR');
              setIsFetchingHistory(false);
              return;
            }

            const income = res.data;
            if (income.length === 0) break;

            allIncome = [...allIncome, ...income];
            if (income.length < 1000) break;

            const maxTime = Math.max(...income.map(i => i.time));
            if (maxTime >= fetchEnd) break;
            fetchStart = maxTime <= fetchStart ? fetchStart + 1 : maxTime + 1;

            if (rateLimitDelay > 0) {
              await new Promise(resolve => setTimeout(resolve, rateLimitDelay));
            }
          }
          currentStart = currentEnd + 1;
        }

        // Extract active symbols for this segment
        const activeSymbolsSet = new Set(allIncome
          .filter(i => i.incomeType === 'REALIZED_PNL' || i.incomeType === 'COMMISSION')
          .map(i => i.symbol.toUpperCase())
        );
        activePositions.forEach(p => activeSymbolsSet.add(p.symbol));
        const activeSymbols = Array.from(activeSymbolsSet);

        if (activeSymbols.length === 0) {
          continue; // No trade activity in this segment, skip to next missing range
        }

        addLog(`发现缺失区间内存在 ${activeSymbols.length} 个活跃合约，正在抓取详细成交记录进行平仓配对...`, 'INFO');

        // 3. fetch detailed trades
        let allTrades: any[] = [];
        let symbolIndex = 0;
        for (const symbol of activeSymbols) {
          symbolIndex++;
          let chunkStart = startTime;
          while (chunkStart <= endTime) {
            let chunkEnd = Math.min(chunkStart + SEVEN_DAYS_MS - 1, endTime);
            let fetchStart = chunkStart;

            setSyncProgress({
              current: symbolIndex,
              total: activeSymbols.length,
              stage: `正在抓取 [${symbol}] 数据 [${new Date(chunkStart).toLocaleDateString()} - ${new Date(chunkEnd).toLocaleDateString()}] (${symbolIndex}/${activeSymbols.length})`
            });

            while (fetchStart <= chunkEnd) {
              const res = await binanceRequestWithRetry('/fapi/v1/userTrades', {
                symbol,
                startTime: fetchStart,
                endTime: chunkEnd,
                limit: 1000
              });

              if (!res.ok || !Array.isArray(res.data)) {
                break;
              }

              const trades = res.data;
              if (trades.length === 0) break;

              allTrades = [...allTrades, ...trades];
              if (trades.length < 1000) break;

              const maxTime = Math.max(...trades.map(t => t.time));
              fetchStart = maxTime <= fetchStart ? fetchStart + 1 : maxTime + 1;

              if (rateLimitDelay > 0) {
                await new Promise(resolve => setTimeout(resolve, rateLimitDelay));
              }
            }
            chunkStart = chunkEnd + 1;
            if (rateLimitDelay > 0) {
              await new Promise(resolve => setTimeout(resolve, rateLimitDelay));
            }
          }
        }

        if (allTrades.length > 0) {
          // De-duplicate and sort
          const uniqueTrades = Array.from(new Map(allTrades.map(t => [t.id, t])).values())
            .sort((a, b) => a.time - b.time);

          // Exclude active open positions
          if (activePositions.length > 0) {
            activePositions.forEach(activePos => {
              const sym = activePos.symbol;
              const sideToExclude = activePos.side;
              let remainingQtyToExclude = activePos.amount;

              for (let i = uniqueTrades.length - 1; i >= 0; i--) {
                if (remainingQtyToExclude <= 1e-8) break;
                const t = uniqueTrades[i];
                if (t.symbol.toUpperCase() === sym && t.side === sideToExclude) {
                  const qty = parseFloat(t.qty);
                  if (qty <= remainingQtyToExclude + 1e-8) {
                    t.exclude = true;
                    remainingQtyToExclude -= qty;
                  } else {
                    t.qty = (qty - remainingQtyToExclude).toString();
                    remainingQtyToExclude = 0;
                  }
                }
              }
            });
          }

          const filteredTrades = uniqueTrades.filter(t => !t.exclude);

          // 3s interval merge
          const mergedTrades: any[] = [];
          const aggregateGroup = (group: any[]): any => {
            if (group.length === 1) return group[0];
            let totalQty = 0;
            let totalCost = 0;
            let totalPnl = 0;
            let totalCommission = 0;

            group.forEach(g => {
              const q = parseFloat(g.qty);
              totalQty += q;
              totalCost += parseFloat(g.price) * q;
              totalPnl += parseFloat(g.realizedPnl || '0');
              totalCommission += parseFloat(g.commission || '0');
            });

            const avgPrice = totalQty > 0 ? totalCost / totalQty : 0;
            return {
              ...group[0],
              qty: totalQty.toString(),
              price: avgPrice.toString(),
              realizedPnl: totalPnl.toString(),
              commission: totalCommission.toString(),
              time: group[0].time,
              id: group.map(g => g.id).join('_'),
            };
          };

          if (filteredTrades.length > 0) {
            let currentGroup: any[] = [filteredTrades[0]];
            for (let i = 1; i < filteredTrades.length; i++) {
              const current = filteredTrades[i];
              const lastInGroup = currentGroup[currentGroup.length - 1];

              const sameSymbol = current.symbol === lastInGroup.symbol;
              const sameSide = current.side === lastInGroup.side;
              const withinThreeSecs = (current.time - lastInGroup.time) <= 3000;

              if (sameSymbol && sameSide && withinThreeSecs) {
                currentGroup.push(current);
              } else {
                mergedTrades.push(aggregateGroup(currentGroup));
                currentGroup = [current];
              }
            }
            if (currentGroup.length > 0) {
              mergedTrades.push(aggregateGroup(currentGroup));
            }
          }

          // Group by symbol
          const groupedTrades: { [key: string]: any[] } = {};
          mergedTrades.forEach(t => {
            if (!groupedTrades[t.symbol]) groupedTrades[t.symbol] = [];
            groupedTrades[t.symbol].push(t);
          });

          const segmentMatchedHistory: PositionHistory[] = [];
          const EPSILON = 0.00000001;

          Object.keys(groupedTrades).forEach(symbol => {
            const trades = groupedTrades[symbol];
            const parsedTrades = trades.map(t => ({
              ...t,
              remainingQty: parseFloat(t.qty),
              originalQty: parseFloat(t.qty),
              commissionVal: parseFloat(t.commission || '0'),
              realizedPnlVal: parseFloat(t.realizedPnl || '0'),
            }));

            for (let i = parsedTrades.length - 1; i >= 0; i--) {
              const closeTrade = parsedTrades[i];
              if (closeTrade.remainingQty < EPSILON) continue;

              const closeSide = closeTrade.side;
              const openSide = closeSide === 'BUY' ? 'SELL' : 'BUY';

              const matchedCloseTrades: any[] = [];
              const matchedOpenTrades: any[] = [];
              let qtyToMatch = closeTrade.remainingQty;

              matchedCloseTrades.push({ trade: closeTrade, qty: qtyToMatch });
              closeTrade.remainingQty = 0;

              for (let j = i - 1; j >= 0; j--) {
                if (qtyToMatch < EPSILON) break;
                const openTrade = parsedTrades[j];
                if (openTrade.side === openSide && openTrade.remainingQty > EPSILON) {
                  const takeQty = Math.min(qtyToMatch, openTrade.remainingQty);
                  matchedOpenTrades.push({ trade: openTrade, qty: takeQty });
                  openTrade.remainingQty -= takeQty;
                  qtyToMatch -= takeQty;
                }
              }

              if (matchedOpenTrades.length > 0) {
                let sumCommission = 0;
                let sumRealizedPnl = 0;
                let openCost = 0;
                let openQty = 0;
                let closeRevenue = 0;
                let closeQty = 0;
                let earliestOpenTime = Infinity;
                let latestCloseTime = -Infinity;

                matchedOpenTrades.forEach(m => {
                  const fraction = m.qty / m.trade.originalQty;
                  sumCommission += m.trade.commissionVal * fraction;
                  sumRealizedPnl += m.trade.realizedPnlVal * fraction;
                  openQty += m.qty;
                  openCost += parseFloat(m.trade.price) * m.qty;
                  earliestOpenTime = Math.min(earliestOpenTime, m.trade.time);
                });

                matchedCloseTrades.forEach(m => {
                  const fraction = m.qty / m.trade.originalQty;
                  sumCommission += m.trade.commissionVal * fraction;
                  sumRealizedPnl += m.trade.realizedPnlVal * fraction;
                  closeQty += m.qty;
                  closeRevenue += parseFloat(m.trade.price) * m.qty;
                  latestCloseTime = Math.max(latestCloseTime, m.trade.time);
                });

                const entryPrice = openQty > 0 ? openCost / openQty : 0;
                const exitPrice = closeQty > 0 ? closeRevenue / closeQty : 0;

                const posIncome = allIncome.filter(inc => 
                  inc.symbol.toUpperCase() === symbol.toUpperCase() && 
                  inc.time >= earliestOpenTime - 5000 && 
                  inc.time <= latestCloseTime + 5000
                );

                const fundingFee = posIncome
                  .filter(inc => inc.incomeType === 'FUNDING_FEE')
                  .reduce((sum, inc) => sum + parseFloat(inc.income), 0);

                const finalPnl = sumRealizedPnl - sumCommission + fundingFee;

                segmentMatchedHistory.push({
                  id: activeAccount + '_' + closeTrade.id + '_' + matchedOpenTrades.map(o => o.trade.id).join('_'),
                  symbol: symbol,
                  side: openSide,
                  positionSide: closeTrade.positionSide || (openSide === 'BUY' ? 'LONG' : 'SHORT'),
                  entryPrice: entryPrice,
                  exitPrice: exitPrice,
                  amount: openQty,
                  tradePnl: sumRealizedPnl,
                  commission: sumCommission,
                  fundingFee: fundingFee,
                  pnl: finalPnl,
                  pnlPercent: 0,
                  openTime: earliestOpenTime,
                  closeTime: latestCloseTime,
                  timestamp: latestCloseTime,
                  account: activeAccount
                });
              }
            }
          });

          // Second pass: merge same open batch positions within 30 seconds
          const segmentMergedHistory: PositionHistory[] = [];
          const openTimeMergeThresholdMs = 30000;
          const sortedSegment = [...segmentMatchedHistory].sort((a, b) => a.openTime - b.openTime);

          for (const item of sortedSegment) {
            const existing = segmentMergedHistory.find(h => 
              h.symbol.toUpperCase() === item.symbol.toUpperCase() &&
              h.side === item.side &&
              h.positionSide === item.positionSide &&
              Math.abs(h.openTime - item.openTime) <= openTimeMergeThresholdMs
            );

            if (existing) {
              const originalQty = existing.amount;
              const itemQty = item.amount;
              const combinedQty = originalQty + itemQty;

              if (combinedQty > 0) {
                existing.entryPrice = (existing.entryPrice * originalQty + item.entryPrice * itemQty) / combinedQty;
                existing.exitPrice = (existing.exitPrice * originalQty + item.exitPrice * itemQty) / combinedQty;
              }

              existing.amount = combinedQty;
              existing.tradePnl += item.tradePnl;
              existing.commission += item.commission;
              existing.fundingFee += item.fundingFee;
              existing.pnl += item.pnl;
              existing.openTime = Math.min(existing.openTime, item.openTime);
              existing.closeTime = Math.max(existing.closeTime, item.closeTime);
              existing.timestamp = Math.max(existing.timestamp, item.timestamp);
              existing.id = `${existing.id}_${item.id}`;
            } else {
              segmentMergedHistory.push({ ...item });
            }
          }

          allNewMatchedHistory.push(...segmentMergedHistory);
        }
      }

      // Save all newly matched records to local SQLite
      if (allNewMatchedHistory.length > 0) {
        addLog(`成功获取并计算出缺失区段的 ${allNewMatchedHistory.length} 条全新仓位历史记录，正在持久化补全本地数据库...`, 'SUCCESS');
        const dbSaveRes = await fetch('/api/position-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ history: allNewMatchedHistory })
        });
        if (dbSaveRes.ok) {
          addLog(`已成功补全本地 SQLite 数据库，已对新产生的 ${allNewMatchedHistory.length} 条记录进行了补足。`, 'SUCCESS');
        }
      } else {
        addLog('未在缺失区段发现任何需要补全的平仓成交记录。', 'INFO');
      }

      // Reload the updated history from local DB for this account, filtered to the user selected range
      const updatedLocalRes = await fetch(`/api/position-history?account=${encodeURIComponent(activeAccount)}`);
      if (updatedLocalRes.ok) {
        const fullHistoryList: PositionHistory[] = await updatedLocalRes.json();
        const filteredList = fullHistoryList.filter(h => h.openTime >= requestedStartTime && h.closeTime <= requestedEndTime);
        setPositionHistory(filteredList);
        // Sync report selector to view this account
        setSelectedReportAccount(activeAccount);
        addLog(`同步补全完成！当前时间段 [${dateRange.start} 至 ${dateRange.end}] 共计 ${filteredList.length} 条独立闭合仓位记录已成功加载展示。`, 'SUCCESS');
      }

      // Fetch the available accounts list as well so the dropdown stays in sync
      fetchAvailableAccounts();

    } catch (error) {
      console.error(error);
      addLog('获取历史记录并进行闭环汇总时发生异常', 'ERROR');
    } finally {
      setIsFetchingHistory(false);
    }
  };

  const formatDateChinese = (dateStr: string) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${year}年${month}月${day}日`;
  };

  const renderReportView = () => {
    const totalTradesCount = trendCandles.reduce((sum, c) => sum + (c.tradesCount || 0), 0);

    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="grid grid-cols-1 gap-6">
          {/* Trend Analysis (走势分析) Chart */}
          <section className="financial-card p-6" id="trend-analysis-section">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#232326] pb-4 mb-6">
              {/* Left Side: Title and toggle */}
              <div className="flex flex-wrap items-center gap-6">
                <div 
                  className="flex items-center gap-2 cursor-pointer hover:opacity-80 select-none"
                  onClick={() => setIsTrendAnalysisVisible(!isTrendAnalysisVisible)}
                >
                  <span className="text-emerald-500 font-bold">$</span>
                  <h2 className="font-semibold text-sm text-white flex items-center gap-2">
                    走势分析
                  </h2>
                  <span className="text-zinc-500 text-[10px] uppercase font-mono ml-2 border border-[#232326] px-1.5 py-0.5 rounded-md hover:text-zinc-300">
                    {isTrendAnalysisVisible ? 'HIDE' : 'SHOW'}
                  </span>
                </div>
                
                {isTrendAnalysisVisible && (
                  <>
                    {/* Opacity slider */}
                    <div className="flex items-center gap-2 bg-[#141416]/50 px-3 py-1.5 rounded-lg border border-[#232326]">
                      <span className="text-xs text-zinc-400">悬浮窗透明度:</span>
                      <input 
                        type="range" 
                        min="10" 
                        max="100" 
                        value={trendOpacity} 
                        onChange={(e) => setTrendOpacity(Number(e.target.value))}
                        className="w-20 md:w-28 accent-emerald-500 cursor-pointer h-1 bg-zinc-800 rounded-lg appearance-none"
                      />
                      <span className="text-xs font-mono text-zinc-300 w-8 text-right">{trendOpacity}%</span>
                    </div>

                    {/* Initial capital config */}
                    <div className="flex items-center gap-1.5 bg-[#141416]/50 px-3 py-1.5 rounded-lg border border-[#232326]">
                      <span className="text-xs text-zinc-400">期初余额:</span>
                      <input 
                        type="number"
                        value={trendInitialBalance}
                        onChange={(e) => setTrendInitialBalance(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="w-20 bg-transparent text-xs text-emerald-400 font-mono focus:outline-none focus:ring-0 font-semibold"
                      />
                      <span className="text-[10px] text-zinc-500 font-mono">USDT</span>
                    </div>
                  </>
                )}
              </div>

              {/* Right Side: Chart buttons & timeframe */}
              {isTrendAnalysisVisible && (
                <div className="flex flex-wrap items-center gap-3">
                  {/* Chart type toggles */}
                  <div className="flex items-center bg-[#141416] p-1 rounded-lg border border-[#232326]">
                    <button
                      onClick={() => setTrendChartType('candle')}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                        trendChartType === 'candle'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold'
                          : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
                      }`}
                    >
                      📊 蜡烛图
                    </button>
                    <button
                      onClick={() => setTrendChartType('line')}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                        trendChartType === 'line'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold'
                          : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
                      }`}
                    >
                      📈 分时图
                    </button>
                  </div>

                  {/* Timeframes */}
                  <div className="flex items-center bg-[#141416] p-1 rounded-lg border border-[#232326]">
                    {(['1h', '4h', '1d', '1w', '1M'] as const).map((tf) => {
                      const labelMap = { '1h': '1小时', '4h': '4小时', '1d': '日线', '1w': '周线', '1M': '月线' };
                      return (
                        <button
                          key={tf}
                          onClick={() => {
                            setTrendTimeframe(tf);
                            handleAnalyzeTrend(tf);
                          }}
                          className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                            trendTimeframe === tf
                              ? 'bg-zinc-800 text-white font-semibold'
                              : 'text-zinc-500 hover:text-zinc-300'
                          }`}
                        >
                          {labelMap[tf]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Content Area */}
            {isTrendAnalysisVisible && (
              <div className="grid grid-cols-1 lg:grid-cols-8 gap-6">
                {/* Left sidebar: Stats overlay block */}
                <div className="lg:col-span-1 bg-[#141416]/60 border border-[#232326] rounded-xl p-4 flex flex-col justify-between h-full min-h-[160px] select-none text-[10px] xl:text-xs w-1/2 lg:w-full lg:max-w-[180px]">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b border-zinc-800">
                      <div className="w-1.5 h-3 bg-emerald-500 rounded-full" />
                      <span className="text-xs font-semibold text-zinc-300">区间 K线统计</span>
                    </div>

                    <div className="space-y-3 font-mono">
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-500">可见k:</span>
                        <span className="text-zinc-200 font-bold">{visibleTrendCandles.length} 根</span>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-zinc-800/40 text-rose-200/90">
                        <span className="text-zinc-500">汇总次数:</span>
                        <span className="text-zinc-200 font-bold">{visibleTrendCandles.reduce((sum, c) => sum + (c.tradesCount || 0), 0)} 次</span>
                      </div>

                      <div className="space-y-1 pt-1 border-t border-zinc-800/40">
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-500">收涨:</span>
                          <span className="text-emerald-500 font-bold">
                            {visibleTrendCandles.filter(c => c.close >= c.open).length} 根 ({
                              visibleTrendCandles.length > 0 
                                ? ((visibleTrendCandles.filter(c => c.close >= c.open).length / visibleTrendCandles.length) * 100).toFixed(1)
                                : '0.0'
                            }%)
                          </span>
                        </div>
                        <div className="flex items-center justify-between pl-3 text-[11px]">
                          <span className="text-zinc-600">均涨:</span>
                          <span className="text-emerald-400 font-semibold">
                            +{(() => {
                              const ups = visibleTrendCandles.filter(c => c.close >= c.open);
                              if (ups.length === 0) return '0.00';
                              const sum = ups.reduce((acc, c) => acc + ((c.close - c.open) / (c.open || 1)), 0);
                              return ((sum / ups.length) * 100).toFixed(2);
                            })()}%
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1 pt-1 border-t border-zinc-800/40">
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-500">收跌:</span>
                          <span className="text-red-500 font-bold">
                            {visibleTrendCandles.filter(c => c.close < c.open).length} 根 ({
                              visibleTrendCandles.length > 0 
                                ? ((visibleTrendCandles.filter(c => c.close < c.open).length / visibleTrendCandles.length) * 100).toFixed(1)
                                : '0.0'
                            }%)
                          </span>
                        </div>
                        <div className="flex items-center justify-between pl-3 text-[11px]">
                          <span className="text-zinc-600">均跌:</span>
                          <span className="text-red-400 font-semibold">
                            -{(() => {
                              const dns = visibleTrendCandles.filter(c => c.close < c.open);
                              if (dns.length === 0) return '0.00';
                              const sum = dns.reduce((acc, c) => acc + ((c.open - c.close) / (c.open || 1)), 0);
                              return ((sum / dns.length) * 100).toFixed(2);
                            })()}%
                          </span>
                        </div>
                      </div>

                      {/* 新增：“总盈亏”和“总胜率” */}
                      <div className="flex items-center justify-between pt-1.5 border-t border-zinc-800/45">
                        <span className="text-zinc-500">总盈亏:</span>
                        <span className={`font-bold ${
                          (() => {
                            const vpnl = visibleTrendCandles.reduce((sum, c) => sum + (c.pnlSum || 0), 0);
                            return vpnl >= 0 ? 'text-emerald-500' : 'text-red-500';
                          })()
                        }`}>
                          {(() => {
                            const vpnl = visibleTrendCandles.reduce((sum, c) => sum + (c.pnlSum || 0), 0);
                            return `${vpnl >= 0 ? '+' : ''}${vpnl.toFixed(2)}`;
                          })()}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-1.5 border-t border-zinc-800/45">
                        <span className="text-zinc-500">总胜率:</span>
                        <span className="text-blue-400 font-bold">
                          {(() => {
                            const vcount = visibleTrendCandles.length;
                            const vups = visibleTrendCandles.filter(c => c.close >= c.open).length;
                            return vcount > 0 ? ((vups / vcount) * 100).toFixed(1) : '0.0';
                          })()}%
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 mt-4 border-t border-zinc-800/40 text-[10px] text-zinc-500 space-y-1 italic">
                    <p>💡 逻辑释义：将盈亏累计在期初余额上，呈现高保真多周期账户余额权益走势。</p>
                  </div>
                </div>

                {/* Right: The Dynamic Chart Canvas */}
                <div 
                  ref={trendContainerRef}
                  onMouseEnter={() => setIsTrendHovered(true)}
                  onMouseLeave={() => setIsTrendHovered(false)}
                  className="lg:col-span-7 h-[380px] w-full border border-zinc-800/40 rounded-xl bg-[#141416]/20 p-2 relative"
                >
                  {visibleTrendCandles.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center p-6 text-zinc-500 italic border border-zinc-950/40 rounded-xl bg-[#141416]/20 text-center">
                      <TrendingUp size={24} className="mb-2 text-emerald-500 animate-pulse" />
                      <span className="text-sm">暂无分析数据。请选择账户并点击右上方的 K线 周期按钮（如「1小时」、「4小时」、「日线」、「周线」、「月线」）来主动对选中账户的“仓位历史记录”进行数据分析。</span>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      {trendChartType === 'candle' ? (
                        <BarChart data={visibleTrendCandles} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#232326" vertical={false} />
                          <XAxis 
                            dataKey="name" 
                            stroke="#52525b" 
                            fontSize={9} 
                            tickLine={false} 
                            axisLine={false}
                            dy={6}
                          />
                          <YAxis 
                            stroke="#52525b" 
                            fontSize={9} 
                            tickLine={false} 
                            axisLine={false}
                            domain={['auto', 'auto']}
                            tickFormatter={(v) => Number(v).toFixed(0)}
                          />
                          <Tooltip content={<CustomTrendTooltip opacity={trendOpacity} />} cursor={{ fill: 'rgba(255, 255, 255, 0.03)' }} />
                          <Bar 
                            dataKey="range" 
                            shape={<Candlestick />} 
                            isAnimationActive={false}
                          />
                        </BarChart>
                      ) : (
                        <AreaChart data={visibleTrendCandles} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="balanceTrendGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10B981" stopOpacity={0.25}/>
                              <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#232326" vertical={false} />
                          <XAxis 
                            dataKey="name" 
                            stroke="#52525b" 
                            fontSize={9} 
                            tickLine={false} 
                            axisLine={false}
                            dy={6}
                          />
                          <YAxis 
                            stroke="#52525b" 
                            fontSize={9} 
                            tickLine={false} 
                            axisLine={false}
                            domain={['auto', 'auto']}
                            tickFormatter={(v) => Number(v).toFixed(0)}
                          />
                          <Tooltip content={<CustomTrendTooltip opacity={trendOpacity} />} cursor={{ stroke: 'rgba(16, 185, 129, 0.2)', strokeWidth: 1 }} />
                          <Area 
                            type="monotone" 
                            dataKey="close" 
                            stroke="#10B981" 
                            strokeWidth={2} 
                            fillOpacity={1} 
                            fill="url(#balanceTrendGrad)" 
                            isAnimationActive={false}
                          />
                        </AreaChart>
                      )}
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Trend Chart */}
          <section className="financial-card p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-6">
                <div 
                  className="flex items-center gap-2 cursor-pointer hover:opacity-80 select-none"
                  onClick={() => setIsStreakChartVisible(!isStreakChartVisible)}
                >
                  <TrendingUp size={18} className="text-emerald-500" />
                  <h2 className="font-semibold flex items-center gap-2">
                    连续赢/亏走势图
                  </h2>
                  <span className="text-zinc-500 text-[10px] uppercase font-mono ml-2 border border-[#232326] px-1.5 py-0.5 rounded-md hover:text-zinc-300">
                    {isStreakChartVisible ? 'HIDE' : 'SHOW'}
                  </span>
                </div>
                
                {/* Summary Stats */}
                {isStreakChartVisible && (
                  <div className="hidden md:flex items-center gap-6 pl-6 border-l border-[#232326]">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">总盈亏汇总</span>
                      <span className={`text-sm font-mono font-bold ${historyTotals.totalPnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {historyTotals.totalPnl >= 0 ? '+' : ''}{historyTotals.totalPnl.toFixed(2)} USDT
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">手续费汇总</span>
                      <span className="text-sm font-mono font-bold text-zinc-300">
                        -{Math.abs(historyTotals.totalCommission).toFixed(2)} USDT
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">资金费汇总</span>
                      <span className={`text-sm font-mono font-bold ${historyTotals.totalFunding >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {historyTotals.totalFunding >= 0 ? '+' : ''}{historyTotals.totalFunding.toFixed(4)} USDT
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">胜率</span>
                      <span className="text-sm font-mono font-bold text-blue-500">
                        {historyTotals.totalTrades > 0 
                          ? ((historyTotals.wins / historyTotals.totalTrades) * 100).toFixed(1) 
                          : '0.0'}%
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">次数</span>
                      <span className="text-sm font-mono font-bold text-amber-500">
                        {historyTotals.totalTrades}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {isStreakChartVisible && (
                <div className="flex gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 bg-emerald-500 rounded-sm" />
                    <span className="text-zinc-400">连续盈利</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 bg-red-500 rounded-sm" />
                    <span className="text-zinc-400">连续亏损</span>
                  </div>
                </div>
              )}
            </div>
            
            {isStreakChartVisible && (
              <div 
                ref={streakContainerRef}
                onMouseEnter={() => setIsStreakHovered(true)}
                onMouseLeave={() => setIsStreakHovered(false)}
                className="h-[350px] w-full border border-zinc-800/40 rounded-xl bg-[#141416]/20 p-2 relative"
              >
                {visibleStreakData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-zinc-600 italic">
                    暂无历史数据，请先进行交易
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={visibleStreakData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#232326" vertical={false} />
                      <XAxis 
                        dataKey="name" 
                        stroke="#52525b" 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={false}
                      />
                      <YAxis 
                        stroke="#52525b" 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#141416', border: '1px solid #232326', borderRadius: '8px' }}
                        cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                        formatter={(value: any, name: any, props: any) => [value, props.payload.isWin ? '连续盈利次数' : '连续亏损次数']}
                      />
                      <Bar 
                        dataKey="count" 
                        radius={[4, 4, 0, 0]} 
                        barSize={Math.min(60, 800 / visibleStreakData.length)}
                        isAnimationActive={false}
                      >
                        {visibleStreakData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                        <LabelList dataKey="count" position="top" fill="#fff" fontSize={12} offset={10} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            )}
          </section>

          {/* Position History Table */}
          <section className="financial-card overflow-hidden">
            <div className="p-5 border-b border-[#232326] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Clock size={18} className="text-blue-500" />
                  <h2 className="font-semibold">仓位历史记录</h2>
                </div>
                
                <div className="flex items-center gap-2">
                  <button 
                    onClick={fetchHistoryFromBinance}
                    disabled={isFetchingHistory || !isConnected}
                    className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded transition-colors disabled:opacity-50"
                  >
                    {isFetchingHistory ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    {isFetchingHistory ? '同步中...' : '同步历史'}
                  </button>

                  <div className="flex items-center gap-1.5 bg-[#1C1C1E] px-2.5 py-1.5 rounded border border-[#232326]">
                    <span className="text-[10px] text-zinc-500">限速策略:</span>
                    <select
                      value={rateLimitDelay}
                      onChange={e => setRateLimitDelay(Number(e.target.value))}
                      disabled={isFetchingHistory}
                      className="bg-transparent text-[11px] text-zinc-300 outline-none border-none cursor-pointer focus:outline-none"
                    >
                      <option value={0} className="bg-[#1C1C1E] text-zinc-300">不限速 (0ms)</option>
                      <option value={100} className="bg-[#1C1C1E] text-zinc-300">极速模式 (100ms)</option>
                      <option value={300} className="bg-[#1C1C1E] text-zinc-300 font-medium">推荐安全 (300ms)</option>
                      <option value={800} className="bg-[#1C1C1E] text-zinc-300">防卡安防 (800ms)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 bg-[#1C1C1E] px-3 py-1.5 rounded border border-[#232326]">
                  <span className="text-[10px] text-zinc-500 uppercase">账目</span>
                  <select
                    value={selectedReportAccount}
                    onChange={e => setSelectedReportAccount(e.target.value)}
                    className="bg-transparent text-xs text-white outline-none border-none cursor-pointer focus:outline-none"
                  >
                    <option value="" className="bg-[#1C1C1E] text-[#9EA1A6]">所有账户</option>
                    {availableAccounts.map(acc => (
                      <option key={acc} value={acc} className="bg-[#1C1C1E] text-zinc-300">{acc}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2 bg-[#1C1C1E] px-3 py-1.5 rounded border border-[#232326]">
                  <span className="text-[10px] text-zinc-500 uppercase">开始</span>
                  <input 
                    type="date" 
                    className="bg-transparent text-xs text-white outline-none"
                    value={dateRange.start}
                    onChange={e => setDateRange({...dateRange, start: e.target.value})}
                  />
                  <span className="text-[10px] text-zinc-400 font-mono">({formatDateChinese(dateRange.start)})</span>
                </div>
                <div className="flex items-center gap-2 bg-[#1C1C1E] px-3 py-1.5 rounded border border-[#232326]">
                  <span className="text-[10px] text-zinc-500 uppercase">终止</span>
                  <input 
                    type="date" 
                    className="bg-transparent text-xs text-white outline-none"
                    value={dateRange.end}
                    onChange={e => setDateRange({...dateRange, end: e.target.value})}
                  />
                  <span className="text-[10px] text-zinc-400 font-mono">({formatDateChinese(dateRange.end)})</span>
                </div>
                <button 
                  onClick={exportToExcel}
                  disabled={positionHistory.length === 0}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold rounded transition-colors disabled:opacity-50"
                >
                  <Download size={14} />
                  下载表格 (.XLSX)
                </button>
              </div>
            </div>

            {/* Sync Progress Bar */}
            {isFetchingHistory && (
              <div className="bg-[#1C1C1E]/30 border-b border-[#232326] px-5 py-3.5 flex flex-col gap-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-400 font-medium flex items-center gap-2">
                    <RefreshCw size={12} className="animate-spin text-blue-500" />
                    {syncProgress.stage || '同步数据中...'}
                  </span>
                  {syncProgress.total > 0 && (
                    <span className="text-blue-400 font-mono text-[11px] bg-blue-500/10 px-1.5 py-0.5 rounded">
                      任务进度: {syncProgress.current} / {syncProgress.total} ({Math.round((syncProgress.current / syncProgress.total) * 100)}%)
                    </span>
                  )}
                </div>
                {syncProgress.total > 0 && (
                  <div className="w-full bg-zinc-800 rounded-full h-1 overflow-hidden">
                    <div 
                      className="bg-blue-500 h-1 rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(59,130,246,0.5)]" 
                      style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                    />
                  </div>
                )}
                {rateLimitDelay > 0 && (
                  <p className="text-[10px] text-zinc-500 italic">
                    💡 限速优化：已在本批次请求中激活硬休眠 {rateLimitDelay}ms/请求 的防护策略，防止高频调用被限制。
                  </p>
                )}
              </div>
            )}
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-zinc-500 border-b border-[#232326]">
                    <th className="px-5 py-3 font-medium">合约名称</th>
                    <th className="px-5 py-3 font-medium">账户</th>
                    <th className="px-5 py-3 font-medium">总盈亏</th>
                    <th className="px-5 py-3 font-medium">成交盈亏</th>
                    <th className="px-5 py-3 font-medium">手续费</th>
                    <th className="px-5 py-3 font-medium">资金费</th>
                    <th className="px-5 py-3 font-medium">收益率</th>
                    <th className="px-5 py-3 font-medium">开仓时间</th>
                    <th className="px-5 py-3 font-medium">最后平仓时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232326]">
                  {positionHistory.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-5 py-12 text-center text-zinc-600 italic text-sm">
                        暂无历史记录。
                      </td>
                    </tr>
                  ) : (
                    positionHistory.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE).map((h) => (
                      <tr key={h.id} className="hover:bg-[#1C1C1E]/50 transition-colors">
                        <td className="px-5 py-4">
                          <div className="font-bold text-sm">{h.symbol}</div>
                          <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded inline-block mt-1 ${
                            h.side === 'BUY' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
                          }`}>
                            {h.side === 'BUY' ? '多' : '空'} ({h.positionSide})
                          </div>
                        </td>
                        <td className="px-5 py-4 text-xs font-mono text-zinc-300">
                          {h.account || '默认账户'}
                        </td>
                        <td className="px-5 py-4">
                          <div className={`font-bold text-sm ${h.pnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {h.pnl >= 0 ? '+' : ''}{h.pnl.toFixed(2)}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className={`text-xs ${h.tradePnl >= 0 ? 'text-emerald-500/70' : 'text-red-500/70'}`}>
                            {h.tradePnl.toFixed(2)}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-xs text-red-400/70 font-mono">
                          {h.commission.toFixed(2)}
                        </td>
                        <td className="px-5 py-4 text-xs text-amber-400/70 font-mono">
                          {h.fundingFee.toFixed(2)}
                        </td>
                        <td className="px-5 py-4 font-mono text-sm">
                          {(() => {
                            const contractVolume = h.entryPrice * h.amount;
                            const yieldRate = contractVolume > 0 ? (h.pnl / contractVolume) : 0;
                            const displayRate = yieldRate * 100;
                            return (
                              <div className={`font-bold ${yieldRate >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                {yieldRate >= 0 ? '+' : ''}{displayRate.toFixed(3)}%
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-5 py-4 text-xs text-zinc-500 font-mono">
                          {new Date(h.openTime).toLocaleString()}
                        </td>
                        <td className="px-5 py-4 text-xs text-zinc-500 font-mono">
                          {new Date(h.closeTime).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {positionHistory.length > ITEMS_PER_PAGE && (
              <div className="flex flex-col sm:flex-row items-center justify-between px-5 py-4 border-t border-[#232326] gap-4 bg-[#1C1C1E]/20">
                <span className="text-xs text-zinc-500 font-mono">
                  显示第 {(currentPage - 1) * ITEMS_PER_PAGE + 1} 至 {Math.min(currentPage * ITEMS_PER_PAGE, positionHistory.length)} 条，共 {positionHistory.length} 条记录
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="px-2.5 py-1.5 bg-[#1C1C1E] border border-[#232326] text-[11px] text-zinc-400 rounded hover:bg-[#232326] disabled:opacity-30 disabled:hover:bg-[#1C1C1E] transition-all"
                  >
                    首页
                  </button>
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="px-2.5 py-1.5 bg-[#1C1C1E] border border-[#232326] text-[11px] text-zinc-400 rounded hover:bg-[#232326] disabled:opacity-30 disabled:hover:bg-[#1C1C1E] transition-all"
                  >
                    上一页
                  </button>
                  <span className="text-xs text-zinc-400 px-3 py-1 bg-black/30 border border-[#232326] rounded font-mono">
                    {currentPage} / {Math.ceil(positionHistory.length / ITEMS_PER_PAGE)}
                  </span>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(Math.ceil(positionHistory.length / ITEMS_PER_PAGE), prev + 1))}
                    disabled={currentPage === Math.ceil(positionHistory.length / ITEMS_PER_PAGE)}
                    className="px-2.5 py-1.5 bg-[#1C1C1E] border border-[#232326] text-[11px] text-zinc-400 rounded hover:bg-[#232326] disabled:opacity-30 disabled:hover:bg-[#1C1C1E] transition-all"
                  >
                    下一页
                  </button>
                  <button
                    onClick={() => setCurrentPage(Math.ceil(positionHistory.length / ITEMS_PER_PAGE))}
                    disabled={currentPage === Math.ceil(positionHistory.length / ITEMS_PER_PAGE)}
                    className="px-2.5 py-1.5 bg-[#1C1C1E] border border-[#232326] text-[11px] text-zinc-400 rounded hover:bg-[#232326] disabled:opacity-30 disabled:hover:bg-[#1C1C1E] transition-all"
                  >
                    末页
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* 警报记录统计表 */}
          <section className="financial-card overflow-hidden">
            <div className="p-5 border-b border-[#232326] flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[#141416]/40">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Bell size={18} className="text-amber-500 animate-pulse" />
                  <h2 className="font-semibold text-sm text-zinc-100">历史价格警报记录</h2>
                </div>
                
                {/* Date filter */}
                <div className="flex items-center gap-2 bg-[#1C1C1E] px-2.5 py-1.5 rounded border border-[#232326]">
                  <span className="text-[10px] text-zinc-500">日期:</span>
                  <input 
                    type="date" 
                    className="bg-transparent text-xs text-white outline-none"
                    value={alertFilterDate}
                    onChange={e => {
                      setAlertFilterDate(e.target.value);
                      setAlertCurrentPage(1);
                    }}
                  />
                  {alertFilterDate && (
                    <button 
                      onClick={() => {
                        setAlertFilterDate('');
                        setAlertCurrentPage(1);
                      }}
                      className="text-zinc-500 hover:text-white text-[10px] font-bold cursor-pointer"
                    >
                      清除
                    </button>
                  )}
                </div>

                {/* Board name filter */}
                <div className="flex items-center gap-2 bg-[#1C1C1E] px-2.5 py-1.5 rounded border border-[#232326]">
                  <span className="text-[10px] text-zinc-500">榜单:</span>
                  <select
                    value={alertFilterBoard}
                    onChange={e => {
                      setAlertFilterBoard(e.target.value);
                      setAlertCurrentPage(1);
                    }}
                    className="bg-transparent text-[11px] text-zinc-300 outline-none border-none cursor-pointer focus:outline-none"
                  >
                    <option value="" className="bg-[#1C1C1E]">全部榜单</option>
                    <option value="15分钟涨幅榜" className="bg-[#1C1C1E]">15分钟涨幅榜</option>
                    <option value="15分钟跌幅榜" className="bg-[#1C1C1E]">15分钟跌幅榜</option>
                    <option value="15分钟振幅榜" className="bg-[#1C1C1E]">15分钟振幅榜</option>
                  </select>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-3">
                <button 
                  onClick={fetchAlertLogs}
                  disabled={isFetchingAlerts}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-850 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 text-xs font-bold rounded transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw size={14} className={isFetchingAlerts ? "animate-spin text-amber-500" : ""} />
                  刷新记录
                </button>
                <button 
                  onClick={handleClearAlertLogs}
                  disabled={alertLogs.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-950/40 border border-red-900/50 hover:bg-red-900/30 text-red-400 text-xs font-bold rounded transition-colors disabled:opacity-30 cursor-pointer"
                >
                  <Trash2 size={14} />
                  清理全部记录
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-zinc-500 border-b border-[#232326] bg-[#141416]/20">
                    <th className="px-5 py-3 font-medium">触发时间</th>
                    <th className="px-5 py-3 font-medium">合约名称</th>
                    <th className="px-5 py-3 font-medium">所属榜单</th>
                    <th className="px-5 py-3 font-medium">涨跌幅 / 振幅</th>
                    <th className="px-5 py-3 font-medium">15分钟成交额</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232326]">
                  {alertLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center text-zinc-600 italic text-sm">
                        暂无警报记录。在监控运行时，触发价格警报将自动记录在此处。
                      </td>
                    </tr>
                  ) : (
                    alertLogs.slice((alertCurrentPage - 1) * ALERT_ITEMS_PER_PAGE, alertCurrentPage * ALERT_ITEMS_PER_PAGE).map((log) => (
                      <tr key={log.id} className="hover:bg-[#1C1C1E]/50 transition-colors">
                        <td className="px-5 py-4 text-xs font-mono text-zinc-400">
                          {new Date(log.trigger_time).toLocaleString()}
                        </td>
                        <td className="px-5 py-4 font-bold text-sm text-zinc-100">
                          {log.symbol}
                        </td>
                        <td className="px-5 py-4">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            log.board_name === '15分钟涨幅榜' 
                              ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' 
                              : log.board_name === '15分钟跌幅榜' 
                                ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' 
                                : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                          }`}>
                            {log.board_name}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className={`font-mono text-sm font-bold ${
                            log.board_name === '15分钟涨幅榜' 
                              ? 'text-emerald-500' 
                              : log.board_name === '15分钟跌幅榜' 
                                ? 'text-rose-500' 
                                : 'text-amber-500'
                          }`}>
                            {log.change_val}
                          </div>
                        </td>
                        <td className="px-5 py-4 font-mono text-sm text-zinc-300">
                          {log.volume_15m ? `${(log.volume_15m / 10000).toFixed(2)} 万` : '--'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls for Alert Logs */}
            {alertLogs.length > ALERT_ITEMS_PER_PAGE && (
              <div className="flex flex-col sm:flex-row items-center justify-between px-5 py-4 border-t border-[#232326] gap-4 bg-[#1C1C1E]/20">
                <span className="text-xs text-zinc-500 font-mono">
                  显示第 {(alertCurrentPage - 1) * ALERT_ITEMS_PER_PAGE + 1} 至 {Math.min(alertCurrentPage * ALERT_ITEMS_PER_PAGE, alertLogs.length)} 条，共 {alertLogs.length} 条警报记录
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setAlertCurrentPage(1)}
                    disabled={alertCurrentPage === 1}
                    className="px-2.5 py-1.5 bg-[#1C1C1E] border border-[#232326] text-[11px] text-zinc-400 rounded hover:bg-[#232326] disabled:opacity-30 disabled:hover:bg-[#1C1C1E] transition-all cursor-pointer"
                  >
                    首页
                  </button>
                  <button
                    onClick={() => setAlertCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={alertCurrentPage === 1}
                    className="px-2.5 py-1.5 bg-[#1C1C1E] border border-[#232326] text-[11px] text-zinc-400 rounded hover:bg-[#232326] disabled:opacity-30 disabled:hover:bg-[#1C1C1E] transition-all cursor-pointer"
                  >
                    上一页
                  </button>
                  <span className="text-xs text-zinc-400 px-3 py-1 bg-black/30 border border-[#232326] rounded font-mono">
                    {alertCurrentPage} / {Math.ceil(alertLogs.length / ALERT_ITEMS_PER_PAGE)}
                  </span>
                  <button
                    onClick={() => setAlertCurrentPage(prev => Math.min(Math.ceil(alertLogs.length / ALERT_ITEMS_PER_PAGE), prev + 1))}
                    disabled={alertCurrentPage === Math.ceil(alertLogs.length / ALERT_ITEMS_PER_PAGE)}
                    className="px-2.5 py-1.5 bg-[#1C1C1E] border border-[#232326] text-[11px] text-zinc-400 rounded hover:bg-[#232326] disabled:opacity-30 disabled:hover:bg-[#1C1C1E] transition-all cursor-pointer"
                  >
                    下一页
                  </button>
                  <button
                    onClick={() => setAlertCurrentPage(Math.ceil(alertLogs.length / ALERT_ITEMS_PER_PAGE))}
                    disabled={alertCurrentPage === Math.ceil(alertLogs.length / ALERT_ITEMS_PER_PAGE)}
                    className="px-2.5 py-1.5 bg-[#1C1C1E] border border-[#232326] text-[11px] text-zinc-400 rounded hover:bg-[#232326] disabled:opacity-30 disabled:hover:bg-[#1C1C1E] transition-all cursor-pointer"
                  >
                    末页
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen pt-4 pb-20 px-4 md:px-8 xl:px-12 w-full space-y-6">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between border-b border-[#232326] pb-3 gap-4 animate-in fade-in duration-300">
        <div className="flex flex-wrap items-center gap-3">
          {/* Card 1: 交易辅助 */}
          <button
            onClick={() => {
              setActiveMainTab('TRADE');
            }}
            id="btn-active-tab-trade"
            className={`flex items-center justify-center gap-2 px-3 rounded-xl border transition-all text-center relative overflow-hidden h-[50px] w-[205px] group cursor-pointer ${
              activeMainTab === 'TRADE'
              ? 'bg-[#388e3c] border-[#388e3c] shadow-lg shadow-[#388e3c]/20 ring-1 ring-[#388e3c]/30'
              : 'bg-[#388e3c]/15 border-[#388e3c]/25 hover:border-[#388e3c]/45 hover:bg-[#388e3c]/25'
            }`}
          >
            {activeMainTab === 'TRADE' && (
              <div className="absolute top-0 left-0 w-1 h-full bg-white opacity-40 animate-pulse" />
            )}
            <div className={`p-1.5 rounded-lg transition-colors shrink-0 ${
              activeMainTab === 'TRADE' ? 'bg-white/20 text-white' : 'bg-[#388e3c]/15 text-[#388e3c]/80 group-hover:text-[#388e3c]'
            }`}>
              <Zap size={16} className={activeMainTab === 'TRADE' ? 'fill-white/20' : 'fill-[#388e3c]/10'} />
            </div>
            <div className="min-w-0">
              <h3 className={`font-bold text-[18px] leading-none transition-colors ${
                activeMainTab === 'TRADE' ? 'text-white' : 'text-[#388e3c]/90 group-hover:text-[#388e3c]'
              }`}>
                交易辅助
              </h3>
            </div>
          </button>

          {/* Card 2: 监控辅助 */}
          <button
            onClick={() => {
              setActiveMainTab('MONITOR');
            }}
            id="btn-active-tab-monitor"
            className={`flex items-center justify-center gap-2 px-3 rounded-xl border transition-all text-center relative overflow-hidden h-[50px] w-[205px] group cursor-pointer ${
              activeMainTab === 'MONITOR'
              ? 'bg-[#ff8a65] border-[#ff8a65] shadow-lg shadow-[#ff8a65]/20 ring-1 ring-[#ff8a65]/30'
              : 'bg-[#ff8a65]/15 border-[#ff8a65]/25 hover:border-[#ff8a65]/45 hover:bg-[#ff8a65]/25'
            }`}
          >
            {activeMainTab === 'MONITOR' && (
              <div className="absolute top-0 left-0 w-1 h-full bg-zinc-950 opacity-40 animate-pulse" />
            )}
            <div className={`p-1.5 rounded-lg transition-colors shrink-0 ${
              activeMainTab === 'MONITOR' ? 'bg-zinc-950/20 text-zinc-950' : 'bg-[#ff8a65]/15 text-[#ff8a65]/80 group-hover:text-[#ff8a65]'
            }`}>
              <Activity size={16} className={activeMainTab === 'MONITOR' ? 'fill-zinc-900/10' : 'fill-[#ff8a65]/10'} />
            </div>
            <div className="min-w-0">
              <h3 className={`font-bold text-[18px] leading-none transition-colors ${
                activeMainTab === 'MONITOR' ? 'text-zinc-950' : 'text-[#ff8a65]/90 group-hover:text-[#ff8a65]'
              }`}>
                监控辅助
              </h3>
            </div>
          </button>
        </div>
        <div className="flex items-center gap-4">
          {/* Card 3: 报表统计 */}
          <button
            onClick={() => {
              setActiveMainTab('REPORT');
            }}
            id="btn-active-tab-report"
            className={`flex items-center justify-center gap-2 px-3 rounded-xl border transition-all text-center relative overflow-hidden h-[50px] w-[205px] group cursor-pointer ${
              activeMainTab === 'REPORT'
              ? 'bg-[#039be5] border-[#039be5] shadow-lg shadow-[#039be5]/20 ring-1 ring-[#039be5]/30'
              : 'bg-[#039be5]/15 border-[#039be5]/25 hover:border-[#039be5]/45 hover:bg-[#039be5]/25'
            }`}
          >
            {activeMainTab === 'REPORT' && (
              <div className="absolute top-0 left-0 w-1 h-full bg-white opacity-40 animate-pulse" />
            )}
            <div className={`p-1.5 rounded-lg transition-colors shrink-0 ${
              activeMainTab === 'REPORT' ? 'bg-white/20 text-white' : 'bg-[#039be5]/15 text-[#039be5]/80 group-hover:text-[#039be5]'
            }`}>
              <FileText size={16} className={activeMainTab === 'REPORT' ? 'fill-white/10' : 'fill-[#039be5]/10'} />
            </div>
            <div className="min-w-0">
              <h3 className={`font-bold text-[18px] leading-none transition-colors ${
                activeMainTab === 'REPORT' ? 'text-white' : 'text-[#039be5]/90 group-hover:text-[#039be5]'
              }`}>
                报表统计
              </h3>
            </div>
          </button>

          {/* 一键静音 / 恢复组件 */}
          <button
            onClick={() => {
              const newState = !isMuted;
              setIsMuted(newState);
              localStorage.setItem('global_mute_state', String(newState));
              addLog(`[系统] 一键静音已${newState ? '开启，全局警报处于静音状态' : '关闭，警报声音已恢复'}`, newState ? 'INFO' : 'SUCCESS');
            }}
            id="btn-global-mute-toggle"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 border rounded-md transition-all active:scale-[0.97] ${
              isMuted 
              ? 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/15 animate-pulse' 
              : 'bg-[#141416] border-[#232326] text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
            }`}
            title={isMuted ? "点击恢复音量" : "点击一键静音"}
          >
            {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            <span className="text-xs font-semibold">{isMuted ? '静音' : '恢复'}</span>
          </button>

          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#141416] border border-[#232326] rounded-md">
            <Server size={14} className="text-zinc-500" />
            <span className="text-xs font-mono text-zinc-400">
              服务器 IP: {showServerIp ? serverIp : '******'}
            </span>
            <div className="flex items-center gap-1.5 ml-1 border-l border-[#232326] pl-1.5">
              <button
                onClick={() => setShowServerIp(prev => !prev)}
                className="text-zinc-500 hover:text-zinc-300 active:scale-95 transition-all p-0.5"
                title={showServerIp ? "隐藏 IP 信息" : "显示 IP 信息"}
              >
                {showServerIp ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
              <button
                onClick={handleFetchIp}
                disabled={isQueryingIp}
                className={`text-zinc-500 hover:text-zinc-300 active:scale-95 disabled:opacity-30 transition-all p-0.5 ${
                  isQueryingIp ? 'animate-spin text-blue-500' : ''
                }`}
                title="手动刷新/查询 IP"
              >
                <RefreshCw size={13} />
              </button>
            </div>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1.5 border rounded-md transition-colors ${
            isConnected 
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' 
            : 'bg-red-500/10 border-red-500/20 text-red-500'
          }`}>
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-xs font-medium uppercase">{isConnected ? '已连接' : '未连接'}</span>
          </div>
        </div>
      </header>

      <div className={activeMainTab === 'TRADE' ? 'block' : 'hidden'}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left Column: API & Config & Account */}
        <div className="lg:col-span-4 flex flex-col space-y-6 h-full">
          {/* Account Status */}
          <section className="financial-card p-5 space-y-4">
            {!isConnected ? (
              <div className="py-8 text-center space-y-2 border border-dashed border-[#232326] rounded-lg">
                <AlertCircle size={24} className="mx-auto text-zinc-600" />
                <p className="text-xs text-zinc-500">请先验证 API 连接以查看余额</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="financial-label">总资产</label>
                  <div className="text-xl font-mono font-bold text-emerald-500">{balance.balance.toFixed(2)} <span className="text-xs text-zinc-500">USDT</span></div>
                </div>
                <div className="space-y-1">
                  <label className="financial-label">可用保证金</label>
                  <div className="text-xl font-mono font-bold text-blue-500">{balance.available.toFixed(2)} <span className="text-xs text-zinc-500">USDT</span></div>
                </div>
                <div className="space-y-1 pt-2 border-t border-[#232326]">
                  <label className="financial-label">现货余额</label>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-mono font-bold text-zinc-300">{(balance.spotBalance || 0).toFixed(2)} <span className="text-xs text-zinc-500">USDT</span></span>
                    <button 
                      type="button"
                      onClick={() => {
                        setTransferType('futures_to_spot');
                        setTransferAmount('');
                        setIsTransferModalOpen(true);
                      }}
                      className="flex items-center justify-center w-6 h-6 bg-gradient-to-r from-emerald-400 to-green-500 hover:from-emerald-300 hover:to-green-400 active:from-emerald-500 active:to-green-600 text-slate-900 border-2 border-emerald-600 shadow-[0_2.5px_0_#047857] hover:scale-110 active:translate-y-[1.5px] active:shadow-[0_1px_0_#047857] transition-all duration-200 rounded-lg cursor-pointer"
                      title="点击划转 (从 合约 划转到 现货)"
                    >
                      <Plus size={14} className="stroke-[4.5]" />
                    </button>
                  </div>
                </div>
                <div className="space-y-1 pt-2 border-t border-[#232326]">
                  <label className="financial-label">合约余额</label>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-mono font-bold text-zinc-300">{(balance.futuresBalance || 0).toFixed(2)} <span className="text-xs text-zinc-500">USDT</span></span>
                    <button 
                      type="button"
                      onClick={() => {
                        setTransferType('spot_to_futures');
                        setTransferAmount('');
                        setIsTransferModalOpen(true);
                      }}
                      className="flex items-center justify-center w-6 h-6 bg-gradient-to-r from-emerald-400 to-green-500 hover:from-emerald-300 hover:to-green-400 active:from-emerald-500 active:to-green-600 text-slate-900 border-2 border-emerald-600 shadow-[0_2.5px_0_#047857] hover:scale-110 active:translate-y-[1.5px] active:shadow-[0_1px_0_#047857] transition-all duration-200 rounded-lg cursor-pointer"
                      title="点击划转 (从 现货 划转到 合约)"
                    >
                      <Plus size={14} className="stroke-[4.5]" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Risk Control Settings */}
          <section className="financial-card border-l-2 border-l-amber-500/50">
            <div 
              className="flex justify-between items-center cursor-pointer p-5 pb-2"
              onClick={() => setIsRiskVisible(!isRiskVisible)}
            >
              <div className="flex items-center gap-2">
                <ShieldAlert size={18} className="text-amber-500" />
                <h2 className="font-semibold">风控配置</h2>
              </div>
              <span className="text-zinc-500 text-[10px] uppercase font-mono">
                {isRiskVisible ? 'HIDE' : 'SHOW'}
              </span>
            </div>
            
            {isRiskVisible && (
              <div className="p-5 pt-0 space-y-4 animate-in fade-in duration-300">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1 text-center">
                    <label className="financial-label text-emerald-400 text-center block w-full">云端止盈 (%)</label>
                    <input 
                      type="number" 
                      step="any"
                      className="w-full bg-[#182C25] border border-emerald-500/40 text-[#5EF2C1] font-mono text-xl p-2 rounded focus:outline-none focus:border-[#4ADE80] font-bold transition-all placeholder-emerald-800 text-center" 
                      value={activeRisk.tp}
                      onChange={e => {
                        const val = e.target.value;
                        setActiveRisk(prev => ({...prev, tp: val}));
                      }}
                    />
                  </div>
                  <div className="space-y-1 text-center">
                    <label className="financial-label text-rose-400 text-center block w-full">云端止损 (%)</label>
                    <input 
                      type="number" 
                      step="any"
                      className="w-full bg-[#2F191B] border border-rose-500/40 text-[#FCA5A5] font-mono text-xl p-2 rounded focus:outline-none focus:border-[#F87171] font-bold transition-all placeholder-rose-800 text-center" 
                      value={activeRisk.sl}
                      onChange={e => {
                        const val = e.target.value;
                        setActiveRisk(prev => ({...prev, sl: val}));
                      }}
                    />
                  </div>
                  
                  {/* 新增展示板："k值"、"z值"、"进场主体" */}
                  <div className="col-span-2 grid grid-cols-3 gap-2.5 pt-2 border-t border-zinc-800/50">
                    <div className="space-y-1 text-center">
                      <label className="text-[10px] text-zinc-500 block">K值</label>
                      <button
                        type="button"
                        disabled={kValue === null}
                        onClick={() => {
                          if (kValue !== null) {
                            const valAbs = Math.abs(kValue);
                            const tpFactor = (activeRisk as any).tpCoef ?? 45;
                            const slFactor = (activeRisk as any).slCoef ?? 100;
                            const nextTp = parseFloat((valAbs * tpFactor / 100).toFixed(4));
                            const nextSl = parseFloat((valAbs * slFactor / 100).toFixed(4));
                            setActiveRisk(prev => ({
                              ...prev,
                              tp: nextTp,
                              sl: nextSl
                            }));
                            addLog(`[快速风控] 已提取 K值 ${kValue.toFixed(4)}% 的绝对值，通过风控系数 (止盈 ${tpFactor}%, 止损 ${slFactor}%) 计算并更新：云端止盈 = ${nextTp}%, 云端止损 = ${nextSl}%`, 'SUCCESS');
                          }
                        }}
                        className={`w-full py-2 rounded font-mono text-xl font-bold text-center transition-all ${
                          kValue !== null 
                            ? `${kValue < 0 ? 'bg-[#2F191B] border border-rose-500/30 text-[#FCA5A5] hover:bg-[#3d1f22]' : 'bg-[#182C25] border border-emerald-500/30 text-[#5EF2C1] hover:bg-[#203a31]'} cursor-pointer hover:scale-[1.02] active:scale-[0.98]` 
                            : 'bg-[#1C1C1E] border border-zinc-800/60 text-zinc-500 cursor-not-allowed'
                        }`}
                        title={kValue !== null ? "点击使用 止盈/止损系数 快速计算并填充至云端止盈/止损" : undefined}
                      >
                        {kValue !== null ? `${kValue > 0 ? '+' : ''}${kValue.toFixed(2)}%` : '--'}
                      </button>
                    </div>

                    <div className="space-y-1 text-center">
                      <label className="text-[10px] text-zinc-500 block">Z值</label>
                      <div className={`w-full py-2 rounded font-mono text-xl font-bold text-center transition-all ${
                        zValue !== null 
                          ? 'bg-[#2E183B]/40 border border-fuchsia-500/30 text-[#D946EF]' 
                          : 'bg-[#1C1C1E] border border-zinc-800/60 text-zinc-500'
                      }`}>
                        {zValue !== null ? `${zValue.toFixed(2)}%` : '--'}
                      </div>
                    </div>

                    <div className="space-y-1 text-center">
                      <label className="text-[10px] text-zinc-500 block">进场主体</label>
                      <button
                        type="button"
                        disabled={entryEntity === null}
                        onClick={() => {
                          if (entryEntity !== null) {
                            const currentZ = zValue ?? 0;
                            const tpFactor = (activeRisk as any).tpCoef ?? 45;
                            const slFactor = (activeRisk as any).slCoef ?? 100;
                            
                            const isRed = entryEntityRatio !== null && entryEntityRatio < 0.5;
                            let nextTp = 0;
                            let formulaDesc = '';
                            
                            if (isRed) {
                              const diff = currentZ - entryEntity;
                              nextTp = parseFloat((diff * tpFactor / 100).toFixed(4));
                              formulaDesc = `红色 (RED) 状态，根据公式 (z值 - 进场主体) * 止盈系数% = (${currentZ.toFixed(4)} - ${entryEntity.toFixed(4)}) * ${tpFactor}%`;
                            } else {
                              nextTp = parseFloat((entryEntity * tpFactor / 100).toFixed(4));
                              formulaDesc = `绿色 (GREEN) 状态，根据公式 进场主体 * 止盈系数% = ${entryEntity.toFixed(4)} * ${tpFactor}%`;
                            }
                            
                            const nextSl = parseFloat((currentZ * slFactor / 100).toFixed(4));
                            
                            setActiveRisk(prev => ({
                              ...prev,
                              tp: nextTp,
                              sl: nextSl
                            }));
                            addLog(`[快速风控] 进场主体处于${formulaDesc} 计算并更新：云端止盈 = ${nextTp}%, 云端止损 = ${nextSl}%`, 'SUCCESS');
                          }
                        }}
                        className={`w-full py-2 rounded font-mono text-xl font-bold text-center transition-all ${
                          entryEntity !== null 
                            ? `${(entryEntityRatio !== null && entryEntityRatio < 0.5) ? 'bg-[#2F191B] border border-rose-500/30 text-[#FCA5A5] hover:bg-[#3d1f22]' : 'bg-[#182C25] border border-emerald-500/30 text-[#5EF2C1] hover:bg-[#203a31]'} cursor-pointer hover:scale-[1.02] active:scale-[0.98]` 
                            : 'bg-[#1C1C1E] border border-zinc-800/60 text-zinc-500 cursor-not-allowed'
                        }`}
                        title={entryEntity !== null ? "点击使用 止盈/止损系数 快速计算并填充至云端止盈/止损" : undefined}
                      >
                        {entryEntity !== null ? entryEntity.toFixed(2) : '--'}
                      </button>
                    </div>
                  </div>
                  
                  {/* 止盈/止损系数 参数配置面板 */}
                  <div className="col-span-2 space-y-2 pt-2 border-t border-zinc-800/50">
                    <label className="text-[10px] text-zinc-400 font-semibold block uppercase tracking-wider">止盈/止损系数</label>
                    <div className="grid grid-cols-2 gap-3 pb-1">
                      <div>
                        <label className="text-[10px] text-zinc-500 block mb-1">止盈系数</label>
                        <div className="relative">
                          <input 
                            type="number" 
                            step="any"
                            className="financial-input w-full pr-8 text-center font-mono font-bold text-emerald-400" 
                            value={(activeRisk as any).tpCoef !== undefined ? (activeRisk as any).tpCoef : 45}
                            onChange={e => {
                              const val = e.target.value === '' ? '' : Number(e.target.value);
                              setActiveRisk(prev => ({...prev, tpCoef: val}));
                            }}
                          />
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-zinc-600 font-mono">%</div>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-zinc-500 block mb-1">止损系数</label>
                        <div className="relative">
                          <input 
                            type="number" 
                            step="any"
                            className="financial-input w-full pr-8 text-center font-mono font-bold text-rose-400" 
                            value={(activeRisk as any).slCoef !== undefined ? (activeRisk as any).slCoef : 100}
                            onChange={e => {
                              const val = e.target.value === '' ? '' : Number(e.target.value);
                              setActiveRisk(prev => ({...prev, slCoef: val}));
                            }}
                          />
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-zinc-600 font-mono">%</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 最大持仓时间 参数面板 */}
                  <div className="col-span-2 space-y-2 pt-2 border-t border-zinc-800/50">
                    <div className="flex-1">
                      <label className="text-[10px] text-zinc-500 block mb-1">最大持仓时间 (分钟)</label>
                      <div className="relative">
                        <input 
                          type="number" 
                          step="any"
                          className="financial-input w-full pr-10" 
                          value={activeRisk.timeLimitMinutes}
                          onChange={e => {
                            const val = e.target.value;
                            setActiveRisk(prev => ({...prev, timeLimitMinutes: val}));
                          }}
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-zinc-600 font-mono">MIN</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Trade Configuration */}
          <section className="financial-card border-l-2 border-l-sky-500/50">
            <div 
              className="flex justify-between items-center cursor-pointer p-5 pb-2"
              onClick={() => setIsTradeConfigVisible(!isTradeConfigVisible)}
            >
              <div className="flex items-center gap-2">
                <Sliders size={18} className="text-sky-500" />
                <h2 className="font-semibold">交易配置</h2>
              </div>
              <span className="text-zinc-500 text-[10px] uppercase font-mono">
                {isTradeConfigVisible ? 'HIDE' : 'SHOW'}
              </span>
            </div>
            
            {isTradeConfigVisible && (
              <div className="p-5 pt-0 space-y-4 animate-in fade-in duration-300">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="financial-label">自定义杠杆倍数</label>
                    <div className="relative">
                      <input 
                        type="number" 
                        className="financial-input w-full pr-8" 
                        value={leverage}
                        onChange={e => setLeverage(Number(e.target.value))}
                        min="1"
                        max="125"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-zinc-600 font-mono">X</div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="financial-label">合约比例 (%)</label>
                    <div className="relative">
                      <input 
                        type="number" 
                        className="financial-input w-full pr-8" 
                        value={futuresRatio}
                        onChange={e => setFuturesRatio(Number(e.target.value))}
                        min="0"
                        max="100"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-zinc-600 font-mono">%</div>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="financial-label">成交额系数</label>
                  <input 
                    type="number" 
                    className="financial-input w-full" 
                    value={turnoverCoef}
                    onChange={e => setTurnoverCoef(Number(e.target.value))}
                    min="1"
                  />
                </div>
              </div>
            )}
          </section>

          {/* API Configuration */}
          <section className="financial-card">
            <div 
              className="flex justify-between items-center cursor-pointer p-5 pb-2"
              onClick={() => setIsApiVisible(!isApiVisible)}
            >
              <div className="flex items-center gap-2">
                <Key size={18} className="text-blue-500" />
                <h2 className="font-semibold">币安 API 配置</h2>
              </div>
              <span className="text-zinc-500 text-[10px] uppercase font-mono">
                {isApiVisible ? 'HIDE' : 'SHOW'}
              </span>
            </div>
            
            {isApiVisible && (
              <div className="p-5 pt-0 space-y-4 animate-in fade-in duration-300">
                <div>
                  <label className="financial-label">账户名称 (Account Name)</label>
                  <div className="relative">
                    {showAccountDropdown && (
                      <div className="fixed inset-0 z-40" onClick={() => setShowAccountDropdown(false)} />
                    )}
                    <div className="relative z-50 flex items-center">
                      <input 
                        type="text" 
                        className="financial-input w-full pr-10" 
                        placeholder="例如: 主账号, 跑机01"
                        value={apiConfig.accountName || ''}
                        onChange={e => setApiConfig({...apiConfig, accountName: e.target.value})}
                      />
                      {savedApiAccounts.length > 0 && (
                        <button
                          type="button"
                          className="absolute right-2 text-zinc-400 hover:text-white p-1 focus:outline-none cursor-pointer"
                          onClick={() => setShowAccountDropdown(!showAccountDropdown)}
                          title="选择已保存的账户"
                        >
                          <ChevronDown size={16} />
                        </button>
                      )}
                    </div>
                    
                    {showAccountDropdown && savedApiAccounts.length > 0 && (
                      <div className="absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-[#1C1C1E] border border-zinc-800 rounded shadow-xl divide-y divide-zinc-800 animate-in fade-in slide-in-from-top-1 duration-150">
                        {savedApiAccounts.map((acc, idx) => (
                          <button
                            key={idx}
                            type="button"
                            className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-[#252528] hover:text-white transition-colors flex justify-between items-center cursor-pointer"
                            onClick={() => {
                              setApiConfig({
                                accountName: acc.accountName,
                                apiKey: '',
                                apiSecret: '',
                                baseUrl: (acc.baseUrl === 'https://fapi.binance.com' || !acc.baseUrl) ? 'https://fapi-gcp.binance.com' : acc.baseUrl
                              });
                              setShowAccountDropdown(false);
                              addLog(`已加载账号 [${acc.accountName}]。安全考虑，请手动输入其 API Key 和 API Secret 进行验证连接`, 'INFO');
                            }}
                          >
                            <span>{acc.accountName}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="financial-label">API Key</label>
                  <input 
                    type="password" 
                    className="financial-input w-full" 
                    placeholder="输入币安 API Key"
                    value={apiConfig.apiKey}
                    onChange={e => setApiConfig({...apiConfig, apiKey: e.target.value})}
                  />
                </div>
                <div>
                  <label className="financial-label">API Secret</label>
                  <input 
                    type="password" 
                    className="financial-input w-full" 
                    placeholder="输入币安 API Secret"
                    value={apiConfig.apiSecret}
                    onChange={e => setApiConfig({...apiConfig, apiSecret: e.target.value})}
                  />
                </div>
                <button 
                  onClick={handleVerifyConnection}
                  disabled={isVerifying}
                  className={`w-full flex items-center justify-center gap-2 py-2 rounded font-medium transition-all ${
                    isConnected 
                    ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30' 
                    : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20'
                  }`}
                >
                  {isVerifying ? (
                    <RefreshCw size={16} className="animate-spin" />
                  ) : isConnected ? (
                    <>
                      <CheckCircle2 size={16} />
                      已通过验证
                    </>
                  ) : (
                    <>
                      <Settings size={16} />
                      验证并连接
                    </>
                  )}
                </button>
              </div>
            )}
          </section>


        </div>

        {/* Right Column: Trading Area & Logs */}
        <div className="lg:col-span-8 flex flex-col space-y-6 h-full">
          {/* Order Module */}
          <section className="financial-card p-5">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Activity size={18} className="text-blue-500" />
                <h2 className="font-semibold">合约执行终端</h2>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-4 flex flex-col justify-between">
                <div>
                  <label className="financial-label">合约交易对 (如 BTCUSDT)</label>
                  <input 
                    type="text" 
                    className="financial-input w-full" 
                    value={orderForm.symbol}
                    onChange={e => setOrderForm({...orderForm, symbol: e.target.value})}
                  />
                </div>
                <div>
                  <label className="financial-label">下单数量 (USDT)</label>
                  <input 
                    type="number" 
                    step="any"
                    className="w-full bg-[#182C25] border border-emerald-500/40 text-[#5EF2C1] font-mono text-xl p-2 rounded focus:outline-none focus:border-[#4ADE80] font-bold transition-all placeholder-emerald-800 text-center" 
                    value={orderForm.amount || ''}
                    onChange={e => {
                      const val = e.target.value;
                      setOrderForm(prev => ({...prev, amount: val === '' ? 0 : Number(val)}));
                    }}
                  />
                </div>
              </div>

              <div className="space-y-4 flex flex-col justify-between">
                <div>
                  <label className="financial-label">订单类型</label>
                  <select 
                    className="financial-input w-full"
                    value={orderForm.type}
                    onChange={e => setOrderForm({...orderForm, type: e.target.value as any})}
                  >
                    <option value="MARKET">市价 (MARKET)</option>
                    <option value="LIMIT">限价 (LIMIT)</option>
                  </select>
                </div>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleCalculateContractVolume}
                    disabled={isCalculatingVolume}
                    className={`w-full py-2.5 px-4 rounded-lg font-bold text-sm text-white flex items-center justify-center gap-2 border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 active:scale-95 transition-all text-sky-400 ${
                      (!isConnected) ? 'opacity-40 cursor-not-allowed' : ''
                    }`}
                  >
                    {isCalculatingVolume ? (
                      <RefreshCw size={14} className="animate-spin text-sky-400" />
                    ) : (
                      <Calculator size={14} className="text-sky-400" />
                    )}
                    <span>合约量计算</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-col justify-between h-full">
                <div className="w-full">
                  <label className="financial-label invisible select-none">倒计时占位</label>
                  <div className="flex items-center justify-center bg-[#2E183B]/40 border border-fuchsia-500/30 py-2.5 rounded-t-lg border-b-0 text-[#D946EF] select-none text-center w-full shadow-inner">
                    <span className="font-mono text-2xl font-bold tracking-wider">
                      {countdownStr}
                    </span>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3 h-[80px]">
                  <button 
                    onClick={() => handlePlaceOrder('BUY')}
                    disabled={isTrading}
                    className={`w-full h-full rounded-b-lg rounded-t-none font-bold text-base flex flex-col items-center justify-center gap-1 transition-all active:scale-95 bg-emerald-300 hover:bg-emerald-400 text-zinc-950 ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {isTrading && orderForm.side === 'BUY' ? (
                      <RefreshCw className="animate-spin text-zinc-950" />
                    ) : (
                      <>
                        <Zap size={16} className="fill-zinc-950/10 text-zinc-950" />
                        <span>做多下单</span>
                        <span className="text-[10px] opacity-75 font-normal leading-none text-zinc-900">(LONG)</span>
                      </>
                    )}
                  </button>
                  <button 
                    onClick={() => handlePlaceOrder('SELL')}
                    disabled={isTrading}
                    className={`w-full h-full rounded-b-lg rounded-t-none font-bold text-base flex flex-col items-center justify-center gap-1 transition-all active:scale-95 bg-red-300 hover:bg-red-400 text-zinc-950 ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {isTrading && orderForm.side === 'SELL' ? (
                      <RefreshCw className="animate-spin text-zinc-950" />
                    ) : (
                      <>
                        <Zap size={16} className="fill-zinc-950/10 text-zinc-950" />
                        <span>做空下单</span>
                        <span className="text-[10px] opacity-75 font-normal leading-none text-zinc-900">(SHORT)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="h-px bg-zinc-800/80 my-5" />

            <div className="grid grid-cols-10 gap-3">
              <button 
                onClick={handleActiveRiskSubmit}
                disabled={isRiskProcessing || !isConnected}
                className={`col-span-4 py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98] brightness-50 hover:brightness-100 ${
                  isRiskProcessing 
                  ? 'bg-yellow-500/20 text-yellow-400 cursor-not-allowed' 
                  : 'bg-yellow-400 hover:bg-yellow-500 text-zinc-950 shadow-lg shadow-yellow-400/20'
                } ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                title="提交当前配置的止盈止损参数到云端挂单"
              >
                {isRiskProcessing ? (
                  <>
                    <RefreshCw size={16} className="animate-spin animate-spin-slow" />
                    正在同步...
                  </>
                ) : (
                  <>
                    <ShieldAlert size={16} />
                    提交云端止盈止损
                  </>
                )}
              </button>
              
              <button 
                onClick={() => {
                  const new_val = !activeRisk.timeLimitEnabled;
                  setActiveRisk(prev => ({ ...prev, timeLimitEnabled: new_val }));
                  addLog(new_val ? '[系统] 已启动持仓时间风控 (可在风控配置面板设置最大时间限制)' : '[系统] 已暂停持仓时间风控', 'INFO');
                }}
                disabled={!isConnected}
                className={`col-span-3 py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                  activeRisk.timeLimitEnabled 
                  ? 'bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-lg shadow-emerald-500/20 hover:from-emerald-400 hover:to-green-500 hover:scale-[1.02]' 
                  : 'bg-[#1e1e21] hover:bg-[#28282c] border border-white/5 text-zinc-400 hover:text-white hover:scale-[1.02]'
                } ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={`持仓超时自动风控开关 (当前: ${activeRisk.timeLimitEnabled ? '开启' : '关闭'})`}
              >
                <Clock size={16} className={activeRisk.timeLimitEnabled ? "text-emerald-200 animate-pulse" : "text-zinc-500"} />
                <span>
                  {activeRisk.timeLimitEnabled ? '时间风控 (开)' : '时间风控 (关)'}
                </span>
              </button>
              <button 
                onClick={handleCancelAllOrders}
                disabled={isCancellingAll || !isConnected}
                className={`col-span-3 py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98] brightness-50 hover:brightness-100 ${
                  isCancellingAll 
                  ? 'text-red-500 cursor-not-allowed bg-[#FF6B35]/20' 
                  : 'bg-[#FF6B35] hover:bg-[#ff8052] text-white shadow-lg shadow-[#FF6B35]/20'
                } ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isCancellingAll ? (
                  <>
                    <RefreshCw size={16} className="animate-spin animate-spin-slow" />
                    正在撤销...
                  </>
                ) : (
                  <>
                    <XCircle size={16} />
                    一键撤销风控
                  </>
                )}
              </button>
            </div>
          </section>

          {/* Positions Module */}
          <section className="financial-card overflow-hidden">
            <div className="px-5 py-2.5 border-b border-[#232326] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp size={16} className="text-blue-500" />
                <h2 className="font-semibold text-sm">永续合约持仓</h2>
              </div>
              <span className="text-[11px] font-mono text-zinc-300">{positions.length} 个活跃持仓</span>
            </div>
            
            <div className="overflow-x-auto max-h-[190px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-zinc-300 border-b border-[#232326]">
                    <th className="px-5 py-1.5 font-medium">合约 / 方向</th>
                    <th className="px-5 py-1.5 font-medium">开仓 / 标记</th>
                    <th className="px-5 py-1.5 font-medium">持仓量</th>
                    <th className="px-5 py-1.5 font-medium">未实现盈亏 (ROE%)</th>
                    <th className="px-5 py-1.5 font-medium">持仓时间</th>
                    <th className="px-5 py-1.5 font-medium text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232326]">
                  <AnimatePresence initial={false}>
                    {positions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-3 text-center text-zinc-600 italic text-xs">
                          暂无合约持仓。
                        </td>
                      </tr>
                    ) : (
                      positions.map((pos) => {
                        const submitTime = riskSubmitTimes[pos.id];
                        let countdownStr = "死斗";
                        const timeLimitMinVal = parseFloat(activeRisk.timeLimitMinutes as any) || 0;
                        if (activeRisk.timeLimitEnabled && timeLimitMinVal > 0 && submitTime) {
                          const limitMs = timeLimitMinVal * 60 * 1000;
                          const elapsedMs = Date.now() - submitTime;
                          const remainingMs = limitMs - elapsedMs;
                          if (remainingMs <= 0) {
                            countdownStr = "00:00";
                          } else {
                            const totalSecs = Math.floor(remainingMs / 1000);
                            const mins = Math.floor(totalSecs / 60);
                            const secs = totalSecs % 60;
                            countdownStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
                          }
                        }
                        return (
                        <motion.tr 
                          key={pos.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          className="hover:bg-[#1C1C1E]/50 transition-colors"
                        >
                          <td className="px-5 py-2">
                            <div className="font-bold text-xs">{pos.symbol}</div>
                            <div className={`text-[9px] font-bold px-1 py-0.2 rounded inline-block mt-0.5 ${
                              pos.side === 'BUY' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
                            }`}>
                              {pos.side === 'BUY' ? '多单 (LONG)' : '空单 (SHORT)'}
                            </div>
                          </td>
                          <td className="px-5 py-2 font-mono text-xs">
                            <div className="text-white font-semibold">{formatPrice(pos.symbol, pos.entryPrice)}</div>
                          </td>
                          <td className="px-5 py-2 font-mono text-xs text-zinc-300">
                            {pos.amount}
                          </td>
                          <td className="px-5 py-2">
                            <div className={`font-bold text-xs flex items-center gap-0.5 ${pos.pnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                              {pos.pnl >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                              {pos.pnl >= 0 ? '+' : ''}{pos.pnl.toFixed(2)}
                            </div>
                            <div className={`text-[10px] ${pos.pnlPercent >= 0 ? 'text-emerald-500/70' : 'text-red-500/70'}`}>
                              ({pos.pnlPercent >= 0 ? '+' : ''}{pos.pnlPercent.toFixed(2)}%)
                            </div>
                          </td>
                          <td className="px-5 py-2 font-mono text-xs">
                            <span className={countdownStr === '死斗' ? "text-amber-500 font-bold text-xs" : "text-amber-400 font-bold text-xs flex items-center gap-1 shrink-0"}>
                              {countdownStr !== '死斗' && <Clock size={11} className="text-amber-400 animate-pulse shrink-0" />}
                              {countdownStr}
                            </span>
                          </td>
                          <td className="px-5 py-2 text-right">
                            <button 
                              onClick={() => handleClosePosition(pos.id)}
                              className="px-2 py-0.5 bg-yellow-400 hover:bg-yellow-500 text-black text-[11px] font-bold rounded flex items-center gap-1.5 ml-auto transition-colors align-middle"
                            >
                              <XCircle size={11} />
                              市价平仓
                            </button>
                          </td>
                        </motion.tr>
                      );
                    })
                    )}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </section>

          {/* Open Orders Module */}
          <section className="financial-card overflow-hidden">
            <div className="px-5 py-2.5 border-b border-[#232326] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-blue-500" />
                <h2 className="font-semibold text-sm">永续合约当前委托</h2>
              </div>
              <span className="text-[11px] font-mono text-zinc-300">{openOrders.length} 个活跃委托</span>
            </div>
            
            <div className="overflow-x-auto max-h-[190px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-zinc-300 border-b border-[#232326]">
                    <th className="px-5 py-1.5 font-medium">合约 / 方向</th>
                    <th className="px-5 py-1.5 font-medium">类型</th>
                    <th className="px-5 py-1.5 font-medium">价格 / 触发价</th>
                    <th className="px-5 py-1.5 font-medium">条件委托</th>
                    <th className="px-5 py-1.5 font-medium text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232326]">
                  <AnimatePresence initial={false}>
                    {openOrders.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-5 py-3 text-center text-zinc-600 italic text-xs">
                          暂无活跃委托。
                        </td>
                      </tr>
                    ) : (
                      openOrders.map((order) => (
                        <motion.tr 
                          key={order.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          className="hover:bg-[#1C1C1E]/50 transition-colors"
                        >
                          <td className="px-5 py-2">
                            <div className="font-bold text-xs">{order.symbol}</div>
                            <div className={`text-[9px] font-bold px-1 py-0.2 rounded inline-block mt-0.5 ${
                              order.side === 'BUY' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
                            }`}>
                              {order.side === 'BUY' ? '买入' : '卖出'} ({order.positionSide})
                            </div>
                          </td>
                          <td className="px-5 py-2 font-mono text-xs text-zinc-400">
                            {order.type}
                          </td>
                          <td className="px-5 py-2 font-mono text-xs">
                            {order.price > 0 ? (
                              <>
                                <div className="text-white">{formatPrice(order.symbol, order.price)}</div>
                                {order.stopPrice > 0 && (
                                  <div className="text-amber-500 text-[10px]">
                                    触发: {formatPrice(order.symbol, order.stopPrice)}
                                  </div>
                                )}
                              </>
                            ) : (
                              <>
                                {order.stopPrice > 0 ? (
                                  <div className="text-amber-500 font-medium">
                                    触发: {formatPrice(order.symbol, order.stopPrice)}
                                  </div>
                                ) : (
                                  <div className="text-zinc-500">--</div>
                                )}
                              </>
                            )}
                          </td>
                          <td className="px-5 py-2">
                            {order.isAlgo ? (
                              <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                                算法止损/止盈
                              </span>
                            ) : (
                              <span className="text-[9px] text-zinc-300 font-medium">普通委托</span>
                            )}
                          </td>
                          <td className="px-5 py-2 text-right">
                            <button 
                              onClick={() => handleCancelOrder(order)}
                              className="px-2 py-0.5 bg-yellow-400 hover:bg-yellow-500 text-black text-[11px] font-bold rounded flex items-center gap-1.5 ml-auto transition-colors align-middle"
                            >
                              <XCircle size={11} />
                              撤销
                            </button>
                          </td>
                        </motion.tr>
                      ))
                    )}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </section>

          {/* Logs Module */}
          <section className="financial-card flex flex-col flex-1 min-h-[300px]">
            <div className="p-4 border-b border-[#232326] flex items-center justify-between bg-[#1C1C1E]/30">
              <div className="flex items-center gap-2">
                <Terminal size={18} className="text-blue-500" />
                <h2 className="font-semibold text-sm">系统日志</h2>
              </div>
              <div className="flex items-center gap-4">
                {/* 自动清理配置 */}
                <div className="flex items-center gap-2 bg-[#141416]/50 border border-[#232326] rounded-md px-2 py-1">
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isAutoCleanLogs}
                      onChange={(e) => {
                        const enabled = e.target.checked;
                        setIsAutoCleanLogs(enabled);
                        addLog(`[系统] 自动清理日志已${enabled ? '开启' : '关闭'}`, 'INFO');
                      }}
                      className="rounded border-[#232326] text-blue-500 focus:ring-blue-500/30 w-3.5 h-3.5 bg-black/40 cursor-pointer accent-blue-500"
                    />
                    <span className="text-[10px] text-zinc-400 font-medium">自动清理</span>
                  </label>
                  {isAutoCleanLogs && (
                    <div className="flex items-center gap-1 border-l border-[#232326] pl-2 ml-1">
                      <input
                        type="number"
                        min="1"
                        max="720"
                        value={autoCleanHours}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val) && val > 0) {
                            setAutoCleanHours(val);
                          }
                        }}
                        className="w-10 text-[10px] bg-black/40 text-center text-zinc-300 border border-[#232326] rounded h-4.5 focus:ring-1 focus:ring-blue-500/30 focus:outline-none font-sans"
                      />
                      <span className="text-[10px] text-zinc-500">小时前日志</span>
                    </div>
                  )}
                </div>

                <button 
                  onClick={() => {
                    setLogs([]);
                    addLog('[系统] 手动清空系统日志', 'INFO');
                  }}
                  className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  清除日志
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-2 custom-scrollbar bg-black/20">
              {logs.length === 0 ? (
                <div className="text-zinc-700 italic">等待系统操作...</div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="flex gap-3 leading-relaxed border-l-2 border-transparent hover:border-zinc-800 pl-2 transition-colors">
                    <span className="text-zinc-600 shrink-0">
                      [{new Date(log.timestamp).toLocaleTimeString()}]
                    </span>
                    <span className={`font-bold shrink-0 w-16 ${
                      log.type === 'SUCCESS' ? 'text-emerald-500' : 
                      log.type === 'ERROR' ? 'text-red-500' : 
                      log.type === 'TRADE' ? 'text-blue-500' : 'text-zinc-400'
                    }`}>
                      {log.type}
                    </span>
                    <span className="text-zinc-300 break-all">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
      </div>

      <div className={activeMainTab === 'MONITOR' ? 'block' : 'hidden'}>
        <MonitoringAssistant 
          apiConfig={apiConfig}
          isConnected={isConnected}
          onSelectSymbol={(sym) => {
            setOrderForm(prev => ({ ...prev, symbol: sym }));
            addLog(`已通过行情中心选择并同步 ${sym} 到合约执行面板`, 'SUCCESS');
          }}
          addLog={addLog}
          onSwitchToTrade={() => setActiveMainTab('TRADE')}
          isMuted={isMuted}
        />
      </div>

      <div className={activeMainTab === 'REPORT' ? 'block' : 'hidden'}>
        {renderReportView()}
      </div>

      {/* 划转面板 (Account Transfer Modal) */}
      <AnimatePresence>
        {isTransferModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              id="transfer_modal"
              className="bg-[#121214] border border-[#232326] rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              {/* Modal Header */}
              <div className="p-4 border-b border-[#232326] flex items-center justify-between bg-[#18181B]">
                <div className="flex items-center gap-2">
                  <Wallet size={18} className="text-emerald-400" />
                  <span className="font-bold text-sm text-zinc-100">
                    账户划转 (USDT)
                  </span>
                </div>
                <button 
                  onClick={() => setIsTransferModalOpen(false)}
                  className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  <XCircle size={18} />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-5 space-y-4">
                {/* Transfer Direction Display */}
                <div className="bg-[#18181B] p-3 rounded-lg border border-[#232326] flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-zinc-500 uppercase font-mono">从 (From)</span>
                    <span className="text-zinc-200 text-sm font-bold mt-0.5">
                      {transferType === 'futures_to_spot' ? '合约账户' : '现货账户'}
                    </span>
                    <span className="text-xs text-zinc-400 font-mono mt-1">
                      余额: {transferType === 'futures_to_spot' 
                        ? (balance.futuresBalance || 0).toFixed(2) 
                        : (balance.spotBalance || 0).toFixed(2)} USDT
                    </span>
                  </div>
                  
                  <div className="text-zinc-500 flex items-center justify-center">
                    <ArrowDownRight size={20} className="rotate-45 text-zinc-400" />
                  </div>

                  <div className="flex flex-col text-right">
                    <span className="text-[10px] text-zinc-500 uppercase font-mono">至 (To)</span>
                    <span className="text-zinc-200 text-sm font-bold mt-0.5">
                      {transferType === 'futures_to_spot' ? '现货账户' : '合约账户'}
                    </span>
                    <span className="text-xs text-zinc-400 font-mono mt-1">
                      余额: {transferType === 'futures_to_spot' 
                        ? (balance.spotBalance || 0).toFixed(2) 
                        : (balance.futuresBalance || 0).toFixed(2)} USDT
                    </span>
                  </div>
                </div>

                {/* Amount Input */}
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400 flex justify-between items-center">
                    <span>划转数量 (Amount)</span>
                    <button 
                      onClick={() => {
                        const maxVal = transferType === 'futures_to_spot' 
                          ? (balance.futuresBalance || 0) 
                          : (balance.spotBalance || 0);
                        setTransferAmount(maxVal.toString());
                      }}
                      className="text-[10px] text-emerald-400 hover:text-emerald-300 font-bold font-mono uppercase"
                    >
                      MAX
                    </button>
                  </label>
                  <div className="relative">
                    <input 
                      type="number" 
                      placeholder="0.00"
                      value={transferAmount}
                      onChange={e => setTransferAmount(e.target.value)}
                      className="w-full bg-[#18181B] border border-[#232326] focus:border-emerald-500 rounded p-2.5 text-zinc-100 font-mono text-sm focus:outline-none"
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-zinc-500 font-bold font-mono">USDT</span>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 bg-[#18181B] border-t border-[#232326] flex gap-3 justify-end">
                <button 
                  onClick={() => setIsTransferModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  取消
                </button>
                <button 
                  disabled={isTransferring}
                  onClick={handleTransfer}
                  className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-5 py-2 rounded text-xs font-bold transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  {isTransferring ? '正在处理...' : 'OK'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer Status Bar */}
      <footer className="fixed bottom-0 left-0 right-0 bg-[#0A0A0B] border-t border-[#232326] px-4 py-2 flex items-center justify-between text-[10px] text-zinc-500 font-mono z-50">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`} />
            币安 WS {isConnected ? '已连接' : '未连接'}
          </div>
          <div>延迟: 12ms</div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-zinc-600">API:</span>
            <span className={isConnected ? 'text-emerald-500' : 'text-zinc-500'}>
              {isConnected ? 'VALID' : 'PENDING'}
            </span>
          </div>
          <div>UTC: {new Date().toISOString()}</div>
          <div className="text-blue-500">v1.1.0-STABLE</div>
        </div>
      </footer>
    </div>
  );
}
