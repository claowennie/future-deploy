# Melo × 网易云本机桥

线上 Future 只负责登录、Melo 界面和 DeepSeek 意图判断。网易云登录与真实播放由独立的 `future-companion` 在用户电脑上完成：

1. DeepSeek 只能返回经过 Worker 校验的结构化 `companionAction`。
2. 浏览器用当前标签页里的配对码，把动作发到 `http://127.0.0.1:45731`。
3. 本机桥校验来源、配对码和动作白名单，再调用官方 `@music163/ncm-cli`。
4. `ncm-cli` 使用它自己的登录状态和 mpv 播放；网站不会取得网易云 Cookie、App Private Key 或音频地址。

如果本机桥未启动或没有配置，网站、DeepSeek 私有电台、Supabase 私有曲库及 YouTube 歌单仍按原方式工作。

当前定位是作品集演示：仅供开发者自己的账号和设备验证。若将来公开给普通用户，需要把本机桥打包成可安装桌面应用，并解决网易云开放平台对客户端凭证、授权范围与分发的要求。
