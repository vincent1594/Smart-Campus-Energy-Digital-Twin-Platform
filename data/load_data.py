"""
Load Data Parser - 從Excel讀取建築負載數據
"""

import pandas as pd
from pathlib import Path
from typing import Dict, List, Tuple
import logging

logger = logging.getLogger(__name__)

class LoadDataParser:
    """負載數據解析器"""
    
    def __init__(self, excel_file_path: str):
        """
        初始化負載數據解析器
        
        Args:
            excel_file_path: Excel文件路徑
        """
        self.excel_file = Path(excel_file_path)
        self.data = None
        self.loads = {}
        
    def load_excel(self) -> pd.DataFrame:
        """
        讀取Excel文件
        
        Returns:
            DataFrame包含所有負載數據
        """
        try:
            # 嘗試讀取所有sheet
            self.data = pd.read_excel(self.excel_file, sheet_name=None)
            logger.info(f"成功讀取Excel: {self.excel_file}")
            logger.info(f"Sheet列表: {list(self.data.keys())}")
            return self.data
        except Exception as e:
            logger.error(f"讀取Excel失敗: {e}")
            raise
    
    def parse_load_sheet(self, sheet_name: str = None) -> Dict:
        """
        解析負載Sheet
        預期格式:
        | Building | Bus | Load_ID | Load_Type | P_kW | Q_kVAR | or P_kW | S_kVA |
        
        Args:
            sheet_name: Sheet名稱，若None則自動偵測
            
        Returns:
            負載數據字典
        """
        if self.data is None:
            self.load_excel()
        
        # 自動偵測sheet
        if sheet_name is None:
            # 查找包含load的sheet
            sheet_list = [s for s in self.data.keys() 
                         if 'load' in s.lower() or 'peak' in s.lower()]
            if sheet_list:
                sheet_name = sheet_list[0]
            else:
                sheet_name = list(self.data.keys())[0]
        
        logger.info(f"解析Sheet: {sheet_name}")
        df = self.data[sheet_name]
        
        # 標準化列名
        df.columns = [col.strip().lower() for col in df.columns]
        
        # 解析負載數據
        loads = {}
        for idx, row in df.iterrows():
            load_id = None
            
            # 查找Load ID（可能的列名）
            for col in ['load_id', 'id', 'load', 'bus']:
                if col in df.columns:
                    load_id = row[col]
                    break
            
            if load_id is None:
                load_id = f"LOAD_{idx+1}"
            
            # 查找功率數據
            p_kw = None
            q_kvar = None
            
            for col in ['p_kw', 'p', 'power', 'kw']:
                if col in df.columns:
                    p_kw = float(row[col]) if pd.notna(row[col]) else 0
                    break
            
            for col in ['q_kvar', 'q', 'reactive', 'kvar']:
                if col in df.columns:
                    q_kvar = float(row[col]) if pd.notna(row[col]) else 0
                    break
            
            # 如果沒有Q，從S計算
            if q_kvar is None and p_kw is not None:
                for col in ['s_kva', 's', 'apparent', 'kva']:
                    if col in df.columns:
                        s_kva = float(row[col]) if pd.notna(row[col]) else 0
                        pf = 0.9  # 假設功率因數
                        q_kvar = (s_kva**2 - p_kw**2)**0.5
                        break
            
            if p_kw is None:
                continue
            
            loads[load_id] = {
                "p_kw": p_kw,
                "q_kvar": q_kvar or p_kw * 0.5,  # 預設功率因數
                "bus": row.get('bus', load_id),
            }
        
        self.loads = loads
        logger.info(f"成功解析{len(loads)}個負載")
        return loads
    
    def get_loads_by_bus(self, bus_name: str) -> List[Tuple[str, float, float]]:
        """
        獲取特定母線的所有負載
        
        Args:
            bus_name: 母線名稱
            
        Returns:
            [(load_id, p_kw, q_kvar), ...]
        """
        return [
            (load_id, data["p_kw"], data["q_kvar"])
            for load_id, data in self.loads.items()
            if data["bus"] == bus_name
        ]
    
    def get_total_load(self) -> Tuple[float, float]:
        """
        計算系統總負載
        
        Returns:
            (total_p_kw, total_q_kvar)
        """
        total_p = sum(data["p_kw"] for data in self.loads.values())
        total_q = sum(data["q_kvar"] for data in self.loads.values())
        return total_p, total_q
    
    def export_load_summary(self, output_file: str = None) -> pd.DataFrame:
        """
        導出負載摘要
        
        Args:
            output_file: 輸出CSV文件路徑
            
        Returns:
            負載摘要DataFrame
        """
        summary_data = []
        for load_id, data in self.loads.items():
            summary_data.append({
                "Load_ID": load_id,
                "Bus": data["bus"],
                "P_kW": data["p_kw"],
                "Q_kVAR": data["q_kvar"],
                "S_kVA": (data["p_kw"]**2 + data["q_kvar"]**2)**0.5,
            })
        
        df_summary = pd.DataFrame(summary_data)
        
        if output_file:
            df_summary.to_csv(output_file, index=False, encoding='utf-8-sig')
            logger.info(f"負載摘要已保存: {output_file}")
        
        return df_summary


