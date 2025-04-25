from flask import Flask, request, render_template, jsonify
import os
from typing import Tuple
import pandas as pd
import numpy as np
from numpy.typing import NDArray

app = Flask(__name__)


def load_stock_data_from_file(file_obj, max_days: int = 365) -> Tuple[NDArray[np.float64], NDArray[np.float64]]:
    """
    Reads a CSV file-like object, extracts closing prices and volumes, and
    returns the last max_days entries.

    Args:
        file_obj (file-like): A file-like object containing the CSV data.
        max_days (int): Maximum number of days to return from the end.

    Returns:
        Tuple (NDArray[np.float64], NDArray[np.float64]): A tuple containing:
            - closing prices array of length up to max_days.
            - volume array of length up to max_days.

    Raises:
        RuntimeError: If an error occurs reading the CSV.
        ValueError: If required columns are missing or no valid data found.
    """
    try:
        df = pd.read_csv(
            file_obj,
            names=["Date", "Open", "High", "Low", "Close", "Volume"],
        )
    except Exception as e:
        raise RuntimeError(f"Error reading CSV: {e}")

    if "Close" not in df.columns or "Volume" not in df.columns:
        raise ValueError("CSV file must contain 'Close' and 'Volume' columns.")

    closing = df["Close"].dropna().values[-max_days:]
    volume = df["Volume"].dropna().values[-max_days:]
    if closing.size == 0:
        raise ValueError("No valid closing price data found.")

    return (
        np.array(closing, dtype=np.float64),
        np.array(volume, dtype=np.float64),
    )


def compute_standard_deviation(prices: NDArray[np.float64]) -> float:
    """
    Computes standard deviation of prices as a percentage of the mean price.

    Args:
        prices (NDArray[np.float64]): Array of closing prices.

    Returns:
        float: Standard deviation expressed in percent of mean.
    """
    mean_price = np.mean(prices)
    std_dev = np.std(prices)
    return float((std_dev / mean_price) * 100)

def detect_large_changes(prices: NDArray[np.float64], delta_percent: float = 10.0) -> int:
    """
    Counts days where absolute daily change exceeds a given percentage.

    Args:
        prices (NDArray[np.float64]): Array of closing prices.
        delta_percent (float): Threshold percent change to count.

    Returns:
        int: Number of days with large changes.
    """
    changes = np.abs(np.diff(prices)) / prices[:-1] * 100
    return int((changes > delta_percent).sum())

def compute_avg_daily_return(prices: NDArray[np.float64]) -> float:
    """
    Computes the average daily return as a percentage.

    Args:
        prices (NDArray[np.float64]): Array of closing prices.

    Returns:
        float: Average daily return in percent.
    """
    rets = np.diff(prices) / prices[:-1]
    return float(np.mean(rets) * 100)

def compute_annualized_volatility(prices: NDArray[np.float64]) -> float:
    """
    Computes the annualized volatility (standard deviation) of daily returns.

    Args:
        prices (NDArray[np.float64]): Array of closing prices.

    Returns:
        float: Annualized volatility in percent.
    """
    rets = np.diff(prices) / prices[:-1]
    vol_daily = np.std(rets)
    return float(vol_daily * np.sqrt(252) * 100)

def compute_sharpe_ratio(prices: NDArray[np.float64]) -> float:
    """
    Computes a Sharpe-like ratio (risk-adjusted return) assuming zero risk-free rate.

    Args:
        prices (NDArray[np.float64]): Array of closing prices.

    Returns:
        float: Sharpe ratio.
    """
    rets = np.diff(prices) / prices[:-1]
    return float((np.mean(rets) / np.std(rets)) * np.sqrt(252))

def compute_max_drawdown(prices: NDArray[np.float64]) -> float:
    """
    Calculates the maximum drawdown (peak-to-trough decline) in percent.

    Args:
        prices (NDArray[np.float64]): Array of closing prices.

    Returns:
        float: Maximum drawdown in percent.
    """
    rets = np.diff(prices) / prices[:-1]
    cum = np.cumprod(1 + rets) - 1
    peak = np.maximum.accumulate(cum)
    drawdowns = peak - cum
    return float(np.max(drawdowns) * 100)

def compute_percent_positive_days(prices: NDArray[np.float64]) -> float:
    """
    Calculates the percentage of days with positive returns.

    Args:
        prices (NDArray[np.float64]): Array of closing prices.

    Returns:
        float: Percent of days with positive returns.
    """
    rets = np.diff(prices) / prices[:-1]
    return float((rets > 0).mean() * 100)

def compute_moving_average(prices: NDArray[np.float64], window: int = 20) -> float:
    """
    Computes a simple moving average of the closing prices.

    Args:
        prices (NDArray[np.float64]): Array of closing prices.
        window (int): Number of days for the moving average.

    Returns:
        float: Last value of the moving average.
    """
    return float(pd.Series(prices).rolling(window).mean().iloc[-1])

