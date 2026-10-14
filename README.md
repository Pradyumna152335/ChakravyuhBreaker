# ChakravyuhBreaker: Real-Time Dynamic Delivery & Multi-Stop Route Optimizer

**ChakravyuhBreaker** is a high-throughput logistics dispatch and graph routing engine designed to solve the **Capacitated Vehicle Routing Problem (CVRP)** under dynamic urban traffic and strict delivery time-window constraints.

## Tech Stack & Features
* **Backend:** Python, FastAPI, WebSockets, Redis
* **Algorithms:** A* Search, 2-Opt Local Search, QuadTree (spatial index), Interval Tree (time-window validation)
* **Frontend:** React, MapLibre GL Interactive Map Dashboard

## Quick Start
`ash
git clone [https://github.com/Pradyumna152335/ChakravyuhBreaker.git](https://github.com/Pradyumna152335/ChakravyuhBreaker.git)
cd ChakravyuhBreaker
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --reload
