# 多用户与多 Agent 协作管理平台 · 产品规划

最近更新：2026-11-25。当前阶段：远程协作原型，验证消息投递和成员身份。

## 产品目标与最终形态

已明确的目标是让多名用户和多个 Agent 在同一平台协同工作。Pachat 是产品体验参考。本项目采用独立设计与实现，当前不对 Pachat 做 REA 逆向。

双方可以在不同地点使用自己的设备和 Agent。首版先支持异步文字沟通：两个人可以直接交流，任一方都能点名多个获授权的 Agent，两边的 Agent 也能在同一讨论串相互交接。人可以回看原始对话，辨认每条结论由谁提交。

**最终体验草案**：成员可以带着各自的 Agent 加入同一项目，围绕任务讨论、分工、交付、复核和验收。后来加入的成员打开一项任务，就能看出要达成什么、现在轮到谁、正在审哪份成果，以及谁根据什么做了最后的决定。

## 当前状态

| 事项 | 状态 | 依据 |
| --- | --- | --- |
| 产品方向与参考边界 | 已明确 | 已在立项讨论中明确多人、多 Agent 协作目标及独立实现路线 |
| 首版范围与验收场景 | 三类远程沟通已明确；任务验收流程仍为草案 | 先验证双方能沟通，再验证任务交付和审批 |
| 开源基底 | OpenAgents 本地开发分支已用于首轮实现 | 见下方选型记录 |
| 消息路由和收发 | 已完成本机 HTTP 集成验证 | 两个人类签名会话、四个脚本 Agent 客户端分别连接同一测试服务 |
| 异地使用 | 待双设备实测 | 尚未验收独立登录、邀请入组、真实 Agent 连接器和公网传输 |

## 开源基底选型 · 2026-11-25

优先考虑成员能否带入各自管理的 Agent、授予队友使用权，并将一项任务从执行者交给复核者。

