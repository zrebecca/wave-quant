import os

# API credentials — read from environment variables, never hardcode secrets here.
# Set them in your shell (or source a local .env that is gitignored), e.g.:
#   export OKX_API_KEY=...  OKX_API_SECRET=...  OKX_API_PASSPHRASE=...
# These reuse the same names as the backend, so backend/.env works as a single source.
API_KEY = os.getenv("OKX_API_KEY", "")
API_KEY_SECRET = os.getenv("OKX_API_SECRET", "")
API_PASSPHRASE = os.getenv("OKX_API_PASSPHRASE", "")
IS_PAPER_TRADING = True

# market-making instrument
TRADING_INSTRUMENT_ID = "BTC-USDT"
TRADING_MODE = "cash"  # "cash" / "isolated" / "cross"

# default latency tolerance level
ORDER_BOOK_DELAYED_SEC = 60  # Warning if OrderBook not updated for these seconds, potential issues from wss connection
ACCOUNT_DELAYED_SEC = 60  # Warning if Account not updated for these seconds, potential issues from wss connection

# risk-free ccy
RISK_FREE_CCY_LIST = ["USDT", "USDC", "DAI"]

# params yaml path
PARAMS_PATH = os.path.abspath(os.path.dirname(__file__) + "/params.yaml")
