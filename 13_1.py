import datetime
import json
import os
import re
import threading
import time
import traceback
import webbrowser
from datetime import timedelta
from tkinter import messagebox
import tkinter as tk
from tkinter import ttk

import numpy as np
import pandas as pd
import pytz
import requests
from kiteconnect import KiteConnect, exceptions
from telegram.ext import Updater, CommandHandler, filters

# ===================== Reversal + Confirmation Helpers =====================
def _body(o, c):
    """Calculates the body length of a candle."""
    return abs(c - o)

def _shadows(o, c, h, l):
    """Calculates upper and lower shadows of a candle."""
    upper = h - max(o, c)
    lower = min(o, c) - l
    return upper, lower

def is_bullish_engulfing(df, i):
    """Detects a bullish engulfing pattern."""
    if i < 1: return False
    o1, c1 = df['open'].iloc[i-1], df['close'].iloc[i-1]
    o2, c2 = df['open'].iloc[i],   df['close'].iloc[i]
    return (c2 > o2) and (c1 < o1) and (min(o2, c2) <= min(o1, c1)) and \
           (max(o2, c2) >= max(o1, c1)) and (_body(o2, c2) >= 0.7 * _body(o1, c1))

def is_bearish_engulfing(df, i):
    """Detects a bearish engulfing pattern."""
    if i < 1: return False
    o1, c1 = df['open'].iloc[i-1], df['close'].iloc[i-1]
    o2, c2 = df['open'].iloc[i],   df['close'].iloc[i]
    return (c2 < o2) and (c1 > o1) and (min(o2, c2) <= min(o1, c1)) and \
           (max(o2, c2) >= max(o1, c1)) and (_body(o2, c2) >= 0.7 * _body(o1, c1))

def is_hammer(df, i):
    """Detects a hammer pattern."""
    o, c, h, l = (df['open'].iloc[i], df['close'].iloc[i], df['high'].iloc[i], df['low'].iloc[i])
    body = _body(o, c) or 1e-8
    upper, lower = _shadows(o, c, h, l)
    return (lower >= 2 * body) and (upper <= 0.5 * body)

def is_shooting_star(df, i):
    """Detects a shooting star pattern."""
    o, c, h, l = (df['open'].iloc[i], df['close'].iloc[i], df['high'].iloc[i], df['low'].iloc[i])
    body = _body(o, c) or 1e-8
    upper, lower = _shadows(o, c, h, l)
    return (upper >= 2 * body) and (lower <= 0.5 * body)

def is_morning_star(df, i):
    """Detects a morning star pattern."""
    if i < 2: return False
    o1, c1 = df['open'].iloc[i-2], df['close'].iloc[i-2]
    o2, c2 = df['open'].iloc[i-1], df['close'].iloc[i-1]
    o3, c3 = df['open'].iloc[i],   df['close'].iloc[i]
    big_bear = (c1 < o1) and (_body(o1, c1) > _body(o2, c2))
    small_mid = _body(o2, c2) <= 0.6 * _body(o1, c1)
    strong_bull = (c3 > o3) and (c3 >= (o1 + c1) / 2)
    return big_bear and small_mid and strong_bull

def is_evening_star(df, i):
    """Detects an evening star pattern."""
    if i < 2: return False
    o1, c1 = df['open'].iloc[i-2], df['close'].iloc[i-2]
    o2, c2 = df['open'].iloc[i-1], df['close'].iloc[i-1]
    o3, c3 = df['open'].iloc[i],   df['close'].iloc[i]
    big_bull = (c1 > o1) and (_body(o1, c1) > _body(o2, c2))
    small_mid = _body(o2, c2) <= 0.6 * _body(o1, c1)
    strong_bear = (c3 < o3) and (c3 <= (o1 + c1) / 2)
    return big_bull and small_mid and strong_bear

def is_piercing(df, i):
    """Detects a piercing pattern."""
    if i < 1: return False
    o1, c1 = df['open'].iloc[i-1], df['close'].iloc[i-1]
    o2, c2 = df['open'].iloc[i],   df['close'].iloc[i]
    long_red = (c1 < o1) and (_body(o1, c1) >= np.median(np.abs(df['close'].tail(50) - df['open'].tail(50))))
    return long_red and (c2 > o2) and (c2 >= (o1 + c1)/2)

def is_dark_cloud(df, i):
    """Detects a dark cloud cover pattern."""
    if i < 1: return False
    o1, c1 = df['open'].iloc[i-1], df['close'].iloc[i-1]
    o2, c2 = df['open'].iloc[i],   df['close'].iloc[i]
    long_green = (c1 > o1) and (_body(o1, c1) >= np.median(np.abs(df['close'].tail(50) - df['open'].tail(50))))
    return long_green and (c2 < o2) and (c2 <= (o1 + c1)/2)

def is_tweezer_bottom(df, i):
    """Detects a tweezer bottom pattern."""
    if i < 1: return False
    l1, l2 = df['low'].iloc[i-1], df['low'].iloc[i]
    return abs(l2 - l1) <= 0.1 * np.median((df['high'].tail(50) - df['low'].tail(50)).abs())

def is_tweezer_top(df, i):
    """Detects a tweezer top pattern."""
    if i < 1: return False
    h1, h2 = df['high'].iloc[i-1], df['high'].iloc[i]
    return abs(h2 - h1) <= 0.1 * np.median((df['high'].tail(50) - df['low'].tail(50)).abs())

def detect_reversal_pattern(df, i, expected):
    """
    Detects various reversal patterns based on the expected direction.
    Returns (True, pattern_name, index) if a pattern is found, otherwise (False, None, None).
    """
    if df is None or len(df) < 3:
        return (False, None, None)
    if expected == 'bullish':
        checks = [
            ('Bullish Engulfing', is_bullish_engulfing(df, i)),
            ('Hammer',            is_hammer(df, i)),
            ('Morning Star',      is_morning_star(df, i)),
            ('Piercing',          is_piercing(df, i)),
            ('Tweezer Bottom',    is_tweezer_bottom(df, i)),
        ]
    else: # expected == 'bearish'
        checks = [
            ('Bearish Engulfing', is_bearish_engulfing(df, i)),
            ('Shooting Star',     is_shooting_star(df, i)),
            ('Evening Star',      is_evening_star(df, i)),
            ('Dark Cloud',        is_dark_cloud(df, i)),
            ('Tweezer Top',       is_tweezer_top(df, i)),
        ]
    for name, ok in checks:
        if ok:
            return True, name, i
    return False, None, None

def price_confirms_breakout(df, i, last_price, expected):
    """Checks if the last price confirms a breakout of the pattern candle."""
    if i is None or i < 0:
        return False
    hi, lo = df['high'].iloc[i], df['low'].iloc[i]
    if expected == 'bullish':
        return last_price >= hi
    else: # expected == 'bearish'
        return last_price <= lo

def calc_atr(df, period=14):
    """Calculates Average True Range (ATR)."""
    h, l, c = df['high'], df['low'], df['close']
    prev_c = c.shift(1)
    tr = np.maximum(h - l, np.maximum(abs(h - prev_c), abs(l - prev_c)))
    return tr.rolling(period).mean()

# ===================== Inline P&L Micro-Module (Self-contained) =====================
# Tracks realized trades and computes daily/weekly/monthly P&L inside this file.
# Persists to CSV; can export to Excel; sends EOD TG summary. IST-aware.

from dataclasses import dataclass
import datetime as _dt
import csv as _csv
from pathlib import Path as _Path

_IST = pytz.timezone("Asia/Kolkata")
_PNL_DIR = _Path.home() / "Documents" / "REVERSAL" / "logs"
_PNL_DIR.mkdir(parents=True, exist_ok=True)
_PNL_CSV = _PNL_DIR / "pnl_log.csv"

# In-memory ledger (mirrors CSV)
_PNL_LEDGER = []  # list[dict]

@dataclass
class _Trade:
    timestamp: _dt.datetime   # naive or tz-aware -> we'll normalize to IST
    symbol: str
    side: str                 # 'BUY' or 'SELL' (entry side)
    qty: int
    entry_price: float
    exit_price: float

    def realized_pnl(self) -> float:
        if self.side.upper() == "BUY":
            return (self.exit_price - self.entry_price) * self.qty
        else:
            return (self.entry_price - self.exit_price) * self.qty

def _to_ist(ts: _dt.datetime) -> _dt.datetime:
    try:
        if ts.tzinfo is None:
            return _IST.localize(ts)
        return ts.astimezone(_IST)
    except Exception:
        # Fallback to now if bad timestamp
        return _IST.localize(_dt.datetime.now())

def _append_to_csv(tr: _Trade):
    write_header = not _PNL_CSV.exists()
    with _PNL_CSV.open("a", newline="") as f:
        w = _csv.DictWriter(f, fieldnames=[
            "timestamp_ist", "symbol", "side", "qty", "entry_price", "exit_price", "realized_pnl"
        ])
        if write_header:
            w.writeheader()
        w.writerow({
            "timestamp_ist": _to_ist(tr.timestamp).strftime("%Y-%m-%d %H:%M:%S"),
            "symbol": tr.symbol,
            "side": tr.side,
            "qty": tr.qty,
            "entry_price": tr.entry_price,
            "exit_price": tr.exit_price,
            "realized_pnl": round(tr.realized_pnl(), 2),
        })

def log_trade(payload: dict):
    """
    Called by your square-off path.
    Expected keys: timestamp, symbol, side('BUY'|'SELL'), qty, entry_price, exit_price
    """
    try:
        tr = _Trade(
            timestamp=payload.get("timestamp") or _dt.datetime.now(),
            symbol=str(payload.get("symbol","")),
            side=str(payload.get("side","BUY")),
            qty=int(payload.get("qty",0)),
            entry_price=float(payload.get("entry_price",0.0)),
            exit_price=float(payload.get("exit_price",0.0)),
        )
    except Exception as e:
        try:
            log_message(f"[PnL] log_trade bad payload: {payload} -> {e}")
        except Exception:
            pass
        return

    _PNL_LEDGER.append({
        "timestamp_ist": _to_ist(tr.timestamp),
        "symbol": tr.symbol,
        "side": tr.side.upper(),
        "qty": tr.qty,
        "entry_price": tr.entry_price,
        "exit_price": tr.exit_price,
        "realized_pnl": tr.realized_pnl(),
    })
    try:
        _append_to_csv(tr)
    except Exception as e:
        try:
            log_message(f"[PnL] CSV append failed: {e}")
        except Exception:
            pass

def _load_all_trades_df() -> pd.DataFrame:
    # Combine in-memory + CSV (CSV is source of truth across runs).
    if _PNL_CSV.exists():
        try:
            df = pd.read_csv(_PNL_CSV, parse_dates=["timestamp_ist"])
        except Exception:
            df = pd.DataFrame(columns=["timestamp_ist","symbol","side","qty","entry_price","exit_price","realized_pnl"])
    else:
        df = pd.DataFrame(columns=["timestamp_ist","symbol","side","qty","entry_price","exit_price","realized_pnl"])

    if _PNL_LEDGER:
        mem = pd.DataFrame(_PNL_LEDGER)
        # Avoid duplicate merge if same rows are already in CSV
        df = pd.concat([df, mem], ignore_index=True)
        df.drop_duplicates(subset=["timestamp_ist","symbol","qty","entry_price","exit_price"], inplace=True, keep="last")
    if not df.empty and df["timestamp_ist"].dtype == "object":
        df["timestamp_ist"] = pd.to_datetime(df["timestamp_ist"])
    return df

def _period_bounds_ist(now_ist: _dt.datetime):
    # Day
    day_start = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
    # Week (Mon start)
    week_start = (day_start - _dt.timedelta(days=day_start.weekday()))
    # Month
    month_start = day_start.replace(day=1)
    return day_start, week_start, month_start

def get_daily_weekly_monthly_summary():
    """
    Returns a dict: {"daily": float, "weekly": float, "monthly": float}
    """
    now_ist = _to_ist(_dt.datetime.now())
    day_start, week_start, month_start = _period_bounds_ist(now_ist)
    df = _load_all_trades_df()
    if df.empty:
        return {"daily": 0.0, "weekly": 0.0, "monthly": 0.0}

    # Ensure tz-aware timestamps in IST
    if getattr(df["timestamp_ist"].dt, "tz", None) is None:
        df["ts"] = df["timestamp_ist"].dt.tz_localize(_IST, nonexistent="NaT", ambiguous="NaT")
    else:
        df["ts"] = df["timestamp_ist"].dt.tz_convert(_IST)

    daily = float(df.loc[df["ts"] >= day_start, "realized_pnl"].sum())
    weekly = float(df.loc[df["ts"] >= week_start, "realized_pnl"].sum())
    monthly = float(df.loc[df["ts"] >= month_start, "realized_pnl"].sum())
    return {"daily": round(daily, 2), "weekly": round(weekly, 2), "monthly": round(monthly, 2)}

def get_portfolio_unrealized(kite, positions_dict: dict) -> float:
    """
    Sum unrealized PnL from your tracked open positions in bot_positions.
    Expects: { instrument_token: { 'symbol', 'entry_price', 'quantity', 'instrument_type' } }
    Assumes long positions; adapt if you also short options.
    """
    if not positions_dict:
        return 0.0
    total = 0.0
    for pos in positions_dict.values():
        sym = pos.get("symbol")
        qty = int(pos.get("quantity", 0))
        entry = float(pos.get("entry_price", 0.0))
        if not sym or qty == 0:
            continue
        ltp = None
        try:
            q = kite.quote(f"NFO:{sym}")
            ltp = q.get(f"NFO:{sym}", {}).get("last_price")
        except Exception as e:
            try:
                log_message(f"[PnL] LTP fetch failed for {sym}: {e}")
            except Exception:
                pass
        if ltp is None:
            continue
        total += (float(ltp) - entry) * qty
    return round(total, 2)

def export_pnl_to_excel():
    """
    Exports realized trades and a small summary sheet to an Excel in the logs folder.
    """
    df = _load_all_trades_df()
    out_xlsx = _PNL_DIR / f"pnl_export_{_dt.datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    with pd.ExcelWriter(out_xlsx, engine="xlsxwriter") as writer:
        df.to_excel(writer, index=False, sheet_name="Trades")
        # Summary
        s = get_daily_weekly_monthly_summary()
        pd.DataFrame([s]).to_excel(writer, index=False, sheet_name="Summary")
    return f"Exported P&L to: {out_xlsx}"

def schedule_eod_pnl_telegram(kite, positions_dict, send_func):
    """
    Composes and sends an EOD P&L report over Telegram.
    Called by schedule_eod_pnl_report() via root.after(...).
    """
    try:
        s = get_daily_weekly_monthly_summary()
        unreal = get_portfolio_unrealized(kite, positions_dict)
        msg = (
            "📊 *EOD P&L Summary*\n"
            f"• Daily: ₹{s['daily']}\n"
            f"• Weekly: ₹{s['weekly']}\n"
            f"• Monthly: ₹{s['monthly']}\n"
            f"• Unrealized (open): ₹{unreal}\n"
            f"_as of {_to_ist(_dt.datetime.now()).strftime('%Y-%m-%d %H:%M:%S %Z')}_"
        )
        send_func(msg)
        try:
            log_message("[PnL] EOD Telegram sent")
        except Exception:
            pass
    except Exception as e:
        try:
            log_message(f"[PnL] EOD Telegram failed: {e}")
        except Exception:
            pass
# =================== End Inline P&L Micro-Module ===================

# --- Global Variables and Constants ---
TELEGRAM_BOT_TOKEN = "8023775485:AAFjKVu1mwEya6h2I13DAJVTpsp7sdiF4RQ"
TELEGRAM_CHAT_ID = "8064208891"

kite = None
CREDENTIALS_FILE = "kite_credentials.json"
is_running = False
is_strategy_running = False
nfo_instruments_cache = None

# Position tracking
bot_positions = {}
current_position_instrument_token = None
last_trade_timestamp = None
last_entry_check_timestamp = None
last_exit_check_timestamp = None

# Enhanced cooldown tracking
position_cooldowns = {}  # Format: { "symbol": {"exit_time": datetime, "strike": float, "expiry": str} }
last_square_off_time_map = {}