# 預定義的建築負載數據 (S1 Baseline)
# 數值來源: 校園變壓器細部資料 (TR-1~TR-52) 的「平均負載」與「運轉功因」
# pf 為補償後運轉功因；建模時 Q = P*tan(acos(pf))，已對應變壓器的獨立電容歸 0 以免重複計入
# 標註「未對應」者真實資料中查無對應，沿用舊估值 (pf=0.9)
# 日期: 2026-06-04
DEFAULT_BUILDING_LOADS = {
    # VCB1
    "LOAD_N": {"p_kw": 255.4, "pf": 0.97},   # TR-23 N文炳館
    "LOAD_Y": {"p_kw": 110.1, "pf": 0.85},   # TR-25 Y三連堂
    "LOAD_F1": {"p_kw": 34.3, "pf": 0.90},   # TR-11 F資訊傳播館
    "LOAD_F2": {"p_kw": 115.8, "pf": 0.95},  # TR-9  F資訊傳播館
    "LOAD_F3": {"p_kw": 94.1, "pf": 0.95},   # TR-10 F資訊傳播館
    "LOAD_G1": {"p_kw": 60.9, "pf": 0.90},   # 未對應 (真實資料無 G 棟)

    # VCB2
    "LOAD_Z": {"p_kw": 35.6, "pf": 0.85},    # TR-22 Z西淮紀念館
    "LOAD_M": {"p_kw": 98.7, "pf": 1.00},    # TR-26 M念慈堂
    "LOAD_G2": {"p_kw": 51.5, "pf": 0.90},   # 未對應 (真實資料無 G 棟)
    "LOAD_H3_1": {"p_kw": 53.3, "pf": 1.00}, # TR-29 H3第三宿舍
    "LOAD_H3_2": {"p_kw": 41.5, "pf": 0.90}, # TR-30 H3第三宿舍

    # VCB3
    "LOAD_K1": {"p_kw": 130.7, "pf": 0.98},  # TR-38 K機械館
    "LOAD_K2": {"p_kw": 44.8, "pf": 0.98},   # TR-39 K機械館
    "LOAD_K3": {"p_kw": 77.7, "pf": 0.85},   # TR-19 K機械館
    "LOAD_K4": {"p_kw": 129.6, "pf": 0.85},  # TR-20 K機械館
    "LOAD_K5": {"p_kw": 93.9, "pf": 0.85},   # TR-21 K機械館
    # TR_K_6 = R汽車工程館 TR-14 (108.6kW)，三筆均分 36.2kW
    # 自然 pf≈0.59 (感性 Q≈150kVAr),由 R_LV_BUS 上 150kVAr 電容補償後淨 pf≈1.0
    "LOAD_Q": {"p_kw": 36.2, "pf": 0.59},    # TR-14 R汽車工程館 (1/3)
    "LOAD_R": {"p_kw": 36.2, "pf": 0.59},    # TR-14 R汽車工程館 (1/3)
    "LOAD_R1": {"p_kw": 36.2, "pf": 0.59},   # TR-14 R汽車工程館 (1/3)
    "LOAD_L1": {"p_kw": 129.7, "pf": 1.00},  # TR-17 L綜合大樓
    "LOAD_L2": {"p_kw": 171.5, "pf": 1.00},  # TR-18 L綜合大樓

    # VCB4
    "LOAD_P": {"p_kw": 133.4, "pf": 1.00},   # TR-13 P電子物流實習館

    # VCB5
    "LOAD_A": {"p_kw": 26.6, "pf": 0.85},    # TR-1 A電機一館
    "LOAD_B": {"p_kw": 99.6, "pf": 0.99},    # TR-2 B電機二館

    # VCB6
    "LOAD_T": {"p_kw": 387.0, "pf": 0.98},   # TR-37 T棟教學研究大樓 (在線)
    "LOAD_V1": {"p_kw": 164.3, "pf": 0.98},  # TR-40 V棟能源工程館
    "LOAD_V2": {"p_kw": 309.6, "pf": 0.98},  # TR-41 V棟能源工程館

    # VCB7
    # TR_CD = D管理與資訊館 TR-3 (300kVA, 34kW, pf0.95)，一台供 C/D 兩棟，均分 17kW
    "LOAD_C": {"p_kw": 17.0, "pf": 0.95},    # TR-3 D管資館 (C 棟)
    "LOAD_D": {"p_kw": 17.0, "pf": 0.95},    # TR-3 D管資館 (D 棟)

    # VCB8
    "LOAD_S1": {"p_kw": 245.2, "pf": 0.99},  # TR-16 S管科大樓
    "LOAD_S2": {"p_kw": 61.3, "pf": 1.00},   # TR-15 S管科大樓

    # VCB9
    "LOAD_J": {"p_kw": 154.3, "pf": 0.90},   # TR-12 J電子二館

    # VCB10
    "LOAD_W1": {"p_kw": 250.1, "pf": 1.00},  # TR-44 W棟生活機能館
    "LOAD_W2": {"p_kw": 234.2, "pf": 0.90},  # 未對應 (W棟真實僅 3 台)
    "LOAD_W3": {"p_kw": 230.4, "pf": 1.00},  # TR-46 W棟生活機能館
    "LOAD_W4": {"p_kw": 131.6, "pf": 1.00},  # TR-45 W棟生活機能館

    # VCB11
    "LOAD_I1": {"p_kw": 165.1, "pf": 0.94},  # TR-48 I工學院大樓
    "LOAD_I2": {"p_kw": 142.8, "pf": 0.98},  # TR-49 I工學院大樓
    "LOAD_I3": {"p_kw": 78.6, "pf": 0.99},   # TR-50 I工學院大樓
    "LOAD_I4": {"p_kw": 88.1, "pf": 0.95},   # TR-51 I工學院大樓
}
