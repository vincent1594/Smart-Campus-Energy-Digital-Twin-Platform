# 單線圖原稿（記事本 ASCII）

電網拓撲的**原始依據**:依校方高壓單線圖手繪整理的 ASCII 圖,原存於桌面 `學校單線圖/`。

| 資料夾 | 內容 | 轉成的程式 |
|---|---|---|
| `北電錶_X/` | `VCB1~12.txt` 各饋線 + `整合.txt`(12 VCB 完整校園 11.4kV 單線圖) | `networks/north/data/network_structure.py` 的 `FEEDERS` |
| `南電錶_H1/` | `VCB1~6.txt` 各饋線 | `networks/south/data/network_structure.py` |

> 這些檔**不被程式讀取**,僅作論文與日後核對的原稿。改電網拓撲請改上表的 `network_structure.py`,
> 並視需要回頭同步原稿。報告中的 ASCII 單線圖(`results/S*/S*_report.md`)是程式依模型重新產生的,含負載率/電壓。
