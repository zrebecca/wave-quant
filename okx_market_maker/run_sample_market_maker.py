import os
from urllib.parse import urlparse

"""
def _install_ws_proxy():
    #第一步:读代理地址 全兼容
    proxy_url = (os.environ.get("https_proxy") or os.environ.get("HTTPS_PROXY")
                 or os.environ.get("http_proxy") or os.environ.get("HTTP_PROXY"))
    #在不需要代理的机器上,这个函数自动跳过,不会捣乱
    if not proxy_url:
        return

    #拆完后 parsed.hostname = "127.0.0.1",parsed.port = 7897。
    parsed = urlparse(proxy_url)
    #防御性检查:万一代理地址格式不对、拆不出主机名或端口,也直接 return 退出,避免后面用到坏数据
    if not parsed.hostname or not parsed.port:
        return

    #第二步:给"建连接工厂"打补丁(走代理)
    #导入 OKX SDK 里负责建 WebSocket 连接的模块。as wcf_mod 是给它起个短名字方便引用。
    from okx.websocket import WsClientFactory as wcf_mod

    #__init__ 是这个工厂类的初始化方法(每次 new 一个连接对象时自动调用的那个)。
    #这行把原版初始化方法备份到 orig_init。注意:这里只是把函数当成值存起来,没有调用它(没有加括号)。
    orig_init = wcf_mod.WsClientFactory.__init__

    #定义我的新版初始化方法
    #self 是对象自己。*args 接住所有"位置参数",**kwargs 接住所有"关键字参数"(就是 名字=值 形式的)。
    #这两个写法能原样接收任意参数,不管原版要几个参数都能兜住
    def patched_init(self, *args, **kwargs):
        #这是关键一行。kwargs 是个字典。.setdefault("proxy", {...}) 意思是:如果还没有 proxy 这个参数,就给它设上(已经有就不动)
        #设的值是 {"host": "127.0.0.1", "port": 7897} —— 也就是把代理地址塞进去。
        #效果:每次建连接,都自动带上代理参数。
        kwargs.setdefault("proxy", {"host": parsed.hostname, "port": parsed.port})
        
        #塞完代理后,调用原版初始化方法,把(加了 proxy 的)参数原样传给它。
        #这样既保留了原版全部功能,又多塞了一个 proxy。
        orig_init(self, *args, **kwargs)

    #偷换:把工厂类的 __init__ 指向我的新版 patched_init。
    #从这行之后,OKX 每次新建连接,跑的都是我的版本 → 自动走代理。这就是 monkeypatch。
    wcf_mod.WsClientFactory.__init__ = patched_init

    #第三步:给"加密握手"打补丁(报 SNI)
    #导入两个东西:Twisted 的 SSL 工具(起名 twisted_ssl)、autobahn 里管 WebSocket 协议的类。
    from twisted.internet import ssl as twisted_ssl
    from autobahn.twisted.websocket import WebSocketClientProtocol

    #定义我的新版"加密握手"方法。
    #self.factory.host 是要连的真实域名,比如 "ws.okx.com"。
    #twisted_ssl.optionsForClientTLS("ws.okx.com") 生成一个带门牌号(SNI)的 TLS 配置——这个函数天生就会把域名当 SNI 发出去。
    #self.transport.startTLS(...) 用这个配置真正开始加密握手。
    def start_tls_with_sni(self):
        self.transport.startTLS(twisted_ssl.optionsForClientTLS(self.factory.host))

    #又一次偷换:把 autobahn 的 startTLS 方法指向我的新版。从此所有加密握手都会报门牌号
    WebSocketClientProtocol.startTLS = start_tls_with_sni

    #作用:运行时你在日志里看到这行,就知道补丁确实生效了——这就是给你看的"证据"
    print(f"Routing OKX websockets through proxy {parsed.hostname}:{parsed.port}")
"""

"""Route the OKX SDK's Twisted/autobahn websockets through the local HTTP proxy.

The OKX python SDK uses Twisted for its websocket connections, which causes two
problems on networks where OKX is only reachable via a local proxy (e.g. Clash on
127.0.0.1:7897):

1. Twisted does not honour the http_proxy/https_proxy environment variables, so it
    connects directly, the connection is reset, and no market data ever arrives.
    We read the proxy from the environment and inject it into the websocket client
    factory so the connections tunnel through the proxy like the REST calls do.

2. When tunnelling a "wss" connection through an HTTP proxy, autobahn's startTLS
    uses a default context that sends no SNI (server name). OKX's edge closes such
    TLS connections cleanly. We patch startTLS to use an SNI-aware client context.
"""

def _install_ws_proxy():

    proxy_url = (os.environ.get("https_proxy") or os.environ.get("HTTPS_PROXY")
                 or os.environ.get("http_proxy") or os.environ.get("HTTP_PROXY"))
    if not proxy_url:
        return

    parsed = urlparse(proxy_url)

    if not parsed.hostname or not parsed.port:
        return

    from okx.websocket import WsClientFactory as wcf_mod


    orig_init = wcf_mod.WsClientFactory.__init__

 
    def patched_init(self, *args, **kwargs):
        kwargs.setdefault("proxy", {"host": parsed.hostname, "port": parsed.port})
        orig_init(self, *args, **kwargs)

    wcf_mod.WsClientFactory.__init__ = patched_init

    from twisted.internet import ssl as twisted_ssl
    from autobahn.twisted.websocket import WebSocketClientProtocol


    def start_tls_with_sni(self):
        self.transport.startTLS(twisted_ssl.optionsForClientTLS(self.factory.host))

    WebSocketClientProtocol.startTLS = start_tls_with_sni

    print(f"Routing websockets through proxy {parsed.hostname}:{parsed.port}")


_install_ws_proxy()

from okx_market_maker.strategy.SampleMM import SampleMM


if __name__ == "__main__":
    strategy = SampleMM()
    strategy.run()

