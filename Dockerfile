# 校園配電數位孿生平台 —— 後端 (FastAPI + pandapower + XGBoost)
# 從 repo 根啟動,webapi 與 networks 為 sibling 套件,原生 import。
FROM python:3.11-slim

# PYTHONUNBUFFERED:即時日誌
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# xgboost 執行期需要 libgomp1(OpenMP);其餘相依皆有 manylinux wheel,免編譯器
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先裝相依(層快取:程式碼變動不必重裝)
COPY requirements.txt ./
RUN pip install -r requirements.txt

# 再複製 repo(含 data/、dataset/、models/ 的 Excel/CSV/pkl —— 真相來源,不外掛 volume)
COPY . .

EXPOSE 8126

# 啟動會建南北兩網 + 跑潮流 + 背景暖機,故 start-period 放寬
HEALTHCHECK --interval=15s --timeout=5s --start-period=120s --retries=10 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8126/api/health',timeout=4).status==200 else 1)"

# PORT 可由環境覆寫(對齊 Render 慣例),預設 8126
CMD ["sh", "-c", "uvicorn webapi.main:app --host 0.0.0.0 --port ${PORT:-8126}"]