# Trailing SL management
active_sl_order_id = None
trade_entry_price = None
highest_price_seen = None

# Consolidation Premium Decay Tracking (Removed for this strategy, but variables kept as placeholder if other parts need them)
consolidation_start_time = None
consolidation_ce_symbol = None
consolidation_pe_symbol = None
consolidation_ce_initial_ltp = None
consolidation_pe_initial_ltp = None

# EMA Crossover variables (No longer used for filtering, but kept for historical context if needed)
last_ema_cross_time = None
last_ema_cross_type = None

# Telegram Updater
telegram_updater = None

# Cache for last trading day
last_trading_day_cache = {}

# --- GUI related global variables ---
root = None
frame = None
log_text = None
api_key_entry = None
api_secret_entry = None
request_token_entry = None
timeframe_var = None
index_var = None
amo_var = None
sl_entry = None
qty_entry = None
target_points_entry = None
trailing_sl_entry = None
reentry_entry = None
run_btn = None
stop_btn = None
next_run_var = None

confirmation_var = None
ce_decay_var = None # Kept for GUI display, but consolidation logic removed
pe_decay_var = None # Kept for GUI display, but consolidation logic removed
zone_tf_var = None
use_internal_zones_var = None # Added for consistency in globals, though will be re-initialized in main

# --- Timeframe mapping for API ---
timeframe_map = {
    "1min": "1minute",
    "3min": "3minute",
    "5min": "5minute",
    "15min": "15minute",
    "45min": "45minute"
}

# --- Merged Zones Helpers (added) ---
def _overlap_blocks(a, b):
    """Checks if two order blocks overlap, assuming same bias."""
    if a.bias != b.bias:
        return False
    return max(a.bar_low, b.bar_low) <= min(a.bar_high, b.bar_high)

def _pct_close(x, y):
    """Calculates percentage difference between two prices."""
    denom = (x + y) / 2.0 if (x + y) != 0 else 1.0
    return abs(x - y) / denom * 100.0

def merge_order_blocks(blocks_a, blocks_b, price_tol_pct=0.05, mode="union"):
    """
    Merge two lists of OrderBlock (swing) with simple dedup/overlap logic.
    mode: 'union' widens overlapping zones; 'intersection' tightens.
    """
    out = []
    for z in list(blocks_a) + list(blocks_b):
        merged = False
        for e in out:
            cond_close = (_pct_close(z.bar_high, e.bar_high) <= price_tol_pct and _pct_close(z.bar_low, e.bar_low) <= price_tol_pct)
            if z.bias == e.bias and (_overlap_blocks(z, e) or cond_close):
                if mode == "union":
                    e.bar_high = max(e.bar_high, z.bar_high)
                    e.bar_low  = min(e.bar_low,  z.bar_low)
                else:  # intersection
                    if _overlap_blocks(z, e):
                        e.bar_high = min(e.bar_high, z.bar_high)
                        e.bar_low  = max(e.bar_low,  z.bar_low)
                if getattr(z, "bar_time", None) and (not getattr(e, "bar_time", None) or z.bar_time > e.bar_time):
                    e.bar_time = z.bar_time
                    if getattr(z, "confirmation_time", None):
                        e.confirmation_time = z.confirmation_time
                merged = True
                break
        if not merged:
            out.append(z)
    out.sort(key=lambda z: (getattr(z, "bar_time", None) or datetime.datetime.min, -(z.bar_high - z.bar_low)), reverse=True)
    return out

def blocks_to_zone_dicts(blocks):
    """Converts a list of OrderBlock objects to a list of dictionaries for display."""
    zones = []
    for z in blocks:
        t = "Demand (Swing)" if z.bias == 1 else "Supply (Swing)"
        zones.append({"type": t, "high": float(z.bar_high), "low": float(z.bar_low), "time": z.bar_time})
    return zones
# --- End helpers ---

# --- Utility / Helper Functions (General Purpose) ---
def get_now_ist():
    """Returns the current datetime in IST, rounded to the minute."""
    return datetime.datetime.now(pytz.timezone("Asia/Kolkata")).replace(second=0, microsecond=0)

def log_message(msg):
    """Logs messages to the GUI log text area and console."""
    if 'log_text' in globals() and log_text is not None and log_text.winfo_exists():
        log_text.configure(state='normal')
        log_text.insert(tk.END, f"{get_now_ist().strftime('%Y-%m-%d %H:%M:%S')} - {msg}\n")
        log_text.configure(state='disabled')
        log_text.yview(tk.END)
    else:
        print(f"{get_now_ist().strftime('%Y-%m-%d %H:%M:%S')} - {msg}")

def send_telegram_message(message):
    """Sends a message to the specified Telegram chat."""
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": message,
        "parse_mode": "Markdown"
    }
    try:
        response = requests.post(url, json=payload)
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        log_message(f"Failed to send Telegram message: {e}")
    except Exception as e:
        log_message(f"An unexpected error occurred while sending Telegram message: {e}")

def save_credentials(api_key, api_secret, request_token):
    """Saves KiteConnect credentials to a JSON file."""
    credentials = {
        "api_key": api_key,
        "api_secret": api_secret,
        "request_token": request_token
    }
    with open(CREDENTIALS_FILE, "w") as f:
        json.dump(credentials, f)
    log_message("Credentials saved.")

def load_credentials():
    """Loads KiteConnect credentials from a JSON file."""
    if os.path.exists(CREDENTIALS_FILE):
        with open(CREDENTIALS_FILE, "r") as f:
            return json.load(f)
    return {"api_key": "", "api_secret": "", "request_token": ""}

# --- KiteConnect & Instrument Data Functions ---
def load_nfo_instruments():
    """Loads and caches NFO option & futures instruments for NIFTY and BANKNIFTY."""
    global kite, nfo_instruments_cache
    if kite is None:
        log_message("KiteConnect not logged in. Cannot load NFO instruments.")
        return False

    try:
        log_message("Loading NFO instruments cache...")
        all_instruments = kite.instruments("NFO")
        nfo_instruments_cache = [
            inst for inst in all_instruments
            if inst.get('segment') in ('NFO-OPT', 'NFO-FUT')
            and inst.get('name') in ('NIFTY', 'BANKNIFTY')
        ]
        log_message(f"NFO instruments cache loaded. Found {len(nfo_instruments_cache)} NIFTY/BANKNIFTY OPT/FUT instruments.")
        send_telegram_message(f"Bot started. Loaded {len(nfo_instruments_cache)} NIFTY/BANKNIFTY OPT/FUT instruments.")
        return True
    except Exception as e:
        log_message(f"Error loading NFO instruments cache: {e}")
        send_telegram_message(f"Error loading NFO cache: {e}")
        return False

    try:
        log_message("Loading NFO instruments cache...")
        all_instruments = kite.instruments("NFO")
        nfo_instruments_cache = [
            inst for inst in all_instruments
            if inst['segment'] == 'NFO-OPT' and
            ('NIFTY' in inst['tradingsymbol'] or 'BANKNIFTY' in inst['tradingsymbol'])
        ]
        log_message(f"NFO instruments cache loaded. Found {len(nfo_instruments_cache)} NIFTY/BANKNIFTY option instruments.")
        send_telegram_message(f"Bot started. Loaded {len(nfo_instruments_cache)} NIFTY/BANKNIFTY option instruments.")
        return True
    except Exception as e:
        log_message(f"Error loading NFO instruments cache: {e}")
        send_telegram_message(f"Error loading NFO instruments: {e}")
        nfo_instruments_cache = None
        return False

def get_instrument_token(symbol):
    """Gets the instrument token for a given trading symbol (NFO or NSE)."""
    global kite, nfo_instruments_cache

    if kite is None:
        log_message("KiteConnect not logged in. Cannot fetch instrument token.")
        return None

    if symbol in ["NIFTY 50", "BANKNIFTY"]:
        try:
            log_message(f"Fetching instrument token for {symbol} (NSE cash segment)...")
            nse_instruments = kite.instruments("NSE")
            for inst in nse_instruments:
                if inst["tradingsymbol"] == symbol and inst["exchange"] == "NSE":
                    return inst["instrument_token"]
            log_message(f"{symbol} instrument token not found on NSE.")
            return None
        except Exception as e:
            log_message(f"Error fetching {symbol} instrument token: {e}")
            return None
    else: # Assume NFO option
        if nfo_instruments_cache is None:
            log_message("NFO instruments cache not loaded. Attempting to load...")
            if not load_nfo_instruments():
                return None

        for inst in nfo_instruments_cache:
            if inst["tradingsymbol"] == symbol:
                return inst["instrument_token"]
        log_message(f"Instrument token not found for {symbol} in NFO cache.")
        return None

def get_futures_instrument_token(index_name, expiry_date_str):
    """Get the futures instrument token for the given index and expiry."""
    global nfo_instruments_cache
    if nfo_instruments_cache is None:
        log_message("NFO instruments cache not loaded. Cannot get futures instrument token.")
        return None

    for inst in nfo_instruments_cache:
        # Normalize index_name for comparison (e.g., "NIFTY 50" -> "NIFTY")
        normalized_index_name = index_name.replace(' 50', '').upper()
        if (inst['name'] == normalized_index_name and
            inst['instrument_type'] == 'FUT' and
            inst['expiry'].strftime("%d%b%y").upper() == expiry_date_str):
            return inst['instrument_token']
    log_message(f"Could not find futures instrument token for {index_name} with expiry {expiry_date_str}.")
    return None

def get_futures_volume(kite, index_name, expiry_date_str):
    """
    Fetches the volume of a futures contract for the given index and expiry.
    """
    instrument_token = get_futures_instrument_token(index_name, expiry_date_str)
    if not instrument_token:
        log_message(f"Could not find futures instrument for {index_name} with expiry {expiry_date_str} to get volume.")
        return None

    try:
        quotes = kite.quote([instrument_token])
        # Response keys may be the exact token object you passed (int) or its string form.
        quote_data = quotes.get(instrument_token) or quotes.get(str(instrument_token)) or next(iter(quotes.values()), None)
        if quote_data and 'volume' in quote_data:
            futures_volume = quote_data['volume']
            log_message(f"Fetched futures volume for {index_name} ({expiry_date_str}): {futures_volume}")
            return futures_volume
        else:
            log_message(f"Volume data not found for futures instrument {instrument_token}: {quote_data}")
            return None
    except Exception as e:
        log_message(f"Error fetching futures volume for {instrument_token}: {e}")
        return None

    try:
        # Fetch the quote for the futures instrument
        # Kiteconnect quote expects a list of instruments or a single instrument token as a string
        quotes = kite.quote([instrument_token])
        # Assuming the response format is a dictionary with instrument_token as key
        # Convert token to string as dictionary keys might be strings
        quote_data = quotes.get(str(instrument_token))
        if quote_data and 'volume' in quote_data:
            futures_volume = quote_data['volume']
            log_message(f"Fetched futures volume for {index_name} ({expiry_date_str}): {futures_volume}")
            return futures_volume
        else:
            log_message(f"Volume data not found for futures instrument {instrument_token}.")
            return None
    except Exception as e:
        log_message(f"Error fetching futures volume for {instrument_token}: {e}")
        return None


def get_atm_strike_price(index_price, index_name):
    """Calculates the At-The-Money (ATM) strike price."""
    step = 50 if index_name == "NIFTY 50" else 100
    return round(index_price / step) * step

def get_weekly_expiry(index_name):
    """Calculates the upcoming weekly expiry date."""
    today = datetime.date.today()
    weekday = today.weekday()
    # Thursday is weekday 3
    days_to_immediate_thursday = (3 - weekday + 7) % 7
    immediate_thursday = today + datetime.timedelta(days=days_to_immediate_thursday)
    current_time = get_now_ist().time()
    market_close_time = datetime.time(15, 30)

    # If it's Thursday and market is closed, or Friday/Saturday/Sunday, use next week's Thursday
    if (weekday == 3 and current_time > market_close_time) or weekday >= 4:
        expiry = immediate_thursday + datetime.timedelta(days=7)
    else:
        expiry = immediate_thursday

    return expiry.strftime("%d%b%y").upper()

def get_monthly_expiry():
    """Calculates the upcoming monthly expiry date (last Thursday of the month)."""
    today = datetime.date.today()
    month = today.month
    year = today.year
    last_thursday = None
    # Iterate from end of month to find last Thursday
    for day in range(25, 32):
        try:
            date_candidate = datetime.date(year, month, day)
            if date_candidate.weekday() == 3:  # Thursday is 3
                last_thursday = date_candidate
        except ValueError:
            continue

    if last_thursday is None:
        log_message("Error: Could not determine last Thursday of the month.")
        return None
    return last_thursday.strftime("%d%b%y").upper()

def get_option_symbol(underlying_price, option_type, index_name):
    """Gets the tradable option symbol (e.g., NIFTY25FEB17000CE) for a given strike and type."""
    global nfo_instruments_cache
    if nfo_instruments_cache is None:
        log_message("NFO instruments cache not loaded. Cannot get option symbol.")
        return None

    expiry_date_str = get_monthly_expiry() # The original code uses monthly for this function
    log_message(f"Using monthly expiry for {index_name}: {expiry_date_str}")

    target_strike = get_atm_strike_price(underlying_price, index_name)

    potential_options = [
        inst for inst in nfo_instruments_cache
        if inst['name'] == index_name.replace(' 50', '').upper() and # NIFTY 50 -> NIFTY, BANKNIFTY -> BANKNIFTY
           inst['instrument_type'] == option_type and
           inst['expiry'].strftime("%d%b%y").upper() == expiry_date_str # Filter by exact monthly expiry
    ]

    if not potential_options:
        log_message(f"No {option_type} options found for {index_name} with expiry {expiry_date_str}.")
        return None

    closest_strike_option = None
    min_diff = float('inf')

    for opt in potential_options:
        diff = abs(opt['strike'] - target_strike)
        if diff < min_diff:
            min_diff = diff
            closest_strike_option = opt

    if closest_strike_option:
        symbol = closest_strike_option['tradingsymbol']
        log_message(f"Found closest tradable option: {symbol} (Strike: {closest_strike_option['strike']}, Expiry: {closest_strike_option['expiry'].strftime('%d%b%y').upper()})")
        return symbol
    else:
        log_message(f"Could not find a suitable tradable {option_type} option for {index_name} with expiry {expiry_date_str} near strike {target_strike}.")
        return None

def get_last_trading_day_start_cached(token, timeframe, days_back=5):
    """Gets the start time of the last trading day for historical data fetching."""
    if token in last_trading_day_cache:
        return last_trading_day_cache[token]

    today = get_now_ist()
    for i in range(1, days_back + 1):
        candidate_day = today - datetime.timedelta(days=i)
        # Attempt to get historical data for trading hours
        start = datetime.datetime.combine(candidate_day.date(), datetime.time(9, 15)) # Changed start time to market open
        end = datetime.datetime.combine(candidate_day.date(), datetime.time(15, 30))
        try:
            data = kite.historical_data(token, start, end, timeframe)
            if data:
                last_trading_day_cache[token] = start
                log_message(f"✅ Found last trading day for token {token}: {candidate_day.strftime('%Y-%m-%d')} @ {start.strftime('%H:%M')}")
                return start
        except Exception as e:
            log_message(f"[Cache] Failed to get data for {candidate_day.date()}: {e}")

    raise ValueError("No valid trading day found in last 5 days")

# --- Technical Indicator Functions ---
def get_ema(data, period):
    """Calculates Exponential Moving Average (EMA)."""
    # This function is kept as it's a general utility, but its output is not used for trade filtering in this simplified strategy.
    if 'close' not in data.columns:
        raise ValueError("DataFrame must contain a 'close' column for EMA calculation.")
    return data['close'].ewm(span=period, adjust=False).mean()

