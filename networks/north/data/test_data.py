"""
Data Layer Test and Validation Script
驗證數據層的正確性和完整性
"""

import logging
from pathlib import Path
import json
from typing import Dict, List

# 配置日誌
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 導入模組
from .network_structure import FEEDERS, MAIN_NETWORK, CABLE_PARAMETERS, TRANSFORMER_IMPEDANCE
from .load_data import DEFAULT_BUILDING_LOADS
from .parameters import SYSTEM_PARAMS, CABLE_PARAMS, TRANSFORMER_PARAMS, LOAD_PARAMS


class DataValidator:
    """數據驗證器"""
    
    def __init__(self):
        self.validation_results = {
            "network_structure": {},
            "loads": {},
            "parameters": {},
            "errors": [],
            "warnings": []
        }
    
    def validate_network_structure(self) -> bool:
        """驗證網路拓撲結構"""
        logger.info("=" * 60)
        logger.info("驗證網路拓撲結構...")
        logger.info("=" * 60)
        
        try:
            # 驗證主網路
            assert "source" in MAIN_NETWORK
            assert "main_cable" in MAIN_NETWORK
            logger.info(f"✓ 主網路定義完整: {MAIN_NETWORK['name']}")
            
            # 驗證Feeder數量
            feeder_count = len(FEEDERS)
            assert feeder_count == 12, f"Feeder數量應為12個，實際{feeder_count}個"
            logger.info(f"✓ Feeder數量正確: {feeder_count}個")
            
            # 驗證每個Feeder
            total_buses = 0
            total_transformers = 0
            total_loads = 0
            
            for vcb_name, feeder_data in FEEDERS.items():
                substations = feeder_data.get("substations", [])
                for substation in substations:
                    total_buses += 1
                    transformers = substation.get("transformers", [])
                    for tr in transformers:
                        # 跳過停用變壓器
                        if tr.get("status") == "disabled":
                            continue
                        total_transformers += 1
                        loads = tr.get("loads", [])
                        total_loads += len(loads)
            
            logger.info(f"✓ Feeder結構驗證完成:")
            logger.info(f"  - 總母線數: {total_buses}")
            logger.info(f"  - 變壓器總數: {total_transformers}")
            logger.info(f"  - 負載接入點: {total_loads}")
            
            self.validation_results["network_structure"]["buses"] = total_buses
            self.validation_results["network_structure"]["transformers"] = total_transformers
            self.validation_results["network_structure"]["load_points"] = total_loads
            
            return True
        
        except Exception as e:
            logger.error(f"✗ 網路拓撲驗證失敗: {e}")
            self.validation_results["errors"].append(str(e))
            return False
    
    def validate_loads(self) -> bool:
        """驗證負載數據"""
        logger.info("=" * 60)
        logger.info("驗證負載數據...")
        logger.info("=" * 60)
        
        try:
            # 檢查預定義負載
            load_count = len(DEFAULT_BUILDING_LOADS)
            logger.info(f"✓ 預定義負載數: {load_count}個")
            
            # 驗證負載數據格式
            total_p = 0
            total_q = 0
            for load_id, load_data in DEFAULT_BUILDING_LOADS.items():
                assert "p_kw" in load_data, f"{load_id}: 缺少p_kw"
                assert "q_kvar" in load_data, f"{load_id}: 缺少q_kvar"
                total_p += load_data["p_kw"]
                total_q += load_data["q_kvar"]
            
            # 負載資料僅存有功 P，建模時依系統功率因數推算無功 Q
            from .parameters import LOAD_PARAMS
            import math
            pf = LOAD_PARAMS["default_power_factor"]
            modeled_q = total_q if total_q else total_p * math.tan(math.acos(pf))
            modeled_s = (total_p**2 + modeled_q**2)**0.5

            logger.info(f"✓ 負載數據格式驗證完成")
            logger.info(f"  - 系統總有功: {total_p:.1f} kW")
            logger.info(f"  - 資料內含無功: {total_q:.1f} kVAR (僅存 P 時為 0)")
            logger.info(f"  - 建模無功 (pf={pf}): {modeled_q:.1f} kVAR")
            logger.info(f"  - 建模總容量: {modeled_s:.1f} kVA")

            self.validation_results["loads"]["count"] = load_count
            self.validation_results["loads"]["total_p_kw"] = total_p
            self.validation_results["loads"]["total_q_kvar"] = total_q
            self.validation_results["loads"]["power_factor"] = pf
            self.validation_results["loads"]["modeled_q_kvar"] = round(modeled_q, 1)
            self.validation_results["loads"]["modeled_s_kva"] = round(modeled_s, 1)

            return True
        
        except Exception as e:
            logger.error(f"✗ 負載驗證失敗: {e}")
            self.validation_results["errors"].append(str(e))
            return False
    
    def validate_parameters(self) -> bool:
        """驗證系統參數"""
        logger.info("=" * 60)
        logger.info("驗證系統參數...")
        logger.info("=" * 60)
        
        try:
            # 驗證電纜參數
            cable_sizes = list(CABLE_PARAMS.keys())
            logger.info(f"✓ 電纜規格: {cable_sizes}")
            
            # 驗證變壓器參數
            tr_capacities = list(TRANSFORMER_PARAMS.keys())
            logger.info(f"✓ 變壓器容量: {tr_capacities}")
            
            # 驗證負載參數
            logger.info(f"✓ 負載功率因數: {LOAD_PARAMS['default_power_factor']}")
            logger.info(f"✓ 負載模型: {LOAD_PARAMS['default_load_model']}")
            
            # 驗證系統參數
            logger.info(f"✓ 系統頻率: {SYSTEM_PARAMS['frequency']} Hz")
            logger.info(f"✓ 主系統電壓: {SYSTEM_PARAMS['main_voltage']} kV")
            
            return True
        
        except Exception as e:
            logger.error(f"✗ 參數驗證失敗: {e}")
            self.validation_results["errors"].append(str(e))
            return False
    
    def validate_feeder_consistency(self) -> bool:
        """驗證Feeder中引用的負載是否在DEFAULT_BUILDING_LOADS中定義"""
        logger.info("=" * 60)
        logger.info("驗證Feeder負載一致性...")
        logger.info("=" * 60)
        
        try:
            undefined_loads = []
            referenced_loads = set()
            
            # 收集Feeder中引用的所有負載
            for vcb_name, feeder_data in FEEDERS.items():
                substations = feeder_data.get("substations", [])
                for substation in substations:
                    transformers = substation.get("transformers", [])
                    for tr in transformers:
                        loads = tr.get("loads", [])
                        for load_id in loads:
                            referenced_loads.add(load_id)
                            # 檢查是否在DEFAULT_BUILDING_LOADS中定義
                            if load_id not in DEFAULT_BUILDING_LOADS:
                                undefined_loads.append(load_id)
            
            if undefined_loads:
                logger.warning(f"⚠ 發現未定義的負載: {undefined_loads}")
                self.validation_results["warnings"].append(f"未定義的負載: {undefined_loads}")
            else:
                logger.info(f"✓ 所有{len(referenced_loads)}個引用的負載都已定義")
            
            return len(undefined_loads) == 0
        
        except Exception as e:
            logger.error(f"✗ Feeder一致性驗證失敗: {e}")
            self.validation_results["errors"].append(str(e))
            return False
    
    def print_summary(self):
        """打印驗證摘要"""
        logger.info("=" * 60)
        logger.info("驗證摘要")
        logger.info("=" * 60)
        
        logger.info("✓ 網路結構:")
        for key, value in self.validation_results["network_structure"].items():
            logger.info(f"  - {key}: {value}")
        
        logger.info("✓ 負載數據:")
        for key, value in self.validation_results["loads"].items():
            logger.info(f"  - {key}: {value}")
        
        if self.validation_results["errors"]:
            logger.error("✗ 錯誤:")
            for error in self.validation_results["errors"]:
                logger.error(f"  - {error}")
        
        if self.validation_results["warnings"]:
            logger.warning("⚠ 警告:")
            for warning in self.validation_results["warnings"]:
                logger.warning(f"  - {warning}")
        
        return len(self.validation_results["errors"]) == 0
    
    def export_validation_report(self, output_file: str = "validation_report.json"):
        """導出驗證報告"""
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(self.validation_results, f, indent=2, ensure_ascii=False)
        logger.info(f"驗證報告已保存: {output_file}")


