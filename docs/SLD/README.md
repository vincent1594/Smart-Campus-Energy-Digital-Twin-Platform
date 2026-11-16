# 單線圖原稿（記事本 ASCII）

電網拓撲的**原始依據**:依校方高壓單線圖手繪整理的 ASCII 圖,原存於桌面 `學校單線圖/`。

| 資料夾 | 內容 | 轉成的程式 |
|---|---|---|
| `北電錶_X/` | `VCB1~12.txt` 各饋線 + `整合.txt`(12 VCB 完整校園 11.4kV 單線圖) | `networks/north/data/network_structure.py` 的 `FEEDERS` |
| `南電錶_H1/` | `VCB1~6.txt` 各饋線 | `networks/south/data/network_structure.py` |

> **為何保留在 repo**:V2 要擴充**太陽能 (PV)、儲能 (ESS)、發電機**,須依這些原稿決定新設備接在哪條 VCB / 哪個母線,
> 再改 `network_structure.py`。網站本身不讀它們,但它們是拓撲的唯一原始依據。
>
> 改電網拓撲請改上表的 `network_structure.py`,並**回頭同步這裡的原稿**(新增 PV/ESS/發電機也畫進來),
> 讓原稿與模型一致。論文報告裡的 ASCII 單線圖是另一回事:由報告程式依模型重新產生 (見 bayesgrid/論文素材/)。