def get_rsi(data, period=14):
    """
    Calculates RSI using Wilder's smoothing method, matching TradingView's implementation.
    Expects a DataFrame with a 'close' column.
    This function is kept as a general utility, but its output is not used for trade filtering in this simplified strategy.
    """
    if 'close' not in data.columns:
        raise ValueError("DataFrame must contain a 'close' column for RSI calculation.")

    close = data['close']
    delta = close.diff()

    gain = delta.where(delta > 0, 0.0)
    loss = -delta.where(delta < 0, 0.0)

    avg_gain = gain.ewm(alpha=1/period, min_periods=period).mean()
    avg_loss = loss.ewm(alpha=1/period, min_periods=period).mean()

    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))

    return rsi

# --- Confirmation Functions (All EMA, RSI, and multi-candle conditions removed for entry logic) ---

def check_bullish_confirmation(df, current_index, lookback=3):
    # This function is no longer used for trade entry logic.
    """Check bullish confirmation with consecutive higher closes"""
    if current_index < lookback:
        return False

    current = df.iloc[current_index]
    # Check if current candle is green
    conditions = [
        current['close'] > current['open']  # Green candle
    ]

    # Check consecutive higher closes for 'lookback' candles ending at current_index
    for i in range(1, lookback + 1):
        if current_index - i < 0: # Ensure we don't go out of bounds
            return False
        if i == 1:
            conditions.append(current['close'] > df.iloc[current_index - i]['close'])
        else:
            # Check if previous candle's close (df.iloc[current_index-i+1]) is higher than the one before it (df.iloc[current_index-i])
            conditions.append(df.iloc[current_index - i + 1]['close'] > df.iloc[current_index - i]['close'])

    return all(conditions)

def check_bearish_confirmation(df, current_index, lookback=3):
    # This function is no longer used for trade entry logic.
    """Check bearish confirmation with consecutive lower closes"""
    if current_index < lookback:
        return False

    current = df.iloc[current_index]
    # Check if current candle is red
    conditions = [
        current['close'] < current['open']  # Red candle
    ]

    # Check consecutive lower closes for 'lookback' candles ending at current_index
    for i in range(1, lookback + 1):
        if current_index - i < 0: # Ensure we don't go out of bounds
            return False
        if i == 1:
            conditions.append(current['close'] < df.iloc[current_index - i]['close'])
        else:
            # Check if previous candle's close (df.iloc[current_index-i+1]) is lower than the one before it (df.iloc[current_index-i])
            conditions.append(df.iloc[current_index - i + 1]['close'] < df.iloc[current_index - i]['close'])

    return all(conditions)

def get_trend_strength(df, current_index, lookback=3):
    # This function is no longer used for trade entry logic.
    """Returns a strength score from 0-100 based on consecutive candles aligning with a defined trend (e.g., green for bullish, red for bearish).
    All other conditions removed.
    """
    if current_index < lookback:
        return 0

    strength = 0
    current_bar = df.iloc[current_index]
    
    if current_bar['close'] > current_bar['open']: # Current candle is green
        expected_bias = 'bullish'
    elif current_bar['close'] < current_bar['open']: # Current candle is red
        expected_bias = 'bearish'
    else: # Doji or flat, no clear strength based on color
        return 0

    for i in range(lookback, -1, -1): # Iterate backwards from lookback to 0 (current candle)
        idx = current_index - i
        if idx < 0:
            continue
        
        bar = df.iloc[idx]
        
        if expected_bias == 'bullish':
            if bar['close'] > bar['open']: # Green candle
                strength += (100 / (lookback + 1))
            else:
                break # Trend not consistently strong
        elif expected_bias == 'bearish':
            if bar['close'] < bar['open']: # Red candle
                strength += (100 / (lookback + 1))
            else:
                break # Trend not consistently strong
            
    return min(100, int(strength)) # Return as int percentage

# --- Position Management / Order Execution Functions ---
def is_market_open():
    """Check if market is currently open"""
    # For now, always return True, assuming the user runs it during market hours or with AMO.
    # In a real scenario, this would check current time against market hours.
    return True

def cleanup_cooldowns():
    """Remove old cooldown entries to prevent memory bloat"""
    try:
        current_time = get_now_ist()
        cooldown_minutes = int(reentry_entry.get())
        threshold_time = current_time - timedelta(minutes=cooldown_minutes * 2)  # Keep some buffer

        # Remove entries older than twice the cooldown period
        for symbol in list(position_cooldowns.keys()):
            if position_cooldowns[symbol]['exit_time'] < threshold_time:
                del position_cooldowns[symbol]

    except Exception as e:
        log_message(f"Error cleaning up cooldown entries: {e}")

def is_cooldown_over(symbol, current_time=None):
    """Check if cooldown period has elapsed for this symbol"""
    try:
        if symbol not in position_cooldowns:
            return True

        cooldown_data = position_cooldowns[symbol]
        cooldown_minutes = int(reentry_entry.get())

        if not current_time:
            current_time = get_now_ist()

        time_since_exit = (current_time - cooldown_data['exit_time']).total_seconds() / 60
        return time_since_exit >= cooldown_minutes

    except Exception as e:
        log_message(f"Cooldown check error for {symbol}: {e}")
        return True # Default to True to allow re-entry in case of error

def cleanup_positions():
    """
    Cleans up bot's internal position tracking based on actual broker positions.
    Also cancels orphaned SL orders.
    """
    global bot_positions, current_position_instrument_token, active_sl_order_id, trade_entry_price, highest_price_seen

    if not kite:
        return

    try:
        current_broker_positions = set()
        positions = kite.positions()

        # Get all currently open positions from broker
        for pos_type in ['day', 'net']:
            for pos in positions.get(pos_type, []):
                if pos['quantity'] != 0:
                    current_broker_positions.add(pos['instrument_token'])

        # Remove any tracked positions that no longer exist on broker
        for token in list(bot_positions.keys()):
            if token not in current_broker_positions:
                log_message(f"Cleaning up closed position: {token} (was tracking: {bot_positions[token].get('symbol')})")
                if token == current_position_instrument_token:
                    current_position_instrument_token = None
                    active_sl_order_id = None
                    trade_entry_price = None
                    highest_price_seen = None
                del bot_positions[token]

        # Additionally, check for orphaned SL orders and cancel them
        orders = kite.orders()
        for order in orders:
            # Check if it's an open SL order on NFO exchange
            if order['status'] == 'OPEN' and order['order_type'] == 'SL' and order['exchange'] == 'NFO':
                is_orphaned = True
                # Check if this SL order belongs to any currently tracked bot position
                for pos_data in bot_positions.values():
                    if order['order_id'] == pos_data.get('sl_order_id'):
                        is_orphaned = False
                        break
                
                if is_orphaned:
                    log_message(f"Cancelling orphaned SL order {order['order_id']} for {order.get('tradingsymbol')}.")
                    try:
                        kite.cancel_order(order_id=order['order_id'], variety="regular")
                        send_telegram_message(f"🧹 Cleaned up orphaned SL order `{order['order_id']}` for *{order.get('tradingsymbol')}*.")
                    except Exception as e:
                        log_message(f"Error cancelling orphaned order {order['order_id']}: {e}")

    except Exception as e:
        log_message(f"Error in position cleanup or orphaned order cancellation: {e}")


def square_off_position(symbol, quantity, instrument_type):
    """Executes a market order to square off an existing position."""
    global current_position_instrument_token, active_sl_order_id, trade_entry_price, highest_price_seen, bot_positions

    if kite is None:
        log_message("KiteConnect not logged in. Cannot square off position.")
        send_telegram_message(f"❌ Square-off failed for *{symbol}*: KiteConnect not logged in.")
        return False

    log_message(f"Attempting to square off {instrument_type} position for {symbol} (Quantity: {quantity})...")
    send_telegram_message(f"👋 Attempting to square off *{instrument_type}* position for *{symbol}* (Qty: {quantity})...")
    try:
        if active_sl_order_id:
            try:
                log_message(f"Cancelling active SL order {active_sl_order_id} for {symbol} before squaring off.")
                kite.cancel_order(order_id=active_sl_order_id, variety="regular")
                log_message(f"SL order {active_sl_order_id} cancelled successfully.")
                send_telegram_message(f"Cancelling existing SL order `{active_sl_order_id}` for *{symbol}* before final square-off.")
            except exceptions.OrderNotFoundException:
                log_message(f"SL order {active_sl_order_id} not found, possibly already filled or cancelled.")
                send_telegram_message(f"⚠️ SL order `{active_sl_order_id}` for *{symbol}* not found during cancellation attempt (already filled/cancelled?). Proceeding with square-off.")
            except Exception as e:
                log_message(f"Error cancelling SL order {active_sl_order_id}: {e}. Proceeding with square-off anyway.")
                send_telegram_message(f"❌ Error cancelling SL order `{active_sl_order_id}` for *{symbol}*: {e}. Proceeding with square-off.")

        square_off_response = kite.place_order(
            tradingsymbol=symbol,
            exchange="NFO",
            transaction_type="SELL", # Always SELL for squaring off a long option position
            quantity=quantity,
            order_type="MARKET",
            product="MIS",
            variety="regular"
        )
        
        square_off_order_id = None
        if isinstance(square_off_response, str):
            square_off_order_id = square_off_response
        elif isinstance(square_off_response, dict):
            square_off_order_id = square_off_response.get('order_id')
        else:
            log_message(f"Unexpected response type from kite.place_order for square-off order: {type(square_off_response)}. Expected str or dict.")
            send_telegram_message(f"❌ Square-off failed for *{symbol}*: Unexpected order response type.")
            return False

        if square_off_order_id is None:
            log_message("Square-off Order ID not found in the response.")
            send_telegram_message(f"❌ Square-off failed for *{symbol}*: Order ID not found.")
            return False

        log_message(f"Square-off order placed. Order ID: {square_off_order_id}. Polling status...")

        order_filled = False
        attempts = 0
        max_attempts = 10
        while not order_filled and attempts < max_attempts:
            time.sleep(1)
            attempts += 1
            orders = kite.orders()
            order_details = next((o for o in orders if o['order_id'] == square_off_order_id), None)

            if order_details and order_details['status'] in ['COMPLETE', 'FILLED']:
                order_filled = True
                exit_price = order_details.get('average_price', 0)
                log_message(f"Square-off order {square_off_order_id} filled at average price: {exit_price:.2f}")
                send_telegram_message(f"✅ Square-off order for *{symbol}* ({quantity}) filled at Avg Price: *{exit_price:.2f}*. Order ID: `{square_off_order_id}`. Position closed.")
                
                # Update cooldown tracking
                # Extract strike and expiry from symbol (e.g., BANKNIFTY24JUN45000CE)
                parts = re.split(r'(\d+)', symbol) # Split by digits to separate name, expiry, strike, type
                strike_str = next((p for p in parts if p.isdigit() and len(p) >= 5), "0") # Find the first long number as strike
                expiry_str_match = re.search(r'(\d{2}[A-Z]{3}\d{2})', symbol) # Find pattern like 24JUN24
                expiry = expiry_str_match.group(1) if expiry_str_match else "UNKNOWN"

                position_cooldowns[symbol] = {
                    'exit_time': get_now_ist(),
                    'strike': float(strike_str),
                    'expiry': expiry
                }
                cleanup_cooldowns()
                
            elif order_details and order_details['status'] in ['CANCELLED', 'REJECTED']:
                log_message(f"Square-off order {square_off_order_id} was {order_details['status']}.")
                send_telegram_message(f"❌ Square-off order for *{symbol}* was *{order_details['status']}*. Position might still be open!")
                return False
        
        if order_filled:
            log_trade({
                'timestamp': datetime.datetime.now(),
                'symbol': symbol,
                'side': 'BUY',  # Assuming we always BUY to enter and SELL to exit
                'qty': quantity,
                'entry_price': trade_entry_price, # Use the global entry price
                'exit_price': exit_price
            })
            
            # Remove from bot_positions
            if current_position_instrument_token in bot_positions:
                del bot_positions[current_position_instrument_token]
            current_position_instrument_token = None
            active_sl_order_id = None
            trade_entry_price = None
            highest_price_seen = None
            return True
        else:
            log_message(f"Square-off order {square_off_order_id} not filled within {max_attempts} seconds.")
            send_telegram_message(f"⚠️ Square-off order for *{symbol}* *NOT FILLED* within {max_attempts}s. Position might still be open! Order ID: `{square_off_order_id}`.")
            return False

    except exceptions.InputException as e:
        result_msg = f"Square-off failed due to input error: {e}."
        log_message(result_msg)
        send_telegram_message(f"❌ Square-off failed for *{symbol}* due to input error: {result_msg}")
        return False
    except Exception as e:
        result_msg = f"An error occurred during square-off for {symbol}: {e}"
        log_message(result_msg)
        send_telegram_message(f"❌ An error occurred during square-off for *{symbol}*: {result_msg}")
        return False

def manage_trailing_stop_loss(symbol, quantity, initial_sl_pct, trailing_step_pct):
    """Manages the trailing stop-loss order for an open position."""
    global kite, active_sl_order_id, trade_entry_price, highest_price_seen, bot_positions
    
    if not kite:
        log_message("Cannot manage trailing SL - not logged in to Kite")
        return False

    try:
        # Get current LTP
        ltp_data = kite.quote(f"NFO:{symbol}")
        current_ltp = ltp_data.get(f"NFO:{symbol}", {}).get('last_price')
        
        if current_ltp is None:
            log_message(f"Could not fetch LTP for {symbol}. Skipping trailing SL update.")
            return False

        # Update highest price seen
        if highest_price_seen is None:
            highest_price_seen = current_ltp
        else:
            highest_price_seen = max(highest_price_seen, current_ltp)

        # Check if we need to re-place cancelled SL order
        if active_sl_order_id:
            try:
                # Verify if SL order still exists
                orders = kite.orders()
                sl_order = next((o for o in orders if o['order_id'] == active_sl_order_id), None)
                
                if not sl_order or sl_order['status'] == 'CANCELLED':
                    log_message(f"Active SL order {active_sl_order_id} not found or cancelled. Will re-place.")
                    active_sl_order_id = None
            except Exception as e:
                log_message(f"Error checking SL order status: {e}")

        # If no active SL order, place fresh one
        if not active_sl_order_id:
            log_message("No active SL order found. Placing fresh SL order...")
            
            # Calculate fresh SL values
            sl_trigger = highest_price_seen * (1 - initial_sl_pct/100)
            sl_price = sl_trigger * 0.995  # Small buffer for limit price

            if sl_trigger <= 0 or sl_price <= 0:
                log_message(f"Calculated SL trigger or price is non-positive ({sl_trigger}, {sl_price}). Skipping SL order placement.")
                return False
            
            # Place fresh SL order
            sl_order_response = kite.place_order(
                tradingsymbol=symbol,
                exchange="NFO",
                transaction_type="SELL",
                quantity=quantity,
                order_type="SL",
                price=round(sl_price, 1),
                trigger_price=round(sl_trigger, 1),
                product="MIS",
                variety="regular"
            )

            if isinstance(sl_order_response, str):
                active_sl_order_id = sl_order_response
            elif isinstance(sl_order_response, dict):
                active_sl_order_id = sl_order_response.get('order_id')
            
            if active_sl_order_id:
                # Update bot_positions with new SL order ID
                if current_position_instrument_token in bot_positions:
                    bot_positions[current_position_instrument_token]['sl_order_id'] = active_sl_order_id
                
                log_message(f"Fresh SL order placed: {active_sl_order_id}")
                send_telegram_message(f"🔄 Replaced cancelled SL order for *{symbol}*: Trigger=*{sl_trigger:.2f}*, Price=*{sl_price:.2f}*")
                return True
            else:
                log_message("Failed to place fresh SL order")
                send_telegram_message(f"❌ Failed to replace SL order for *{symbol}*")
                return False

        # Normal trailing logic
        new_sl_trigger = highest_price_seen * (1 - initial_sl_pct/100)
        new_sl_price = new_sl_trigger * 0.995
        
        # Get current SL order details
        orders = kite.orders()
        sl_order = next((o for o in orders if o['order_id'] == active_sl_order_id), None)
        
        if not sl_order:
            log_message(f"Active SL order {active_sl_order_id} not found. Will re-place next cycle.")
            active_sl_order_id = None
            return False

        current_sl_trigger = float(sl_order['trigger_price']) if sl_order['trigger_price'] else None
        current_sl_price = float(sl_order['price']) if sl_order['price'] else None
        
        # Only modify if new SL is higher than current SL by at least trailing_step_pct
        if current_sl_trigger and (new_sl_trigger - current_sl_trigger) >= (highest_price_seen * trailing_step_pct/100):
            log_message(f"Updating trailing SL for {symbol}: New Trigger={new_sl_trigger:.2f}, New Price={new_sl_price:.2f} (Current Trigger={current_sl_trigger:.2f})")
            
            # Cancel existing SL order
            try:
                kite.cancel_order(order_id=active_sl_order_id, variety="regular")
                log_message(f"Cancelled old SL order {active_sl_order_id}")
            except Exception as e:
                log_message(f"Error cancelling old SL order: {e}")
                return False

            if new_sl_trigger <= 0 or new_sl_price <= 0:
                log_message(f"Calculated new SL trigger or price is non-positive ({new_sl_trigger}, {new_sl_price}). Skipping SL update.")
                return False

            # Place new SL order
            sl_order_response = kite.place_order(
                tradingsymbol=symbol,
                exchange="NFO",
                transaction_type="SELL",
                quantity=quantity,
                order_type="SL",
                price=round(new_sl_price, 1),
                trigger_price=round(new_sl_trigger, 1),
                product="MIS",
                variety="regular"
            )

            if isinstance(sl_order_response, str):
                active_sl_order_id = sl_order_response
            elif isinstance(sl_order_response, dict):
                active_sl_order_id = sl_order_response.get('order_id')
            else:
                log_message("Unexpected response type from SL order placement")
                return False

            if active_sl_order_id:
                # Update bot_positions with new SL order ID
                if current_position_instrument_token in bot_positions:
                    bot_positions[current_position_instrument_token]['sl_order_id'] = active_sl_order_id
                
                log_message(f"New trailing SL order placed: {active_sl_order_id}")
                send_telegram_message(f"🔼 Trailing SL updated for *{symbol}*: New Trigger=*{new_sl_trigger:.2f}*, Price=*{new_sl_price:.2f}*")
                return True
            else:
                log_message("Failed to get new SL order ID")
                return False
        else:
            log_message(f"No trailing SL update needed for {symbol}. Current trigger {current_sl_trigger:.2f} >= new trigger {new_sl_trigger:.2f}")
            return False

    except Exception as e:
        log_message(f"Critical error in trailing SL management: {e}")
        send_telegram_message(f"🚨 CRITICAL: Trailing SL failure for *{symbol}*: {e}")
        return False

