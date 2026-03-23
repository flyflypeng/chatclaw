# OpenClaw 重复输出问题案例复盘

## 1. 问题背景

在 ChatClaw 侧栏中，OpenClaw Agent 场景下偶发出现同一轮回答被拆成两条、且内容重复的现象。用户可见表现为：模型先输出一段完整回答，随后又追加一条与上一条相同或高度重叠的回答。

---

## 2. 问题现象

### 2.1 UI 现象

- 单次提问后，Agent 侧出现两条相邻回复；
- 第二条回复常常与第一条内容相同，或是第一条全文再来一次；
- 多发生在 OpenClaw 场景，MicroClaw 不明显。

### 2.2 关键特征

- 并非每次都复现；
- 常出现在流式输出接近收尾时；
- 与 WebSocket 连接本身稳定性无明显直接关系。

---

## 3. 可定位手段建设

为避免“猜测式修复”，在 `sidebar.js` 增加可开关的流式诊断能力，核心目标是回答三个问题：

1. 每一段文本到底来自哪个分支（chat/agent/inline）；
2. 何时触发 finalize；
3. 重复内容是“重复到达”还是“提前 finalize 后重新开新消息”。

### 3.1 增加调试开关与日志缓冲

- 本地开关：`localStorage['chatclaw_stream_debug'] = '1'`
- 提供调试 API：
  - `window.chatclawStreamDebug.enable()`
  - `window.chatclawStreamDebug.disable()`
  - `window.chatclawStreamDebug.clear()`
  - `window.chatclawStreamDebug.dump()`

### 3.2 入站消息与追加路径埋点

- 入站消息统一记录：`kind: inbound`，包含 `dataType/event/seq/id/status/preview`；
- 文本写入 UI 前统一记录：`kind: append`，包含 `source/textLength/preview`；
- 追加策略记录：`appendMode`（`init` / `tail-diff` / `full-replace-fallback`）；
- 跳过场景记录：`append-skip`（例如 same-as-current）。

### 3.3 重复片段探测

- 基于 `runId + sessionKey + preview` 做指纹计数；
- 出现重复时记录 `kind: duplicate-chunk`，标注 `source` 与 `previousSource`。

### 3.4 验证数据

- 复现数据落盘为：`openclaw-dump.log`；
- 该文件包含完整事件时序与 append 决策日志，用于根因定位。

---

## 4. 根因定位逻辑

### 4.1 从日志看时序

在 `openclaw-dump.log` 中可观察到：

- 有持续的流式事件（`event: agent`）；
- 同时周期性出现 `event: chat`，其内容为累计全文快照；
- 在尾部阶段会出现：
  1. lifecycle/结束语义事件先到；
  2. 随后同一 runId 的 `chat` 全文事件才到。

### 4.2 为什么会出现“先 final 后 delta/full”

结论不是 WebSocket 乱序，而是“协议事件语义并发”：

- WebSocket 在同连接内是有序传输；
- 但 `agent lifecycle` 与 `chat` 可能来自服务端不同异步生产路径；
- `final` 在这里更像“某流结束信号”，并不总是“用户可见文本绝对最后一个包”；
- 因此可能出现：先收到结束信号，后收到同 runId 的最终全文快照。

### 4.3 触发重复的直接机制

旧逻辑下：

1. 收到结束信号后立即 `finalizeAgentResponse()`；
2. `finalizeAgentResponse()` 会清空 `currentStreamingContent`；
3. 稍后到达的 `chat` 全文被当作新消息 `init` 追加；
4. 结果是 UI 上形成第二条重复回答。

---

## 5. 根因总结

根因是 **OpenClaw 多事件通道在收尾阶段存在语义时序缝隙**，前端把结束信号当成“绝对终态”处理，导致状态机提前清空，后续同 runId 的尾包只能以新消息路径进入，最终形成重复显示。

---

## 6. 修复方案

修复分两层，第一层止血，第二层根治：

### 6.1 第一层：延迟 finalize（止血）

- 对 OpenClaw lifecycle 结束信号不立即 finalize；
- 采用短暂延迟窗口；
- 若窗口内有新文本到达则取消延迟 finalize。

作用：降低“刚 finalize 就来尾包”的概率。

局限：时间窗口不是严格正确性保证，只是概率优化。

### 6.2 第二层：runId 一致性回补（根治）

增加“已完成消息快照”并支持回补：

1. finalize 时记录最近完成消息的 `messageId/content/runId`；
2. 若后续收到 `openclaw-chat` 文本：
   - runId 相同；
   - 新文本以已完成文本为前缀扩展；
3. 则不新建消息，改为“重新挂接”到上一条消息继续补尾；
4. 再次 finalize 时更新历史中最后一条 agent 消息内容，而不是新增一条。

作用：把“晚到尾包”合并回同一条消息，避免重复。

---

## 7. 最终效果

- 针对“结束信号先到、全文尾包后到”的场景，UI 不再新增重复消息；
- 日志层可准确区分：
  - 真实重复到达；
  - 提前 finalize 导致的新消息重启；
  - runId 一致的尾包回补。

---

## 8. 经验与建议

1. 流式协议对接时，不应假设单一 `final` 语义；
2. 文本聚合应以“请求实体标识（runId/sessionKey）+ 内容关系（prefix）”做一致性判定；
3. 时间窗口策略可作为兜底，但不要作为唯一正确性机制；
4. 类似问题应优先建设“可观测性”再修复，避免反复试错。

---

## 9. 后续可选增强

1. 与后端协议对齐，明确：
   - 哪个事件是“最终用户文本完成”的唯一信号；
   - 是否保证 lifecycle 与 chat 的顺序关系。
2. 在前端引入更明确的响应状态机（RUNNING / ENDING / FINALIZED / REOPENED）；
3. 增加针对“late full-text after finalize”的自动化回归测试（可基于事件回放）。

