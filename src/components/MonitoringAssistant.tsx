/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, 
  Square, 
  Settings, 
  Volume2, 
  VolumeX, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  AlertCircle,
  Upload,
  Pause,
  ChevronRight,
  X,
  Mail,
  Send,
  Sparkles,
  ExternalLink,
  RefreshCw,
  Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TradeLog } from '../types';

// --- Types ---

interface BinanceTicker {
  symbol: string;
  quoteVolume: string;
  lastPrice: string;
  priceChangePercent: string;
}

interface Config {
  xMin: number;
  xSec: number;
  m: number; // 24h volume threshold for Phase 1
  n: number; // 15m volume threshold for Phase 1
  yMin: number;
  ySec: number;
  m1: number; // 24h volume threshold for Phase 2
  n1: number; // 15m volume threshold for Phase 2
  gainThreshold: number;
  lossThreshold: number;
  amplitudeThreshold: number;
  enableAlertTimeout: boolean;
  alertTimeoutSeconds: number;
}

interface SymbolData {
  symbol: string;
  volume24h: number;
  volume15m: number;
  openPrice: number;
  lastPrice: number;
  change: number;
  change24h: number;
  amplitude?: number;
}

interface FundingRateData {
  symbol: string;
  fundingRate: number;
  settlementCycle: string;
  volume24h: number;
  nextFundingTime?: number;
  fetchedAt?: number;
}

interface ScanResult {
  gainers: SymbolData[];
  losers: SymbolData[];
  amplitude15m: SymbolData[];
  gainers24h: SymbolData[];
  losers24h: SymbolData[];
  timestamp: number;
}

interface MonitoringAssistantProps {
  apiConfig: { apiKey: string; apiSecret: string; baseUrl: string };
  isConnected: boolean;
  onSelectSymbol: (symbol: string) => void;
  addLog: (message: string, type?: TradeLog['type']) => void;
  onSwitchToTrade: () => void;
  isMuted?: boolean;
}

// --- Constants ---

const CYCLE_MS = 15 * 60 * 1000; // 15 minutes

const TRANSLATIONS = {
  title: "币安永续监控",
  subtitle: "Binance Futures Monitor",
  parameterConfig: "参数配置",
  phase1Title: "阶段一 (扫描全市场)",
  startTime: "开始时间 (分:秒)",
  vol24hM: "24h成交额 M (USDT)",
  vol15mN: "15m成交额 N (USDT)",
  phase2Title: "阶段二 (二次分析)",
  vol24hM1: "24h成交额 M1 (USDT)",
  vol15mN1: "15m成交额 N1 (USDT)",
  alertThreshold: "报警阈值",
  gainThreshold: "涨幅阈值 (%)",
  lossThreshold: "跌幅阈值 (%)",
  amplitudeThreshold: "振幅阈值 (%)",
  voiceAlerts: "语音报警",
  stopAnnouncement: "停止播报",
  gainAlertSound: "涨幅报警音 (MP3)",
  lossAlertSound: "跌幅报警音 (MP3)",
  amplitudeAlertSound: "振幅报警音 (MP3)",
  uploaded: "已上传",
  clickToUpload: "点击上传",
  fundingRateLeaderboard: "资金费率排行榜",
  gainer15m: "15分钟涨幅榜",
  loser15m: "15分钟跌幅榜",
  amplitude15m: "15分钟振幅榜",
  gainer24h: "24小时涨幅榜",
  loser24h: "24小时跌幅榜",
  tableSymbol: "币种",
  tableRate: "费率",
  tableCycle: "周期",
  table24hVol: "24h成交额（万）",
  table15mVol: "成交额（万）",
  tableGain: "涨幅",
  tableLoss: "跌幅",
  tableAmplitude: "振幅",
  loading: "加载中...",
  currentTime: "当前时间",
  cachePoolStatus: "缓存池状态",
  symbolsUnit: "币种",
  apiError: "API 错误",
  recentScanStats: "最近扫描统计",
  totalSymbols: "总币种",
  passed24h: "24h通过",
  passed15m: "15m通过",
  runningInstructions: "运行说明",
  rule1: "监控程序以15分钟为一个完整周期（0, 15, 30, 45分）。",
  rule2Part1: "阶段一：在每根K线的第 ",
  rule2Part2: "分",
  rule2Part3: "秒 扫描全市场，筛选符合条件的币种进入缓存。",
  rule3Part1: "阶段二：在每根K线的第 ",
  rule3Part2: "分",
  rule3Part3: "秒 对缓存中的币种进行二次分析并展示榜单。",
  rule4: "资金费率榜：优先显示结算周期短（如2h/4h）且费率绝对值高的币种。",
  rule5: "注意：请确保浏览器允许自动播放音频，或在上传后点击一次界面以激活音频上下文。",
  triggerGainAlert: "触发涨幅警报！",
  triggerLossAlert: "触发跌幅警报！",
  triggerAmpAlert: "触发振幅警报！",
  alertBannerSub: "当前榜单中已有币种超过设定的阈值。",
  dismissAlert: "我知道了",
  waitingScan: "等待扫描结果...",
  stopProgram: "停止程序",
  startProgram: "启动程序",
  phase1Countdown: "阶段一倒计时",
  phase2Countdown: "阶段二倒计时",
  versionInfo: "版本信息 v1.0.0 Community Edition.",
  copyright: "© 2026 QuantSolutions. All rights reserved.",
};