def check_for_open_positions():
    """
    Checks if the bot currently has an open position being tracked internally,
    and reconciles with broker positions.
    """
    global kite, current_position_instrument_token, active_sl_order_id, trade_entry_price, highest_price_seen, bot_positions

    if kite is None:
        return None

    # First check if our tracked position still exists
    if current_position_instrument_token:
        try:
            positions = kite.positions()
            found = False

            # Check both day and net positions
            for pos_type in ['day', 'net']:
                for pos in positions.get(pos_type, []):
                    # Check if instrument token matches AND quantity is not zero
                    if pos['instrument_token'] == current_position_instrument_token and pos['quantity'] != 0:
                        found = True
                        # Update trade_entry_price and highest_price_seen if necessary
                        if trade_entry_price is None:
                            trade_entry_price = pos.get('average_price')
                            log_message(f"Updated trade_entry_price for {bot_positions.get(current_position_instrument_token, {}).get('symbol')}: {trade_entry_price:.2f}")
                        if highest_price_seen is None or pos.get('last_price') > highest_price_seen:
                            highest_price_seen = pos.get('last_price')
                        break
                if found:
                    break

            if not found:
                log_message(f"Bot's position {current_position_instrument_token} ({bot_positions.get(current_position_instrument_token, {}).get('symbol')}) no longer exists on broker. Cleaning up internal tracking.")
                if current_position_instrument_token in bot_positions:
                    del bot_positions[current_position_instrument_token]
                current_position_instrument_token = None
                active_sl_order_id = None
                trade_entry_price = None
                highest_price_seen = None
                return None
            else:
                return current_position_instrument_token

        except Exception as e:
            log_message(f"Error verifying position with Kite API: {e}. Assuming position still open for now.")
            return current_position_instrument_token # Assume it's still open if API call fails
    
    # If no position is being tracked, make sure we don't have any orphaned SL orders
    # This check is now integrated within cleanup_positions(), which is called before this.
    return None # No position currently tracked by the bot

def place_option_order(symbol, quantity, use_amo, sl_pct):
    """Places an option BUY order and a corresponding SL order."""
    global kite, current_position_instrument_token, last_trade_timestamp, active_sl_order_id, trade_entry_price, highest_price_seen, bot_positions

    initial_order_id = None
    sl_order_id = None
    execution_price = None
    result_msg = "Order placement failed unexpectedly."

    if kite is None:
        result_msg = "KiteConnect not logged in. Cannot place order."
        log_message(result_msg)
        send_telegram_message(f"Order failed: {result_msg}")
        return initial_order_id, sl_order_id, execution_price, result_msg

    now = get_now_ist().time()
    if use_amo and not (now < datetime.time(9, 0) or now > datetime.time(16, 0)):
        result_msg = "AMO order is only allowed from 4 PM to 9 AM. Please uncheck AMO and try again."
        log_message(result_msg)
        messagebox.showerror("AMO Order Error", result_msg)
        send_telegram_message(f"Order failed: {result_msg}")
        return initial_order_id, sl_order_id, execution_price, result_msg

    product_type = "MIS"
    variety_type = "amo" if use_amo else "regular"

    try:
        log_message(f"Fetching LTP for {symbol} to place order...")
        ltp_data = kite.quote(f"NFO:{symbol}")
        current_ltp = ltp_data.get(f"NFO:{symbol}", {}).get('last_price')

        if current_ltp is None:
            result_msg = f"Could not fetch LTP for {symbol}. Market data unavailable or symbol incorrect?"
            log_message(result_msg)
            send_telegram_message(f"Order failed for {symbol}: {result_msg}")
            raise ValueError(result_msg)

        # For AMO, typically place a limit order with a slightly higher price to ensure fill, or a market order
        limit_price = round(current_ltp * 1.005, 1) if use_amo else None # Using a small buffer for AMO limit price

        log_message(f"Placing initial BUY order for {symbol} (Product: {product_type}) with price {current_ltp} (Limit: {limit_price if use_amo else 'Market'})...")
        initial_order_response = kite.place_order(
            tradingsymbol=symbol,
            exchange="NFO",
            transaction_type="BUY",
            quantity=quantity,
            order_type="LIMIT" if use_amo else "MARKET",
            product=product_type,
            price=limit_price if use_amo else None,
            variety=variety_type
        )

        if isinstance(initial_order_response, str):
            initial_order_id = initial_order_response
        elif isinstance(initial_order_response, dict):
            initial_order_id = initial_order_response.get('order_id')
        else:
            result_msg = f"Unexpected response type from kite.place_order for initial order: {type(initial_order_response)}. Expected str or dict."
            log_message(result_msg)
            send_telegram_message(f"Order failed for {symbol}: {result_msg}")
            return initial_order_id, sl_order_id, execution_price, result_msg

        if initial_order_id is None:
             result_msg = "Order ID not found in the response from initial order placement."
             log_message(result_msg)
             send_telegram_message(f"Order failed for {symbol}: {result_msg}")
             return initial_order_id, sl_order_id, execution_price, result_msg

        order_filled = False
        attempts = 0
        max_attempts = 10 # Poll for up to 10 seconds for order fill

        while not order_filled and attempts < max_attempts:
            time.sleep(1) # Wait for 1 second before polling again
            attempts += 1
            log_message(f"Polling initial order status for {initial_order_id}... Attempt {attempts}")
            try:
                orders = kite.orders()
                order_details = next((o for o  in orders if o['order_id'] == initial_order_id), None)

                if order_details and order_details['status'] in ['COMPLETE', 'FILLED']:
                    order_filled = True
                    avg_fill_price = order_details.get('average_price', current_ltp)
                    log_message(f"Initial order {initial_order_id} filled at average price: {avg_fill_price:.2f}")
                    send_telegram_message(f"✅ Initial BUY order for *{symbol}* ({quantity}) filled at Avg Price: *{avg_fill_price:.2f}*. Order ID: `{initial_order_id}`.")
                elif order_details and order_details['status'] in ['CANCELLED', 'REJECTED']:
                    result_msg = f"Initial order {initial_order_id} was {order_details['status']}. Aborting SL order placement."
                    log_message(result_msg)
                    send_telegram_message(f"❌ Initial BUY order for *{symbol}* ({quantity}) was *{order_details['status']}*. Aborting trade. Order ID: `{initial_order_id}`.")
                    return initial_order_id, sl_order_id, execution_price, result_msg
            except Exception as e:
                log_message(f"Error while polling initial order status: {e}")

        if not order_filled:
            result_msg = f"Initial order {initial_order_id} not filled within {max_attempts} seconds. Aborting SL order placement."
            log_message(result_msg)
            send_telegram_message(f"⚠️ Initial BUY order for *{symbol}* ({quantity}) *NOT FILLED* within {max_attempts}s. Aborting trade. Order ID: `{initial_order_id}`.")
            # Optionally, cancel the pending order here if it's still open
            try:
                orders = kite.orders()
                order_details = next((o for o in orders if o['order_id'] == initial_order_id), None)
                if order_details and order_details['status'] == 'OPEN':
                    kite.cancel_order(order_id=initial_order_id, variety=variety_type)
                    log_message(f"Cancelled unfilled initial order {initial_order_id}.")
            except Exception as e_cancel:
                log_message(f"Error attempting to cancel unfilled order {initial_order_id}: {e_cancel}")

            return initial_order_id, sl_order_id, execution_price, result_msg

        execution_price = avg_fill_price if avg_fill_price else current_ltp
        sl_buffer = 0.05 # A small buffer for the limit price relative to trigger price
        initial_sl_trigger_price = round(execution_price * (1 - sl_pct / 100), 1)
        initial_sl_price = round(initial_sl_trigger_price - sl_buffer, 1) # Price must be <= trigger for SL-SELL

        # Ensure SL price and trigger are positive
        if initial_sl_trigger_price <= 0 or initial_sl_price <= 0:
            result_msg = f"Calculated SL trigger or price is non-positive (Trigger: {initial_sl_trigger_price}, Price: {initial_sl_price}). Cannot place SL order."
            log_message(result_msg)
            send_telegram_message(f"Error placing SL for *{symbol}*: {result_msg}")
            return initial_order_id, None, execution_price, result_msg


        log_message(f"Calculated Initial SL Trigger: {initial_sl_trigger_price}, SL Price: {initial_sl_price}")

        sl_order_response = kite.place_order(
            tradingsymbol=symbol,
            exchange="NFO",
            transaction_type="SELL", # Always SELL for SL on a long position
            quantity=quantity,
            order_type="SL",
            price=initial_sl_price,
            trigger_price=initial_sl_trigger_price,
            product="MIS",
            variety="regular"
        )

        if isinstance(sl_order_response, str):
            sl_order_id = sl_order_response
        elif isinstance(sl_order_response, dict):
            sl_order_id = sl_order_response.get('order_id')
        else:
            result_msg = f"Unexpected response type from kite.place_order for SL order: {type(sl_order_response)}. Expected str or dict."
            log_message(result_msg)
            send_telegram_message(f"Error placing SL for *{symbol}*: {result_msg}")
            return initial_order_id, None, execution_price, result_msg

        if sl_order_id is None:
            result_msg = "SL Order ID not found in the response from SL order placement. Trade state inconsistent."
            log_message(result_msg)
            send_telegram_message(f"Error placing SL for *{symbol}*: {result_msg}")
            return initial_order_id, None, execution_price, result_msg

        log_message(f"Initial SL order placed (Product: MIS). Order ID: {sl_order_id}.")
        send_telegram_message(f"🎯 SL order placed for *{symbol}* at Trigger: *{initial_sl_trigger_price:.2f}*, Price: *{initial_sl_price:.2f}* (Order ID: `{sl_order_id}`).")

        current_position_instrument_token = get_instrument_token(symbol)
        last_trade_timestamp = get_now_ist()
        active_sl_order_id = sl_order_id
        trade_entry_price = execution_price
        highest_price_seen = execution_price

        # Track this position in our bot_positions dictionary
        bot_positions[current_position_instrument_token] = {
            'entry_price': execution_price,
            'symbol': symbol,
            'quantity': quantity,
            'sl_order_id': sl_order_id,
            'instrument_type': 'CE' if 'CE' in symbol else 'PE' # Store type for P&L tracking
        }
        log_message(f"Tracked new position in bot_positions: {bot_positions[current_position_instrument_token]}")

        result_msg = f"Order placed for {symbol} @ {execution_price:.2f} with initial SL: {initial_sl_price} (Trigger: {initial_sl_trigger_price})."
        return initial_order_id, sl_order_id, execution_price, result_msg

    except exceptions.InputException as e:
        result_msg = f"Kite API Input Error: {e}"
        log_message(result_msg)
        send_telegram_message(f"❌ Order failed for *{symbol}*: {result_msg}")
        return initial_order_id, sl_order_id, execution_price, result_msg
    except Exception as e:
        result_msg = f"An unexpected error occurred during order placement: {e}"
        log_message(result_msg)
        send_telegram_message(f"❌ Order failed for *{symbol}*: {e}")
        return initial_order_id, sl_order_id, execution_price, result_msg

# --- Improved Supply/Demand Zone Detector Classes ---
class OrderBlock:
    """Represents a single detected order block (supply or demand zone)."""
    def __init__(self, bar_high, bar_low, bar_time, bias):
        self.bar_high = bar_high
        self.bar_low = bar_low
        self.bar_time = bar_time
        self.bias = bias  # +1 for demand, -1 for supply
        self.confirmed = False  # Track if zone is confirmed
        self.confirmation_time = None  # When zone was confirmed

