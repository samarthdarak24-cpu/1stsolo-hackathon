@echo off
cd /d "%~dp0"
REM Preload the item-scan path (YOLO + SigLIP + OCR + BGE-M3) in the background so
REM the first user photo does not pay the cold-load cost. Reranker and VLM stay
REM lazy: they are only needed later, at match time. Set WARMUP_PROVIDERS=* to
REM preload everything, or WARMUP_ON_BOOT=0 to go back to lazy loading.
set "WARMUP_ON_BOOT=1"
set "WARMUP_PROVIDERS=detector,siglip,ocr,bge_m3"
".venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8100 > ai-service.out.log 2>&1
