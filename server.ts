import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import os from "os";
import CryptoJS from "crypto-js";
import Database from "better-sqlite3";

// Initialize SQLite database
const dbPath = process.env.DATABASE_PATH || "trading.db";
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  
  CREATE TABLE IF NOT EXISTS position_history (
    id TEXT PRIMARY KEY,
    symbol TEXT,
    side TEXT,
    positionSide TEXT,
    entryPrice REAL,
    exitPrice REAL,
    amount REAL,
    pnl REAL,
    tradePnl REAL,
    commission REAL,
    fundingFee REAL,
    pnlPercent REAL,
    openTime INTEGER,
    closeTime INTEGER,
    timestamp INTEGER,
    account TEXT
  );

  CREATE TABLE IF NOT EXISTS api_credentials (
    account_name TEXT PRIMARY KEY,
    api_key TEXT,
    api_secret TEXT,
    base_url TEXT
  );

  CREATE TABLE IF NOT EXISTS alert_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trigger_time INTEGER,
    symbol TEXT,
    board_name TEXT,
    change_val TEXT,
    volume_15m REAL
  );
`);

// Encryption Helper Functions
const ENCRYPTION_KEY = process.env.API_ENCRYPTION_KEY || "BinanceTradingS3cr3tK3y!@#";
const encrypt = (text: string) => {
  if (!text) return "";
  return CryptoJS.AES.encrypt(text, ENCRYPTION_KEY).toString();
};
const decrypt = (cipherText: string) => {
  if (!cipherText) return "";
  try {
    const bytes = CryptoJS.AES.decrypt(cipherText, ENCRYPTION_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (err) {
    console.error("Decryption failed:", err);
    return "";
  }
};

// Safe migration to add 'account' column if it doesn't already exist
try {
  db.prepare("SELECT account FROM position_history LIMIT 1").run();
} catch (error) {
  console.log("Missing 'account' column. running migration to add 'account' column...");
  try {
    db.exec("ALTER TABLE position_history ADD COLUMN account TEXT;");
  } catch (alterError) {
    console.error("Failed to add 'account' column to position_history:", alterError);
  }
}

interface MonitoringConfig {
  xMin: number;
  xSec: number;
  m: number;
  n: number;
  yMin: number;
  ySec: number;
  m1: number;
  n1: number;
  gainThreshold: number;
  lossThreshold: number;
  amplitudeThreshold: number;
  enableAlertTimeout: boolean;
  alertTimeoutSeconds: number;
}

const DEFAULT_CONFIG: MonitoringConfig = {
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
};

interface MonitorLog {
  id: string;
  timestamp: number;
  type: 'INFO' | 'SUCCESS' | 'ERROR' | 'TRADE';
  message: string;
}

let isRunning = false;
let config: MonitoringConfig = { ...DEFAULT_CONFIG };
let cache1: string[] = [];
let scanResults: any = null;
let scanStats: any = null;
let fundingRates: any[] = [];
let phase1Countdown = "00:00";
let phase2Countdown = "00:00";
let lastPhase1Trigger = -1;
let lastPhase2Trigger = -1;
let lastFundingFetchHour = -1;
let isScanningPhase1 = false;
let isScanningPhase2 = false;
let isFetchingFunding = false;
let monitorLogs: MonitorLog[] = [];
let symbolsInfo: any[] = [];

// Initialize configs from DB
try {
  const runRow = db.prepare("SELECT value FROM settings WHERE key = ?").get("monitoring_running") as any;
  if (runRow) {
    isRunning = JSON.parse(runRow.value);
  }
} catch (e) {
  console.error("Failed to load monitoring_running status:", e);
}

try {
  const configRow = db.prepare("SELECT value FROM settings WHERE key = ?").get("monitoring_config") as any;
  if (configRow) {
    config = { ...config, ...JSON.parse(configRow.value) };
  }
} catch (e) {
  console.error("Failed to load monitoring_config:", e);
}

function saveRunningState(state: boolean) {
  try {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("monitoring_running", JSON.stringify(state));
  } catch (e) {
    console.error("Failed to save running state:", e);
  }
}

function saveConfigState(newConfig: MonitoringConfig) {
  try {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("monitoring_config", JSON.stringify(newConfig));
  } catch (e) {
    console.error("Failed to save config state:", e);
  }
}

function addMonitorLog(message: string, type: 'INFO' | 'SUCCESS' | 'ERROR' | 'TRADE' = 'INFO') {
  const log: MonitorLog = {
    id: Math.random().toString(36).substring(2, 11),
    timestamp: Date.now(),
    type,
    message
  };
  monitorLogs.unshift(log);
  if (monitorLogs.length > 500) {
    monitorLogs = monitorLogs.slice(0, 500);
  }
  console.log(`[BACKEND MONITOR] [${type}] ${message}`);
}

const fetchBinanceBackend = async (endpoint: string, params: Record<string, any> = {}): Promise<any> => {
  const safeEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const queryString = new URLSearchParams(params).toString();
  const candidates = [
    "https://fapi-gcp.binance.com",
    "https://fapi.binance.com",
    "https://fapi1.binance.com",
    "https://fapi2.binance.com",
    "https://fapi3.binance.com",
    "https://fapi4.binance.com"
  ];

  let lastError: any = null;
  for (const base of candidates) {
    try {
      const url = `${base}${safeEndpoint}${queryString ? '?' + queryString : ''}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(url, { 
        method: "GET",
        headers: {
          "Content-Type": "application/json"
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP status ${response.status}`);
      }
      const text = await response.text();
      return JSON.parse(text);
    } catch (err: any) {
      lastError = err;
    }
  }
  throw lastError || new Error("All endpoints failed");
};

const fetchAllTickers = async (): Promise<any[]> => {
  try {
    const [tickers, info] = await Promise.all([
      fetchBinanceBackend('/fapi/v1/ticker/24hr'),
      fetchBinanceBackend('/fapi/v1/exchangeInfo')
    ]);
    
    if (!tickers || !info) {
      throw new Error("Invalid response from Binance API");
    }

    if (info.symbols) {
      symbolsInfo = info.symbols;
    }

    const activeSymbols = new Set(
      info.symbols
        .filter((s: any) => 
          s.status === 'TRADING' && 
          s.contractType === 'PERPETUAL' && 
          s.quoteAsset === 'USDT'
        )
        .map((s: any) => s.symbol)
    );

    const tickerList = Array.isArray(tickers) ? tickers : [tickers];
    return tickerList.filter((t: any) => activeSymbols.has(t.symbol));
  } catch (error: any) {
    console.error("Backend fetchAllTickers failed:", error);
    throw error;
  }
};

const fetchKlines = async (symbol: string) => {
  try {
    const data = await fetchBinanceBackend('/fapi/v1/klines', { symbol, interval: '15m', limit: '1' });
    if (data && data.length > 0) {
      return {
        open: parseFloat(data[0][1]),
        high: parseFloat(data[0][2]),
        low: parseFloat(data[0][3]),
        close: parseFloat(data[0][4]),
        volume: parseFloat(data[0][7]), // Quote asset volume (USDT)
      };
    }
  } catch (e) {
    console.error(`Failed to fetch kline for ${symbol}`, e);
  }
  return null;
};

const fetchFundingRatesBackend = async () => {
  if (isFetchingFunding) return;
  isFetchingFunding = true;
  try {
    const [premiumData, tickerData, exchangeData, fundingInfoData] = await Promise.all([
      fetchBinanceBackend('/fapi/v1/premiumIndex'),
      fetchBinanceBackend('/fapi/v1/ticker/24hr'),
      symbolsInfo.length > 0 ? Promise.resolve(null) : fetchBinanceBackend('/fapi/v1/exchangeInfo'),
      fetchBinanceBackend('/fapi/v1/fundingInfo')
    ]);
    
    if (!premiumData || !tickerData) {
      throw new Error("Failed to fetch core funding rate data from API");
    }

    if (exchangeData && exchangeData.symbols) {
      symbolsInfo = exchangeData.symbols;
    }

    const tickerList: any[] = Array.isArray(tickerData) ? tickerData : [tickerData];
    const tickerMap = new Map(tickerList.map((t: any) => [t.symbol, t]));
    
    const premiumArray = Array.isArray(premiumData) ? premiumData : [premiumData];
    const allSymbols = symbolsInfo.length > 0 ? symbolsInfo : (exchangeData?.symbols || []);

    const fundingInfoList = Array.isArray(fundingInfoData) ? fundingInfoData : [];
    const fundingInfoMap = new Map(fundingInfoList.map((f: any) => [f.symbol, f]));

    const rates = premiumArray
      .filter((p: any) => {
        if (!p || typeof p.symbol !== 'string') return false;
        if (!p.symbol.endsWith('USDT')) return false;
        
        const ticker = tickerMap.get(p.symbol);
        const vol24h = ticker && ticker.quoteVolume ? parseFloat(ticker.quoteVolume) : 0;
        return vol24h > config.m1;
      })
      .map((p: any) => {
        const ticker = tickerMap.get(p.symbol);
        const fInfo = fundingInfoMap.get(p.symbol);
        const rawHours = (fInfo && fInfo.fundingIntervalHours) || p.fundingIntervalHours || 8;
        const intervalHours = Number(rawHours);
        const nextFundingTime = p.nextFundingTime ? Number(p.nextFundingTime) : 0;
        const lastRate = parseFloat(p.lastFundingRate);
        return {
          symbol: p.symbol,
          fundingRate: (isNaN(lastRate) ? 0 : lastRate) * 100,
          settlementCycle: `${intervalHours}h`,
          volume24h: ticker && ticker.quoteVolume ? parseFloat(ticker.quoteVolume) : 0,
          nextFundingTime,
          fetchedAt: Date.now()
        };
      })
      .sort((a: any, b: any) => {
        const cycleA = parseFloat(a.settlementCycle);
        const cycleB = parseFloat(b.settlementCycle);
        if (cycleA !== cycleB) {
          return cycleA - cycleB;
        }
        return Math.abs(b.fundingRate) - Math.abs(a.fundingRate);
      });
    
    fundingRates = rates.slice(0, 24);
  } catch (error: any) {
    console.error("Failed to fetch funding rates on backend:", error);
  } finally {
    isFetchingFunding = false;
  }
};

const runPhase1Backend = async () => {
  if (isScanningPhase1) return;
  isScanningPhase1 = true;
  addMonitorLog('[爆仓监控] 阶段一：启动全市场扫描筛选中...', 'INFO');
  try {
    const tickers = await fetchAllTickers();
    if (tickers.length === 0) {
      isScanningPhase1 = false;
      return;
    }

    const filteredBy24h = tickers.filter((t: any) => parseFloat(t.quoteVolume) > config.m);
    
    let passed15mCount = 0;
    const results: string[] = [];

    for (let i = 0; i < filteredBy24h.length; i += 10) {
      const batch = filteredBy24h.slice(i, i + 10);
      await Promise.all(batch.map(async (t: any) => {
        try {
          const kline = await fetchKlines(t.symbol);
          if (kline && kline.volume > config.n) {
            results.push(t.symbol);
            passed15mCount++;
          }
        } catch (e) {
          console.error(`Failed to fetch kline for ${t.symbol}`, e);
        }
      }));
      await new Promise(resolve => setTimeout(resolve, 120));
    }
    
    scanStats = {
      lastScanTime: new Date().toLocaleTimeString(),
      totalTickers: tickers.length,
      passed24h: filteredBy24h.length,
      passed15m: passed15mCount
    };

    cache1 = results;
    addMonitorLog(`[扫描监控] 阶段一全市场扫描完成，共有 ${results.length} 组交易对通过 15m/24h 额度阈值存入缓存。`, 'SUCCESS');
    
    setTimeout(() => {
      cache1 = [];
      addMonitorLog('[扫描监控] 阶段一临时缓存已超时清空，等待下一轮循环扫描...', 'INFO');
    }, 5 * 60 * 1000);

  } catch (error: any) {
    console.error("Backend Phase 1 failed:", error);
    addMonitorLog('[扫描监控] 阶段一全市场扫描失败: ' + String(error.message || error), 'ERROR');
  } finally {
    isScanningPhase1 = false;
  }
};

const runPhase2Backend = async () => {
  if (isScanningPhase2) return;
  isScanningPhase2 = true;
  addMonitorLog('[扫描监控] 阶段二：对缓存池币种进行二次量化过滤...', 'INFO');
  
  if (cache1.length === 0) {
    addMonitorLog('[扫描监控] 检测到当前缓存池为空，正在自动执行阶段一全市场扫描以填充缓存...', 'INFO');
    await runPhase1Backend();
  }

  if (cache1.length === 0) {
    addMonitorLog('[扫描监控] 阶段一扫描完成后缓存池仍为空（未发现满足当前阈值的交易对），跳过本次二次过滤。请根据市场行情调整阶段一或二的阈值。', 'INFO');
    isScanningPhase2 = false;
    return;
  }

  try {
    const tickers = await fetchAllTickers();
    const tickerMap = new Map<string, any>(tickers.map((t: any) => [t.symbol, t]));

    const finalResults: any[] = [];

    for (let i = 0; i < cache1.length; i += 10) {
      const batch = cache1.slice(i, i + 10);
      await Promise.all(batch.map(async (symbol) => {
        const ticker = tickerMap.get(symbol);
        if (!ticker || parseFloat(ticker.quoteVolume) <= config.m1) return;

        const kline = await fetchKlines(symbol);
        if (kline && kline.volume > config.n1) {
          const change = ((kline.close - kline.open) / kline.open) * 100;
          const amplitude = ((kline.high - kline.low) / kline.low) * 100;
          finalResults.push({
            symbol,
            volume24h: parseFloat(ticker.quoteVolume),
            volume15m: kline.volume,
            openPrice: kline.open,
            lastPrice: kline.close,
            change,
            change24h: parseFloat(ticker.priceChangePercent),
            amplitude
          });
        }
      }));
    }

    const gainers = [...finalResults].sort((a, b) => b.change - a.change).slice(0, 5);
    const losers = [...finalResults].sort((a, b) => a.change - b.change).slice(0, 5);
    const amplitude15m = [...finalResults].sort((a, b) => (b.amplitude || 0) - (a.amplitude || 0)).slice(0, 5);

    const allQualified24h = tickers
      .filter(t => parseFloat(t.quoteVolume) > config.m1)
      .map(t => ({
        symbol: t.symbol,
        volume24h: parseFloat(t.quoteVolume),
        volume15m: 0,
        openPrice: 0,
        lastPrice: parseFloat(t.lastPrice),
        change: 0,
        change24h: parseFloat(t.priceChangePercent)
      }));

    const gainers24h = [...allQualified24h].sort((a, b) => b.change24h - a.change24h).slice(0, 5);
    const losers24h = [...allQualified24h].sort((a, b) => a.change24h - b.change24h).slice(0, 5);

    scanResults = {
      gainers,
      losers,
      amplitude15m,
      gainers24h,
      losers24h,
      timestamp: Date.now()
    };

    addMonitorLog(`[扫描监控] 阶段二二次量化过滤完成，已重新载入 15m 涨跌板块和 24h 数据。`, 'SUCCESS');

    // Check for alerts
    const maxGain = gainers.length > 0 ? gainers[0].change : 0;
    const maxLoss = losers.length > 0 ? Math.abs(losers[0].change) : 0;
    const maxAmplitude = amplitude15m.length > 0 ? (amplitude15m[0].amplitude || 0) : 0;

    const now = Date.now();

    if (maxGain >= config.gainThreshold) {
      addMonitorLog(`【价格报警】 触发15分钟多头暴涨点位！当前最高涨幅: +${maxGain.toFixed(2)}%`, 'SUCCESS');
      try {
        const stmt = db.prepare(`
          INSERT INTO alert_logs (trigger_time, symbol, board_name, change_val, volume_15m)
          VALUES (?, ?, ?, ?, ?)
        `);
        for (const item of gainers) {
          if (item.change >= config.gainThreshold) {
            stmt.run(now, item.symbol, "15分钟涨幅榜", "+" + item.change.toFixed(2) + "%", item.volume15m);
          }
        }
      } catch (e: any) {
        console.error("Failed to insert gain alert logs:", e);
      }
    }
    if (maxLoss >= config.lossThreshold) {
      addMonitorLog(`【价格报警】 触发15分钟空头暴跌点位！当前最高跌幅: -${maxLoss.toFixed(2)}%`, 'SUCCESS');
      try {
        const stmt = db.prepare(`
          INSERT INTO alert_logs (trigger_time, symbol, board_name, change_val, volume_15m)
          VALUES (?, ?, ?, ?, ?)
        `);
        for (const item of losers) {
          if (Math.abs(item.change) >= config.lossThreshold) {
            stmt.run(now, item.symbol, "15分钟跌幅榜", (item.change >= 0 ? "+" : "") + item.change.toFixed(2) + "%", item.volume15m);
          }
        }
      } catch (e: any) {
        console.error("Failed to insert loss alert logs:", e);
      }
    }
    if (maxAmplitude >= config.amplitudeThreshold) {
      addMonitorLog(`【价格报警】 触发15分钟振幅报警点位！当前最高振幅: ${maxAmplitude.toFixed(2)}%`, 'SUCCESS');
      try {
        const stmt = db.prepare(`
          INSERT INTO alert_logs (trigger_time, symbol, board_name, change_val, volume_15m)
          VALUES (?, ?, ?, ?, ?)
        `);
        for (const item of amplitude15m) {
          if (item.amplitude >= config.amplitudeThreshold) {
            stmt.run(now, item.symbol, "15分钟振幅榜", item.amplitude.toFixed(2) + "%", item.volume15m);
          }
        }
      } catch (e: any) {
        console.error("Failed to insert amplitude alert logs:", e);
      }
    }

  } catch (error: any) {
    console.error("Backend Phase 2 failed:", error);
    addMonitorLog('[扫描监控] 阶段二二次过滤失败: ' + String(error.message || error), 'ERROR');
  } finally {
    isScanningPhase2 = false;
  }
};

function runBackgroundMonitor() {
  const CYCLE_MS = 15 * 60 * 1000;
  
  if (isRunning) {
    fetchFundingRatesBackend();
  }

  setInterval(async () => {
    const now = new Date();
    
    if (!isRunning) return;

    const currentHour = now.getHours();
    if (now.getMinutes() === 55 && now.getSeconds() === 0 && lastFundingFetchHour !== currentHour) {
      lastFundingFetchHour = currentHour;
      fetchFundingRatesBackend();
    }

    const totalSecondsInCycle = (now.getMinutes() % 15) * 60 + now.getSeconds();
    const currentCycleStart = Math.floor(now.getTime() / CYCLE_MS) * CYCLE_MS;

    const xTargetSeconds = config.xMin * 60 + config.xSec;
    if (totalSecondsInCycle >= xTargetSeconds && lastPhase1Trigger !== currentCycleStart) {
      lastPhase1Trigger = currentCycleStart;
      runPhase1Backend();
    }

    const yTargetSeconds = config.yMin * 60 + config.ySec;
    if (totalSecondsInCycle >= yTargetSeconds && lastPhase2Trigger !== currentCycleStart) {
      lastPhase2Trigger = currentCycleStart;
      runPhase2Backend();
    }

    const updateCountdown = (targetSec: number) => {
      let diff = targetSec - totalSecondsInCycle;
      if (diff < 0) diff += 15 * 60;
      const m = Math.floor(diff / 60);
      const s = diff % 60;
      return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    phase1Countdown = updateCountdown(xTargetSeconds);
    phase2Countdown = updateCountdown(yTargetSeconds);

  }, 1000);
}

runBackgroundMonitor();

// Background Daily Auto-Sync Engine
async function binanceSignedRequest(endpoint: string, params: Record<string, any>, apiKey: string, apiSecret: string, baseUrl: string) {
  const timestamp = Date.now();
  const baseParams = {
    ...params,
    timestamp: timestamp.toString()
  };
  const queryString = new URLSearchParams(baseParams).toString();
  const signature = CryptoJS.HmacSHA256(queryString, apiSecret).toString(CryptoJS.enc.Hex);
  
  let targetBaseUrl = baseUrl;
  if (targetBaseUrl.includes("fapi.binance.com")) {
    targetBaseUrl = targetBaseUrl.replace("fapi.binance.com", "fapi-gcp.binance.com");
  }
  if (targetBaseUrl.includes("api.binance.com")) {
    targetBaseUrl = targetBaseUrl.replace("api.binance.com", "api-gcp.binance.com");
  }

  const isFutures = endpoint.includes('/fapi/') || targetBaseUrl.includes('fapi');
  const candidates = isFutures 
    ? [
        "https://fapi-gcp.binance.com",
        "https://fapi.binance.com",
        "https://fapi1.binance.com",
        "https://fapi2.binance.com",
        "https://fapi3.binance.com",
        "https://fapi4.binance.com"
      ]
    : [
        "https://api-gcp.binance.com",
        "https://api.binance.com",
        "https://api1.binance.com",
        "https://api2.binance.com",
        "https://api3.binance.com"
      ];

  const uniqueCandidates = [targetBaseUrl, ...candidates.filter(c => c !== targetBaseUrl)];

  let lastError: any = null;
  for (const currentBase of uniqueCandidates) {
    try {
      const currentUrl = `${currentBase}${endpoint}?${queryString}&signature=${signature}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      
      const res = await fetch(currentUrl, {
        method: "GET",
        headers: {
          "X-MBX-APIKEY": apiKey,
          "Content-Type": "application/json"
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      const responseText = await res.text();
      if (!res.ok) {
        throw new Error(`Binance API error (status ${res.status}): ${responseText}`);
      }
      
      return JSON.parse(responseText);
    } catch (err: any) {
      console.warn(`[Auto Sync Fetch Warning] Failed with ${currentBase}: ${err.message}`);
      lastError = err;
    }
  }
  throw lastError || new Error(`Failed to request ${endpoint} across all bases`);
}

async function binanceSignedRequestWithRetry(
  endpoint: string,
  params: Record<string, any>,
  apiKey: string,
  apiSecret: string,
  baseUrl: string,
  maxRetries = 4,
  initialDelay = 1500
): Promise<any> {
  let attempt = 0;
  while (true) {
    try {
      const data = await binanceSignedRequest(endpoint, params, apiKey, apiSecret, baseUrl);
      return data;
    } catch (error: any) {
      const isRateLimit = error.message && (
        error.message.includes('429') || 
        error.message.includes('418') || 
        error.message.includes('-1003')
      );
      
      attempt++;
      if (attempt >= maxRetries) {
        throw error;
      }
      
      const delay = initialDelay * Math.pow(2, attempt - 1) + Math.random() * 500;
      console.log(`[Auto Sync Rate Limit] Attempt ${attempt}/${maxRetries} failed. Retrying in ${Math.round(delay)}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

async function executeDailyAutoSync(syncTimezone: string, localNow: Date, cstNow: Date) {
  let targetPrevDayStart = 0;
  let targetPrevDayEnd = 0;

  if (syncTimezone.includes("Local")) {
    const prevDay = new Date(localNow.getTime() - 24 * 60 * 60 * 1000);
    prevDay.setHours(0, 0, 0, 0);
    targetPrevDayStart = prevDay.getTime();
    
    const prevDayEnd = new Date(prevDay);
    prevDayEnd.setHours(23, 59, 59, 999);
    targetPrevDayEnd = prevDayEnd.getTime();
  } else {
    // CST (UTC+8)
    const prevDayCst = new Date(cstNow.getTime() - 24 * 60 * 60 * 1000);
    const cstYear = prevDayCst.getFullYear();
    const cstMonth = prevDayCst.getMonth();
    const cstDate = prevDayCst.getDate();
    
    targetPrevDayStart = Date.UTC(cstYear, cstMonth, cstDate, 0, 0, 0, 0) - 8 * 60 * 60 * 1000;
    targetPrevDayEnd = Date.UTC(cstYear, cstMonth, cstDate, 23, 59, 59, 999) - 8 * 60 * 60 * 1000;
  }

  const startTimeStr = new Date(targetPrevDayStart).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const endTimeStr = new Date(targetPrevDayEnd).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  addMonitorLog(`[Auto Sync] 正在开始自动拉取各账户上一日数据：从 ${startTimeStr} 到 ${endTimeStr}`, "INFO");

  // Fetch all accounts
  const accounts = db.prepare("SELECT * FROM api_credentials ORDER BY account_name ASC").all() as any[];
  if (accounts.length === 0) {
    addMonitorLog("[Auto Sync] 未检测到任何已配置的 API 账户，跳过本次自动同步。", "INFO");
    return;
  }

  addMonitorLog(`[Auto Sync] 检测到 ${accounts.length} 个账户。将按照「逐一同步」顺序，执行链式数据拉取与对账。`, "INFO");

  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i];
    const accountName = acc.account_name;
    addMonitorLog(`[Auto Sync] [${i+1}/${accounts.length}] 正在启动账户 [${accountName}] 的对账分析...`, "INFO");

    try {
      const apiKey = acc.api_key ? decrypt(acc.api_key) : "";
      const apiSecret = acc.api_secret ? decrypt(acc.api_secret) : "";
      const baseUrl = acc.base_url || "https://fapi-gcp.binance.com";

      if (!apiKey || !apiSecret) {
        addMonitorLog(`[Auto Sync] 账户 [${accountName}] 缺少有效的 API 密钥，已自动跳过。`, "ERROR");
        continue;
      }

      // Step 1: Get active position list to exclude from history closed positions matching
      let activePositions: { symbol: string, side: 'BUY' | 'SELL', amount: number }[] = [];
      try {
        const posData = await binanceSignedRequestWithRetry('/fapi/v2/positionRisk', {}, apiKey, apiSecret, baseUrl);
        if (Array.isArray(posData)) {
          activePositions = posData
            .filter((p: any) => parseFloat(p.positionAmt) !== 0)
            .map((p: any) => ({
              symbol: p.symbol.toUpperCase(),
              side: parseFloat(p.positionAmt) > 0 ? 'BUY' : 'SELL',
              amount: Math.abs(parseFloat(p.positionAmt))
            }));
        }
      } catch (err: any) {
        addMonitorLog(`[Auto Sync] [${accountName}] 获取持仓信息失败: ${err.message || err}。将默认完整对账全部成交。`, "INFO");
      }

      // Step 2: Fetch income streams (realized pnl, commissions, funding fee)
      let allIncome: any[] = [];
      try {
        const incomeData = await binanceSignedRequestWithRetry('/fapi/v1/income', {
          startTime: targetPrevDayStart,
          endTime: targetPrevDayEnd,
          limit: 1000
        }, apiKey, apiSecret, baseUrl);
        if (Array.isArray(incomeData)) {
          allIncome = incomeData;
        }
      } catch (err: any) {
        addMonitorLog(`[Auto Sync] [${accountName}] 抓取收入流水失败: ${err.message || err}。跳过该账户。`, "ERROR");
        continue;
      }

      // Extract active traded symbols from income record
      const activeSymbolsSet = new Set<string>(
        allIncome
          .filter(inc => inc.incomeType === 'REALIZED_PNL' || inc.incomeType === 'COMMISSION')
          .map(inc => inc.symbol.toUpperCase())
      );
      activePositions.forEach(p => activeSymbolsSet.add(p.symbol));
      const activeSymbols = Array.from(activeSymbolsSet);

      if (activeSymbols.length === 0) {
        addMonitorLog(`[Auto Sync] [${accountName}] 在同步时间段内未发生任何交易成交或资金流转。该账户同步完成。`, "SUCCESS");
        continue;
      }

      addMonitorLog(`[Auto Sync] [${accountName}] 检测到上一日共有 ${activeSymbols.length} 个合约发生过变动或存在持仓，开始精准抓取成交记录...`, "INFO");

      // Step 3: Fetch trades for active symbols
      let allTrades: any[] = [];
      for (const symbol of activeSymbols) {
        try {
          const trades = await binanceSignedRequestWithRetry('/fapi/v1/userTrades', {
            symbol,
            startTime: targetPrevDayStart,
            endTime: targetPrevDayEnd,
            limit: 1000
          }, apiKey, apiSecret, baseUrl);
          if (Array.isArray(trades)) {
            allTrades = [...allTrades, ...trades];
          }
        } catch (err: any) {
          addMonitorLog(`[Auto Sync] [${accountName}] 获取合约 [${symbol}] 的成交历史失败: ${err.message || err}`, "ERROR");
        }
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      if (allTrades.length === 0) {
        addMonitorLog(`[Auto Sync] [${accountName}] 未检索到上一日任何底层的交易成交数据。`, "INFO");
        continue;
      }

      // Step 4: De-duplicate and sort trades
      const uniqueTrades = Array.from(new Map(allTrades.map(t => [t.id, t])).values())
        .sort((a: any, b: any) => a.time - b.time);

      // Step 5: Exclude active open positions
      if (activePositions.length > 0) {
        activePositions.forEach(activePos => {
          const sym = activePos.symbol;
          const sideToExclude = activePos.side;
          let remainingQtyToExclude = activePos.amount;

          for (let idx = uniqueTrades.length - 1; idx >= 0; idx--) {
            if (remainingQtyToExclude <= 1e-8) break;
            const t = uniqueTrades[idx] as any;
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

      const filteredTrades = uniqueTrades.filter((t: any) => !t.exclude);

      // Step 6: 3-second interval batch order merging
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
        for (let idx = 1; idx < filteredTrades.length; idx++) {
          const current = filteredTrades[idx];
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

      // Step 7: Match open & close trades by symbol
      const groupedTrades: { [key: string]: any[] } = {};
      mergedTrades.forEach(t => {
        if (!groupedTrades[t.symbol]) groupedTrades[t.symbol] = [];
        groupedTrades[t.symbol].push(t);
      });

      const segmentMatchedHistory: any[] = [];
      const EPSILON = 1e-8;

      Object.keys(groupedTrades).forEach(symbol => {
        const trades = groupedTrades[symbol];
        const parsedTrades = trades.map(t => ({
          ...t,
          remainingQty: parseFloat(t.qty),
          originalQty: parseFloat(t.qty),
          commissionVal: parseFloat(t.commission || '0'),
          realizedPnlVal: parseFloat(t.realizedPnl || '0'),
        }));

        for (let idx = parsedTrades.length - 1; idx >= 0; idx--) {
          const closeTrade = parsedTrades[idx];
          if (closeTrade.remainingQty < EPSILON) continue;

          const closeSide = closeTrade.side;
          const openSide = closeSide === 'BUY' ? 'SELL' : 'BUY';

          const matchedCloseTrades: any[] = [];
          const matchedOpenTrades: any[] = [];
          let qtyToMatch = closeTrade.remainingQty;

          matchedCloseTrades.push({ trade: closeTrade, qty: qtyToMatch });
          closeTrade.remainingQty = 0;

          for (let j = idx - 1; j >= 0; j--) {
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
              id: accountName + '_' + closeTrade.id + '_' + matchedOpenTrades.map(o => o.trade.id).join('_'),
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
              account: accountName
            });
          }
        }
      });

      // Step 8: Second pass: merge same open batch positions within 30 seconds
      const segmentMergedHistory: any[] = [];
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

      // Step 9: Save positions to SQLite DB in a single safe transaction
      if (segmentMergedHistory.length > 0) {
        const insertStmt = db.prepare(`
          INSERT OR REPLACE INTO position_history (
            id, symbol, side, positionSide, entryPrice, exitPrice, amount, 
            tradePnl, commission, fundingFee, pnl, pnlPercent, openTime, closeTime, timestamp, account
          ) VALUES (
            @id, @symbol, @side, @positionSide, @entryPrice, @exitPrice, @amount,
            @tradePnl, @commission, @fundingFee, @pnl, @pnlPercent, @openTime, @closeTime, @timestamp, @account
          )
        `);

        const tx = db.transaction((items) => {
          for (const item of items) {
            insertStmt.run(item);
          }
        });

        tx(segmentMergedHistory);
        addMonitorLog(`[Auto Sync] 账户 [${accountName}] 对账分析成功！同步生成并持久化了 ${segmentMergedHistory.length} 条全新历史闭环仓位。`, "SUCCESS");
      } else {
        addMonitorLog(`[Auto Sync] 账户 [${accountName}] 在上一日没有可生成的闭环交易历史。`, "INFO");
      }

    } catch (err: any) {
      console.error(`[Auto Sync] [${accountName}] Sync Process Failed:`, err);
      addMonitorLog(`[Auto Sync] 账户 [${accountName}] 数据抓取/平仓匹配失败: ${err.message || err}`, "ERROR");
    }

    // Rate-limiting delay before the next account to protect Binance weights
    if (i < accounts.length - 1) {
      addMonitorLog(`[Auto Sync] 防限速避让：等待 3 秒后继续同步下一个账户...`, "INFO");
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  addMonitorLog(`[Auto Sync] 每日自动定时同步任务全部圆满完成！`, "SUCCESS");
}

function initDailyAutoSync() {
  console.log("[Auto Sync Initializer] Daily position history auto-sync initialized (Checked every 30 seconds).");
  
  setInterval(async () => {
    const now = new Date();
    const localHour = now.getHours();
    const localMinute = now.getMinutes();

    const utc8Date = new Date(now.getTime() + (8 * 60 + now.getTimezoneOffset()) * 60000);
    const cstHour = utc8Date.getHours();
    const cstMinute = utc8Date.getMinutes();

    let triggerSync = false;
    let syncBaseDateStr = "";
    let syncTimezone = "";

    if (localHour === 6 && localMinute === 18) {
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      syncBaseDateStr = `${yyyy}-${mm}-${dd}_local`;
      triggerSync = true;
      syncTimezone = "Local Server Time";
    } else if (cstHour === 6 && cstMinute === 18) {
      const yyyy = utc8Date.getFullYear();
      const mm = String(utc8Date.getMonth() + 1).padStart(2, '0');
      const dd = String(utc8Date.getDate()).padStart(2, '0');
      syncBaseDateStr = `${yyyy}-${mm}-${dd}_cst`;
      triggerSync = true;
      syncTimezone = "China Standard Time (UTC+8)";
    }

    if (!triggerSync) return;

    try {
      const row = db.prepare("SELECT value FROM settings WHERE key = ?").get("last_auto_sync_date") as { value: string } | undefined;
      if (row && row.value === syncBaseDateStr) {
        return;
      }

      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("last_auto_sync_date", syncBaseDateStr);
      
      addMonitorLog(`[Auto Sync] 触发每日自动同步定时任务（触发时区: ${syncTimezone}, 批次标识: ${syncBaseDateStr}）`, "INFO");

      executeDailyAutoSync(syncTimezone, now, utc8Date).catch(err => {
        console.error("[Auto Sync Error] Execution failed:", err);
        addMonitorLog(`[Auto Sync Error] 定时自动同步执行失败: ${err.message || err}`, "ERROR");
      });

    } catch (e: any) {
      console.error("[Auto Sync] Database check/save failed:", e);
    }
  }, 30000);
}

// Start daily auto sync engine
initDailyAutoSync();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Helper for Binance Signature
  const getSignature = (queryString: string, secret: string) => {
    return CryptoJS.HmacSHA256(queryString, secret).toString(CryptoJS.enc.Hex);
  };

  // API routes
  app.get("/api/server-info", async (req, res) => {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      res.json({ 
        ip: data.ip,
        hostname: os.hostname()
      });
    } catch (error) {
      const interfaces = os.networkInterfaces();
      let localIp = "127.0.0.1";
      for (const k in interfaces) {
        for (const k2 in interfaces[k]!) {
          const address = interfaces[k][k2]!;
          if (address.family === "IPv4" && !address.internal) {
            localIp = address.address;
            break;
          }
        }
      }
      res.json({ ip: localIp, hostname: os.hostname() });
    }
  });

  // Get saved system settings
  app.get("/api/settings", (req, res) => {
    try {
      const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
      const result: Record<string, any> = {};
      for (const row of rows) {
        try {
          result[row.key] = JSON.parse(row.value);
        } catch {
          result[row.key] = row.value;
        }
      }
      res.json(result);
    } catch (error: any) {
      console.error("Failed to fetch settings from DB:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Save/update system settings
  app.post("/api/settings", (req, res) => {
    try {
      const insert = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
      const transaction = db.transaction((settings: Record<string, any>) => {
        for (const [key, value] of Object.entries(settings)) {
          insert.run(key, JSON.stringify(value));
        }
      });
      transaction(req.body);
      res.json({ status: "success" });
    } catch (error: any) {
      console.error("Failed to save settings to DB:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Monitoring endpoints
  app.get("/api/monitoring/status", (req, res) => {
    res.json({
      isRunning,
      config,
      scanStats,
      results: scanResults,
      fundingRates,
      phase1Countdown,
      phase2Countdown,
      cache1,
      currentTime: new Date().toISOString()
    });
  });

  app.post("/api/monitoring/toggle", (req, res) => {
    isRunning = !isRunning;
    saveRunningState(isRunning);
    
    if (isRunning) {
      addMonitorLog('[扫描监控] 监控与量化过滤程序在服务器后端开始启动运行...', 'SUCCESS');
      fetchFundingRatesBackend();
    } else {
      addMonitorLog('[扫描监控] 配置程序已被用户在服务器后端手动中止。', 'INFO');
    }
    
    res.json({ isRunning });
  });

  app.post("/api/monitoring/config", (req, res) => {
    const newConfig = req.body;
    if (newConfig) {
      config = { ...config, ...newConfig };
      saveConfigState(config);
      addMonitorLog('[扫描监控] 监控配置参数已更新并成功同步到后端。', 'SUCCESS');
    }
    res.json({ config });
  });

  app.get("/api/monitoring/logs", (req, res) => {
    res.json(monitorLogs);
  });

  app.post("/api/monitoring/logs/clear", (req, res) => {
    monitorLogs = [];
    res.json({ status: "success" });
  });

  app.post("/api/monitoring/scan-phase1", async (req, res) => {
    addMonitorLog('[扫描监控] 收到用户手动指令：立即执行阶段一全市场扫描', 'INFO');
    await runPhase1Backend();
    res.json({ status: "success", cache1, scanStats });
  });

  app.post("/api/monitoring/scan-phase2", async (req, res) => {
    addMonitorLog('[扫描监控] 收到用户手动指令：立即执行阶段二二次量化过滤', 'INFO');
    await runPhase2Backend();
    res.json({ status: "success", results: scanResults });
  });

  app.post("/api/monitoring/funding/refresh", async (req, res) => {
    addMonitorLog('[资金费率] 收到用户手动指令：立即刷新永续合约资金费率排行', 'INFO');
    await fetchFundingRatesBackend();
    res.json({ status: "success", fundingRates });
  });

  // Save/update specialized api-credentials (Encrypted)
  app.post("/api/api-credentials", (req, res) => {
    try {
      const { accountName, apiKey, apiSecret, baseUrl } = req.body;
      if (!accountName) {
        return res.status(400).json({ error: "Missing required fields (accountName)" });
      }

      // Encrypt sensitive API key and secret before storing in SQLite
      const encryptedKey = apiKey ? encrypt(apiKey) : "";
      const encryptedSecret = apiSecret ? encrypt(apiSecret) : "";

      db.prepare(`
        INSERT OR REPLACE INTO api_credentials (account_name, api_key, api_secret, base_url)
        VALUES (?, ?, ?, ?)
      `).run(accountName, encryptedKey, encryptedSecret, baseUrl || "https://fapi-gcp.binance.com");

      res.json({ status: "success" });
    } catch (error: any) {
      console.error("Failed to save api-credentials to DB:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get all saved credentials with decryption
  app.get("/api/api-credentials", (req, res) => {
    try {
      const rows = db.prepare("SELECT * FROM api_credentials ORDER BY account_name ASC").all() as any[];
      const list = rows.map(r => ({
        accountName: r.account_name,
        apiKey: r.api_key ? decrypt(r.api_key) : "",
        apiSecret: r.api_secret ? decrypt(r.api_secret) : "",
        baseUrl: r.base_url === "https://fapi.binance.com" ? "https://fapi-gcp.binance.com" : r.base_url
      }));
      res.json(list);
    } catch (error: any) {
      console.error("Failed to fetch api-credentials from DB:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete a saved credential
  app.delete("/api/api-credentials", (req, res) => {
    try {
      const { accountName } = req.body;
      if (!accountName) {
        return res.status(400).json({ error: "Missing required fields (accountName)" });
      }

      db.prepare("DELETE FROM api_credentials WHERE account_name = ?").run(accountName);
      res.json({ status: "success" });
    } catch (error: any) {
      console.error("Failed to delete api-credentials:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get alert logs with optional filtering by date (YYYY-MM-DD) and boardName
  app.get("/api/alert-logs", (req, res) => {
    try {
      const { date, boardName } = req.query;
      let queryStr = "SELECT * FROM alert_logs";
      const params: any[] = [];
      const conditions: string[] = [];

      if (date) {
        const startOfDay = new Date(date as string).setHours(0, 0, 0, 0);
        const endOfDay = new Date(date as string).setHours(23, 59, 59, 999);
        conditions.push("trigger_time >= ? AND trigger_time <= ?");
        params.push(startOfDay, endOfDay);
      }

      if (boardName) {
        conditions.push("board_name = ?");
        params.push(boardName);
      }

      if (conditions.length > 0) {
        queryStr += " WHERE " + conditions.join(" AND ");
      }

      queryStr += " ORDER BY trigger_time DESC";

      const rows = db.prepare(queryStr).all(...params);
      res.json(rows);
    } catch (error: any) {
      console.error("Failed to fetch alert logs from DB:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Clear alert logs
  app.post("/api/alert-logs/clear", (req, res) => {
    try {
      db.prepare("DELETE FROM alert_logs").run();
      res.json({ status: "success" });
    } catch (error: any) {
      console.error("Failed to clear alert logs:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get persistent position history
  app.get("/api/position-history", (req, res) => {
    try {
      const { account } = req.query;
      let rows;
      if (account) {
        rows = db.prepare("SELECT * FROM position_history WHERE account = ? ORDER BY timestamp DESC").all(account);
      } else {
        rows = db.prepare("SELECT * FROM position_history ORDER BY timestamp DESC").all();
      }
      res.json(rows);
    } catch (error: any) {
      console.error("Failed to fetch position history from DB:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get all unique accounts from database
  app.get("/api/position-history/accounts", (req, res) => {
    try {
      const rows = db.prepare("SELECT DISTINCT account FROM position_history WHERE account IS NOT NULL AND account != '' ORDER BY account ASC").all() as { account: string }[];
      const accounts = rows.map(r => r.account);
      res.json(accounts);
    } catch (error: any) {
      console.error("Failed to fetch accounts from DB:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Bulk save/upsert position history
  app.post("/api/position-history", (req, res) => {
    try {
      const { history } = req.body;
      if (!Array.isArray(history)) {
        return res.status(400).json({ error: "Invalid history payload, expected an array under 'history' key" });
      }

      const insert = db.prepare(`
        INSERT OR REPLACE INTO position_history (
          id, symbol, side, positionSide, entryPrice, exitPrice, amount, 
          pnl, tradePnl, commission, fundingFee, pnlPercent, openTime, closeTime, timestamp, account
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const transaction = db.transaction((items: any[]) => {
        for (const item of items) {
          insert.run(
            item.id,
            item.symbol,
            item.side,
            item.positionSide,
            Number(item.entryPrice) || 0,
            Number(item.exitPrice) || 0,
            Number(item.amount) || 0,
            Number(item.pnl) || 0,
            Number(item.tradePnl) || 0,
            Number(item.commission) || 0,
            Number(item.fundingFee) || 0,
            Number(item.pnlPercent) || 0,
            Number(item.openTime) || 0,
            Number(item.closeTime) || 0,
            Number(item.timestamp) || 0,
            item.account || ""
          );
        }
      });

      transaction(history);
      res.json({ status: "success", count: history.length });
    } catch (error: any) {
      console.error("Failed to save position history to DB:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Clear position history
  app.post("/api/position-history/clear", (req, res) => {
    try {
      db.prepare("DELETE FROM position_history").run();
      res.json({ status: "success" });
    } catch (error: any) {
      console.error("Failed to clear position history in DB:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Simple in-memory cache for public endpoints to avoid Binance IP bans and rate-limits
  interface CacheEntry {
    data: any;
    timestamp: number;
    status: number;
  }
  const publicCache = new Map<string, CacheEntry>();

  const getCacheDuration = (endpoint: string): number => {
    if (endpoint.includes('/exchangeInfo')) {
      return 15 * 60 * 1000; // 15 minutes cache for exchangeInfo since it is static and huge
    }
    if (endpoint.includes('/ticker/24hr')) {
      return 10 * 1000; // 10 seconds cache for daily tickers
    }
    if (endpoint.includes('/premiumIndex') || endpoint.includes('/fundingInfo')) {
      return 5 * 1000; // 5 seconds cache
    }
    return 3 * 1000; // 3 seconds default cache for others like klines
  };

  // Binance Public Proxy Route (for public market data without signature)
  app.get("/api/binance-public", async (req, res) => {
    const { endpoint } = req.query;
    if (!endpoint) {
      return res.status(400).json({ error: "Missing endpoint parameter" });
    }

    try {
      // Rebuild query parameters excluding endpoint
      const params = { ...req.query };
      delete params.endpoint;

      const queryString = new URLSearchParams(params as any).toString();
      const safeEndpoint = (endpoint as string).startsWith('/') ? (endpoint as string) : `/${endpoint}`;

      const cacheKey = `${safeEndpoint}?${queryString}`;
      const now = Date.now();
      const cached = publicCache.get(cacheKey);
      const ttl = getCacheDuration(safeEndpoint);

      if (cached && (now - cached.timestamp < ttl)) {
        return res.status(cached.status).json(cached.data);
      }

      const isFutures = safeEndpoint.includes('/fapi/') || safeEndpoint.includes('/premiumIndex') || safeEndpoint.includes('/fundingInfo');
      const candidates = isFutures
        ? [
            "https://fapi-gcp.binance.com",
            "https://fapi.binance.com",
            "https://fapi1.binance.com",
            "https://fapi2.binance.com",
            "https://fapi3.binance.com",
            "https://fapi4.binance.com"
          ]
        : [
            "https://api-gcp.binance.com",
            "https://api.binance.com",
            "https://api1.binance.com",
            "https://api2.binance.com",
            "https://api3.binance.com"
          ];

      let lastError: any = null;
      let data: any = null;
      let responseStatus = 200;
      let success = false;

      for (const base of candidates) {
        try {
          const url = `${base}${safeEndpoint}${queryString ? '?' + queryString : ''}`;
          console.log(`Public Proxy attempting (${base}) for: ${safeEndpoint}`);
          
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          
          const response = await fetch(url, { 
            method: "GET",
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          
          responseStatus = response.status;
          const responseText = await response.text();
          
          try {
            data = JSON.parse(responseText);
            success = true;
            break;
          } catch (jsonErr) {
            console.warn(`Non-JSON response from public endpoint ${base}${safeEndpoint}, status: ${response.status}`);
            lastError = new Error(`Non-JSON response (status ${response.status})`);
          }
        } catch (fetchErr: any) {
          console.warn(`Failed to connect/fetch public endpoint from ${base}: ${fetchErr.message || fetchErr}`);
          lastError = fetchErr;
        }
      }

      if (success) {
        if (responseStatus === 200) {
          publicCache.set(cacheKey, {
            data,
            timestamp: now,
            status: responseStatus
          });
        }
        return res.status(responseStatus).json(data);
      }

      if (cached) {
        console.warn(`[Public Proxy Cache] Serving stale data on complete fetch failure for: ${safeEndpoint}`);
        return res.status(cached.status).json(cached.data);
      }

      return res.status(500).json({ 
        error: "All Binance Public API endpoints returned errors or non-JSON", 
        details: lastError?.message || "Unknown error" 
      });
    } catch (error: any) {
      console.error("Binance Public Proxy Error:", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // Binance Proxy Route
  app.post("/api/binance-proxy", async (req, res) => {
    const { method, endpoint, params, apiKey, apiSecret } = req.body;

    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: "Missing API credentials" });
    }

    try {
      const timestamp = Date.now();
      const baseParams = {
        ...(params || {}),
        timestamp: timestamp.toString(),
      };

      const queryString = new URLSearchParams(baseParams).toString();
      const signature = getSignature(queryString, apiSecret);
      
      const safeEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      let baseUrl = req.body.baseUrl || "https://fapi-gcp.binance.com";
      if (baseUrl.includes("fapi.binance.com")) {
        baseUrl = baseUrl.replace("fapi.binance.com", "fapi-gcp.binance.com");
      }
      if (baseUrl.includes("api.binance.com")) {
        baseUrl = baseUrl.replace("api.binance.com", "api-gcp.binance.com");
      }

      const isFutures = safeEndpoint.includes('/fapi/') || baseUrl.includes('fapi');
      const candidates = isFutures 
        ? [
            "https://fapi-gcp.binance.com",
            "https://fapi.binance.com",
            "https://fapi1.binance.com",
            "https://fapi2.binance.com",
            "https://fapi3.binance.com",
            "https://fapi4.binance.com"
          ]
        : [
            "https://api-gcp.binance.com",
            "https://api.binance.com",
            "https://api1.binance.com",
            "https://api2.binance.com",
            "https://api3.binance.com"
          ];

      const uniqueCandidates = [baseUrl, ...candidates.filter(c => c !== baseUrl)];

      let response: any = null;
      let responseText = '';
      let data: any = null;
      let lastError: any = null;
      let success = false;
      let finalUrl = '';

      for (const currentBase of uniqueCandidates) {
        try {
          let currentUrl = `${currentBase}${safeEndpoint}`;
          let options: RequestInit = {
            method: method || "GET",
            headers: {
              "X-MBX-APIKEY": apiKey,
            },
          };

          if (options.method === "POST" || options.method === "PUT" || options.method === "DELETE") {
            const bodyParams = new URLSearchParams({
              ...baseParams,
              signature: signature,
            });
            options.body = bodyParams.toString();
            options.headers = {
              ...options.headers,
              "Content-Type": "application/x-www-form-urlencoded",
            };
          } else {
            currentUrl += `?${queryString}&signature=${signature}`;
          }

          finalUrl = currentUrl;
          console.log(`Proxying ${options.method} request to: ${currentUrl}`);

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 6000);
          options.signal = controller.signal;

          const resObj = await fetch(currentUrl, options);
          clearTimeout(timeoutId);

          responseText = await resObj.text();
          response = resObj;

          try {
            data = JSON.parse(responseText);
            success = true;
            break; // Valid JSON payload parsed successfully
          } catch (jsonErr) {
            console.warn(`Non-JSON response from domain ${currentBase}: status ${resObj.status}. Snippet: ${responseText.slice(0, 150)}`);
            lastError = new Error(`Non-JSON response (status ${resObj.status})`);
          }
        } catch (fetchErr: any) {
          console.warn(`Failed to connect/fetch from ${currentBase}: ${fetchErr.message || fetchErr}`);
          lastError = fetchErr;
        }
      }

      if (success && response) {
        return res.status(response.status).json(data);
      }

      // If all candidates failed:
      console.error("All proxies failed for URL:", finalUrl);
      return res.status(response ? response.status : 502).json({
        error: "Binance API returned a non-JSON response (likely blocked by Cloudflare/AWS/GCP network policy on all backend endpoints).",
        status: response ? response.status : 502,
        url: finalUrl,
        details: responseText ? responseText.substring(0, 500) : (lastError?.message || "Connection timed out")
      });
    } catch (error: any) {
      console.error("Binance Proxy Error:", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