class SupplyDemandDetector:
    """Detects and manages supply and demand zones."""
    def __init__(self, atr_length=14, threshold=1.0, use_internal_zones_var=None, lookback=5, max_blocks=1000, use_atr=True):
        self.atr_length = atr_length
        self.threshold = threshold
        # IMPORTANT: This instance variable now directly reflects whether internal zones should be used.
        # It can be controlled by a Tkinter BooleanVar or a simple Python boolean.
        self.use_internal_zones_var = use_internal_zones_var 
        self.lookback = lookback
        self.max_blocks = max_blocks
        self.use_atr = use_atr
        self.swing_order_blocks = []
        self.internal_order_blocks = []
        self.potential_zones = []  # Store potential zones before confirmation
        self.confirmation_bars = 3  # Number of bars needed to confirm a zone
        self.min_zone_age = 3  # Minimum bars a zone must exist before being considered valid

    def calculate_atr(self, df, period=14):
        """Calculates ATR for a given DataFrame."""
        high = df['high']
        low = df['low']
        close = df['close']
        tr = np.maximum(high - low, np.maximum(abs(high - close.shift()), abs(low - close.shift())))
        return tr.rolling(window=period).mean()

    def detect_leg(self, highs, lows, i):
        """Detects potential pivot (swing high/low) that could form a zone."""
        if i < self.lookback + self.confirmation_bars:  # Need enough bars for confirmation
            return 0
        
        # Check for new high with confirmation
        if highs.iloc[i] > highs.iloc[i - self.lookback:i].max():
            # Verify next bars don't invalidate the high
            for j in range(1, self.confirmation_bars + 1):
                if i + j >= len(highs) or highs.iloc[i + j] > highs.iloc[i]:
                    return 0
            return -1  # confirmed supply
        
        # Check for new low with confirmation
        if lows.iloc[i] < lows.iloc[i - self.lookback:i].min():
            # Verify next bars don't invalidate the low
            for j in range(1, self.confirmation_bars + 1):
                if i + j >= len(lows) or lows.iloc[i + j] < lows.iloc[i]:
                    return 0
            return 1   # confirmed demand
        
        return 0

    def store_order_block(self, df, pivot_idx, bias, internal=True):
        """Stores a confirmed order block."""
        highs = df['high']
        lows = df['low']
        times = df.index

        if pivot_idx >= len(df):
            log_message(f"Warning: pivot_idx {pivot_idx} out of bounds for df length {len(df)}. Skipping order block storage.")
            return

        # Only store zones after confirmation period
        if pivot_idx + self.confirmation_bars >= len(df):
            return

        # Check for invalidation during the confirmation period itself
        is_invalidated_during_confirmation = False
        if bias == -1:  # supply
            for j in range(1, self.confirmation_bars + 1):
                if pivot_idx + j >= len(highs): continue # Avoid out of bounds
                if highs.iloc[pivot_idx + j] > highs.iloc[pivot_idx]:
                    is_invalidated_during_confirmation = True
                    break
        else:  # demand
            for j in range(1, self.confirmation_bars + 1):
                if pivot_idx + j >= len(lows): continue # Avoid out of bounds
                if lows.iloc[pivot_idx + j] < lows.iloc[pivot_idx]:
                    is_invalidated_during_confirmation = True
                    break

        if is_invalidated_during_confirmation:
            pivot_type = "Supply" if bias == -1 else "Demand"
            log_message(f"🚫 Potential {pivot_type} at {times[pivot_idx].strftime('%Y-%m-%d %H:%M:%S')} invalidated during confirmation period.")
            return


        ob = OrderBlock(
            bar_high=highs.iloc[pivot_idx],
            bar_low=lows.iloc[pivot_idx],
            bar_time=times[pivot_idx],
            bias=bias
        )
        ob.confirmed = True
        # Confirmation time is when the confirmation bars have closed
        ob.confirmation_time = times[pivot_idx + self.confirmation_bars]

        block_list = self.internal_order_blocks if internal else self.swing_order_blocks
        if len(block_list) >= self.max_blocks:
            oldest_block = block_list.pop(0)
            log_message(f"🧹 Removed oldest zone {oldest_block.bar_time} (Type: {'Supply' if oldest_block.bias == -1 else 'Demand'} {'Internal' if internal else 'Swing'}) due to max blocks limit.")
        
        block_list.append(ob)
        zone_type_str = "Supply" if bias == -1 else "Demand"
        zone_origin_str = "Internal" if internal else "Swing"
        log_message(f"✨ Detected and Confirmed {zone_type_str} ({zone_origin_str}) Zone: High={ob.bar_high:.2f}, Low={ob.bar_low:.2f}, Time={ob.bar_time.strftime('%Y-%m-%d %H:%M:%S')}. Confirmed at {ob.confirmation_time.strftime('%Y-%m-%d %H:%M:%S')}.")


    def delete_invalidated_blocks(self, df, internal=True, use_close=False):
        """Removes zones that have been invalidated (price moved through them)."""
        if df.empty:
            return

        # Use the latest available data for invalidation checks
        current_row = df.iloc[-1]
        current_high = current_row['high']
        current_low = current_row['low']
        current_close = current_row['close']

        block_list = self.internal_order_blocks if internal else self.swing_order_blocks
        valid_blocks = []
        zone_origin_str = "Internal" if internal else "Swing"

        for ob in block_list:
            is_valid = False
            if ob.bias == -1:  # Supply block
                # Supply zone invalidated if high breaks above it
                if current_high <= ob.bar_high:
                    is_valid = True
            elif ob.bias == 1:  # Demand block
                # Demand zone invalidated if low breaks below it
                if current_low >= ob.bar_low:
                    is_valid = True
            
            if is_valid:
                valid_blocks.append(ob)
            else:
                zone_type_str = "Supply" if ob.bias == -1 else "Demand"
                log_message(f"❌ Invalidation: {zone_type_str} ({zone_origin_str}) Zone {ob.bar_low:.2f}-{ob.bar_high:.2f} (Time: {ob.bar_time.strftime('%Y-%m-%d %H:%M:%S')}) invalidated by current price action.")


        if internal:
            self.internal_order_blocks = valid_blocks
        else:
            self.swing_order_blocks = valid_blocks

    def run(self, df):
        """Runs the zone detection algorithm on the given DataFrame."""
        df = df.copy()
        if self.use_atr:
            df['atr'] = self.calculate_atr(df)
        else:
            df['atr'] = (df['high'] - df['low']).expanding().mean()
        df['atr'] = df['atr'].fillna(df['atr'].mean())

        all_detected_zones = []

        # Determine whether to use internal zones based on the passed BooleanVar
        # Get the current value from the BooleanVar if it's a Tkinter variable, otherwise use its boolean value
        use_internal = False
        if isinstance(self.use_internal_zones_var, tk.BooleanVar):
            use_internal = self.use_internal_zones_var.get()
        elif isinstance(self.use_internal_zones_var, bool): # For cases where a raw boolean is passed
            use_internal = self.use_internal_zones_var

        log_message(f"Starting zone detection for {len(df)} bars. Lookback: {self.lookback}, Confirmation Bars: {self.confirmation_bars}, Min Zone Age: {self.min_zone_age} minutes. Use Internal Zones: {use_internal}")


        for i in range(self.lookback, len(df)):
            leg = self.detect_leg(df['high'], df['low'], i)

            if leg != 0:
                # Log potential pivot detection before confirmation
                pivot_type = "High (Potential Supply)" if leg == -1 else "Low (Potential Demand)"
                log_message(f"📈📉 Potential Pivot detected at {df.index[i].strftime('%Y-%m-%d %H:%M:%S')}: {pivot_type} - Price: {df['close'].iloc[i]:.2f}.")

                if use_internal: # Only store internal zones if 'use_internal' is True
                    self.store_order_block(df, i, leg, internal=True)
                self.store_order_block(df, i, leg, internal=False) # Always store swing zones

            # Invalidation only makes sense when there's enough data for current bar's price action
            if i >= self.lookback + self.confirmation_bars: 
                if use_internal: # Only invalidate internal zones if 'use_internal' is True
                    self.delete_invalidated_blocks(df.iloc[:i+1], internal=True)
                self.delete_invalidated_blocks(df.iloc[:i+1], internal=False) # Always invalidate swing zones

        # Only include zones that have been confirmed and meet minimum age
        current_time = df.index[-1]
        
        final_swing_zones = []
        for ob in self.swing_order_blocks:
            # Check if confirmation_time exists before using it
            if ob.confirmed and ob.confirmation_time and (current_time - ob.confirmation_time).total_seconds() >= self.min_zone_age * 60:
                final_swing_zones.append(ob)
                zone_type = "Supply" if ob.bias == -1 else "Demand"
                log_message(f"✅ Final Swing Zone: {zone_type} | High: {ob.bar_high:.2f}, Low: {ob.bar_low:.2f}, Time: {ob.bar_time.strftime('%Y-%m-%d %H:%M:%S')}")
        all_detected_zones.extend([
            {"type": "Supply" if ob.bias == -1 else "Demand", 
             "high": ob.bar_high, "low": ob.bar_low, "time": ob.bar_time}
            for ob in final_swing_zones
        ])

        if use_internal: # Only add internal zones to output if 'use_internal' is True
            final_internal_zones = []
            for ob in self.internal_order_blocks:
                # Check if confirmation_time exists before using it
                if ob.confirmed and ob.confirmation_time and (current_time - ob.confirmation_time).total_seconds() >= self.min_zone_age * 60:
                    final_internal_zones.append(ob)
                    zone_type = "Supply (Internal)" if ob.bias == -1 else "Demand (Internal)"
                    log_message(f"✅ Final Internal Zone: {zone_type} | High: {ob.bar_high:.2f}, Low: {ob.bar_low:.2f}, Time: {ob.bar_time.strftime('%Y-%m-%d %H:%M:%S')}")
            all_detected_zones.extend([
                {"type": "Supply (Internal)" if ob.bias == -1 else "Demand (Internal)",
                 "high": ob.bar_high, "low": ob.bar_low, "time": ob.bar_time}
                for ob in final_internal_zones
            ])

        log_message(f"Zone detection complete. Total {len(all_detected_zones)} valid zones found.")
        return all_detected_zones

    def is_price_in_zone(self, price, min_age_bars=3):
        """Checks if the current price is within any active supply/demand zone."""
        zones_to_check = []
        
        # Determine whether to use internal zones based on the passed BooleanVar
        use_internal_in_check = False
        if isinstance(self.use_internal_zones_var, tk.BooleanVar):
            use_internal_in_check = self.use_internal_zones_var.get()
        elif isinstance(self.use_internal_zones_var, bool):
            use_internal_in_check = self.use_internal_zones_var
            
        log_message(f"Zone Check - Using Internal Zones: {use_internal_in_check}")

        # Add swing zones always
        zones_to_check += [z for z in self.swing_order_blocks 
                         if z.confirmed and z.confirmation_time and (get_now_ist() - z.confirmation_time).total_seconds() >= min_age_bars * 60]

        # Conditionally add internal zones
        if use_internal_in_check:
            zones_to_check += [z for z in self.internal_order_blocks 
                             if z.confirmed and z.confirmation_time and (get_now_ist() - z.confirmation_time).total_seconds() >= min_age_bars * 60]


        for zone in zones_to_check:
            if zone.bar_low <= price <= zone.bar_high:
                zone_type = "Demand" if zone.bias == 1 else "Supply"
                zone_origin = "Internal" if zone in self.internal_order_blocks else "Swing"
                log_message(f"🎯 Price {price:.2f} is *within* {zone_type} ({zone_origin}) Zone: {zone.bar_low:.2f}-{zone.bar_high:.2f} (Time: {zone.bar_time.strftime('%Y-%m-%d %H:%M:%S')}).")
                return True, f"{zone_type} ({zone_origin})", zone

        log_message(f"🚫 Price {price:.2f} is *outside* all currently active zones.")
        return False, None, None

# --- Strategy Logic Functions ---

def is_consolidating(df, range_pct, duration_min, candle_interval_min):
    # This function is no longer used for trade entry logic.
    """Checks for price consolidation within a given range and duration."""
    bars_needed = int(duration_min / candle_interval_min)
    if len(df) < bars_needed:
        return False
    recent_df = df.tail(bars_needed)
    high = recent_df['high'].max()
    low = recent_df['low'].min()
    mid = (high + low) / 2
    return ((high - low) / mid) * 100 <= range_pct

