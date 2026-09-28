# rankpeek-server（部分开源）

这个目录里只有**数据接收端**：`service/hextech_ingest.py`，负责白名单校验、限流、去重与匿名计数落库。

**未包含：**

- `scripts/` —— 聚合与发布（榜单算法）
- `deploy/` —— 部署脚本与配置

接收端只用 Python 标准库，可以直接跑：

```
python3 service/hextech_ingest.py
```

默认只监听回环地址，生产环境由 nginx 反代。测试见 `tests/test_ingest.py`。