def compute_bollinger_pctB(prices: NDArray[np.float64], window: int = 20, n_std: int = 2) -> float:
    """
    Calculates the Bollinger %B indicator for the last price.

    Args:
        prices (NDArray[np.float64]): Array of closing prices.
        window (int): Number of days for the moving average and std.
        n_std (int): Number of standard deviations for the bands.

    Returns:
        float: Bollinger %B for the latest price.
    """
    s = pd.Series(prices)
    mid = s.rolling(window).mean()
    sd = s.rolling(window).std()
    upper = mid + n_std * sd
    lower = mid - n_std * sd
    return float((prices[-1] - lower.iloc[-1]) / (upper.iloc[-1] - lower.iloc[-1]))

def compute_rsi(prices: NDArray[np.float64], window: int = 14) -> float:
    """
    Computes the Relative Strength Index (RSI) for the last price.

    Args:
        prices (NDArray[np.float64]): Array of closing prices.
        window (int): Number of days for RSI calculation.

    Returns:
        float: RSI value for the latest price.
    """
    s = pd.Series(prices)
    delta = s.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / window).mean()
    loss = -delta.clip(upper=0).ewm(alpha=1 / window).mean()
    rs = gain / loss
    rsi = 100 - (100 / (1 + rs))
    return float(rsi.iloc[-1])

def compute_volume_spikes(volumes: NDArray[np.float64], threshold: float = 2.0) -> int:
    """
    Counts days where trading volume exceeds a threshold times the average.

    Args:
        volumes (NDArray[np.float64]): Array of daily volume values.
        threshold (float): Multiplier of average volume for a spike.

    Returns:
        int: Number of volume spike days.
    """
    avg_vol = volumes.mean()
    return int((volumes > threshold * avg_vol).sum())


@app.route("/", methods=["GET", "POST"])
def index():
    """
    Renders the upload form on GET and processes files on POST.

    On POST, reads each CSV, computes metrics, and returns JSON results.
    On GET, renders the upload form with any previous results.
    """
    if request.method == "POST":
        files = request.files.getlist("files")
        if not files or all(f.filename == "" for f in files):
            return jsonify({"error": "No files selected."}), 400

        results = []
        for file in files:
            try:
                prices, volumes = load_stock_data_from_file(file.stream)
                std_dev = compute_standard_deviation(prices)
                large_changes = detect_large_changes(prices)
                avg_daily = compute_avg_daily_return(prices)
                annual_vol = compute_annualized_volatility(prices)
                sharpe = compute_sharpe_ratio(prices)
                max_dd = compute_max_drawdown(prices)
                pos_days = compute_percent_positive_days(prices)
                moving_avg = compute_moving_average(prices)
                bollinger_pctB = compute_bollinger_pctB(prices)
                rsi = compute_rsi(prices)
                vol_spikes = compute_volume_spikes(volumes)

                stock_symbol = os.path.splitext(os.path.basename(file.filename))[0]
                chart_link = f"https://www.wsj.com/market-data/quotes/{stock_symbol.upper()}"
                results.append({
                    "file_name": stock_symbol.upper(),
                    "chart_link": chart_link,
                    "std_dev": f"{std_dev:.2f}%",
                    "large_changes": large_changes,
                    "avg_daily_return": f"{avg_daily:.2f}%",
                    "annual_volatility": f"{annual_vol:.2f}%",
                    "sharpe_ratio": f"{sharpe:.2f}",
                    "max_drawdown": f"{max_dd:.2f}%",
                    "positive_days": f"{pos_days:.2f}%",
                    "moving_average": f"{moving_avg:.2f}",
                    "bollinger_pctB": f"{bollinger_pctB:.2f}",
                    "rsi": f"{rsi:.2f}",
                    "volume_spikes": vol_spikes,
                })
            except Exception as e:
                results.append({
                    "file_name": file.filename,
                    "chart_link": "N/A",
                    "std_dev": "Error",
                    "large_changes": "Error",
                    "avg_daily_return": "Error",
                    "annual_volatility": "Error",
                    "sharpe_ratio": "Error",
                    "max_drawdown": "Error",
                    "positive_days": "Error",
                    "moving_average": "Error",
                    "bollinger_pctB": "Error",
                    "rsi": "Error",
                    "volume_spikes": "Error",
                    "error": str(e)
                })
        if request.headers.get("X-Requested-With") == "XMLHttpRequest":
            return jsonify(results=results)
        return render_template("index.html", results=results)

    return render_template("index.html")


if __name__ == "__main__":
    app.run(debug=True)