def run_entry_logic():
    global is_strategy_running, last_entry_check_timestamp, zones_data
    # Removed consolidation_start_time, consolidation_ce_symbol, consolidation_pe_symbol, consolidation_ce_initial_ltp, consolidation_pe_initial_ltp from globals
    # Removed last_ema_cross_time, last_ema_cross_type from globals

    if not is_running:
        log_message("Entry logic not running: Strategy is stopped.")
        return
    if is_strategy_running:
        log_message("Entry logic is already running. Skipping this cycle.")
        return

    is_strategy_running = True # Set flag to prevent re-entry
    start_time_func = time.time() # Renamed to avoid conflict with global start_time
    try:
        if not kite:
            log_message("KiteConnect not logged in. Skipping entry logic.")
            return

        if check_for_open_positions() is not None:
            log_message("Open position detected. Skipping new trade entry.")
            send_telegram_message("ℹ️ Open position detected. Skipping new trade entry.")
            return

        if not is_market_open():
            log_message("Market is closed. Skipping entry logic.")
            send_telegram_message("ℹ️ Market closed. Skipping entry logic.")
            return

        selected_timeframe = timeframe_var.get()
        selected_index = index_var.get()
        quantity_entry = qty_entry.get()
        sl_percent_entry = sl_entry.get()
        target_points_entry_val = target_points_entry.get()
        reentry_minutes_entry = reentry_entry.get()
        
        # Validate inputs
        if not all([selected_timeframe, selected_index, quantity_entry, sl_percent_entry, target_points_entry_val, reentry_minutes_entry]):
            raise ValueError("All strategy parameters must be filled: Timeframe, Index, Quantity, SL %, Target Points, Re-entry Cooldown.")
        
        try:
            quantity_value = int(quantity_entry)
            sl_percent_value = float(sl_percent_entry)
            target_points_value = float(target_points_entry_val)
            reentry_minutes_value = int(reentry_minutes_entry)
        except ValueError:
            raise ValueError("Quantity, SL %, Target Points, Re-entry Cooldown must be valid numbers.")

        # Cleanup old cooldown entries
        cleanup_cooldowns()

        index_token = None
        if selected_index == "NIFTY 50":
            index_token = 256265  # NIFTY 50 index token (NSE)
        elif selected_index == "BANKNIFTY":
            index_token = 260105  # BANKNIFTY index token (NFO ref)
        if not index_token:
            log_message(f"Could not resolve instrument token for {selected_index}. Skipping entry logic.")
            send_telegram_message(f"❌ Could not resolve instrument token for *{selected_index}*. Skipping entry logic.")
            return
        log_message(f"{selected_index} instrument token resolved as {index_token}")

        end_time = get_now_ist()
        try:
            start_time_index = get_last_trading_day_start_cached(index_token, timeframe_map[selected_timeframe])
        except Exception as e:
            log_message(f"❌ Could not find last valid trading day for {selected_index}: {e}")
            send_telegram_message(f"⚠️ Skipping entry check: No valid trading day for *{selected_index}*. Error: {e}")
            return

        log_message(f"Fetching historical data for {selected_index} from {start_time_index.strftime('%Y-%m-%d %H:%M')} to {end_time.strftime('%Y-%m-%d %H:%M')} ({timeframe_map[selected_timeframe]})...")
        try:
            nifty_data = kite.historical_data(index_token, start_time_index, end_time, timeframe_map[selected_timeframe])
            nifty_df = pd.DataFrame(nifty_data)
        except Exception as e:
            log_message(f"Error fetching historical data for {selected_index}: {e}")
            send_telegram_message(f"⚠️ Entry Check Skipped: Error fetching historical data for *{selected_index}*: {e}")
            return

        if nifty_df.empty:
            log_message(f"No historical data fetched for {selected_index}. Cannot proceed with entry logic.")
            send_telegram_message(f"⚠️ Entry Check Skipped: No historical data for *{selected_index}*.")
            return

        if 'date' in nifty_df.columns:
            nifty_df['date'] = pd.to_datetime(nifty_df['date'])
            nifty_df.set_index('date', inplace=True)
            nifty_df = nifty_df.rename(columns=str.lower) # Convert column names to lowercase for consistency
        else:
            log_message("Warning: 'date' column not found in historical data. Assuming index is datetime.")
            nifty_df.index = pd.to_datetime(nifty_df.index)
            nifty_df = nifty_df.rename(columns=str.lower) # Convert column names to lowercase for consistency

        # RSI and EMA calculations are no longer used for filtering, but functions are kept.
        nifty_df['rsi'] = get_rsi(nifty_df)
        nifty_df['ema_5'] = get_ema(nifty_df, 5)
        nifty_df['ema_13'] = get_ema(nifty_df, 13)
        nifty_df.dropna(subset=['close'], inplace=True) # Ensure 'close' column exists

        if nifty_df.empty:
            log_message("Index data preparation resulted in all NaNs after dropping. Not enough data points?")
            send_telegram_message(f"⚠️ Entry Check Skipped: Not enough data for *{selected_index}* after prep.")
            return

        nifty_last_price = nifty_df['close'].iloc[-1]
        log_message(f"Last {selected_index} price: {nifty_last_price:.2f}")

        # ===== ZONE DETECTION AND TRADE SIGNAL GENERATION =====
        zone_bias = 0
        in_zone = False
        zone_desc = None
        active_zone = None
        
        # --- MODIFICATION START ---
        # UNION of zones: (A) current timeframe (usually 5m last day) + (B) 15m last {zone_days_var.get()} days
        # Always use swing (legacy) zones for entries.
        temp_use_internal_zones_for_entry = tk.BooleanVar(value=False)

        # A) Detector on current timeframe df
        det_a = SupplyDemandDetector(lookback=5, max_blocks=1000, use_atr=True)
        det_a.use_internal_zones_var = temp_use_internal_zones_for_entry
        det_a.run(nifty_df)

        # B) Detector on 15m / {zone_days_var.get()}-day window
        try:
            start_lookback_zone = end_time - timedelta(days=zone_days_var.get())
            log_message(f"Fetching 15m, last {zone_days_var.get()} days for zone merge: {start_lookback_zone.strftime('%Y-%m-%d %H:%M')} → {end_time.strftime('%Y-%m-%d %H:%M')}")
            # Ensure correct index token for historical data (NIFTY 50 or BANKNIFTY)
            data_15m = kite.historical_data(index_token, start_lookback_zone, end_time, '15minute')
            df_15m = pd.DataFrame(data_15m)
            if not df_15m.empty:
                if 'date' in df_15m.columns:
                    df_15m['date'] = pd.to_datetime(df_15m['date'])
                    df_15m.set_index('date', inplace=True)
                df_15m = df_15m.rename(columns=str.lower)
                det_b = SupplyDemandDetector(lookback=5, max_blocks=1000, use_atr=True)
                det_b.use_internal_zones_var = temp_use_internal_zones_for_entry
                det_b.run(df_15m[['high','low','close','open']].copy())
            else:
                det_b = SupplyDemandDetector(lookback=5, max_blocks=1000, use_atr=True)
                det_b.use_internal_zones_var = temp_use_internal_zones_for_entry
        except Exception as e:
            log_message(f"15m/{zone_days_var.get()}d fetch failed for merge: {e}")
            det_b = SupplyDemandDetector(lookback=5, max_blocks=1000, use_atr=True)
            det_b.use_internal_zones_var = temp_use_internal_zones_for_entry

        # Merge swing blocks from both detectors
        merged_blocks = merge_order_blocks(det_a.swing_order_blocks, det_b.swing_order_blocks, price_tol_pct=0.05, mode='union')

        # Use det_a as the active detector, but replace its swing blocks with merged
        zone_detector = det_a
        zone_detector.swing_order_blocks = merged_blocks
        zone_detector.internal_order_blocks = []  # ensure internals unused

        # Update zones_data for the GUI viewer to reflect what entry used
        zones_data = blocks_to_zone_dicts(merged_blocks)

        # Now check price against the merged zones
        in_zone, zone_desc, active_zone = zone_detector.is_price_in_zone(nifty_last_price)
        # --- MODIFICATION END ---
        
        option_type_selected = None # Initialize option type selected to None
        if in_zone and active_zone:
            zone_bias = active_zone.bias  # +1 for demand, -1 for supply

            # === Reversal confirmation at zone (added) ===
            current_idx = len(nifty_df) - 1 # Use the latest candle for confirmation
            expected = 'bullish' if zone_bias == 1 else 'bearish'

            # GUI toggles (fallback defaults if not present)
            try:
                use_filter = use_reversal_filter_var.get()
            except Exception:
                use_filter = True
            try:
                require_break = require_break_var.get()
            except Exception:
                require_break = True
            try:
                use_vol = use_volume_kick_var.get()
            except Exception:
                use_vol = False

            # Read volume kick multiplier from GUI (fallback to 1.2 if missing/invalid)
            try:
                vol_kick_multiplier = float(vol_kick_multiplier_var.get())
                if vol_kick_multiplier < 1.0:
                    vol_kick_multiplier = 1.0
            except Exception:
                vol_kick_multiplier = 1.2
            ok, pat_name, pat_idx = (True, "Zone Only", current_idx)
            if use_filter:
                ok, pat_name, pat_idx = detect_reversal_pattern(nifty_df, current_idx, expected)

            broke = ok
            if ok and require_break:
                broke = price_confirms_breakout(nifty_df, pat_idx, nifty_last_price, expected)

            # Optional volume kick - NOW USING FUTURES VOLUME
            if broke and use_vol:
                try:
                    # Get monthly expiry for the futures contract
                    futures_expiry = get_monthly_expiry()
                    # Get the current volume for the futures contract
                    current_futures_volume = get_futures_volume(kite, selected_index, futures_expiry)

                    if current_futures_volume is not None:
                        # Fetch historical futures data to calculate median volume
                        # Assuming 30 days of 1-minute historical data for median volume calculation.
                        # This can be optimized by caching or using a longer timeframe for median.
                        futures_hist_start = end_time - datetime.timedelta(days=30)
                        futures_hist_token = get_futures_instrument_token(selected_index, futures_expiry)
                        
                        if futures_hist_token:
                            futures_hist_data = kite.historical_data(futures_hist_token, futures_hist_start, end_time, '1minute') # Using 1minute for historical volume
                            futures_hist_df = pd.DataFrame(futures_hist_data)
                            if not futures_hist_df.empty and 'volume' in futures_hist_df.columns:
                                futures_hist_df['date'] = pd.to_datetime(futures_hist_df['date'])
                                futures_hist_df.set_index('date', inplace=True)
                                
                                # Calculate median volume from historical futures data
                                vol_med = futures_hist_df['volume'].median()
                                
                                if not (vol_med == vol_med and current_futures_volume >= vol_kick_multiplier * vol_med): # Check for NaN and then volume kick
                                    broke = False
                                    pat_name = f"{pat_name} (no vol kick)"
                                else:
                                    log_message(f"Volume kick CONFIRMED for {selected_index} futures. Current Vol: {current_futures_volume}, Median Vol: {vol_med:.0f}")
                            else:
                                log_message(f"No historical futures volume data for median calculation for {selected_index}.")
                                # If no historical volume, cannot confirm volume kick, so treat as no kick
                                broke = False
                                pat_name = f"{pat_name} (no futures volume data)"
                        else:
                            log_message(f"Could not get futures instrument token for historical volume for {selected_index}.")
                            broke = False
                            pat_name = f"{pat_name} (no futures token)"
                    else:
                        log_message(f"Could not fetch current futures volume for {selected_index}.")
                        broke = False
                        pat_name = f"{pat_name} (no futures volume)"
                except Exception as _e:
                    log_message(f"Error in futures volume kick check: {_e}")
                    broke = False
                    pat_name = f"{pat_name} (vol check error)"
            elif use_vol and ('volume' not in nifty_df.columns): # If use_vol is true but no 'volume' column in index_df (unlikely, but for robustness)
                log_message("Warning: Volume kick enabled but no 'volume' column in index data or futures volume not available.")
                broke = False
                pat_name = f"{pat_name} (no volume data)"

            if broke:
                if zone_bias == 1:  # Demand -> CE
                    option_type_selected = "CE"
                    log_message(f"Price {nifty_last_price:.2f} is within {zone_desc} & confirmed by {pat_name}. Signal: BUY CE.")
                    send_telegram_message(f"✅ *{selected_index}* {nifty_last_price:.2f}: In *{zone_desc}* with *{pat_name}*. Signal: *BUY CE*.")
                    confirmation_var.set(f"Demand + {pat_name} (CE)")
                else:  # Supply -> PE
                    option_type_selected = "PE"
                    log_message(f"Price {nifty_last_price:.2f} is within {zone_desc} & confirmed by {pat_name}. Signal: BUY PE.")
                    send_telegram_message(f"✅ *{selected_index}* {nifty_last_price:.2f}: In *{zone_desc}* with *{pat_name}*. Signal: *BUY PE*.")
                    confirmation_var.set(f"Supply + {pat_name} (PE)")
            else:
                if zone_bias == 1:
                    log_message(f"In Demand {zone_desc}, but NO bullish reversal yet. Standing by.")
                    send_telegram_message(f"ℹ️ In *Demand {zone_desc}*, no bullish reversal yet → no trade.")
                    confirmation_var.set("Demand: waiting reversal")
                else:
                    log_message(f"In Supply {zone_desc}, but NO bearish reversal yet. Standing by.")
                    send_telegram_message(f"ℹ️ In *Supply {zone_desc}*, no bearish reversal yet → no trade.")
                    confirmation_var.set("Supply: waiting reversal")
        else:
            log_message(f"Price {nifty_last_price:.2f} is outside all known zones. No trade signal from zones.")
            send_telegram_message(f"ℹ️ Price *{nifty_last_price:.2f}* is _outside_ all zones. No trade signal.")
            confirmation_var.set("No Zone Hit")
            return # No trade if not in a zone, as zones are the only filter


        # --- Consolidation Detection (Completely removed from strategy logic) ---
        # The variables ce_decay_var and pe_decay_var are reset for GUI clarity,
        # but no active consolidation detection logic drives trade decisions.
        ce_decay_var.set(f"CE Decay: --")
        pe_decay_var.set(f"PE Decay: --")

        # Removed confirmation candles logic as trade decision is purely zone based
        # Removed calls to get_trend_strength, check_bullish/bearish_confirmation.
        
        if option_type_selected: # If a trade type was determined by zone analysis
            option_symbol = get_option_symbol(nifty_last_price, option_type_selected, selected_index)
            if option_symbol:
                # ===== ENHANCED RE-ENTRY COOLDOWN CHECK =====
                if is_cooldown_over(option_symbol):
                    sl_pct = float(sl_entry.get())
                    quantity = int(qty_entry.get())
                    # Adjust quantity based on index
                    if selected_index == "NIFTY 50":
                        quantity *= 75 # Nifty lot size is 75
                    elif selected_index == "BANKNIFTY":
                        quantity *= 35 # BankNifty lot size is 35
                    # Ensure quantity is positive
                    if quantity <= 0:
                        raise ValueError("Quantity must be a positive number.")

                    use_amo = amo_var.get()
                    initial_order_id, sl_order_id, entry_price, result_msg = place_option_order(
                        option_symbol, quantity=quantity, use_amo=use_amo, sl_pct=sl_pct
                    )
                    if initial_order_id and sl_order_id and entry_price:
                        log_message(f"Order placement successful: {result_msg}")
                        send_telegram_message(f"✅ *TRADE ENTRY:* Bought *{option_type_selected}* for *{option_symbol}* @ *{entry_price:.2f}*. {result_msg}")
                    else:
                        log_message(f"Order placement failed: {result_msg}")
                        send_telegram_message(f"❌ *TRADE FAILED:* Could not enter trade for *{option_type_selected}* on *{option_symbol}*. Reason: {result_msg}")
                else:
                    cooldown_data = position_cooldowns.get(option_symbol, {})
                    cooldown_end = cooldown_data.get('exit_time', get_now_ist()) + timedelta(minutes=int(reentry_entry.get()))
                    cooldown_left = (cooldown_end - get_now_ist()).total_seconds() / 60
                    if cooldown_left > 0:
                        log_message(f"Cooldown active for {option_symbol}. {cooldown_left:.1f} minutes left.")
                        send_telegram_message(f"⏳ Cooldown active for *{option_symbol}* until {cooldown_end.strftime('%H:%M:%S')} ({cooldown_left:.1f} mins left).")
                    else:
                        log_message(f"Cooldown period expired for {option_symbol} but wasn't cleaned up. Cleaning now.")
                        position_cooldowns.pop(option_symbol, None) # Clean up if expired but still present
                # ===== END ENHANCED COOLDOWN CHECK =====
            else:
                log_message(f"Could not find a suitable option symbol for {selected_index} Index signal. No trade executed.")
                send_telegram_message(f"ℹ️ No trade executed. Could not find suitable option symbol for {selected_index} Index signal.")
        else:
            log_message(f"No option type determined from zone analysis. No trade executed.")
            send_telegram_message(f"ℹ️ No trade executed. No option type determined from zone analysis.")

    except ValueError as ve:
        log_message(f"Configuration/Input Error: {ve}")
        messagebox.showerror("Configuration Error", str(ve))
        send_telegram_message(f"❌ *Configuration Error*: {ve}")
    except Exception as e:
        log_message(f"Entry logic execution error: {e}")
        messagebox.showerror("Entry Error", str(e))
        send_telegram_message(f"🚨 *Entry Logic Execution Error*: {e}")
    finally:
        last_entry_check_timestamp = get_now_ist()
        is_strategy_running = False # Reset flag
        execution_time = time.time() - start_time_func
        log_message(f"Entry logic execution completed in {execution_time:.2f} seconds")


def run_exit_logic_only():
    global current_position_instrument_token, trade_entry_price, last_exit_check_timestamp
    
    if not is_running:
        return
    
    start_time_func = time.time() # Renamed to avoid conflict with global start_time
    
    try:
        # Cleanup positions first
        cleanup_positions()

        if not is_market_open():
            log_message("Market is closed - skipping exit check")
            return

        # Check only our own positions
        open_pos_token = current_position_instrument_token if current_position_instrument_token else None

        if open_pos_token is not None:
            log_message(f"Bot's position detected for {current_position_instrument_token}. Managing exit conditions.")
            symbol_found = None
            instrument_type_found = None
            quantity = None
            
            # Get position details from our tracking
            if current_position_instrument_token in bot_positions:
                pos_data = bot_positions[current_position_instrument_token]
                symbol_found = pos_data['symbol']
                quantity = pos_data['quantity']
                instrument_type_found = 'PE' if 'PE' in symbol_found else 'CE'
            
            if symbol_found and quantity:
                # 1. Check target exit
                try:
                    ltp_data = kite.quote(f"NFO:{symbol_found}")
                    current_ltp = ltp_data.get(f"NFO:{symbol_found}", {}).get('last_price')
                    
                    if current_ltp is None:
                        log_message(f"Target Exit: Could not fetch LTP for open position {symbol_found}. Skipping target check.")
                    else:
                        target_reached = False
                        target_points = float(target_points_entry.get())
                        
                        # Assuming trade_entry_price is correctly set when entering position
                        if trade_entry_price and current_ltp >= (trade_entry_price + target_points):
                            target_reached = True
                            log_message(f"Target Exit: {instrument_type_found} position for {symbol_found} reached target. Entry: {trade_entry_price:.2f}, Current LTP: {current_ltp:.2f}, Target: {trade_entry_price + target_points:.2f}")
                            send_telegram_message(f"🎉 Target hit for *{instrument_type_found} position* on *{symbol_found}*! Entry: *{trade_entry_price:.2f}*, Current: *{current_ltp:.2f}* (+{target_points} pts). Initiating exit.")

                        if target_reached:
                            square_off_position(symbol_found, quantity, instrument_type_found)
                            return  # Only return if we actually squared off
                except Exception as e:
                    log_message(f"Error in Target Point exit check for {symbol_found}: {e}")
                    send_telegram_message(f"❌ Error in Target Point exit check for *{symbol_found}*: {e}")

                # 2. Manage trailing SL
                try:
                    sl_pct = float(sl_entry.get())
                    trailing_step_pct = float(trailing_sl_entry.get())
                    manage_trailing_stop_loss(symbol_found, quantity, sl_pct, trailing_step_pct)
                except Exception as e:
                    log_message(f"Error managing trailing SL for {symbol_found}: {e}")
                    send_telegram_message(f"❌ Error managing trailing SL for *{symbol}*: {e}")
            else:
                log_message(f"Could not find tracking details for instrument token {current_position_instrument_token}. Cannot manage exit conditions.")
        else:
            log_message("No open position detected - skipping exit management")

    except Exception as e:
        log_message(f"Exit logic error: {e}")
        send_telegram_message(f"🚨 Exit Logic Error: {e}")
    
    finally:
        last_exit_check_timestamp = get_now_ist()
        execution_time = time.time() - start_time_func
        log_message(f"Exit logic execution completed in {execution_time:.2f} seconds")

# --- GUI Functions ---
def open_login_url():
    """Opens the KiteConnect login URL in a web browser."""
    api_key = api_key_entry.get()
    if not api_key:
        messagebox.showwarning("Missing", "Enter your API Key first.")
        return
    url = f"https://kite.zerodha.com/connect/login?v=3&api_key={api_key}"
    webbrowser.open(url)
    log_message(f"Opened Kite login URL: {url}")
    send_telegram_message(f"🌐 Opened Kite login URL.")