export default function MonitoringAssistant({ 
  apiConfig,
  isConnected,
  onSelectSymbol,
  addLog,
  onSwitchToTrade,
  isMuted = false
}: MonitoringAssistantProps) {
  // --- State ---
  const [isRunning, setIsRunning] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const t = TRANSLATIONS;
  const [config, setConfig] = useState<Config>({
    xMin: 12,
    xSec: 0,
    m: 10000000,
    n: 2000000,
    yMin: 14,
    ySec: 30,
    m1: 15000000,
    n1: 3000000,
    gainThreshold: 5,
    lossThreshold: 5,
    amplitudeThreshold: 8,
    enableAlertTimeout: true,
    alertTimeoutSeconds: 15,
  });

  const [cache1, setCache1] = useState<string[]>([]);
  const [results, setResults] = useState<ScanResult | null>(null);
  const [fundingRates, setFundingRates] = useState<FundingRateData[]>([]);
  const [fundingPage, setFundingPage] = useState<number>(1);
  const [isFetchingFunding, setIsFetchingFunding] = useState(false);
  const [symbolsInfo, setSymbolsInfo] = useState<any[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [phase1Countdown, setPhase1Countdown] = useState<string>('00:00');
  const [phase2Countdown, setPhase2Countdown] = useState<string>('00:00');
  const [scanStats, setScanStats] = useState<{
    lastScanTime: string;
    totalTickers: number;
    passed24h: number;
    passed15m: number;
  } | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  
  const [audioFiles, setAudioFiles] = useState<{ gain: string | null; loss: string | null; amp: string | null }>({
    gain: null,
    loss: null,
    amp: null,
  });
  const [isAlerting, setIsAlerting] = useState(false);
  const [activeAlert, setActiveAlert] = useState<'gain' | 'loss' | 'amp' | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted]);
  const lastPhase1Trigger = useRef<number>(-1);
  const lastPhase2Trigger = useRef<number>(-1);
  const lastFundingFetchHour = useRef<number>(-1);

  // --- Audio Logic ---

  const handleFileUpload = (type: 'gain' | 'loss' | 'amp', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setAudioFiles(prev => ({ ...prev, [type]: url }));
      let alertLabel = '上涨';
      if (type === 'loss') alertLabel = '下跌';
      if (type === 'amp') alertLabel = '振幅';
      addLog(`[语音报警] 已成功上传「${alertLabel}」警报音频文件`, 'SUCCESS');
    }
  };

  const alertTimerRef = useRef<any>(null);
  const playPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    return () => {
      if (alertTimerRef.current) {
        clearTimeout(alertTimerRef.current);
      }
    };
  }, []);

  const stopAlert = useCallback(() => {
    setIsAlerting(false);
    setActiveAlert(null);
    
    const pauseAudio = () => {
      if (audioRef.current) {
        try {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        } catch (e) {
          console.error("Failed to pause audio:", e);
        }
      }
    };

    if (playPromiseRef.current) {
      playPromiseRef.current
        .then(() => {
          pauseAudio();
          playPromiseRef.current = null;
        })
        .catch((err) => {
          // Play was interrupted or failed, but still pause and clean up safely
          pauseAudio();
          playPromiseRef.current = null;
        });
    } else {
      pauseAudio();
    }

    if (alertTimerRef.current) {
      clearTimeout(alertTimerRef.current);
      alertTimerRef.current = null;
    }
  }, []);

  const triggerAlert = useCallback((type: 'gain' | 'loss' | 'amp') => {
    if (audioFiles[type] && !isAlerting) {
      setActiveAlert(type);
      setIsAlerting(true);
      if (audioRef.current) {
        audioRef.current.src = audioFiles[type]!;
        audioRef.current.loop = true;
        audioRef.current.muted = isMuted;
        
        const promise = audioRef.current.play();
        playPromiseRef.current = promise;
        
        promise
          .then(() => {
            if (playPromiseRef.current === promise) {
              playPromiseRef.current = null;
            }
          })
          .catch(err => {
            console.warn("Audio play failed or was interrupted:", err);
            if (playPromiseRef.current === promise) {
              playPromiseRef.current = null;
            }
          });
      }

      if (alertTimerRef.current) {
        clearTimeout(alertTimerRef.current);
      }

      if (config.enableAlertTimeout) {
        alertTimerRef.current = setTimeout(() => {
          stopAlert();
          let alertLabel = '价格上涨';
          if (type === 'loss') alertLabel = '价格下跌';
          if (type === 'amp') alertLabel = '15m振幅';
          addLog(`[系统] 警报持续时间已达 ${config.alertTimeoutSeconds} 秒，自动完成清除本次警报音和特效`, 'INFO');
        }, config.alertTimeoutSeconds * 1000);
      }
    }
  }, [audioFiles, isAlerting, isMuted, config.enableAlertTimeout, config.alertTimeoutSeconds, stopAlert, addLog]);

  // --- Sync State from Backend ---

  const lastSeenResultTimestamp = useRef<number>(-1);

  // Poll server state and sync with frontend UI
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/monitoring/status");
        if (res.ok) {
          const data = await res.json();
          setIsRunning(data.isRunning);
          setConfig(data.config);
          setScanStats(data.scanStats);
          setResults(data.results);
          setFundingRates(data.fundingRates || []);
          setPhase1Countdown(data.phase1Countdown);
          setPhase2Countdown(data.phase2Countdown);
          setCache1(data.cache1 || []);
        }
      } catch (err) {
        console.error("Failed to fetch monitoring status:", err);
      }
    };

    fetchStatus();
    const statusInterval = setInterval(fetchStatus, 1500); // Poll status every 1.5 seconds
    return () => clearInterval(statusInterval);
  }, []);

  // Update a ticking local clock
  useEffect(() => {
    const clockInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(clockInterval);
  }, []);

  // Check alert conditions when results are updated from the backend
  useEffect(() => {
    if (results && results.timestamp && results.timestamp !== lastSeenResultTimestamp.current) {
      lastSeenResultTimestamp.current = results.timestamp;
      
      const maxGain = results.gainers && results.gainers.length > 0 ? results.gainers[0].change : 0;
      const maxLoss = results.losers && results.losers.length > 0 ? Math.abs(results.losers[0].change) : 0;
      const maxAmplitude = results.amplitude15m && results.amplitude15m.length > 0 ? (results.amplitude15m[0].amplitude || 0) : 0;

      let alertTriggered = false;
      if (maxGain >= config.gainThreshold) {
        triggerAlert('gain');
        alertTriggered = true;
      }
      if (maxLoss >= config.lossThreshold) {
        if (!alertTriggered) {
          triggerAlert('loss');
          alertTriggered = true;
        }
      }
      if (maxAmplitude >= config.amplitudeThreshold) {
        if (!alertTriggered) {
          triggerAlert('amp');
          alertTriggered = true;
        }
      }
    }
  }, [results, config, triggerAlert]);

  // Synchronize parameter config immediately back to Node.js backend
  const updateConfig = async (updatedConfig: Config) => {
    setConfig(updatedConfig);
    try {
      await fetch("/api/monitoring/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedConfig)
      });
    } catch (err) {
      console.error("Failed to sync config:", err);
    }
  };

  const toggleRunning = async () => {
    try {
      const res = await fetch("/api/monitoring/toggle", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setIsRunning(data.isRunning);
        addLog(data.isRunning ? '[扫描监控] 监控与量化过滤程序在服务器后端开始启动运行...' : '[扫描监控] 配置程序已被用户手动中止。', data.isRunning ? 'SUCCESS' : 'INFO');
      }
    } catch (err) {
      console.error("Failed to toggle running state:", err);
    }
  };

  const triggerPhase1Manual = async () => {
    addLog('[监控看板] 触发手动指令：开始立即执行阶段一全市场扫描...', 'INFO');
    try {
      const res = await fetch("/api/monitoring/scan-phase1", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setCache1(data.cache1 || []);
        setScanStats(data.scanStats);
        addLog(`[监控看板] 手动阶段一完成！${data.cache1 ? data.cache1.length : 0} 交易对存入缓存。`, 'SUCCESS');
      }
    } catch (err) {
      console.error("Failed manual Phase 1:", err);
      addLog(`[监控看板] 手动阶段一异常: ${err}`, 'ERROR');
    }
  };

  const triggerPhase2Manual = async () => {
    addLog('[监控看板] 触发手动指令：开始立即执行阶段二二次量化过滤...', 'INFO');
    try {
      const res = await fetch("/api/monitoring/scan-phase2", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setResults(data.results);
        addLog('[监控看板] 手动阶段二二次量化过滤完成并加载刷新！', 'SUCCESS');
      }
    } catch (err) {
      console.error("Failed manual Phase 2:", err);
      addLog(`[监控看板] 手动阶段二异常: ${err}`, 'ERROR');
    }
  };

  const fetchFundingRates = async () => {
    setIsFetchingFunding(true);
    addLog('[资金费率] 手动刷新资金费率中...', 'INFO');
    try {
      const res = await fetch("/api/monitoring/funding/refresh", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setFundingRates(data.fundingRates || []);
        addLog('[资金费率] 资金费率更新成功！', 'SUCCESS');
      }
    } catch (err) {
      console.error("Failed to refresh funding rates:", err);
      addLog(`[资金费率] 刷新异常: ${err}`, 'ERROR');
    } finally {
      setIsFetchingFunding(false);
    }
  };

  const copyToClipboard = async (text: string): Promise<boolean> => {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        console.warn('Modern clipboard API failed, trying fallback...', err);
      }
    }

    // Legacy fallback for non-secure HTTP contexts (IP addresses without domain/SSL)
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.top = "-9999px";
      textArea.style.left = "-9999px";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    } catch (err) {
      console.error('Fallback copy failed:', err);
      return false;
    }
  };

  const handleRowClick = async (symbol: string) => {
    const success = await copyToClipboard(symbol);
    if (success) {
      addLog(`[剪贴板] 已成功将合约 "${symbol}" 复制到剪贴板`, 'SUCCESS');
    } else {
      addLog(`[剪贴板] 复制失败，请手动选择复制合约 "${symbol}"`, 'ERROR');
    }
    onSelectSymbol(symbol);
    onSwitchToTrade();
  };

  // --- Formatters ---

  const formatVolume = (vol: number) => {
    const value = (vol / 10000).toFixed(2);
    return `${value}`;
  };

  return (
    <div className="text-gray-100 font-sans selection:bg-red-500/30 min-h-[calc(100vh-170px)] flex flex-col gap-6">
      <audio ref={audioRef} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mt-1 flex-1 items-stretch">
        
        {/* Left Column: Config & Audio OR Funding Rate Ranking */}
        <div className="lg:col-span-4 flex flex-col space-y-5 h-full">
          
          {showSettings ? (
            <>
              {/* Config Card */}
              <section className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden shadow-2xl flex-1 flex flex-col min-h-[400px]">
                <div className="px-5 py-4 border-b border-white/10 bg-white/5 flex items-center gap-2">
                  <Settings className="w-4 h-4 text-gray-400" />
                  <h2 className="font-bold text-sm uppercase tracking-wider">{t.parameterConfig}</h2>
                </div>
                <div className="p-5 space-y-6 flex-1 overflow-y-auto">
                  
                  {/* Phase 1 Config */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-gray-400 uppercase flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      {t.phase1Title}
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] text-gray-400 block">{t.startTime}</label>
                        <div className="flex gap-1 items-center">
                          <input 
                            type="number" 
                            value={config.xMin} 
                            onChange={e => updateConfig({...config, xMin: parseInt(e.target.value) || 0})}
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-center focus:border-red-500 outline-none font-mono"
                          />
                          <span className="text-gray-600">:</span>
                          <input 
                            type="number" 
                            value={config.xSec} 
                            onChange={e => updateConfig({...config, xSec: parseInt(e.target.value) || 0})}
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-center focus:border-red-500 outline-none font-mono"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-gray-400 block">{t.vol24hM}</label>
                        <input 
                          type="number" 
                          value={config.m} 
                          onChange={e => updateConfig({...config, m: parseInt(e.target.value) || 0})}
                          className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs focus:border-red-500 outline-none font-mono"
                        />
                      </div>
                      <div className="space-y-1 col-span-2">
                        <label className="text-[10px] text-gray-400 block">{t.vol15mN}</label>
                        <input 
                          type="number" 
                          value={config.n} 
                          onChange={e => updateConfig({...config, n: parseInt(e.target.value) || 0})}
                          className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs focus:border-red-500 outline-none font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Phase 2 Config */}
                  <div className="space-y-3 pt-4 border-t border-white/5">
                    <h3 className="text-xs font-bold text-gray-400 uppercase flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      {t.phase2Title}
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] text-gray-400 block">{t.startTime}</label>
                        <div className="flex gap-1 items-center">
                          <input 
                            type="number" 
                            value={config.yMin} 
                            onChange={e => updateConfig({...config, yMin: parseInt(e.target.value) || 0})}
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-center focus:border-emerald-500 outline-none font-mono"
                          />
                          <span className="text-gray-600">:</span>
                          <input 
                            type="number" 
                            value={config.ySec} 
                            onChange={e => updateConfig({...config, ySec: parseInt(e.target.value) || 0})}
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-center focus:border-emerald-500 outline-none font-mono"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-gray-400 block">{t.vol24hM1}</label>
                        <input 
                          type="number" 
                          value={config.m1} 
                          onChange={e => updateConfig({...config, m1: parseInt(e.target.value) || 0})}
                          className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs focus:border-emerald-500 outline-none font-mono"
                        />
                      </div>
                      <div className="space-y-1 col-span-2">
                        <label className="text-[10px] text-gray-400 block">{t.vol15mN1}</label>
                        <input 
                          type="number" 
                          value={config.n1} 
                          onChange={e => updateConfig({...config, n1: parseInt(e.target.value) || 0})}
                          className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs focus:border-emerald-500 outline-none font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Thresholds */}
                  <div className="space-y-3 pt-4 border-t border-white/5">
                    <h3 className="text-xs font-bold text-gray-400 uppercase">{t.alertThreshold}</h3>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] text-gray-400 block">{t.gainThreshold}</label>
                        <input 
                          type="number" 
                          step="0.1"
                          value={config.gainThreshold} 
                          onChange={e => updateConfig({...config, gainThreshold: parseFloat(e.target.value) || 0})}
                          className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-red-500 font-bold focus:border-red-500 outline-none font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-gray-400 block">{t.lossThreshold}</label>
                        <input 
                          type="number" 
                          step="0.1"
                          value={config.lossThreshold} 
                          onChange={e => updateConfig({...config, lossThreshold: parseFloat(e.target.value) || 0})}
                          className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-emerald-500 font-bold focus:border-emerald-500 outline-none font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-gray-400 block">{t.amplitudeThreshold}</label>
                        <input 
                          type="number" 
                          step="0.1"
                          value={config.amplitudeThreshold} 
                          onChange={e => updateConfig({...config, amplitudeThreshold: parseFloat(e.target.value) || 0})}
                          className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-amber-500 font-bold focus:border-amber-500 outline-none font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Alert Duration Control */}
                  <div className="space-y-3 pt-4 border-t border-white/5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-gray-400 uppercase">警报时间控制</h3>
                      <label className="flex items-center gap-1.5 cursor-pointer select-none">
                        <input 
                          type="checkbox"
                          checked={config.enableAlertTimeout}
                          onChange={e => {
                            const enabled = e.target.checked;
                            updateConfig({...config, enableAlertTimeout: enabled});
                            addLog(`[系统] 警报持续时间限制已${enabled ? '开启' : '关闭'}`, 'INFO');
                          }}
                          className="rounded border-white/10 text-blue-500 focus:ring-blue-500/30 w-3.5 h-3.5 bg-black/40 cursor-pointer accent-blue-500"
                        />
                        <span className="text-[10px] text-zinc-400 font-medium font-sans">限制持续时间</span>
                      </label>
                    </div>
                    {config.enableAlertTimeout && (
                      <div className="space-y-1">
                        <label className="text-[10px] text-gray-400 block">警报持续秒数 (秒)</label>
                        <input 
                          type="number" 
                          min="1"
                          max="3600"
                          value={config.alertTimeoutSeconds} 
                          onChange={e => {
                            const val = parseInt(e.target.value, 10);
                            if (!isNaN(val) && val > 0) {
                              updateConfig({...config, alertTimeoutSeconds: val});
                            }
                          }}
                          className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-blue-400 font-bold focus:border-blue-500 outline-none font-mono"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* Audio Upload Card */}
              <section className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
                <div className="px-5 py-4 border-b border-white/10 bg-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-gray-400" />
                    <h2 className="font-bold text-sm uppercase tracking-wider">{t.voiceAlerts}</h2>
                  </div>
                  {isAlerting && (
                    <button 
                      onClick={stopAlert}
                      className="flex items-center gap-1.5 px-3 py-1 bg-red-500 text-white rounded-lg text-xs font-bold animate-pulse cursor-pointer"
                    >
                      <Pause className="w-3 h-3 fill-current" />
                      {t.stopAnnouncement}
                    </button>
                  )}
                </div>
                <div className="p-5 space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs text-gray-400 flex items-center gap-2">
                      <TrendingUp className="w-3 h-3 text-red-500" /> {t.gainAlertSound}
                    </label>
                    <div className="relative group">
                      <input 
                        type="file" 
                        accept=".mp3" 
                        onChange={e => handleFileUpload('gain', e)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      />
                      <div className={`p-3 border-2 border-dashed rounded-xl flex items-center justify-center gap-2 transition-colors ${audioFiles.gain ? 'border-red-500/50 bg-red-500/5' : 'border-white/10 group-hover:border-white/20'}`}>
                        <Upload className="w-4 h-4 text-gray-500" />
                        <span className="text-xs text-gray-400 font-medium">{audioFiles.gain ? t.uploaded : t.clickToUpload}</span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-gray-400 flex items-center gap-2">
                      <TrendingDown className="w-3 h-3 text-emerald-500" /> {t.lossAlertSound}
                    </label>
                    <div className="relative group">
                      <input 
                        type="file" 
                        accept=".mp3" 
                        onChange={e => handleFileUpload('loss', e)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      />
                      <div className={`p-3 border-2 border-dashed rounded-xl flex items-center justify-center gap-2 transition-colors ${audioFiles.loss ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-white/10 group-hover:border-white/20'}`}>
                        <Upload className="w-4 h-4 text-gray-500" />
                        <span className="text-xs text-gray-400 font-medium">{audioFiles.loss ? t.uploaded : t.clickToUpload}</span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-gray-400 flex items-center gap-2">
                      <Activity className="w-3 h-3 text-amber-500" /> {t.amplitudeAlertSound}
                    </label>
                    <div className="relative group">
                      <input 
                        type="file" 
                        accept=".mp3" 
                        onChange={e => handleFileUpload('amp', e)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      />
                      <div className={`p-3 border-2 border-dashed rounded-xl flex items-center justify-center gap-2 transition-colors ${audioFiles.amp ? 'border-amber-500/50 bg-amber-500/5' : 'border-white/10 group-hover:border-white/20'}`}>
                        <Upload className="w-4 h-4 text-gray-500" />
                        <span className="text-xs text-gray-400 font-medium">{audioFiles.amp ? t.uploaded : t.clickToUpload}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </>
          ) : (
            /* Funding Rate Ranking Card */
            (() => {
              const totalFundingPages = Math.max(1, Math.ceil(fundingRates.length / 8));
              const safeFundingPage = Math.min(fundingPage, totalFundingPages);
              const paginatedFundingRates = fundingRates.slice((safeFundingPage - 1) * 8, safeFundingPage * 8);
              return (
                <section className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden flex flex-col flex-1 min-h-[350px] shadow-2xl">
                  <div className="px-5 py-4 border-b border-white/10 bg-white/5 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-yellow-500" />
                      <h2 className="font-bold text-[21px] uppercase tracking-wider">{t.fundingRateLeaderboard}</h2>
                      <button 
                        onClick={fetchFundingRates}
                        disabled={isFetchingFunding}
                        className="p-1 hover:bg-white/10 active:bg-white/25 rounded-md transition-colors cursor-pointer group flex items-center justify-center"
                        title="手动刷新"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 text-zinc-400 group-hover:text-yellow-500 transition-all ${isFetchingFunding ? 'animate-spin text-yellow-500' : ''}`} />
                      </button>
                    </div>
                    {fundingRates.length > 0 && (
                      <div className="flex items-center gap-1.5 text-[18px] font-mono">
                        <button
                          onClick={() => setFundingPage(p => Math.max(1, p - 1))}
                          disabled={safeFundingPage <= 1}
                          className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-white/5 text-zinc-300 transition-colors cursor-pointer"
                        >
                          &lt;
                        </button>
                        <span className="text-zinc-400 text-[16.5px] font-bold">
                          {safeFundingPage} / {totalFundingPages}
                        </span>
                        <button
                          onClick={() => setFundingPage(p => Math.min(totalFundingPages, p + 1))}
                          disabled={safeFundingPage >= totalFundingPages}
                          className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-white/5 text-zinc-300 transition-colors cursor-pointer"
                        >
                          &gt;
                        </button>
                        <span className="text-[15px] text-zinc-500 font-bold ml-0.5">
                          (Top {fundingRates.length})
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto scrollbar-hide">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-[#161619] z-10 shadow-sm border-b border-white/5">
                        <tr className="text-[15px] text-gray-500 uppercase font-bold tracking-wider">
                          <th className="px-4 py-3">{t.tableSymbol}</th>
                          <th className="px-4 py-3">{t.tableRate}</th>
                          <th className="px-4 py-3">{t.tableCycle}</th>
                          <th className="px-4 py-3">倒计时（分钟）</th>
                          <th className="px-4 py-3 text-right">{t.table24hVol}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {paginatedFundingRates.map((item) => (
                          <tr 
                            key={item.symbol} 
                            className="hover:bg-white/5 transition-colors group cursor-pointer"
                            title="点击快速交易"
                            onClick={() => handleRowClick(item.symbol)}
                          >
                            <td className="px-4 py-3">
                              <span className="font-bold text-[17px] text-zinc-100 group-hover:text-yellow-500 transition-colors">
                                {item.symbol.replace('USDT', '')}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-[17px] font-sans font-bold ${item.fundingRate > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                {item.fundingRate > 0 ? '+' : ''}{item.fundingRate.toFixed(2)}%
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-[14px] text-gray-500 font-medium">{item.settlementCycle}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-[14px] font-mono text-zinc-300">
                                {item.nextFundingTime && item.fetchedAt
                                  ? `${Math.max(0, (item.nextFundingTime - item.fetchedAt) / (60 * 1000)).toFixed(1)}`
                                  : '--'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="text-[14px] font-mono text-gray-400">{formatVolume(item.volume24h)}</span>
                            </td>
                          </tr>
                        ))}
                        {fundingRates.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-4 py-12 text-center text-gray-600 italic text-[17px]">
                              {isRunning ? t.loading : '程序未启动：请先点击下方开启程序'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })()
          )}

          {/* Controls Card */}
          <section className="bg-white/5 rounded-2xl border border-white/10 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between gap-4">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`p-3 rounded-xl border transition-all duration-300 cursor-pointer ${
                  showSettings 
                    ? 'bg-red-500/15 border-red-500/50 text-red-500' 
                    : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10'
                }`}
                title={t.parameterConfig}
              >
                <Settings className={`w-5 h-5 ${showSettings ? 'rotate-90' : ''} transition-transform duration-300`} />
              </button>

              <button
                onClick={toggleRunning}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold transition-all duration-300 cursor-pointer ${
                  isRunning 
                    ? 'bg-red-500/10 text-red-500 border border-red-500/50 hover:bg-red-500/20' 
                    : 'bg-green-600 text-white shadow-lg shadow-green-900/20 hover:bg-green-500 hover:-translate-y-0.5'
                }`}
              >
                {isRunning ? <Square className="w-4 h-4 fill-current animate-pulse" /> : <Play className="w-4 h-4 fill-current shrink-0" />}
                {isRunning ? t.stopProgram : t.startProgram}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/5 px-4 py-2.5 rounded-xl border border-white/10 flex flex-col items-center justify-between">
                <span className="text-[10px] text-gray-500 uppercase font-bold tracking-tight">{t.phase1Countdown}</span>
                <span className="text-lg font-mono font-bold text-red-500 mt-1">{phase1Countdown}</span>
                <button
                  onClick={triggerPhase1Manual}
                  className="mt-2 text-[10px] bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold px-2.5 py-1 rounded-lg border border-red-500/20 active:scale-95 transition-all cursor-pointer w-full text-center"
                >
                  立即扫描
                </button>
              </div>
              <div className="bg-white/5 px-4 py-2.5 rounded-xl border border-white/10 flex flex-col items-center justify-between">
                <span className="text-[10px] text-gray-500 uppercase font-bold tracking-tight">{t.phase2Countdown}</span>
                <span className="text-lg font-mono font-bold text-emerald-500 mt-1">{phase2Countdown}</span>
                <button
                  onClick={triggerPhase2Manual}
                  className="mt-2 text-[10px] bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-bold px-2.5 py-1 rounded-lg border border-emerald-500/20 active:scale-95 transition-all cursor-pointer w-full text-center"
                >
                  立即过滤
                </button>
              </div>
            </div>
          </section>

          {/* Status Card */}
          <section className="bg-white/5 rounded-2xl border border-white/10 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-gray-500 animate-spin" style={{ animationDuration: '4s' }} />
                <div>
                  <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">{t.currentTime}</p>
                  <p className="text-base font-mono font-bold text-zinc-300 mt-0.5">{currentTime.toLocaleTimeString()}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">{t.cachePoolStatus}</p>
                <p className="text-base font-mono font-bold text-blue-400 mt-0.5">{cache1.length} <span className="text-xs text-gray-600">{t.symbolsUnit}</span></p>
              </div>
            </div>

            {apiError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2 text-red-400 text-xs shadow-inner animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <p className="font-semibold">{t.apiError}: {apiError}</p>
              </div>
            )}

            {scanStats && (
              <div className="pt-4 border-t border-white/5 space-y-2.5 animate-in slide-in-from-bottom-2">
                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">{t.recentScanStats} ({scanStats.lastScanTime})</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-black/20 p-2 rounded-lg text-center border border-white/5">
                    <p className="text-[9px] text-gray-500 font-bold">{t.totalSymbols}</p>
                    <p className="text-xs font-mono font-bold text-zinc-300 mt-1">{scanStats.totalTickers}</p>
                  </div>
                  <div className="bg-black/20 p-2 rounded-lg text-center border border-white/5">
                    <p className="text-[9px] text-gray-500 font-bold">{t.passed24h}</p>
                    <p className="text-xs font-mono font-bold text-yellow-500 mt-1">{scanStats.passed24h}</p>
                  </div>
                  <div className="bg-black/20 p-2 rounded-lg text-center border border-white/5">
                    <p className="text-[9px] text-gray-500 font-bold">{t.passed15m}</p>
                    <p className="text-xs font-mono font-bold text-emerald-500 mt-1">{scanStats.passed15m}</p>
                  </div>
                </div>
              </div>
            )}
          </section>

        </div>

        {/* Right Column: Results */}
        <div className="lg:col-span-8 flex flex-col space-y-6 h-full">
          
          {/* Alert Banner */}
          <AnimatePresence>
            {isAlerting && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className={`p-4 rounded-2xl border flex items-center justify-between shadow-2xl ${
                  activeAlert === 'gain' 
                    ? 'bg-red-500/10 border-red-500/50 text-red-400' 
                    : activeAlert === 'loss'
                    ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400'
                    : 'bg-amber-500/10 border-amber-500/50 text-amber-400'
                }`}
              >
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-6 h-6 animate-bounce shrink-0" />
                  <div>
                    <p className="font-bold text-sm">
                      {activeAlert === 'gain' 
                        ? t.triggerGainAlert 
                        : activeAlert === 'loss'
                        ? t.triggerLossAlert 
                        : t.triggerAmpAlert}
                    </p>
                    <p className="text-xs opacity-80 mt-0.5">{t.alertBannerSub}</p>
                  </div>
                </div>
                <button 
                  onClick={stopAlert}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  {t.dismissAlert}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-[320px]">
            
            {/* Gainers List */}
            <section className="space-y-4 flex flex-col h-full flex-1">
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-red-500/10 rounded-lg flex items-center justify-center border border-red-500/20 shadow-md">
                    <TrendingUp className="w-5 h-5 text-red-500 animate-pulse" />
                  </div>
                  <h2 className="text-[24px] font-bold text-red-500 tracking-tight">{t.gainer15m}</h2>
                </div>
                <span className="text-[15px] text-gray-500 uppercase font-bold tracking-widest font-mono">Top 5</span>
              </div>
              
              <div className="bg-[#141416]/40 rounded-2xl border border-white/10 overflow-hidden shadow-2xl flex-1 flex flex-col">
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-white/5 text-[15px] text-gray-500 uppercase font-bold tracking-wider">
                        <th className="px-4 py-3 w-[32%]">{t.tableSymbol}</th>
                        <th className="px-4 py-3 w-[38%]">{t.table15mVol}</th>
                        <th className="px-4 py-3 text-right w-[30%]">{t.tableGain}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      <AnimatePresence mode="popLayout">
                        {results?.gainers.map((item, idx) => {
                          const shouldHighlight = isAlerting && item.change >= config.gainThreshold;
                          return (
                            <motion.tr 
                              key={item.symbol}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              transition={{ delay: idx * 0.05 }}
                              className={`transition-all group cursor-pointer border-l-4 ${
                                shouldHighlight 
                                  ? 'bg-red-500/20 hover:bg-red-500/30 border-red-500 shadow-[inset_0_0_12px_rgba(239,68,68,0.3)] animate-pulse font-bold' 
                                  : 'hover:bg-white/5 border-transparent'
                              }`}
                              title="点击同步交易"
                              onClick={() => handleRowClick(item.symbol)}
                            >
                              <td className="px-4 py-3">
                                <span className={`font-bold text-[21px] ${shouldHighlight ? 'text-red-400' : 'text-zinc-200 group-hover:text-red-500'} transition-colors uppercase`}>{item.symbol.replace('USDT', '')}</span>
                              </td>
                              <td className={`px-4 py-3 font-mono text-[18px] ${shouldHighlight ? 'text-red-200' : 'text-gray-300'}`}>
                                {formatVolume(item.volume15m)}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1 text-red-500 font-bold text-[21px] font-sans">
                                  +{item.change.toFixed(2)}%
                                  <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-red-500" />
                                </div>
                              </td>
                            </motion.tr>
                          );
                        })}
                      </AnimatePresence>
                      {(!results || results.gainers.length === 0) && (
                        <tr>
                          <td colSpan={3} className="px-4 py-12 text-center text-gray-600 italic text-[18px] font-medium">
                            {t.waitingScan}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* Losers List */}
            <section className="space-y-4 flex flex-col h-full flex-1">
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center border border-emerald-500/20 shadow-md">
                    <TrendingDown className="w-5 h-5 text-emerald-500 animate-pulse" />
                  </div>
                  <h2 className="text-[24px] font-bold text-emerald-500 tracking-tight">{t.loser15m}</h2>
                </div>
                <span className="text-[15px] text-gray-500 uppercase font-bold tracking-widest font-mono">Top 5</span>
              </div>
              
              <div className="bg-[#141416]/40 rounded-2xl border border-white/10 overflow-hidden shadow-2xl flex-1 flex flex-col">
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-white/5 text-[15px] text-gray-500 uppercase font-bold tracking-wider">
                        <th className="px-4 py-3 w-[32%]">{t.tableSymbol}</th>
                        <th className="px-4 py-3 w-[38%]">{t.table15mVol}</th>
                        <th className="px-4 py-3 text-right w-[30%]">{t.tableLoss}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      <AnimatePresence mode="popLayout">
                        {results?.losers.map((item, idx) => {
                          const shouldHighlight = isAlerting && Math.abs(item.change) >= config.lossThreshold;
                          return (
                            <motion.tr 
                              key={item.symbol}
                              initial={{ opacity: 0, x: 20 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              transition={{ delay: idx * 0.05 }}
                              className={`transition-all group cursor-pointer border-l-4 ${
                                shouldHighlight 
                                  ? 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-500 shadow-[inset_0_0_12px_rgba(16,185,129,0.3)] animate-pulse font-bold' 
                                  : 'hover:bg-white/5 border-transparent'
                              }`}
                              title="点击同步交易"
                              onClick={() => handleRowClick(item.symbol)}
                            >
                              <td className="px-4 py-3">
                                <span className={`font-bold text-[21px] ${shouldHighlight ? 'text-emerald-400' : 'text-zinc-200 group-hover:text-emerald-500'} transition-colors uppercase`}>{item.symbol.replace('USDT', '')}</span>
                              </td>
                              <td className={`px-4 py-3 font-mono text-[18px] ${shouldHighlight ? 'text-emerald-250' : 'text-gray-300'}`}>
                                {formatVolume(item.volume15m)}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1 text-emerald-500 font-bold text-[21px] font-sans">
                                  {item.change.toFixed(2)}%
                                  <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-emerald-500" />
                                </div>
                              </td>
                            </motion.tr>
                          );
                        })}
                      </AnimatePresence>
                      {(!results || results.losers.length === 0) && (
                        <tr>
                          <td colSpan={3} className="px-4 py-12 text-center text-gray-600 italic text-[18px] font-medium">
                            {t.waitingScan}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* Amplitude List */}
            <section className="space-y-4 flex flex-col h-full flex-1">
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center border border-amber-500/20 shadow-md">
                    <Activity className="w-5 h-5 text-amber-500 animate-pulse" />
                  </div>
                  <h2 className="text-[24px] font-bold text-amber-500 tracking-tight">{t.amplitude15m}</h2>
                </div>
                <span className="text-[15px] text-gray-500 uppercase font-bold tracking-widest font-mono">Top 5</span>
              </div>
              
              <div className="bg-[#141416]/40 rounded-2xl border border-white/10 overflow-hidden shadow-2xl flex-1 flex flex-col">
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-white/5 text-[15px] text-gray-500 uppercase font-bold tracking-wider">
                        <th className="px-4 py-3 w-[32%]">{t.tableSymbol}</th>
                        <th className="px-4 py-3 w-[38%]">{t.table15mVol}</th>
                        <th className="px-4 py-3 text-right w-[30%]">{t.tableAmplitude}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      <AnimatePresence mode="popLayout">
                        {results?.amplitude15m?.map((item, idx) => {
                          const shouldHighlight = isAlerting && (item.amplitude || 0) >= config.amplitudeThreshold;
                          return (
                            <motion.tr 
                              key={item.symbol + '_amp'}
                              initial={{ opacity: 0, x: 20 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              transition={{ delay: idx * 0.05 }}
                              className={`transition-all group cursor-pointer border-l-4 ${
                                shouldHighlight 
                                  ? 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-500 shadow-[inset_0_0_12px_rgba(245,158,11,0.3)] animate-pulse font-bold' 
                                  : 'hover:bg-white/5 border-transparent'
                              }`}
                              title="点击同步交易"
                              onClick={() => handleRowClick(item.symbol)}
                            >
                              <td className="px-4 py-3">
                                <span className={`font-bold text-[21px] ${shouldHighlight ? 'text-amber-400' : 'text-zinc-200 group-hover:text-amber-500'} transition-colors uppercase`}>{item.symbol.replace('USDT', '')}</span>
                              </td>
                              <td className={`px-4 py-3 font-mono text-[18px] ${shouldHighlight ? 'text-amber-200' : 'text-gray-300'}`}>
                                {formatVolume(item.volume15m)}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1 text-amber-500 font-bold text-[21px] font-sans">
                                  {item.amplitude !== undefined ? `${item.amplitude.toFixed(2)}%` : '--'}
                                  <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-amber-500" />
                                </div>
                              </td>
                            </motion.tr>
                          );
                        })}
                      </AnimatePresence>
                      {(!results || !results.amplitude15m || results.amplitude15m.length === 0) && (
                        <tr>
                          <td colSpan={3} className="px-4 py-12 text-center text-gray-600 italic text-[18px] font-medium">
                            {t.waitingScan}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 min-h-[300px]">
            
            {/* 24h Gainers List */}
            <section className="space-y-4 flex flex-col h-full flex-1">
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-red-500/10 rounded-lg flex items-center justify-center border border-red-500/20 shadow-md">
                    <TrendingUp className="w-5 h-5 text-red-500 animate-pulse" />
                  </div>
                  <h2 className="text-[24px] font-bold text-red-500 tracking-tight">{t.gainer24h}</h2>
                </div>
                <span className="text-[15px] text-gray-500 uppercase font-bold tracking-widest font-mono">Top 5</span>
              </div>
              
              <div className="bg-[#141416]/40 rounded-2xl border border-white/10 overflow-hidden shadow-2xl flex-1 flex flex-col">
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-white/5 text-[15px] text-gray-500 uppercase font-bold tracking-wider">
                        <th className="px-4 py-3 w-[32%]">{t.tableSymbol}</th>
                        <th className="px-4 py-3 w-[38%]">{t.table24hVol}</th>
                        <th className="px-4 py-3 text-right w-[30%]">{t.tableGain}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      <AnimatePresence mode="popLayout">
                        {results?.gainers24h.map((item, idx) => (
                          <motion.tr 
                            key={item.symbol + '_24h'}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ delay: idx * 0.05 }}
                            className="hover:bg-white/5 transition-colors group cursor-pointer"
                            title="点击同步交易"
                            onClick={() => handleRowClick(item.symbol)}
                          >
                            <td className="px-4 py-3">
                              <span className="font-bold text-[21px] text-zinc-200 group-hover:text-red-500 transition-colors uppercase">{item.symbol.replace('USDT', '')}</span>
                            </td>
                            <td className="px-4 py-3 font-mono text-[18px] text-gray-300">
                              {formatVolume(item.volume24h)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1 text-red-500 font-bold text-[21px] font-sans">
                                +{item.change24h.toFixed(2)}%
                                <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-red-500" />
                              </div>
                            </td>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                      {(!results || results.gainers24h.length === 0) && (
                        <tr>
                          <td colSpan={3} className="px-4 py-12 text-center text-gray-600 italic text-[18px] font-medium">
                            {t.waitingScan}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* 24h Losers List */}
            <section className="space-y-4 flex flex-col h-full flex-1">
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center border border-emerald-500/20 shadow-md">
                    <TrendingDown className="w-5 h-5 text-emerald-500 animate-pulse" />
                  </div>
                  <h2 className="text-[24px] font-bold text-emerald-500 tracking-tight">{t.loser24h}</h2>
                </div>
                <span className="text-[15px] text-gray-500 uppercase font-bold tracking-widest font-mono">Top 5</span>
              </div>
              
              <div className="bg-[#141416]/40 rounded-2xl border border-white/10 overflow-hidden shadow-2xl flex-1 flex flex-col">
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-white/5 text-[15px] text-gray-500 uppercase font-bold tracking-wider">
                        <th className="px-4 py-3 w-[32%]">{t.tableSymbol}</th>
                        <th className="px-4 py-3 w-[38%]">{t.table24hVol}</th>
                        <th className="px-4 py-3 text-right w-[30%]">{t.tableLoss}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      <AnimatePresence mode="popLayout">
                        {results?.losers24h.map((item, idx) => (
                          <motion.tr 
                            key={item.symbol + '_24h'}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ delay: idx * 0.05 }}
                            className="hover:bg-white/5 transition-colors group cursor-pointer"
                            title="点击同步交易"
                            onClick={() => handleRowClick(item.symbol)}
                          >
                            <td className="px-4 py-3">
                              <span className="font-bold text-[21px] text-zinc-200 group-hover:text-emerald-500 transition-colors uppercase">{item.symbol.replace('USDT', '')}</span>
                            </td>
                            <td className="px-4 py-3 font-mono text-[18px] text-gray-300 font-medium">
                              {formatVolume(item.volume24h)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1 text-emerald-500 font-bold text-[21px] font-sans">
                                {item.change24h.toFixed(2)}%
                                <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-emerald-500" />
                              </div>
                            </td>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                      {(!results || results.losers24h.length === 0) && (
                        <tr>
                          <td colSpan={3} className="px-4 py-12 text-center text-gray-600 italic text-[18px] font-medium">
                            {t.waitingScan}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

          </div>



          {/* No version panel here */}
          </div>

        {/* Dynamic Custom Features Detail Modal */}
        <AnimatePresence>
          {showContactModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              {/* Blur Overlay */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowContactModal(false)}
                className="fixed inset-0 bg-black/85 backdrop-blur-md"
              />

              {/* Dialog Frame */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#121212] p-6 shadow-2xl"
              >
                {/* Dismiss X Icon */}
                <button
                  onClick={() => setShowContactModal(false)}
                  className="absolute right-4 top-4 p-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all cursor-pointer border border-transparent hover:border-white/10"
                >
                  <X className="w-4 h-4" />
                </button>

                {/* Pop Up Header */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-gradient-to-br from-red-500/20 to-red-500/5 rounded-xl flex items-center justify-center border border-red-500/25">
                    <Sparkles className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-100 font-sans tracking-tight">
                      获取定制功能
                    </h3>
                    <p className="text-[11px] text-gray-500 font-mono tracking-wider uppercase">
                      Premium Trading Tools
                    </p>
                  </div>
                </div>

                {/* Description Text */}
                <p className="text-sm text-gray-300 leading-relaxed mb-6 font-sans">
                  Like this tool? I specialize in building custom trading bots, alert systems, and automated execution scripts for Binance.
                </p>

                {/* Contacts Block */}
                <div className="space-y-3 bg-white/5 rounded-xl border border-white/5 p-4 mb-6">
                  {/* Email contact row */}
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-gray-300 font-medium">
                      <Mail className="w-4 h-4 text-red-500 shrink-0" />
                      <span>📧 Email:</span>
                      <span className="font-semibold text-gray-200">wonch520@163.com</span>
                    </div>
                    <a
                      href="mailto:wonch520@163.com"
                      className="text-[10px] font-bold text-red-400 hover:text-red-300 bg-red-400/10 px-2 py-1 rounded transition-colors"
                    >
                      Mail
                    </a>
                  </div>

                  {/* Telegram contact row */}
                  <div className="flex items-center justify-between text-xs pt-3 border-t border-white/5">
                    <div className="flex items-center gap-2 text-gray-300 font-medium font-sans">
                      <Send className="w-4 h-4 text-blue-400 shrink-0" />
                      <span>✈️ Telegram:</span>
                      <span className="font-semibold text-gray-200">@wonch520</span>
                    </div>
                    <a
                      href="https://t.me/wonch520"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] font-bold text-blue-400 hover:text-blue-300 bg-blue-400/10 px-2 py-1 rounded transition-colors"
                    >
                      Chat
                    </a>
                  </div>
                </div>

                {/* Affirmative CTA button */}
                <button
                  onClick={() => setShowContactModal(false)}
                  className="w-full py-3 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white rounded-xl text-xs font-bold shadow-lg shadow-red-950/30 transition-all uppercase tracking-wider cursor-pointer"
                >
                  OK, Got It
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