| 候选 | 可复用部分 | 采用时最重要的验证项 |
| --- | --- | --- |
| [OpenAgents](https://github.com/openagents-org/openagents) · Apache-2.0 | 可自托管的 Web 工作区、外部 Agent 接入、按成员共享 Agent、讨论串、任务和复核交接 | 首选。验证自托管时两个独立用户的身份与授权，再确认成果修订和最终验收能否关联同一版本 |
| [Paperclip](https://github.com/paperclipai/paperclip) · MIT | 项目、工单、Agent 适配器、评审阶段与管理看板 | 最合适的备选。如果首批用户更重视工单审批，优先试它；要核实个人持有的 Agent 如何授权给另一位成员。[官方产品说明](https://paperclip.ing/product/) |
| [Buzz](https://github.com/block/buzz) · Apache-2.0 | 人与 Agent 在共享频道协作，可运行自己的中继服务 | 适合以讨论为主要入口的产品；要核实频道内的成果能否按版本退回、重审和验收 |

**OpenAgents 验证基线**：选用上游开发分支的固定提交 `3f3ef81cea7c2392118750886d0d8e97d7ca17e5`，用于验证首版场景。工作区由 FastAPI、Next.js 和 PostgreSQL 组成。自托管默认使用工作区令牌；双用户验收必须能区分甲乙的身份，不能让两个浏览器共用一个令牌来代替。[固定提交与许可证](https://github.com/openagents-org/openagents/tree/3f3ef81cea7c2392118750886d0d8e97d7ca17e5) · [自托管说明](https://openagents.org/docs/en/self-hosting/overview)

**已查到的实现边界**：上游复核服务在功能开关开启且满足讨论串条件时，可以根据明确的复核职责把执行者的回复交给另一 Agent。其测试覆盖重复分派和无权限复核。这足以作为交接的起点；“复核的是哪一版、谁最终验收了它”仍需单独验证。[复核服务](https://github.com/openagents-org/openagents/blob/3f3ef81cea7c2392118750886d0d8e97d7ca17e5/workspace/backend/app/services/review_handoff.py) · [测试用例](https://github.com/openagents-org/openagents/blob/3f3ef81cea7c2392118750886d0d8e97d7ca17e5/workspace/backend/tests/test_review_handoff.py)

**本地交接**：源码位于项目根目录下的 `openagents/`，上游远程名为 `upstream`，本地开发分支为 `platform/prototype`。从 [工作区说明](openagents/workspace/README.md) 进入前后端。保留仓库自带的许可证和版权声明，发布修改版时按 Apache-2.0 的再分发条款标注修改。

**本机验证**：在 `openagents/workspace/backend` 使用 Python 3.12 和 SQLite 内存测试库执行以下三组上游测试，43 项全部通过。开发 Compose 配置成功解析出 db、backend 和 frontend。本次未启动整套服务，本机检查时 Docker Desktop 的 Linux 引擎未运行。

```powershell
uv run --no-project --python 3.12 --with-requirements requirements.txt --with pytest python -m pytest -q tests/test_review_handoff.py tests/test_agent_sharing_requests.py tests/test_tasks.py -p no:cacheprovider
```

## 远程沟通的验收场景

| 谁在沟通 | 验收动作 | 目前的验证范围 |
| --- | --- | --- |
| 人与人 | 甲发消息，乙能阅读并回复，甲能看到乙的回复 | 两个独立签名会话经 TCP 在同一讨论串收发；已有私信测试覆盖双方可读、第三个人类成员不可读 |
| 人与多个 Agent | 甲、乙各发一条“@writer、@editor 请分别起草和复核” | 两个已获授权的目标 Agent 都通过各自的轮询请求收到同一条消息 |
| 多个 Agent 与多个 Agent | writer 和 editor 各自同时点名 analyst、reader，后两者分别回传结论 | 两个接收者均能取回两条交接消息，两个人都能读取结果；仅点名回复模式下，普通结论不会再唤醒其他 Agent |

验证代码在 [远程对话集成测试](openagents/workspace/backend/tests/test_remote_conversation.py)。测试使用预置成员和共享授权，通过上游令牌验证及消息 API，用本机回环地址模拟独立客户端。Agent 沿用上游工作区机器令牌，并各带会话标识；工作区机器令牌拥有较宽读取权限。面对分别由双方控制的设备，还需验证或收窄每台设备可读取的会话范围。

此次回归共 **238 项通过**。在 `openagents/workspace/backend` 可复现：

```powershell
uv run --no-project --python 3.12 --with-requirements requirements.txt --with pytest python -m pytest -q tests/test_remote_conversation.py tests/test_people_messaging.py tests/test_response_mode.py tests/test_dm_loop_guard.py tests/test_message_delivery.py tests/test_completion_routing.py tests/test_review_handoff.py tests/test_agent_sharing_requests.py tests/test_tasks.py -p no:cacheprovider
```

## 首版任务候选场景与验收条件

以两位项目成员和他们各自的一个 Agent 为例。甲负责验收，甲的 Agent 负责调研，乙的 Agent 负责复核。

| 步骤 | 可观察的验收结果 |
| --- | --- |
| 甲创建项目并邀请乙 | 乙加入后可查看同一项目，两人能辨认每个 Agent 归谁管理 |
| 甲创建调研任务并指派自己的 Agent | 任务显示目标、执行者和下一步动作；执行 Agent 能收到任务并提交第一版成果 |
| 乙指派自己的 Agent 复核 | 复核意见关联到第一版成果；若要求修改，任务回到执行者手中 |
| 执行 Agent 提交修订 | 两个版本均可查看，成员能辨认哪一版已经评审、哪一版仍待评审 |
| 甲验收，或退回继续修改 | 项目成员看到一致的任务状态，能追溯决定人、决定时间、针对的版本和理由 |

## 下一步与待定问题

**下一步**：打通自托管入口、独立登录和邀请。当前上游生产代理将首页转到官方站点，前端默认使用上游身份配置。随后用两台异地设备登录，双方各接入真实 Agent，在同一工作区复验上述三条对话，检查断线重连后的消息和设备访问范围，最后再验证按成果版本验收。

| 待定问题 | 影响的决策 |
| --- | --- |
| 首批用户最常共同交付什么成果？ | 用哪种真实任务验收，以及首版交付物需要支持文本、文件还是链接 |
| 首先接入哪一种 Agent，它在哪里运行？ | 如何领取任务、回传结果，以及离线后如何继续 |
| 谁可以调用其他成员的 Agent，谁有最终验收权？ | 项目角色、授权边界和任务状态转换 |

## 会话交接与维护

新会话先读本文件，再对照仓库中的实现和测试记录。若两者不一致，核验后更新“当前状态”。讨论中的设想保留为草案，产品负责人确认后再标为已定。每次范围发生变化或完成一项验收，在同一次工作中更新状态、验证依据和下一步，并在下表追加一行。

| 日期 | 变更 | 依据 |
| --- | --- | --- |
| 2026-11-25 | 建立规划，记录产品目标、独立实现路线及首版候选场景 | 初次产品讨论；已核对项目目录 |
| 2026-11-25 | 对比三个开源项目，选定 OpenAgents 作为首轮验证基底 | 核对上游仓库、工作区自托管文档、复核服务及测试源码 |
| 2026-11-25 | 将异地双方的三类沟通列为明确目标；在仅点名回复的讨论串支持 Agent 一次点名多名已有参与者 | 新增两人、四个 Agent 的本机 HTTP 集成测试 |