def login():
    """Attempts to log in to KiteConnect using provided credentials."""
    global kite
    api_key = api_key_entry.get()
    api_secret = api_secret_entry.get()
    request_token = request_token_entry.get()

    if not all([api_key, api_secret, request_token]):
        messagebox.showwarning("Missing Credentials", "Please enter API Key, API Secret, and Request Token.")
        send_telegram_message("❌ Login Failed: Missing KiteConnect credentials.")
        return
    try:
        log_message("Attempting to log in to KiteConnect...")
        kite = KiteConnect(api_key=api_key)
        session = kite.generate_session(request_token, api_secret=api_secret)
        kite.set_access_token(session["access_token"])
        save_credentials(api_key, api_secret, request_token)
        log_message("Login successful!")
        messagebox.showinfo("Login", "Login successful!")
        send_telegram_message("✅ KiteConnect Login Successful!")
        load_nfo_instruments() # Load instruments after successful login
    except exceptions.TokenException as e:
        messagebox.showerror("Login Error", f"Invalid request token or API key/secret combination. Please regenerate request token. Error: {e}")
        log_message(f"Login failed (Token Error): {e}")
        send_telegram_message(f"❌ KiteConnect Login Failed (Token Error): {e}")
    except Exception as e:
        messagebox.showerror("Login Error", f"An error occurred during login: {e}")
        log_message(f"Login failed: {e}")
        send_telegram_message(f"❌ KiteConnect Login Failed: {e}")

def show_pnl_popup():
    """Displays the daily, weekly, and monthly P&L summary in a popup."""
    try:
        out = get_daily_weekly_monthly_summary()
        if isinstance(out, dict):
            daily = out.get("daily", 0.0)
            weekly = out.get("weekly", 0.0)
            monthly = out.get("monthly", 0.0)
        else:
            # tuple/list fallback
            daily, weekly, monthly, *rest = out
    except Exception as e:
        try:
            log_message(f"[PnL] popup summary error: {e}")
        except Exception:
            print(f"[PnL] popup summary error: {e}")
        daily = weekly = monthly = 0.0

    # Ensure formatting to 2 decimals for neat UI
    try:
        daily_s = f"{float(daily):.2f}"
        weekly_s = f"{float(weekly):.2f}"
        monthly_s = f"{float(monthly):.2f}"
    except Exception:
        daily_s, weekly_s, monthly_s = str(daily), str(weekly), str(monthly)

    try:
        # Use tkinter messagebox to display
        from tkinter import messagebox
        messagebox.showinfo(
            "P&L Summary",
            f"Daily P&L: ₹{daily_s}\nWeekly P&L: ₹{weekly_s}\nMonthly P&L: ₹{monthly_s}"
        )
    except Exception as e:
        # Fallback to console if GUI messagebox fails
        try:
            log_message(f"[PnL] Could not show popup: {e}")
        except Exception:
            print(f"[PnL] Could not show popup: {e}")
        print(f"Daily P&L: ₹{daily_s}\nWeekly P&L: ₹{weekly_s}\nMonthly P&L: ₹{monthly_s}")


def export_excel_popup():
    """Exports P&L data to an Excel file and shows a popup with the result."""
    try:
        result = export_pnl_to_excel()
        messagebox.showinfo("Export Result", result)
    except Exception as e:
        messagebox.showerror("Export Failed", str(e))

# --- Supply/Demand Zone Viewer GUI Function ---
zones_data = []  # Global list to store detected zones for display


def initialize_zones_on_start():
    """
    Fetches historical data for the selected index and timeframe,
    then computes and stores supply/demand zones.
    """
    global zones_data

    if kite is None:
        log_message("Cannot initialize zones: KiteConnect not logged in.")
        return

    selected_index = index_var.get() if index_var else ""
    if selected_index not in ("NIFTY 50", "BANKNIFTY"):
        log_message("Cannot initialize zones: no valid index selected.")
        return

    index_token = 256265 if selected_index == "NIFTY 50" else 260105

    # Determine zone timeframe
    zone_tf = None
    try:
        if zone_tf_var is not None:
            zone_tf = zone_tf_var.get()
    except Exception:
        zone_tf = None
    if not zone_tf:
        try:
            tf_key = timeframe_var.get()
            zone_tf = timeframe_map.get(tf_key, None)
        except Exception:
            zone_tf = None
    if not zone_tf:
        zone_tf = "15minute"

    # Fetch full 30 days of data using chunked API calls
    zone_start = get_now_ist() - datetime.timedelta(days=zone_days_var.get())
    zone_end = get_now_ist()
    zone_raw = []
    max_days_per_chunk = 2
    current_start = zone_start

    while current_start < zone_end:
        current_end = min(current_start + datetime.timedelta(days=max_days_per_chunk), zone_end)
        try:
            chunk = kite.historical_data(index_token, current_start, current_end, zone_tf)
            zone_raw.extend(chunk)
        except Exception as e:
            log_message(f"Error fetching zone data from {current_start.date()} to {current_end.date()}: {e}")
        current_start = current_end
        time.sleep(0.5)  # Respect rate limits

    zone_df = pd.DataFrame(zone_raw)
    if zone_df.empty:
        log_message(f"No data fetched for {zone_days_var.get()}-day zone computation for {selected_index}.")
        return

    log_message(f"Fetched {len(zone_df)} candles from {zone_df['date'].min()} to {zone_df['date'].max()}")
    log_message(f"Zone range: {zone_df['date'].min()} to {zone_df['date'].max()} — Total candles: {len(zone_df)}")

    if 'date' in zone_df.columns:
        zone_df['date'] = pd.to_datetime(zone_df['date'])
        zone_df.set_index('date', inplace=True)
    zone_df = zone_df.rename(columns=str.lower)

    zones_data = []

    try:
        det = SupplyDemandDetector(lookback=5, max_blocks=1000, use_atr=True)
        # Pass False to use_internal_zones_var to ensure only swing zones are detected for the viewer.
        det.use_internal_zones_var = False 
        df_for_legacy = zone_df[['high', 'low', 'close', 'open']].copy()
        detected = det.run(df_for_legacy)
        zones_data.extend(detected)
        log_message(f"Initialized {len(detected)} supply/demand zones from last {zone_days_var.get()} days using detector.")
    except Exception as e:
        log_message(f"Zone initialization error using detector: {e}")
      
def view_zones_window():
    """Opens a new window to display detected supply/demand zones in a table."""
    global zones_data
    if not zones_data:
        messagebox.showinfo("No Zones", "No supply/demand zones detected yet. Run the strategy to detect zones.")
        return

    zone_window = tk.Toplevel(root) # Child window of root
    zone_window.title("Supply/Demand Zones")

    # Create a Treeview widget
    tree = ttk.Treeview(zone_window, columns=("Type", "High", "Low", "Time"), show="headings")
    tree.heading("Type", text="Type")
    tree.heading("High", text="High")
    tree.heading("Low", text="Low")
    tree.heading("Time", text="Time")

    # Adjust column widths (optional, but good for readability)
    tree.column("Type", width=100)
    tree.column("High", width=100)
    tree.column("Low", width=100)
    tree.column("Time", width=180)

    # Insert data into the Treeview
    # Deduplicate zone data before rendering
    seen = set()
    unique_zones = []
    for z in zones_data:
        time_str = z["time"].strftime("%Y-%m-%d %H:%M:%S") if isinstance(z["time"], datetime.datetime) else str(z["time"])
        key = (z["type"], round(z["high"], 2), round(z["low"], 2), time_str)
        if key not in seen:
            seen.add(key)
            unique_zones.append(z)
    zones_data = unique_zones        

    for zone in zones_data:
        tree.insert("", tk.END, values=(zone["type"], f"{zone['high']:.2f}", f"{zone['low']:.2f}", zone["time"].strftime("%Y-%m-%d %H:%M:%S")))

    tree.pack(expand=True, fill=tk.BOTH)

    # Add a scrollbar
    scrollbar = ttk.Scrollbar(zone_window, orient="vertical", command=tree.yview)
    tree.configure(yscrollcommand=scrollbar.set)
    scrollbar.pack(side="right", fill="y")

# --- Telegram Bot Commands ---
def start_command(update, context):
    """Telegram command handler to start the strategy."""
    chat_id = update.effective_chat.id
    if str(chat_id) == TELEGRAM_CHAT_ID:
        if not is_running:
            send_telegram_message("Initiating strategy start from Telegram...")
            # Use root.after to schedule GUI updates safely from a separate thread
            root.after(0, start_strategy)
        else:
            send_telegram_message("Strategy is already running.")
    else:
        send_telegram_message(f"Unauthorized access attempt from {chat_id}.")
        log_message(f"Unauthorized /startbot command from {chat_id}")

def stop_command(update, context):
    """Telegram command handler to stop the strategy."""
    chat_id = update.effective_chat.id
    if str(chat_id) == TELEGRAM_CHAT_ID:
        if is_running:
            send_telegram_message("Initiating strategy stop from Telegram...")
            # Use root.after to schedule GUI updates safely from a separate thread
            root.after(0, stop_strategy)
        else:
            send_telegram_message("Strategy is not running.")
    else:
        send_telegram_message(f"Unauthorized access attempt from {chat_id}.")
        log_message(f"Unauthorized /stopbot command from {chat_id}")

def pnl_command(update, context):
    """Telegram command handler to display P&L summary."""
    chat_id = update.effective_chat.id
    if str(chat_id) == TELEGRAM_CHAT_ID:
        summary = get_daily_weekly_monthly_summary()
        msg_text = (
            f"📊 P&L Summary\n"
            f"• Daily: ₹{summary['daily']:.2f}\n"
            f"• Weekly: ₹{summary['weekly']:.2f}\n"
            f"• Monthly: ₹{summary['monthly']:.2f}"
        )
        context.bot.send_message(chat_id=chat_id, text=msg_text)
        try:
            # Pass kite and bot_positions to get_portfolio_unrealized
            unrealized = get_portfolio_unrealized(kite, bot_positions)
            context.bot.send_message(chat_id=chat_id, text=f"• Unrealized (open): ₹{unrealized:.2f}")
        except Exception as e:
            context.bot.send_message(chat_id=chat_id, text=f"Error fetching unrealized P&L: {e}")
    else:
        context.bot.send_message(chat_id=chat_id, text="Unauthorized access.")

def run_telegram_bot_polling():
    """Starts the Telegram bot polling in a separate thread."""
    global telegram_updater
    if TELEGRAM_BOT_TOKEN == "YOUR_BOT_TOKEN" or TELEGRAM_CHAT_ID == "YOUR_CHAT_ID":
        log_message("Telegram bot token or chat ID not configured. Telegram control will not work.")
        return
    try:
        telegram_updater = Updater(TELEGRAM_BOT_TOKEN, use_context=True) # use_context=True is required for newer versions
        dispatcher = telegram_updater.dispatcher
        dispatcher.add_handler(CommandHandler("startbot", start_command, filters.Chat(chat_id=int(TELEGRAM_CHAT_ID))))
        dispatcher.add_handler(CommandHandler("stopbot", stop_command, filters.Chat(chat_id=int(TELEGRAM_CHAT_ID))))
        dispatcher.add_handler(CommandHandler("pnl", pnl_command, filters.Chat(chat_id=int(TELEGRAM_CHAT_ID))))
        log_message("Starting Telegram bot polling...")
        telegram_updater.start_polling()
        log_message("Telegram bot polling started.")
    except Exception as e:
        log_message(f"Error starting Telegram bot: {e}. Make sure the bot token is correct and there's no conflict with another instance.")
        send_telegram_message(f"🚨 Error starting Telegram bot: {e}")

# --- Strategy Scheduling & Control ---
def schedule_entry_checks():
    """Schedules the next execution of the entry logic."""
    global is_running
    if not is_running:
        return
    try:
        # Run entry logic in a separate thread to avoid freezing GUI
        threading.Thread(target=run_entry_logic, daemon=True).start()
        # Schedule next entry check in exactly 3 minutes (180,000 milliseconds)
        root.after(180000, schedule_entry_checks)
        # Update next run display - note this will be approximate as entry logic runs in thread
        next_entry_time = get_now_ist() + datetime.timedelta(minutes=3)
        next_exit_time = get_now_ist() + datetime.timedelta(minutes=1) # Exit check is every 1 min
        next_run_var.set(f"Next entry check scheduled: {next_entry_time.strftime('%H:%M:%S')} | Next exit check scheduled: {next_exit_time.strftime('%H:%M:%S')}")
    except Exception as e:
        log_message(f"Error in entry scheduling: {e}")
        # Retry after 30 seconds if error occurs
        root.after(30000, schedule_entry_checks)

def schedule_exit_checks():
    """Schedules the next execution of the exit logic."""
    global is_running
    if not is_running:
        return
    try:
        # Run exit logic directly as it's typically faster and less resource-intensive
        run_exit_logic_only()
        # Schedule next exit check in exactly 1 minute (60,000 milliseconds)
        root.after(60000, schedule_exit_checks)
        # Update next run display
        next_entry_time = get_now_ist() + datetime.timedelta(minutes=3) # Entry check is every 3 mins
        next_exit_time = get_now_ist() + datetime.timedelta(minutes=1)
        next_run_var.set(f"Next entry check scheduled: {next_entry_time.strftime('%H:%M:%S')} | Next exit check scheduled: {next_exit_time.strftime('%H:%M:%S')}")
    except Exception as e:
        log_message(f"Error in exit scheduling: {e}")
        # Retry after 30 seconds if error occurs
        root.after(30000, schedule_exit_checks)

def schedule_eod_pnl_report():
    """Schedules the End-Of-Day P&L report for Telegram."""
    now = get_now_ist()
    target_time = now.replace(hour=15, minute=30, second=0, microsecond=0) # 3:30 PM IST
    
    # If target time is in the past for today, schedule for tomorrow
    if now >= target_time:
        target_time += datetime.timedelta(days=1)
    
    delay_ms = max(0, int((target_time - now).total_seconds() * 1000))
    log_message(f"EOD PnL report scheduled for {target_time.strftime('%Y-%m-%d %H:%M:%S')}")
    root.after(delay_ms, lambda: schedule_eod_pnl_telegram(kite, bot_positions, send_telegram_message))

def strategy_heartbeat():
    """Monitors if strategy checks are getting stuck and restarts them if necessary."""
    global last_entry_check_timestamp, last_exit_check_timestamp
    if is_running:
        now = get_now_ist()

        # Check if entry checks are running (e.g., last update within 4 minutes)
        if last_entry_check_timestamp and (now - last_entry_check_timestamp).total_seconds() > (3 * 60 + 30): # 3 minutes + 30 sec buffer
            log_message("⚠️ Entry checks appear stuck - restarting entry thread.")
            send_telegram_message("⚠️ Entry checks appear stuck - restarting.")
            threading.Thread(target=run_entry_logic, daemon=True).start()

        # Check if exit checks are running (e.g., last update within 2 minutes)
        if last_exit_check_timestamp and (now - last_exit_check_timestamp).total_seconds() > (1 * 60 + 30): # 1 minute + 30 sec buffer
            log_message("⚠️ Exit checks appear stuck - restarting exit logic.")
            send_telegram_message("⚠️ Exit checks appear stuck - restarting.")
            run_exit_logic_only() # Call directly as it's designed to be quick

        root.after(30000, strategy_heartbeat)  # Check every 30 seconds

