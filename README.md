# MultiAgentsPlatform

面向异地团队的多人、多 Agent 协作管理平台。成员可以在同一讨论串交流、点名多个 Agent，以及在不同 Agent 之间交接工作。

受邀联调的成员请打开邀请人提供的工作区地址，使用私下收到的邮箱和密码登录。自行部署时，可按下方自托管说明创建本机账号。

- [产品规划与当前验证进度](PRODUCT_PLAN.md)
- [本地自托管与账号配置](openagents/workspace/README.md#start-multiagentsplatform-locally)
- [Windows 桌面客户端](openagents/workspace/README.md#windows-desktop-client)
- [工作区源码与开发说明](openagents/workspace/README.md)
- [两位用户与四个 Agent 的消息收发测试](openagents/workspace/backend/tests/test_remote_conversation.py)

本项目的 `openagents/` 目录基于 [OpenAgents 上游提交](https://github.com/openagents-org/openagents/commit/3f3ef81cea7c2392118750886d0d8e97d7ca17e5)，保留 [Apache-2.0 许可证](openagents/LICENSE)。本项目在该基线上支持群聊多目标消息路由和自托管账号登录，并新增集成测试。

Multi agents platform for agents&amp;human cooperation management 