class DataSummary:
    """數據摘要生成器"""
    
    @staticmethod
    def print_feeder_summary():
        """打印Feeder摘要"""
        logger.info("=" * 60)
        logger.info("Feeder摘要")
        logger.info("=" * 60)
        
        for vcb_name, feeder_data in FEEDERS.items():
            logger.info(f"\n{vcb_name}: {feeder_data['name']}")
            
            substations = feeder_data.get("substations", [])
            for idx, substation in enumerate(substations, 1):
                bus = substation['bus']
                transformers = substation.get("transformers", [])
                logger.info(f"  {idx}. {bus}")
                
                for tr in transformers:
                    status = " (停用)" if tr.get("status") == "disabled" else ""
                    logger.info(f"     - {tr['name']} {tr['capacity']}kVA{status}")
    
    @staticmethod
    def print_load_summary():
        """打印負載摘要"""
        logger.info("=" * 60)
        logger.info("負載摘要")
        logger.info("=" * 60)
        
        total_p = 0
        total_q = 0
        
        logger.info("\nLoad ID           | P (kW)  | Q (kVAR) | S (kVA)")
        logger.info("-" * 60)
        
        for load_id, load_data in sorted(DEFAULT_BUILDING_LOADS.items()):
            p = load_data["p_kw"]
            q = load_data["q_kvar"]
            s = (p**2 + q**2)**0.5
            logger.info(f"{load_id:15s} | {p:7.1f} | {q:8.1f} | {s:7.1f}")
            total_p += p
            total_q += q
        
        total_s = (total_p**2 + total_q**2)**0.5
        logger.info("-" * 60)
        logger.info(f"{'TOTAL':15s} | {total_p:7.1f} | {total_q:8.1f} | {total_s:7.1f}")


def run_validation():
    """執行完整的數據驗證"""
    logger.info("\n" + "=" * 60)
    logger.info("開始校園配電系統數據驗證")
    logger.info("=" * 60 + "\n")
    
    validator = DataValidator()
    
    # 執行驗證
    results = {
        "network_structure": validator.validate_network_structure(),
        "loads": validator.validate_loads(),
        "parameters": validator.validate_parameters(),
        "feeder_consistency": validator.validate_feeder_consistency(),
    }
    
    # 打印摘要
    validator.print_summary()
    
    # 打印詳細摘要
    DataSummary.print_feeder_summary()
    DataSummary.print_load_summary()
    
    # 導出報告
    validator.export_validation_report()
    
    # 總結
    all_passed = all(results.values())
    logger.info("\n" + "=" * 60)
    if all_passed:
        logger.info("✓ 所有驗證通過！數據層已準備好用於建模")
    else:
        logger.warning("✗ 部分驗證未通過，請檢查上述錯誤")
    logger.info("=" * 60)
    
    return all_passed


if __name__ == "__main__":
    # 執行驗證
    run_validation()