def start_strategy():
    """Initializes and starts the trading strategy."""
    global is_running, current_position_instrument_token, last_entry_check_timestamp, last_exit_check_timestamp, active_sl_order_id, trade_entry_price, highest_price_seen, bot_positions
    global consolidation_start_time, consolidation_ce_symbol, consolidation_pe_symbol, consolidation_ce_initial_ltp, consolidation_pe_initial_ltp
    global last_ema_cross_time, last_ema_cross_type, position_cooldowns, zones_data # Reset zones_data too

    if not kite:
        messagebox.showwarning("Login Required", "Please log in to KiteConnect first.")
        log_message("Attempt to start strategy failed: KiteConnect not logged in.")
        return

    if not is_running:
        is_running = True
        # Reset all relevant global state variables at strategy start
        current_position_instrument_token = None
        active_sl_order_id = None
        trade_entry_price = None
        highest_price_seen = None
        last_entry_check_timestamp = None
        last_exit_check_timestamp = None
        bot_positions = {}
        position_cooldowns = {}
        consolidation_start_time = None
        consolidation_ce_symbol = None
        consolidation_pe_symbol = None
        consolidation_ce_initial_ltp = None
        consolidation_pe_initial_ltp = None
        zones_data = [] # Clear detected zones on strategy start
        ce_decay_var.set(f"CE Decay: --")
        pe_decay_var.set(f"PE Decay: --")
        last_ema_cross_time = None # Still reset, though no longer used for filtering
        last_ema_cross_type = None # Still reset, though no longer used for filtering
        
        confirmation_var.set("Confirmation: --")

      
        try:
            initialize_zones_on_start()
        except Exception as e:
            log_message(f"Error initializing zones at strategy start: {e}")

        log_message("Strategy started. Entry checks every 3min, exit checks every 1min.")
        send_telegram_message("🟢 Strategy started (3min entry/1min exit checks)")
        schedule_eod_pnl_report() # Schedule EOD report
        schedule_entry_checks() # Start entry checks
        schedule_exit_checks() # Start exit checks
        strategy_heartbeat() # Start heartbeat monitor
        run_btn.config(state=tk.DISABLED)
        stop_btn.config(state=tk.NORMAL)
    else:
        log_message("Strategy is already running.")
        send_telegram_message("⚠️ Strategy start requested, but it's already running.")

def stop_strategy():
    """Stops the trading strategy and cleans up resources."""
    global is_running, telegram_updater
    if is_running:
        is_running = False
        log_message("Strategy stopping...")
        send_telegram_message("🛑 Strategy stop requested")
        # Cancel any pending 'after' calls from Tkinter's event loop
        for after_id in root.tk.eval('after info').split():
            try:
                root.after_cancel(after_id)
            except Exception as e:
                # This can happen if an after_id is already cancelled or invalid
                log_message(f"Error cancelling Tkinter after_id {after_id}: {e}")

        # Stop Telegram bot polling if it's running
        if telegram_updater and telegram_updater.running:
            log_message("Stopping Telegram bot polling...")
            telegram_updater.stop()
            telegram_updater.join() # Wait for the updater thread to finish
            log_message("Telegram bot polling stopped.")

        run_btn.config(state=tk.NORMAL)
        stop_btn.config(state=tk.DISABLED)
        log_message("Strategy fully stopped.")
        send_telegram_message("✅ Strategy fully stopped.")
    else:
        log_message("Strategy is not running.")

# --- Main GUI Setup ---
if __name__ == "__main__":
    root = tk.Tk()
    root.title("RSI NIFTY Option Algo")
    root.geometry("1200x850") # Adjust size as needed

    
    # --- Modified for Tabbed Interface ---
    notebook = ttk.Notebook(root)
    notebook.pack(expand=True, fill="both")

    # Create main_frame and status_log_frame
    main_frame = tk.Frame(notebook)
    status_log_frame = tk.Frame(notebook)

    # Add both frames to notebook
    notebook.add(main_frame, text="Strategy Dashboard")
    notebook.add(status_log_frame, text="Status & Logs")

    # Update `frame = tk.Frame(root, ...)` to use `main_frame`
    frame = main_frame
    
    frame.grid_columnconfigure(0, weight=1)
    frame.grid_columnconfigure(1, weight=1)

    creds = load_credentials()

    # Credentials Frame
    cred_frame = tk.LabelFrame(frame, text="KiteConnect Credentials", padx=10, pady=10)
    cred_frame.grid(row=0, column=0, columnspan=2, pady=10, sticky="ew")
    tk.Label(cred_frame, text="API Key:").grid(row=0, column=0, sticky='e', padx=5, pady=2)
    api_key_entry = tk.Entry(cred_frame, width=40)
    api_key_entry.insert(0, creds.get("api_key", ""))
    api_key_entry.grid(row=0, column=1, pady=2, padx=5)
    tk.Label(cred_frame, text="API Secret:").grid(row=1, column=0, sticky='e', padx=5, pady=2)
    api_secret_entry = tk.Entry(cred_frame, width=40)
    api_secret_entry.insert(0, creds.get("api_secret", ""))
    api_secret_entry.grid(row=1, column=1, pady=2, padx=5)
    tk.Label(cred_frame, text="Request Token:").grid(row=2, column=0, sticky='e', padx=5, pady=2)
    request_token_entry = tk.Entry(cred_frame, width=40)
    request_token_entry.insert(0, creds.get("request_token", ""))
    request_token_entry.grid(row=2, column=1, pady=2, padx=5)
    login_btn = tk.Button(cred_frame, text="Login", command=login)
    login_btn.grid(row=3, column=1, pady=5, sticky='e')
    open_url_btn = tk.Button(cred_frame, text="Get Request Token URL", command=open_login_url)
    open_url_btn.grid(row=3, column=0, pady=5, sticky='w')

    # Parameters Frame
    param_frame = tk.LabelFrame(frame, text="Strategy Parameters", padx=10, pady=10)
    param_frame.grid(row=1, column=0, pady=10, sticky="nsew") # Adjusted grid placement

    # Timeframe Selection
    tk.Label(param_frame, text="Timeframe:").grid(row=0, column=0, sticky='e', padx=5, pady=2)
    timeframe_var = tk.StringVar()
    timeframe_dropdown = tk.OptionMenu(param_frame, timeframe_var, "1min", "3min", "5min", "15min", "45min")
    timeframe_dropdown.config(width=8)
    timeframe_dropdown.grid(row=0, column=1, sticky='w', padx=5, pady=2)
    timeframe_var.set("3min") # Default to 3 minute as it was used in run_entry_logic

    # Index Selection
    tk.Label(param_frame, text="Index:").grid(row=1, column=0, sticky='e', padx=5, pady=2)
    index_var = tk.StringVar()
    index_menu = tk.OptionMenu(param_frame, index_var, "NIFTY 50", "BANKNIFTY")
    index_menu.grid(row=1, column=1, sticky='w', padx=5, pady=2)
    index_var.set("NIFTY 50")

    # Order Type
    amo_var = tk.BooleanVar()
    tk.Checkbutton(param_frame, text="Use AMO Order", variable=amo_var).grid(row=2, column=0, columnspan=2, sticky='w', pady=5)

    # Quantity
    tk.Label(param_frame, text="Quantity (Lots):").grid(row=3, column=0, sticky='e', padx=5, pady=2)
    qty_entry = tk.Entry(param_frame, width=10)
    qty_entry.insert(0, "1") # Default 1 lot
    qty_entry.grid(row=3, column=1, sticky='w', padx=5, pady=2)

    # Zone Lookback (days) for 15m swing zones
    tk.Label(param_frame, text="Zone Lookback (days):").grid(row=8, column=0, sticky='e', padx=5, pady=2)
    zone_days_var = tk.IntVar(value=30)
    zone_days_menu = ttk.Combobox(param_frame, values=[5,10,15,20,25,30], textvariable=zone_days_var, width=10, state="readonly")
    zone_days_menu.grid(row=8, column=1, sticky='w', padx=5, pady=2)
    zone_days_menu.set(30)
    
    # Initial SL %
    tk.Label(param_frame, text="Initial SL %:").grid(row=4, column=0, sticky='e', padx=5, pady=2)
    sl_entry = tk.Entry(param_frame, width=10)
    sl_entry.insert(0, "0.5") # Default 0.5% SL
    sl_entry.grid(row=4, column=1, sticky='w', padx=5, pady=2)

    # Trailing SL Step %
    tk.Label(param_frame, text="Trailing SL Step %:").grid(row=5, column=0, sticky='e', padx=5, pady=2)
    trailing_sl_entry = tk.Entry(param_frame, width=10)
    trailing_sl_entry.insert(0, "0.1") # Default 0.1% step
    trailing_sl_entry.grid(row=5, column=1, sticky='w', padx=5, pady=2)

    # Target Points
    tk.Label(param_frame, text="Target Points:").grid(row=6, column=0, sticky='e', padx=5, pady=2)
    target_points_entry = tk.Entry(param_frame, width=10)
    target_points_entry.insert(0, "20") # Default 20 points target
    target_points_entry.grid(row=6, column=1, sticky='w', padx=5, pady=2)

    # Re-entry Cooldown (minutes)
    tk.Label(param_frame, text="Re-entry Cooldown (min):").grid(row=7, column=0, sticky='e', padx=5, pady=2)
    reentry_entry = tk.Entry(param_frame, width=10)
    reentry_entry.insert(0, "15") # Default 15 minutes cooldown
    reentry_entry.grid(row=7, column=1, sticky='w', padx=5, pady=2)

 

    # Strategy Control Frame
    control_frame = tk.LabelFrame(frame, text="Strategy Control", padx=10, pady=10)
    control_frame.grid(row=2, column=0, columnspan=2, pady=10, sticky="ew")

    run_btn = tk.Button(control_frame, text="Start Strategy", command=start_strategy, font=("Helvetica", 12), bg="green", fg="white", width=15)
    run_btn.pack(side=tk.LEFT, padx=10)
    stop_btn = tk.Button(control_frame, text="Stop Strategy", command=stop_strategy, font=("Helvetica", 12), bg="red", fg="white", width=15, state=tk.DISABLED)
    stop_btn.pack(side=tk.LEFT, padx=10)

    # Next Run Info
    next_run_var = tk.StringVar(value="Next entry: --:--:-- | Next exit: --:--:--")
    tk.Label(control_frame, textvariable=next_run_var, font=("Helvetica", 10)).pack(side=tk.LEFT, padx=10)


    # Status/Output Frame
    status_frame = tk.LabelFrame(status_log_frame, text="Real-time Status and Logs", padx=10, pady=10)
    status_frame.grid(row=3, column=0, columnspan=2, pady=10, sticky="nsew")
    status_frame.grid_rowconfigure(0, weight=1)
    status_frame.grid_columnconfigure(0, weight=1)

 
    # Confirmation Status (Adjusted row numbers due to EMA removal)
    confirmation_var = tk.StringVar(value="Confirmation: --")
    tk.Label(status_frame, textvariable=confirmation_var, font=("Helvetica", 10)).grid(row=0, column=0, sticky="w", padx=5, pady=2) # Changed from row=2 to row=0

    # Premium Decay Status (Adjusted row numbers due to consolidation removal)
    ce_decay_var = tk.StringVar(value="CE Decay: --")
    tk.Label(status_frame, textvariable=ce_decay_var, font=("Helvetica", 10)).grid(row=1, column=0, sticky="w", padx=5, pady=2) # Changed from row=3 to row=1
    pe_decay_var = tk.StringVar(value="PE Decay: --")
    tk.Label(status_frame, textvariable=pe_decay_var, font=("Helvetica", 10)).grid(row=2, column=0, sticky="w", padx=5, pady=2) # Changed from row=4 to row=2



    # Log Text Area (Adjusted row number due to EMA removal)
    log_text = tk.Text(status_frame, height=40,width=100, state='disabled', wrap='word', font=("Arial", 12),bg='white', fg='black')
    log_text.grid(row=3, column=0, columnspan=2, sticky="nsew", padx=10, pady=10) # Changed from row=5 to row=3
    log_scrollbar = tk.Scrollbar(status_frame, command=log_text.yview)
    log_scrollbar.grid(row=3, column=2, sticky='ns') # Changed from row=5 to row=3
    log_text.config(yscrollcommand=log_scrollbar.set)

    # P&L and Export Buttons (Moved from original snippet for better organization)
    pnl_btn = tk.Button(control_frame, text="Show P&L", command=show_pnl_popup, font=("Helvetica", 12), bg="blue", fg="white", width=15)
    pnl_btn.pack(side=tk.LEFT, padx=10)
    export_btn = tk.Button(control_frame, text="Export to Excel", command=export_excel_popup, font=("Helvetica", 12), bg="purple", fg="white", width=15)
    export_btn.pack(side=tk.LEFT, padx=10)

    # --- Supply/Demand Zone Viewer GUI Elements ---
    # Moved from random place in original code to here, after frame is defined.
    # Note: `view_zones_window` is now defined above where it's used.
    zone_tf_var = tk.StringVar(value="15minute") # This was a global variable in the original code
    zone_frame = tk.LabelFrame(frame, text="Supply/Demand Zones", padx=10, pady=10)
    use_internal_zones_var = tk.BooleanVar(value=False) # THIS IS THE GUI VARIABLE
    tk.Checkbutton(zone_frame, text="Use Internal Zones", variable=use_internal_zones_var).grid(row=2, column=0, sticky='w')

    # === Reversal confirmation controls (added) ===
    use_reversal_filter_var = tk.BooleanVar(value=True)
    require_break_var = tk.BooleanVar(value=True)
    use_volume_kick_var = tk.BooleanVar(value=False)

    # Multiplier for volume kick (compared to median futures volume)
    vol_kick_multiplier_var = tk.DoubleVar(value=1.2)
    tk.Checkbutton(zone_frame, text="Require Reversal at Zone", variable=use_reversal_filter_var).grid(row=3, column=0, sticky='w')
    tk.Checkbutton(zone_frame, text="Require Break of Reversal Candle", variable=require_break_var).grid(row=4, column=0, sticky='w')
    tk.Checkbutton(zone_frame, text="Use Volume Kick (multiplier × median)", variable=use_volume_kick_var).grid(row=5, column=0, sticky='w')
    # GUI control for volume kick multiplier
    tk.Label(zone_frame, text="Vol Kick Multiplier").grid(row=6, column=0, sticky="w", padx=5, pady=2)
    tk.Spinbox(zone_frame, from_=1.0, to=5.0, increment=0.05, textvariable=vol_kick_multiplier_var, width=8).grid(row=6, column=1, sticky="w", padx=5, pady=2)
    zone_frame.grid(row=1, column=1, pady=10, sticky="nsew") # Placed next to params frame
    tk.Label(zone_frame, text="Zone Timeframe").grid(row=0, column=0, sticky="w", padx=5, pady=2) # Changed row to 0
    zone_tf_menu = tk.OptionMenu(zone_frame, zone_tf_var, "3minute", "5minute", "15minute", "45minute")
    zone_tf_menu.grid(row=0, column=1, sticky="ew", padx=5, pady=2)
    tk.Button(zone_frame, text="View Zones", command=view_zones_window).grid(row=1, column=0, columnspan=2, pady=5) # Changed row to 1

    # Start Telegram bot polling in a separate daemon thread so it doesn't block GUI
    telegram_thread = threading.Thread(target=run_telegram_bot_polling, daemon=True)
    telegram_thread.start()

    root.mainloop() # Start the Tkinter event loop

# NOTE: The original file had a patched show_pnl_popup function outside __main__ block.
# Keeping it here for consistency if other parts of the system rely on it being external.
def show_pnl_popup():
    """Patched show_pnl_popup for safe and numeric output."""
    try:
        out = get_daily_weekly_monthly_summary()
        if isinstance(out, dict):
            daily = out.get("daily", 0.0)
            weekly = out.get("weekly", 0.0)
            monthly = out.get("monthly", 0.0)
        else:
            # tuple/list fallback if get_daily_weekly_monthly_summary returned non-dict (older version)
            daily, weekly, monthly, *rest = out
    except Exception as e:
        try:
            log_message(f"[PnL] popup summary error: {e}")
        except Exception:
            print(f"[PnL] popup summary error: {e}")
        daily = weekly = monthly = 0.0

    # Ensure formatting to 2 decimals for neat UI
    try:
        daily_s = f"{float(daily):.2f}"
        weekly_s = f"{float(weekly):.2f}"
        monthly_s = f"{float(monthly):.2f}"
    except Exception:
        daily_s, weekly_s, monthly_s = str(daily), str(weekly), str(monthly)

    try:
        from tkinter import messagebox
        messagebox.showinfo(
            "P&L Summary",
            f"Daily P&L: ₹{daily_s}\nWeekly P&L: ₹{weekly_s}\nMonthly P&L: ₹{monthly_s}"
        )
    except Exception as e:
        # Fallback to console if GUI messagebox fails
        try:
            log_message(f"[PnL] Could not show popup: {e}")
        except Exception:
            print(f"[PnL] Could not show popup: {e}")
        print(f"Daily P&L: ₹{daily_s}\nWeekly P&L: ₹{weekly_s}\nMonthly P&L: ₹{monthly_s}")
